"""数据库模式管理和缓存模块。"""

import asyncio
import time
from typing import Any, Dict, Optional
from collections import OrderedDict

from pg_mcp.exceptions import SchemaError
from pg_mcp.database.manager import DatabaseManager


class SchemaCache:
    """LRU 模式的缓存实现。"""

    def __init__(self, max_size: int = 10, ttl: int = 3600):
        """初始化模式缓存。

        参数:
            max_size: 缓存最大条目数
            ttl: 缓存失效时间（秒）
        """
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._access_times: Dict[str, float] = {}
        self._order = OrderedDict()
        self.max_size = max_size
        self.ttl = ttl
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Optional[Dict[str, Any]]:
        """获取缓存的条目。

        参数:
            key: 缓存键

        返回:
            缓存的数据或 None
        """
        async with self._lock:
            if key not in self._cache:
                return None

            # 检查 TTL
            if time.time() - self._access_times[key] > self.ttl:
                await self.delete(key)
                return None

            # 更新访问时间并移动到末尾（LRU）
            self._access_times[key] = time.time()
            self._order.move_to_end(key)

            return self._cache[key]

    async def set(self, key: str, value: Dict[str, Any]) -> None:
        """设置缓存条目。

        参数:
            key: 缓存键
            value: 要缓存的数据
        """
        async with self._lock:
            # 如果键已存在，删除旧条目
            if key in self._cache:
                await self.delete(key)

            # 如果已达到最大大小，删除最旧的条目
            if len(self._cache) >= self.max_size and self._order:
                oldest_key = next(iter(self._order))
                await self.delete(oldest_key)

            # 添加新条目
            self._cache[key] = value
            self._access_times[key] = time.time()
            self._order[key] = None

    async def delete(self, key: str) -> None:
        """删除缓存条目。

        参数:
            key: 缓存键
        """
        async with self._lock:
            self._cache.pop(key, None)
            self._access_times.pop(key, None)
            self._order.pop(key, None)

    async def clear(self) -> None:
        """清空所有缓存。"""
        async with self._lock:
            self._cache.clear()
            self._access_times.clear()
            self._order.clear()

    def size(self) -> int:
        """获取缓存大小。

        返回:
            缓存中的条目数量
        """
        return len(self._cache)


