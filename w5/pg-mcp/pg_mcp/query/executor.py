"""PostgreSQL查询执行器，提供安全的只读查询执行功能。"""

import re
import time
from typing import Any, Optional, Tuple
import asyncpg

from pg_mcp.database.manager import DatabaseManager
from pg_mcp.exceptions import DatabaseError, QueryError, SecurityError


class QueryExecutionError(QueryError):
    """查询执行错误。"""


class QueryExecutor:
    """PostgreSQL查询执行器，提供安全的只读查询执行。

    特性:
        - 只读事务保证数据安全
        - 自动LIMIT注入防止大数据查询
        - 查询超时保护
        - 连接池管理
        - 格式化的查询结果返回
        - 详细的查询统计信息
    """

    # 需要检查LIMIT注入的查询模式
    LIMIT_REQUIRED_PATTERNS = [
        r'^\s*SELECT\s+',  # SELECT queries
        r'^\s*WITH\s+',    # CTE queries
    ]

    def __init__(self, db_manager: DatabaseManager) -> None:
        """初始化查询执行器。

        参数:
            db_manager: 数据库连接管理器实例
        """
        self.db_manager = db_manager

    async def execute(
        self,
        db_id: str,
        sql: str,
        max_rows: int = 1000,
        timeout: Optional[float] = None
    ) -> dict[str, Any]:
        """执行SQL查询（只读事务）。

        参数:
            db_id: 数据库标识符
            sql: SQL查询字符串
            max_rows: 最大返回行数限制（默认1000）
            timeout: 查询超时时间（秒），None表示使用配置默认值

        返回:
            包含以下字段的字典:
                - sql: 实际执行的SQL语句
                - rows: 查询结果行列表
                - execution_time: 执行时间（秒）
                - row_count: 返回行数
                - columns: 列名列表
                - has_more: 是否有更多数据

        引发:
            QueryExecutionError: 查询执行失败
            DatabaseError: 数据库连接错误
            SecurityError: SQL安全检查失败
        """
        # 安全检查：确保是只读查询
        if self._contains_dangerous_keywords(sql):
            raise SecurityError(
                "SQL包含危险关键词，只允许SELECT查询",
                details={"sql": sql}
            )

        # 自动添加LIMIT（如果没有）
        original_sql = sql
        sql = self._add_limit_if_needed(sql, max_rows)

        # 获取连接池
        pool = self.db_manager.get_pool(db_id)
        if not pool:
            raise DatabaseError(f"数据库 '{db_id}' 未连接")

        start_time = time.time()
        try:
            async with pool.acquire() as conn:
                # 设置只读事务
                async with conn.transaction(readonly=True):
                    # 检查超时设置
                    if timeout is not None:
                        old_timeout = conn.get_settings().get('statement_timeout')
                        await conn.execute(f"SET LOCAL statement_timeout = {int(timeout * 1000)}")

                    try:
                        # 执行查询
                        rows = await conn.fetch(sql)

                        # 恢复超时设置（如果需要）
                        if timeout is not None and old_timeout is not None:
                            await conn.execute(f"SET LOCAL statement_timeout = {old_timeout}")

                        execution_time = time.time() - start_time

                        # 格式化结果
                        result = {
                            "sql": sql,
                            "rows": [dict(row) for row in rows],
                            "execution_time": round(execution_time, 4),
                            "row_count": len(rows),
                            "columns": list(rows[0].keys()) if rows else [],
                            "has_more": len(rows) >= max_rows
                        }

                        return result

                    except asyncpg.exceptions.QueryCanceledError:
                        raise QueryExecutionError(
                            f"查询超时（{timeout}秒）",
                            details={"timeout": timeout, "sql": sql}
                        )
                    except asyncpg.exceptions.Error as e:
                        raise QueryExecutionError(
                            f"查询执行错误: {e}",
                            details={"error": str(e), "sql": sql}
                        )

        except Exception as e:
            if 'asyncpg' in str(type(e)):
                raise DatabaseError(
                    f"数据库操作失败: {e}",
                    details={"error": str(e), "db_id": db_id}
                )
            raise

    async def test_connection(self, db_id: str) -> Tuple[bool, str]:
        """测试数据库连接。

        参数:
            db_id: 数据库标识符

        返回:
            包含 (是否成功, 消息) 的元组
        """
        pool = self.db_manager.get_pool(db_id)
        if not pool:
            return False, f"数据库 '{db_id}' 未连接"

        try:
            async with pool.acquire() as conn:
                result = await conn.fetch("SELECT 1 as test")
                if result and result[0]['test'] == 1:
                    return True, "连接正常"
                else:
                    return False, "连接测试返回无效结果"
        except Exception as e:
            return False, f"连接失败: {e}"

    async def get_query_stats(self, db_id: str, sql: str) -> Optional[dict[str, Any]]:
        """获取查询统计信息（使用EXPLAIN）。

        参数:
            db_id: 数据库标识符
            sql: SQL查询语句

        返回:
            包含查询计划的字典，如果查询计划功能未启用则返回None
        """
        # 安全检查：只分析SELECT查询
        if self._contains_dangerous_keywords(sql):
            return None

        pool = self.db_manager.get_pool(db_id)
        if not pool:
            return None

        try:
            async with pool.acquire() as conn:
                async with conn.transaction(readonly=True):
                    # 执行EXPLAIN ANALYZE
                    explain_sql = f"EXPLAIN (ANALYZE, FORMAT JSON) {sql}"
                    result = await conn.fetch(explain_sql)

                    if result:
                        # 解析查询计划
                        plan_data = result[0][0]
                        return self._parse_explain_plan(plan_data)

        except Exception:
            # EXPLAIN可能失败，这不是致命错误
            return None

        return None

    def _add_limit_if_needed(self, sql: str, max_rows: int) -> str:
        """如果需要，自动为SQL添加LIMIT子句。

        参数:
            sql: 原始SQL查询
            max_rows: 最大行数限制

        返回:
            添加LIMIT后的SQL（如果需要）
        """
        # 清理SQL字符串
        sql = sql.strip()

        # 检查是否需要LIMIT注入
        requires_limit = False
        for pattern in self.LIMIT_REQUIRED_PATTERNS:
            if re.match(pattern, sql, re.IGNORECASE):
                requires_limit = True
                break

        if not requires_limit:
            return sql

        # 检查是否已经包含LIMIT
        if self._has_limit_clause(sql):
            return sql

        # 移除末尾的分号（如果有）
        if sql.endswith(';'):
            sql = sql[:-1].strip()

        # 添加LIMIT
        return f"{sql}\nLIMIT {max_rows}"

    def _has_limit_clause(self, sql: str) -> bool:
        """检查SQL是否包含LIMIT子句。

        参数:
            sql: SQL查询字符串

        返回:
            如果包含LIMIT返回True，否则返回False
        """
        # 移除字符串字面量以避免误报
        cleaned = re.sub(r"'[^']*'", "", sql)
        cleaned = re.sub(r'"[^"]*"', '', cleaned)

        # 检查LIMIT模式（不在子查询中）
        patterns = [
            r'\bLIMIT\s+\d+\b',
            r'\bLIMIT\s+\$\d+\b',  # 参数化查询
            r'\bLIMIT\s+ALL\b',
        ]

        for pattern in patterns:
            if re.search(pattern, cleaned, re.IGNORECASE):
                # 确认不在子查询中（简单检查）
                if not self._is_in_subquery(cleaned, pattern):
                    return True

        return False

    def _is_in_subquery(self, sql: str, limit_match: str) -> bool:
        """简单检查LIMIT是否在子查询中。

        这是一个简化的检查，对于生产环境，
        应该使用更复杂的SQL解析。

        参数:
            sql: 清理后的SQL字符串
            limit_match: 找到的LIMIT匹配字符串

        返回:
            如果在子查询中返回True
        """
        # 查找匹配的LIMIT位置
        match = re.search(limit_match, sql, re.IGNORECASE)
        if not match:
            return False

        limit_pos = match.start()

        # 检查LIMIT之前是否有未匹配的左括号
        before_limit = sql[:limit_pos]
        open_parens = before_limit.count('(')
        close_parens = before_limit.count(')')

        # 如果左括号多于右括号，可能在子查询中
        return open_parens > close_parens

    def _contains_dangerous_keywords(self, sql: str) -> bool:
        """检查SQL是否包含危险关键词。

        参数:
            sql: SQL查询字符串

        返回:
            如果包含危险关键词返回True
        """
        dangerous_keywords = {
            'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
            'TRUNCATE', 'GRANT', 'REVOKE', 'COPY', 'VACUUM', 'ANALYZE'
        }

        # 清理SQL：移除字符串字面量
        cleaned = re.sub(r"'[^']*'", "", sql)
        cleaned = re.sub(r'"[^"]*"', '', cleaned)
        cleaned = re.sub(r'/\*.*?\*/', '', cleaned, flags=re.DOTALL)  # 移除注释

        # 检查关键词
        sql_upper = cleaned.upper()
        for keyword in dangerous_keywords:
            # 使用单词边界检查完整单词
            pattern = rf'\b{keyword}\b'
            if re.search(pattern, sql_upper):
                return True

        return False

    def _parse_explain_plan(self, plan_data: Any) -> dict[str, Any]:
        """解析EXPLAIN计划数据。

        参数:
            plan_data: EXPLAIN返回的JSON数据

        返回:
            简化的查询统计信息字典
        """
        if isinstance(plan_data, list) and len(plan_data) > 0:
            plan = plan_data[0].get('Plan', {})

            return {
                'total_cost': plan.get('Total Cost'),
                'startup_cost': plan.get('Startup Cost'),
                'actual_time': plan.get('Actual Total Time'),
                'actual_rows': plan.get('Actual Rows'),
                'plan_rows': plan.get('Plan Rows'),
                'node_type': plan.get('Node Type'),
                'scan_type': self._get_scan_type(plan)
            }

        return {}

    def _get_scan_type(self, plan: dict[str, Any]) -> str:
        """获取扫描类型描述。

        参数:
            plan: 查询计划节点

        返回:
            扫描类型描述
        """
        node_type = plan.get('Node Type', '')

        scan_types = {
            'Seq Scan': '顺序扫描',
            'Index Scan': '索引扫描',
            'Index Only Scan': '仅索引扫描',
            'Bitmap Heap Scan': '位图堆扫描',
            'Bitmap Index Scan': '位图索引扫描',
            'TID Scan': 'TID扫描'
        }

        return scan_types.get(node_type, node_type)
