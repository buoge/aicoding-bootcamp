"""使用 asyncpg 连接池的数据库连接管理器。"""

import asyncio
from typing import Optional

import asyncpg

from pg_mcp.exceptions import DatabaseError


class DatabaseManager:
    """使用 asyncpg 连接池管理 PostgreSQL 数据库连接。

    提供连接池、健康检查和安全连接管理。
    """

    def __init__(self) -> None:
        """初始化空的连接池注册表。"""
        self._pools: dict[str, asyncpg.Pool] = {}
        self._lock = asyncio.Lock()

    async def connect(
        self,
        db_id: str,
        host: str,
        database: str,
        user: str,
        password: str,
        port: int = 5432,
        min_size: int = 1,
        max_size: int = 10,
    ) -> bool:
        """为数据库创建连接池。

        参数:
            db_id: 唯一的数据库标识符
            host: 数据库主机
            database: 数据库名称
            user: 数据库用户
            password: 数据库密码
            port: 数据库端口 (默认: 5432)
            min_size: 最小连接池大小
            max_size: 最大连接池大小

        返回:
            如果连接成功返回 True，否则返回 False
        """
        async with self._lock:
            if db_id in self._pools:
                return True  # 已连接

            try:
                pool = await asyncpg.create_pool(
                    host=host,
                    port=port,
                    database=database,
                    user=user,
                    password=password,
                    min_size=min_size,
                    max_size=max_size,
                    command_timeout=30,
                    server_settings={
                        "application_name": f"pg_mcp_{db_id}",
                    },
                )

                # 测试连接
                async with pool.acquire() as conn:
                    await conn.fetch("SELECT 1")

                self._pools[db_id] = pool
                return True

            except Exception as e:
                raise DatabaseError(
                    f"连接数据库 '{db_id}' 失败: {e}",
                    details={"host": host, "port": port, "database": database},
                )

    def get_pool(self, db_id: str) -> Optional[asyncpg.Pool]:
        """获取数据库的连接池。

        参数:
            db_id: 数据库标识符

        返回:
            连接池，如果未连接则返回 None
        """
        return self._pools.get(db_id)

    async def disconnect(self, db_id: str) -> None:
        """关闭数据库的连接池。

        参数:
            db_id: 数据库标识符
        """
        pool = self._pools.pop(db_id, None)
        if pool:
            await pool.close()

    async def disconnect_all(self) -> None:
        """关闭所有连接池。"""
        pools = list(self._pools.items())
        self._pools.clear()

        for db_id, pool in pools:
            await pool.close()

    async def health_check(self, db_id: str) -> tuple[bool, str]:
        """检查数据库健康状态。

        参数:
            db_id: 数据库标识符

        返回:
            (是否健康, 消息) 的元组
        """
        pool = self.get_pool(db_id)
        if not pool:
            return False, f"数据库 '{db_id}' 未连接"

        try:
            async with pool.acquire() as conn:
                await conn.fetch("SELECT 1")
                return True, "连接正常"
        except Exception as e:
            return False, f"健康检查失败: {e}"

    def list_databases(self) -> list[str]:
        """列出所有已连接的数据库 ID。

        返回:
            数据库标识符列表
        """
        return list(self._pools.keys())