class SchemaManager:
    """管理模式发现和缓存。

    提供带有 LRU 缓存的自动模式发现功能。
    """

    def __init__(self, db_manager: DatabaseManager, config: Optional[Dict[str, Any]] = None):
        """初始化模式管理器。

        参数:
            db_manager: 数据库管理器实例
            config: 模式配置字典
        """
        self.db_manager = db_manager
        self.config = config or {}

        # 缓存设置
        max_cache_size = self.config.get("max_cache_size", 5)
        cache_ttl = self.config.get("cache_ttl", 3600)
        self._cache = SchemaCache(max_size=max_cache_size, ttl=cache_ttl)

        # 模式设置
        self.max_tables = self.config.get("max_tables", 20)
        self.max_columns_per_table = self.config.get("max_columns_per_table", 50)
        self.include_schemas = self.config.get("include_schemas", [])
        self.exclude_schemas = self.config.get("exclude_schemas", ["pg_catalog", "information_schema"])

    async def get_schema(self, db_id: str, force_refresh: bool = False) -> Dict[str, Any]:
        """获取数据库的模式（带缓存）。

        参数:
            db_id: 数据库标识符
            force_refresh: 强制从数据库刷新

        返回:
            模式字典
        """
        cache_key = f"schema:{db_id}"

        if not force_refresh:
            cached_schema = await self._cache.get(cache_key)
            if cached_schema is not None:
                return cached_schema

        # 从数据库发现模式
        schema = await self._discover_schema(db_id)
        await self._cache.set(cache_key, schema)

        return schema

    async def refresh_schema(self, db_id: str) -> Dict[str, Any]:
        """刷新指定数据库的模式缓存。

        参数:
            db_id: 数据库标识符

        返回:
            更新的模式字典
        """
        return await self.get_schema(db_id, force_refresh=True)

    async def _discover_schema(self, db_id: str) -> Dict[str, Any]:
        """发现数据库的模式。

        参数:
            db_id: 数据库标识符

        返回:
            模式字典

        引发:
            SchemaError: 如果模式发现失败
        """
        pool = self.db_manager.get_pool(db_id)
        if not pool:
            raise SchemaError(f"数据库 '{db_id}' 未连接")

        try:
            async with pool.acquire() as conn:
                # 构建 schema 过滤条件
                schema_conditions = []
                params = []
                param_index = 1

                # 排除 schema
                if self.exclude_schemas:
                    placeholders = [f"${i}" for i in range(param_index, param_index + len(self.exclude_schemas))]
                    schema_conditions.append(f"table_schema NOT IN ({', '.join(placeholders)})")
                    params.extend(self.exclude_schemas)
                    param_index += len(self.exclude_schemas)

                # 包含 schema（如果指定）
                if self.include_schemas:
                    placeholders = [f"${i}" for i in range(param_index, param_index + len(self.include_schemas))]
                    schema_conditions.append(f"table_schema IN ({', '.join(placeholders)})")
                    params.extend(self.include_schemas)

                # 构建 WHERE 子句
                where_clause = ""
                if schema_conditions:
                    where_clause = "WHERE " + " AND ".join(schema_conditions)

                # 查询表信息
                query = f"""
                    SELECT table_schema, table_name
                    FROM information_schema.tables
                    {where_clause}
                    ORDER BY table_schema, table_name
                """

                tables = await conn.fetch(query, *params)

                schema = {"tables": {}}
                tables_processed = 0

                for table in tables:
                    if tables_processed >= self.max_tables:
                        break

                    table_schema = table["table_schema"]
                    table_name = table["table_name"]
                    full_name = f"{table_schema}.{table_name}"

                    # 获取列信息
                    columns = await conn.fetch("""
                        SELECT
                            column_name,
                            data_type,
                            is_nullable,
                            column_default,
                            ordinal_position
                        FROM information_schema.columns
                        WHERE table_schema = $1 AND table_name = $2
                        ORDER BY ordinal_position
                        LIMIT $3
                    """, table_schema, table_name, self.max_columns_per_table)

                    # 获取主键信息
                    pk_columns = await conn.fetch("""
                        SELECT a.attname
                        FROM pg_index i
                        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                        JOIN pg_class c ON c.oid = i.indrelid
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE i.indisprimary
                            AND n.nspname = $1
                            AND c.relname = $2
                    """, table_schema, table_name)

                    pk_column_names = [col["attname"] for col in pk_columns]

                    # 组织列信息
                    column_info = []
                    for col in columns:
                        column_info.append({
                            "name": col["column_name"],
                            "type": col["data_type"],
                            "nullable": col["is_nullable"] == "YES",
                            "default": col["column_default"],
                            "primary_key": col["column_name"] in pk_column_names,
                        })

                    schema["tables"][full_name] = {
                        "schema": table_schema,
                        "name": table_name,
                        "columns": column_info,
                        "primary_keys": pk_column_names,
                    }

                    tables_processed += 1

                return schema

        except Exception as e:
            raise SchemaError(f"模式发现失败: {e}", details={"db_id": db_id})

    def get_schema_text(
        self,
        db_id: str,
        max_tables: Optional[int] = None,
        format_type: str = "simple"
    ) -> str:
        """获取用于提示词的模式文本。

        参数:
            db_id: 数据库标识符
            max_tables: 最大表数量（覆盖配置）
            format_type: 格式类型 ("simple", "detailed", "minimal")

        返回:
            格式化的模式文本
        """
        import asyncio

        # 如果没有提供 async 事件循环，则创建一个
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        # 获取模式（如果未缓存可能需要同步）
        try:
            schema = loop.run_until_complete(self.get_schema(db_id))
        except Exception:
            # 回退到空模式
            schema = {"tables": {}}

        if not schema or "tables" not in schema:
            return "No schema information available."

        max_tables = max_tables or self.max_tables
        tables = list(schema["tables"].keys())[:max_tables]

        if format_type == "minimal":
            # 最小格式：只包含表名
            text = "Available tables:\n"
            for table_name in tables:
                text += f"- {table_name}\n"
            return text

        elif format_type == "detailed":
            # 详细格式：包含所有信息
            text = "Database Schema:\n\n"
            for table_name in tables:
                table_info = schema["tables"][table_name]
                text += f"Table: {table_name}\n"

                if table_info.get("primary_keys"):
                    text += f"  Primary Keys: {', '.join(table_info['primary_keys'])}\n"

                text += "  Columns:\n"
                for col in table_info["columns"]:
                    nullable = "NULL" if col["nullable"] else "NOT NULL"
                    pk_indicator = " (PK)" if col["primary_key"] else ""
                    default_str = f" DEFAULT {col['default']}" if col["default"] else ""
                    text += f"    - {col['name']}: {col['type']} {nullable}{default_str}{pk_indicator}\n"

                text += "\n"

        else:
            # 简单格式（默认）
            text = "Database Schema:\n\n"
            for table_name in tables:
                table_info = schema["tables"][table_name]
                text += f"Table: {table_name}\n"
                for col in table_info["columns"]:
                    nullable = "NULL" if col["nullable"] else "NOT NULL"
                    text += f"  - {col['name']}: {col['type']} {nullable}\n"
                text += "\n"

        return text

    async def clear_cache(self) -> None:
        """清空所有模式缓存。"""
        await self._cache.clear()

    def get_cache_info(self) -> dict[str, Any]:
        """获取缓存信息。

        返回:
            包含缓存统计信息的字典
        """
        return {
            "size": self._cache.size(),
            "max_size": self._cache.max_size,
            "ttl": self._cache.ttl,
            "max_tables": self.max_tables,
            "max_columns_per_table": self.max_columns_per_table,
        }
