"""QueryService - 协调所有组件的核心服务。

提供自然语言查询、SQL执行、数据库管理和模式操作的高级接口。
"""

from typing import Any, Dict, List, Optional

from pg_mcp.config.loader import Config
from pg_mcp.database.manager import DatabaseManager
from pg_mcp.database.schema import SchemaManager
from pg_mcp.llm.service import LLMService
from pg_mcp.query.executor import QueryExecutor
from pg_mcp.security.validator import SQLSecurityValidator
from pg_mcp.exceptions import (
    PGMCPErr,
    ConfigError,
    DatabaseError,
    SchemaError,
    SecurityError,
    QueryError,
    LLMError,
)


class QueryService:
    """查询服务，协调数据库管理、模式管理、LLM 服务和查询执行。

    提供以下核心功能：
    - 自然语言到 SQL 的转换
    - SQL 安全验证和执行
    - 数据库连接管理
    - 模式信息获取和缓存
    - 结果验证
    """

    def __init__(self, config: Config) -> None:
        """初始化查询服务。

        参数:
            config: 配置对象

        引发:
            ConfigError: 如果配置无效
        """
        # 验证配置
        errors = config.validate()
        if errors:
            raise ConfigError(f"配置验证失败: {'; '.join(errors)}")

        self.config = config

        # 初始化组件
        self.db_manager = DatabaseManager()
        self.schema_manager = SchemaManager(self.db_manager, config.get_schema_config())
        self.security_validator = SQLSecurityValidator(**config.get("security", {}))
        self.query_executor = QueryExecutor(self.db_manager)

        # 根据配置初始化 LLM 服务
        llm_config = config.get_llm_config()
        self.llm_service = LLMService(
            api_key=llm_config["api_key"],
            base_url=llm_config.get("base_url", "https://api.moonshot.cn/v1"),
            model=llm_config.get("model", "kimi-k2-thinking-turbo"),
            temperature=llm_config.get("temperature", 0.1),
            max_tokens=llm_config.get("max_tokens", 4000),
            timeout=llm_config.get("timeout", 60),
            max_retries=llm_config.get("max_retries", 3),
        )

        # 查询配置
        query_config = config.get_query_config()
        self.default_max_rows = query_config.get("max_rows", 1000)
        self.default_timeout = query_config.get("timeout", 30)
        self.enable_explain = query_config.get("enable_explain", False)

    async def query_database(
        self,
        query: str,
        db_id: str,
        validate_result: bool = False,
        max_rows: Optional[int] = None,
        timeout: Optional[float] = None,
    ) -> Dict[str, Any]:
        """执行自然语言查询并返回结果。

        工作流程：
        1. 验证数据库存在
        2. 获取模式信息
        3. 使用 LLM 生成 SQL
        4. 验证 SQL 安全性
        5. 执行 SQL
        6. 可选：使用 LLM 验证结果

        参数:
            query: 自然语言查询
            db_id: 数据库标识符
            validate_result: 是否使用 LLM 验证结果
            max_rows: 最大返回行数（默认来自配置）
            timeout: 查询超时时间（秒）

        返回:
            包含以下字段的字典：
                - success: 是否成功
                - query: 原始查询
                - sql: 生成的 SQL
                - results: 查询结果列表
                - columns: 列名列表
                - row_count: 结果行数
                - execution_time: 执行时间（秒）
                - validation: 验证结果（可选）
                - error: 错误信息（如果失败）
                - error_code: 错误代码（如果失败）

        引发:
            PGMCPErr: 如果发生重大错误
        """
        max_rows = max_rows or self.default_max_rows
        timeout = timeout or self.default_timeout

        try:
            # 步骤 1: 验证数据库存在
            pool = self.db_manager.get_pool(db_id)
            if not pool:
                # 尝试连接
                db_config = self.config.get_database(db_id)
                if not db_config:
                    return {
                        "success": False,
                        "query": query,
                        "error": f"数据库 '{db_id}' 未找到",
                        "error_code": "DB_NOT_FOUND",
                    }

                try:
                    await self.db_manager.connect(
                        db_id=db_id,
                        host=db_config["host"],
                        database=db_config["database"],
                        user=db_config["user"],
                        password=db_config["password"],
                        port=db_config.get("port", 5432),
                        min_size=db_config.get("min_pool_size", 1),
                        max_size=db_config.get("max_pool_size", 10),
                    )
                except DatabaseError as e:
                    return {
                        "success": False,
                        "query": query,
                        "error": f"数据库连接失败: {e.message}",
                        "error_code": "DB_CONNECTION_ERROR",
                    }

            # 步骤 2: 获取模式信息
            try:
                schema_text = self.schema_manager.get_schema_text(db_id)
            except SchemaError as e:
                return {
                    "success": False,
                    "query": query,
                    "error": f"获取模式失败: {e.message}",
                    "error_code": "SCHEMA_ERROR",
                }

            # 步骤 3: 使用 LLM 生成 SQL
            try:
                sql = await self.llm_service.generate_sql(query, schema_text)
            except LLMError as e:
                return {
                    "success": False,
                    "query": query,
                    "error": f"SQL 生成失败: {e.message}",
                    "error_code": "LLM_ERROR",
                }

            # 步骤 4: 验证 SQL 安全性
            is_valid, message = self.security_validator.validate(sql)
            if not is_valid:
                return {
                    "success": False,
                    "query": query,
                    "sql": sql,
                    "error": f"SQL 验证失败: {message}",
                    "error_code": "SECURITY_ERROR",
                }

            # 步骤 5: 执行 SQL
            try:
                result = await self.query_executor.execute(
                    db_id=db_id,
                    sql=sql,
                    max_rows=max_rows,
                    timeout=timeout,
                )
            except QueryError as e:
                return {
                    "success": False,
                    "query": query,
                    "sql": sql,
                    "error": f"查询执行失败: {e.message}",
                    "error_code": "QUERY_ERROR",
                }

            # 步骤 6: 可选的结果验证
            validation_result = None
            if validate_result:
                try:
                    # 只发送结果预览（前 5 行）
                    preview_rows = result["rows"][:5] if len(result["rows"]) > 5 else result["rows"]
                    result_preview = {
                        "columns": result["columns"],
                        "row_count": result["row_count"],
                        "preview_rows": preview_rows,
                    }
                    validation_result = await self.llm_service.validate_result(
                        user_query=query,
                        sql=sql,
                        result_preview=str(result_preview),
                    )
                except LLMError:
                    # 验证失败不是致命错误
                    validation_result = {
                        "validation_score": 50,
                        "issues_found": ["结果验证失败"],
                        "suggestions": ["请手动检查结果"],
                        "is_correct": True,
                        "confidence": "low",
                    }

            # 构建成功响应
            response = {
                "success": True,
                "query": query,
                "sql": result["sql"],
                "results": result["rows"],
                "columns": result["columns"],
                "row_count": result["row_count"],
                "execution_time": result["execution_time"],
                "has_more": result.get("has_more", False),
            }

            if validation_result:
                response["validation"] = validation_result

            return response

        except Exception as e:
            # 捕获所有未预期的错误
            error_msg = f"意外错误: {type(e).__name__}: {str(e)}"
            return {
                "success": False,
                "query": query,
                "error": error_msg,
                "error_code": "UNEXPECTED_ERROR",
            }

    async def execute_sql(
        self,
        sql: str,
        db_id: str,
        max_rows: Optional[int] = None,
        timeout: Optional[float] = None,
        add_limit_if_missing: bool = True,
    ) -> Dict[str, Any]:
        """执行 SQL 查询（带验证）。

        工作流程：
        1. 验证 SQL 安全性
        2. 如果有效，则执行

        参数:
            sql: SQL 查询字符串
            db_id: 数据库标识符
            max_rows: 最大返回行数
            timeout: 查询超时时间（秒）
            add_limit_if_missing: 如果缺失是否添加 LIMIT

        返回:
            包含以下字段的字典：
                - success: 是否成功
                - sql: 执行的 SQL
                - results: 查询结果列表
                - columns: 列名列表
                - row_count: 结果行数
                - execution_time: 执行时间（秒）
                - has_more: 是否有更多数据
                - error: 错误信息（如果失败）
                - error_code: 错误代码（如果失败）
        """
        max_rows = max_rows or self.default_max_rows
        timeout = timeout or self.default_timeout

        try:
            # 验证 SQL 安全性
            is_valid, message = self.security_validator.validate(sql)
            if not is_valid:
                return {
                    "success": False,
                    "sql": sql,
                    "error": f"SQL 验证失败: {message}",
                    "error_code": "SECURITY_ERROR",
                }

            # 添加 LIMIT（如果需要）
            if add_limit_if_missing:
                sql = self.security_validator.add_limit_if_missing(sql, max_rows)

            # 验证数据库连接
            pool = self.db_manager.get_pool(db_id)
            if not pool:
                return {
                    "success": False,
                    "sql": sql,
                    "error": f"数据库 '{db_id}' 未连接",
                    "error_code": "DB_NOT_CONNECTED",
                }

            # 执行查询
            result = await self.query_executor.execute(
                db_id=db_id,
                sql=sql,
                max_rows=max_rows,
                timeout=timeout,
            )

            return {
                "success": True,
                "sql": result["sql"],
                "results": result["rows"],
                "columns": result["columns"],
                "row_count": result["row_count"],
                "execution_time": result["execution_time"],
                "has_more": result.get("has_more", False),
            }

        except QueryError as e:
            return {
                "success": False,
                "sql": sql,
                "error": f"查询执行失败: {e.message}",
                "error_code": "QUERY_ERROR",
            }
        except Exception as e:
            error_msg = f"意外错误: {type(e).__name__}: {str(e)}"
            return {
                "success": False,
                "sql": sql,
                "error": error_msg,
                "error_code": "UNEXPECTED_ERROR",
            }

    async def list_databases(self) -> Dict[str, Any]:
        """列出所有已配置的数据库及其连接状态。

        返回:
            包含以下字段的字典：
                - success: 是否成功
                - databases: 数据库信息列表
                    - id: 数据库标识符
                    - host: 主机地址
                    - database: 数据库名称
                    - connected: 是否已连接
                    - status: 状态消息
                    - tables_count: 表数量（如果已连接）
        """
        databases = []
        configured_dbs = self.config.list_databases()

        for db_id in configured_dbs:
            db_config = self.config.get_database(db_id)
            if not db_config:
                continue

            db_info = {
                "id": db_id,
                "host": db_config.get("host", ""),
                "database": db_config.get("database", ""),
                "connected": False,
                "status": "未连接",
            }

            # 测试连接
            try:
                success, message = await self.query_executor.test_connection(db_id)
                db_info["connected"] = success
                db_info["status"] = message

                # 如果连接成功，获取表数量
                if success:
                    try:
                        result = await self.query_executor.execute(
                            db_id=db_id,
                            sql="SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')",
                            max_rows=1,
                        )
                        if result["rows"]:
                            db_info["tables_count"] = result["rows"][0].get("table_count", 0)
                    except Exception:
                        db_info["tables_count"] = 0

            except Exception as e:
                db_info["status"] = f"测试连接时出错: {str(e)}"

            databases.append(db_info)

        return {
            "success": True,
            "databases": databases,
        }

    async def refresh_schema(self, db_id: str) -> Dict[str, Any]:
        """强制刷新指定数据库的模式缓存。

        参数:
            db_id: 数据库标识符

        返回:
            包含以下字段的字典：
                - success: 是否成功
                - db_id: 数据库标识符
                - tables_count: 发现的表数量
                - error: 错误信息（如果失败）
        """
        try:
            # 验证数据库连接
            pool = self.db_manager.get_pool(db_id)
            if not pool:
                return {
                    "success": False,
                    "db_id": db_id,
                    "error": f"数据库 '{db_id}' 未连接",
                    "error_code": "DB_NOT_CONNECTED",
                }

            # 刷新模式
            schema = await self.schema_manager.refresh_schema(db_id)
            tables_count = len(schema.get("tables", {}))

            return {
                "success": True,
                "db_id": db_id,
                "tables_count": tables_count,
            }

        except SchemaError as e:
            return {
                "success": False,
                "db_id": db_id,
                "error": f"刷新模式失败: {e.message}",
                "error_code": "SCHEMA_ERROR",
            }
        except Exception as e:
            error_msg = f"意外错误: {type(e).__name__}: {str(e)}"
            return {
                "success": False,
                "db_id": db_id,
                "error": error_msg,
                "error_code": "UNEXPECTED_ERROR",
            }

    async def get_schema_info(self, db_id: str) -> Dict[str, Any]:
        """获取指定数据库的详细模式信息。

        参数:
            db_id: 数据库标识符

        返回:
            包含以下字段的字典：
                - success: 是否成功
                - db_id: 数据库标识符
                - schema: 模式信息字典
                    - tables: 表信息
                - schema_text: 格式化的模式文本
                - error: 错误信息（如果失败）
        """
        try:
            # 验证数据库连接
            pool = self.db_manager.get_pool(db_id)
            if not pool:
                return {
                    "success": False,
                    "db_id": db_id,
                    "error": f"数据库 '{db_id}' 未连接",
                    "error_code": "DB_NOT_CONNECTED",
                }

            # 获取模式
            schema = await self.schema_manager.get_schema(db_id)
            schema_text = self.schema_manager.get_schema_text(db_id)

            return {
                "success": True,
                "db_id": db_id,
                "schema": schema,
                "schema_text": schema_text,
                "tables_count": len(schema.get("tables", {})),
            }

        except SchemaError as e:
            return {
                "success": False,
                "db_id": db_id,
                "error": f"获取模式失败: {e.message}",
                "error_code": "SCHEMA_ERROR",
            }
        except Exception as e:
            error_msg = f"意外错误: {type(e).__name__}: {str(e)}"
            return {
                "success": False,
                "db_id": db_id,
                "error": error_msg,
                "error_code": "UNEXPECTED_ERROR",
            }

    async def close(self) -> None:
        """关闭所有连接和清理资源。"""
        await self.db_manager.disconnect_all()

    async def __aenter__(self):
        """异步上下文管理器入口。"""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """异步上下文管理器出口。"""
        await self.close()
