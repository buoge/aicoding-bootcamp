"""使用 SQLGlot 实现的 SQL 安全验证器。"""

import re
from typing import Any, Optional, Tuple

import sqlglot
from sqlglot import expressions

from pg_mcp.exceptions import SecurityError


class SQLValidationError(SecurityError):
    """SQL 验证错误。"""


class SQLSecurityValidator:
    """SQL 安全性验证器。

    提供多层 SQL 验证以确保只读访问：
    1. 黑名单关键词
    2. SQLGlot 解析和语句类型验证
    3. 查询复杂度限制
    4. 表和列名验证
    """

    BLACKLIST_KEYWORDS = {
        # 数据修改
        "INSERT", "UPDATE", "DELETE", "MERGE", "UPSERT", "REPLACE",
        # 数据库定义
        "CREATE", "DROP", "ALTER", "TRUNCATE", "RENAME", "COMMENT",
        # 权限管理
        "GRANT", "REVOKE",
        # 事务控制
        "BEGIN", "COMMIT", "ROLLBACK", "START", "SAVEPOINT", "RELEASE",
        # 系统操作
        "COPY", "LOAD", "VACUUM", "ANALYZE", "CLUSTER", "REINDEX",
        # 其他危险操作
        "EXECUTE", "PREPARE", "DEALLOCATE",
    }

    ALLOWED_STATEMENT_TYPES = {
        expressions.Select,
        expressions.Union,
        expressions.CTE,  # Common Table Expressions
    }

    def __init__(
        self,
        max_query_depth: int = 3,
        max_joins: int = 10,
        allow_system_tables: bool = False
    ) -> None:
        """初始化安全验证器。

        参数:
            max_query_depth: 最大查询嵌套深度
            max_joins: 最大 JOIN 数量
            allow_system_tables: 是否允许访问系统表
        """
        self.max_query_depth = max_query_depth
        self.max_joins = max_joins
        self.allow_system_tables = allow_system_tables

    def validate(
        self,
        sql: str,
        required_tables: Optional[list[str]] = None
    ) -> tuple[bool, str]:
        """验证 SQL 查询的安全性。

        参数:
            sql: 要验证的 SQL 查询
            required_tables: 可选的所需表名列表

        返回:
            tuple: (is_valid, message)

        引发:
            SQLValidationError: 如果验证失败
        """
        if not sql or not sql.strip():
            return False, "SQL 不能为空"

        sql = sql.strip()

        # 1. 黑名单关键词检查（大小写不敏感）
        if not self._check_blacklist(sql):
            return False, "SQL 包含黑名单关键词"

        # 2. SQLGlot 解析验证
        try:
            parsed_statements = self._parse_sql(sql)
        except SQLValidationError as e:
            return False, str(e)
        except Exception as e:
            return False, f"SQL 解析错误: {str(e)}"

        # 3. 语句类型验证
        if not self._validate_statement_types(parsed_statements):
            return False, "只允许 SELECT 查询语句"

        # 4. 查询复杂度验证
        if not self._validate_complexity(parsed_statements):
            return False, "查询过于复杂"

        # 5. 表名验证
        if required_tables and not self._validate_tables(parsed_statements, required_tables):
            return False, "SQL 使用了未授权的表"

        # 6. 系统表访问验证
        if not self.allow_system_tables and not self._check_system_table_access(parsed_statements):
            return False, "不允许访问系统表"

        return True, "验证通过"

    def _check_blacklist(self, sql: str) -> bool:
        """检查 SQL 是否包含黑名单关键词。"""
        sql_upper = sql.upper()

        # 移除字符串字面量以避免误报
        cleaned_sql = re.sub(r"'[^']*'", "", sql_upper)
        cleaned_sql = re.sub(r'"[^"]*"', "", cleaned_sql)

        for keyword in self.BLACKLIST_KEYWORDS:
            # 使用单词边界检查完整单词
            pattern = r"\b{}\b".format(keyword)
            if re.search(pattern, cleaned_sql):
                return False

        return True

    def _parse_sql(self, sql: str) -> list[expressions.Expression]:
        """使用 SQLGlot 解析 SQL。"""
        try:
            # 使用 PostgreSQL 方言解析
            statements = sqlglot.parse(sql, dialect="postgres")

            if not statements or len(statements) == 0:
                raise SQLValidationError("解析失败")

            return statements

        except sqlglot.ParseError as e:
            raise SQLValidationError(f"SQL 解析错误: {str(e)}")

    def _validate_statement_types(self, statements: list[expressions.Expression]) -> bool:
        """验证语句类型是否允许。"""
        for statement in statements:
            # 检查主要语句类型
            if type(statement) not in self.ALLOWED_STATEMENT_TYPES:
                # 检查嵌套语句
                if not self._check_nested_statements(statement):
                    return False

        return True

    def _check_nested_statements(self, node: expressions.Expression) -> bool:
        """递归检查嵌套语句。"""
        if hasattr(node, "args") and node.args:
            for arg_name, arg_value in node.args.items():
                if arg_value is None:
                    continue

                if isinstance(arg_value, expressions.Expression):
                    if type(arg_value) not in self.ALLOWED_STATEMENT_TYPES:
                        return False
                    if not self._check_nested_statements(arg_value):
                        return False

                elif isinstance(arg_value, (list, tuple)):
                    for item in arg_value:
                        if isinstance(item, expressions.Expression):
                            if type(item) not in self.ALLOWED_STATEMENT_TYPES:
                                return False
                            if not self._check_nested_statements(item):
                                return False

        return True

    def _validate_complexity(self, statements: list[expressions.Expression]) -> bool:
        """验证查询复杂度。"""
        for statement in statements:
            # 检查查询深度
            depth = self._get_query_depth(statement)
            if depth > self.max_query_depth:
                return False

            # 检查 JOIN 数量
            joins = self._count_joins(statement)
            if joins > self.max_joins:
                return False

        return True

    def _get_query_depth(self, node: expressions.Expression, depth: int = 0) -> int:
        """计算查询嵌套深度。"""
        max_depth = depth

        # 检查子查询
        if hasattr(node, "find"):
            subqueries = list(node.find_all(expressions.Subquery))
            for subquery in subqueries:
                sub_depth = self._get_query_depth(subquery.this, depth + 1)
                max_depth = max(max_depth, sub_depth)

        return max_depth

    def _count_joins(self, node: expressions.Expression) -> int:
        """计算 JOIN 数量。"""
        if hasattr(node, "find"):
            joins = list(node.find_all(expressions.Join))
            return len(joins)
        return 0

    def _validate_tables(self, statements: list[expressions.Expression], allowed_tables: list[str]) -> bool:
        """验证使用的表是否在允许列表中。"""
        used_tables = self._extract_table_names(statements)
        allowed_set = {table.lower() for table in allowed_tables}

        for table in used_tables:
            if table.lower() not in allowed_set:
                return False

        return True

    def _extract_table_names(self, statements: list[expressions.Expression]) -> list[str]:
        """从 SQL 语句中提取表名。"""
        tables = []

        for statement in statements:
            if hasattr(statement, "find"):
                table_exprs = list(statement.find_all(expressions.Table))
                for table_expr in table_exprs:
                    # 获取完整的表名（包括 schema）
                    parts = []
                    if hasattr(table_expr, "db") and table_expr.db:
                        parts.append(str(table_expr.db))
                    if hasattr(table_expr, "table") and table_expr.table:
                        parts.append(str(table_expr.table))

                    if parts:
                        tables.append(".".join(parts))

        # 去重
        return list(set(tables))

    def _check_system_table_access(self, statements: list[expressions.Expression]) -> bool:
        """检查是否访问了系统表。"""
        system_schemas = {"pg_catalog", "information_schema"}
        used_tables = self._extract_table_names(statements)

        for table in used_tables:
            parts = table.split(".")
            schema = parts[0] if len(parts) > 1 else "public"

            if schema in system_schemas:
                return False

        return True

    def sanitize_sql(self, sql: str) -> str:
        """清理并规范 SQL。"""
        # 移除多余的空白字符
        sql = re.sub(r'\s+', ' ', sql)
        sql = sql.strip()

        # 确保以分号结尾
        if not sql.endswith(';'):
            sql += ';'

        return sql

    def add_limit_if_missing(self, sql: str, max_rows: int = 1000) -> str:
        """如果 SQL 中没有 LIMIT，则添加。"""
        # 检查是否已经存在 LIMIT
        if self._has_limit(sql):
            return sql

        # 找到最后一个 SELECT 语句并添加 LIMIT
        if sql.strip().endswith(';'):
            sql = sql.strip()[:-1]

        return f"{sql} LIMIT {max_rows};"

    def _has_limit(self, sql: str) -> bool:
        """检查 SQL 是否已包含 LIMIT 子句。"""
        # 移除字符串字面量
        cleaned = re.sub(r"'[^']*'", "", sql.upper())
        cleaned = re.sub(r'\"[^\"]*\"', "", cleaned)

        return " LIMIT " in cleaned

    def validate_and_clean(self, sql: str, **kwargs: Any) -> tuple[str, bool, str]:
        """验证并清理 SQL。"""
        is_valid, message = self.validate(sql, **kwargs)
        if not is_valid:
            return sql, is_valid, message

        # 清理 SQL
        cleaned_sql = self.sanitize_sql(sql)
        return cleaned_sql, True, "验证通过"
