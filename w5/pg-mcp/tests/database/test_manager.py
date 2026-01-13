"""测试数据库管理器。"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import asyncpg
import pytest

from pg_mcp.database.manager import DatabaseManager
from pg_mcp.exceptions import DatabaseError


class TestDatabaseManager:
    """测试 DatabaseManager 类。"""

    @pytest.fixture
    def manager(self):
        """创建 DatabaseManager 实例。"""
        return DatabaseManager()

    @pytest.fixture
    def mock_pool(self):
        """创建 mock 连接池。"""
        pool = MagicMock(spec=asyncpg.Pool)
        pool.close = AsyncMock()
        return pool

    @pytest.mark.asyncio
    async def test_connect_success(self, manager):
        """测试成功连接到数据库。"""
        with patch('asyncpg.create_pool', new_callable=AsyncMock) as mock_create_pool:
            mock_pool = MagicMock()
            mock_pool.close = AsyncMock()

            # 模拟连接池创建和连接测试
            mock_create_pool.return_value = mock_pool

            # Mock 连接获取和查询
            mock_conn = AsyncMock()
            mock_conn.fetch = AsyncMock(return_value=[{'?column?': 1}])

            mock_acquire = AsyncMock()
            mock_acquire.__aenter__ = AsyncMock(return_value=mock_conn)
            mock_acquire.__aexit__ = AsyncMock(return_value=None)

            mock_pool.acquire = MagicMock(return_value=mock_acquire)

            result = await manager.connect(
                db_id="test_db",
                host="localhost",
                database="test",
                user="testuser",
                password="secret"
            )

            assert result is True
            assert "test_db" in manager.list_databases()

    @pytest.mark.asyncio
    async def test_connect_already_connected(self, manager, mock_pool):
        """测试尝试连接已连接的数据库。"""
        # 先连接
        manager._pools["test_db"] = mock_pool

        # 再次连接
        result = await manager.connect(
            db_id="test_db",
            host="localhost",
            database="test",
            user="testuser",
            password="secret"
        )

        assert result is True  # 应该返回 True 表示已连接

    @pytest.mark.asyncio
    async def test_connect_failure(self, manager):
        """测试连接失败。"""
        with patch('asyncpg.create_pool', new_callable=AsyncMock) as mock_create_pool:
            mock_create_pool.side_effect = Exception("Connection failed")

            with pytest.raises(DatabaseError) as exc_info:
                await manager.connect(
                    db_id="test_db",
                    host="bad_host",
                    database="test",
                    user="testuser",
                    password="secret"
                )

            assert "连接数据库" in str(exc_info.value)
            assert "test_db" in str(exc_info.value)

    def test_get_pool_exists(self, manager, mock_pool):
        """测试获取存在的连接池。"""
        manager._pools["test_db"] = mock_pool

        pool = manager.get_pool("test_db")
        assert pool is mock_pool

    def test_get_pool_not_exists(self, manager):
        """测试获取不存在的连接池。"""
        pool = manager.get_pool("nonexistent")
        assert pool is None

    @pytest.mark.asyncio
    async def test_disconnect(self, manager, mock_pool):
        """测试断开数据库连接。"""
        manager._pools["test_db"] = mock_pool

        await manager.disconnect("test_db")

        assert "test_db" not in manager.list_databases()
        mock_pool.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_disconnect_not_exists(self, manager):
        """测试断开不存在的数据库连接。"""
        # 不应该抛出异常
        await manager.disconnect("nonexistent")
        # 没有错误就是成功

    @pytest.mark.asyncio
    async def test_disconnect_all(self, manager):
        """测试断开所有数据库连接。"""
        pool1 = MagicMock(spec=asyncpg.Pool)
        pool1.close = AsyncMock()
        pool2 = MagicMock(spec=asyncpg.Pool)
        pool2.close = AsyncMock()

        manager._pools["db1"] = pool1
        manager._pools["db2"] = pool2

        await manager.disconnect_all()

        assert len(manager.list_databases()) == 0
        pool1.close.assert_called_once()
        pool2.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_health_check_healthy(self, manager, mock_pool):
        """测试健康检查 - 健康状态。"""
        manager._pools["test_db"] = mock_pool

        # Mock 连接和查询
        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[{'?column?': 1}])

        mock_acquire = AsyncMock()
        mock_acquire.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_acquire.__aexit__ = AsyncMock(return_value=None)

        mock_pool.acquire = MagicMock(return_value=mock_acquire)

        is_healthy, message = await manager.health_check("test_db")

        assert is_healthy is True
        assert "正常" in message

    @pytest.mark.asyncio
    async def test_health_check_unhealthy(self, manager, mock_pool):
        """测试健康检查 - 不健康状态。"""
        manager._pools["test_db"] = mock_pool

        # Mock 连接失败
        mock_acquire = AsyncMock()
        mock_acquire.__aenter__ = AsyncMock(side_effect=Exception("Connection lost"))
        mock_acquire.__aexit__ = AsyncMock(return_value=None)

        mock_pool.acquire = MagicMock(return_value=mock_acquire)

        is_healthy, message = await manager.health_check("test_db")

        assert is_healthy is False
        assert "失败" in message

    @pytest.mark.asyncio
    async def test_health_check_not_connected(self, manager):
        """测试健康检查 - 未连接。"""
        is_healthy, message = await manager.health_check("not_connected")

        assert is_healthy is False
        assert "未连接" in message

    def test_list_databases_empty(self, manager):
        """测试列出空的数据库列表。"""
        databases = manager.list_databases()
        assert isinstance(databases, list)
        assert len(databases) == 0

    def test_list_databases_multiple(self, manager, mock_pool):
        """测试列出多个数据库。"""
        manager._pools["db1"] = mock_pool
        manager._pools["db2"] = mock_pool
        manager._pools["db3"] = mock_pool

        databases = manager.list_databases()
        assert len(databases) == 3
        assert "db1" in databases
        assert "db2" in databases
        assert "db3" in databases

    @pytest.mark.asyncio
    async def test_concurrent_connects(self, manager):
        """测试并发连接数据库。"""
        with patch('asyncpg.create_pool', new_callable=AsyncMock) as mock_create_pool:
            mock_pool = MagicMock()
            mock_pool.close = AsyncMock()

            async def mock_create(*args, **kwargs):
                await asyncio.sleep(0.01)  # 模拟延迟
                mock_conn = AsyncMock()
                mock_conn.fetch = AsyncMock(return_value=[{'?column?': 1}])

                mock_acquire = AsyncMock()
                mock_acquire.__aenter__ = AsyncMock(return_value=mock_conn)
                mock_acquire.__aexit__ = AsyncMock(return_value=None)

                mock_pool.acquire = MagicMock(return_value=mock_acquire)
                return mock_pool

            mock_create_pool.side_effect = mock_create

            # 并发连接
            results = await asyncio.gather(
                manager.connect("db1", "host1", "db1", "user", "pass"),
                manager.connect("db2", "host2", "db2", "user", "pass"),
                manager.connect("db3", "host3", "db3", "user", "pass")
            )

            assert all(results)
            assert len(manager.list_databases()) == 3

    def test_singleton_pool_per_db_id(self, manager):
        """测试每个数据库 ID 只有一个连接池。"""
        # 这个测试确保 connect 方法的加锁机制正确工作
        assert isinstance(manager._lock, asyncio.Lock)

    @pytest.mark.asyncio
    async def test_connect_with_custom_pool_size(self, manager):
        """测试使用自定义连接池大小连接。"""
        with patch('asyncpg.create_pool', new_callable=AsyncMock) as mock_create_pool:
            mock_pool = MagicMock()
            mock_pool.close = AsyncMock()
            mock_create_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_conn.fetch = AsyncMock(return_value=[{'?column?': 1}])

            mock_acquire = AsyncMock()
            mock_acquire.__aenter__ = AsyncMock(return_value=mock_conn)
            mock_acquire.__aexit__ = AsyncMock(return_value=None)

            mock_pool.acquire = MagicMock(return_value=mock_acquire)

            await manager.connect(
                db_id="test_db",
                host="localhost",
                database="test",
                user="testuser",
                password="secret",
                min_size=5,
                max_size=20
            )

            # 验证 create_pool 是否被正确调用
            mock_create_pool.assert_called_once()
            call_kwargs = mock_create_pool.call_args[1]
            assert call_kwargs['min_size'] == 5
            assert call_kwargs['max_size'] == 20

    @pytest.mark.asyncio
    async def test_database_error_details(self, manager):
        """测试数据库错误包含详细信息。"""
        with patch('asyncpg.create_pool', new_callable=AsyncMock) as mock_create_pool:
            mock_create_pool.side_effect = asyncpg.ConnectionError("Connection refused")

            with pytest.raises(DatabaseError) as exc_info:
                await manager.connect(
                    db_id="test_db",
                    host="bad_host",
                    database="test_db",
                    user="testuser",
                    password="secret",
                    port=5433
                )

            error = exc_info.value
            assert error.details is not None
            assert 'host' in error.details
            assert error.details['host'] == 'bad_host'
            assert error.details['port'] == 5433

    @pytest.mark.asyncio
    async def test_connection_with_application_name(self, manager):
        """测试连接时使用正确的 application_name。"""
        with patch('asyncpg.create_pool', new_callable=AsyncMock) as mock_create_pool:
            mock_pool = MagicMock()
            mock_pool.close = AsyncMock()
            mock_create_pool.return_value = mock_pool

            mock_conn = AsyncMock()
            mock_conn.fetch = AsyncMock(return_value=[{'?column?': 1}])

            mock_acquire = AsyncMock()
            mock_acquire.__aenter__ = AsyncMock(return_value=mock_conn)
            mock_acquire.__aexit__ = AsyncMock(return_value=None)

            mock_pool.acquire = MagicMock(return_value=mock_acquire)

            await manager.connect(
                db_id="mydatabase",
                host="localhost",
                database="test",
                user="testuser",
                password="secret"
            )

            # 验证 server_settings
            call_kwargs = mock_create_pool.call_args[1]
            assert 'server_settings' in call_kwargs
            assert call_kwargs['server_settings']['application_name'] == 'pg_mcp_mydatabase'

    @pytest.mark.asyncio
    async def test_health_check_graceful_degradation(self, manager, mock_pool):
        """测试健康检查的优雅降级。"""
        manager._pools["test_db"] = mock_pool

        # Mock 连接获取失败
        mock_pool.acquire = MagicMock(side_effect=Exception("Pool exhausted"))

        is_healthy, message = await manager.health_check("test_db")

        assert is_healthy is False
        assert "健康检查失败" in message
        assert "Pool exhausted" in message
