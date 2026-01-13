"""QueryExecutor 集成测试。"""

import pytest
import asyncpg
from testcontainers.postgres import PostgresContainer
import asyncio
from datetime import datetime

from pg_mcp.database.manager import DatabaseManager
from pg_mcp.query.executor import QueryExecutor


@pytest.fixture(scope="module")
def postgres_container():
    """创建PostgreSQL测试容器。"""
    with PostgresContainer("postgres:15") as postgres:
        yield postgres


@pytest.fixture
async def real_db_manager(postgres_container):
    """创建管理真实数据库的管理器。"""
    manager = DatabaseManager()

    connection_url = postgres_container.get_connection_url()
    # 解析连接URL
    import re
    match = re.match(r'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(\w+)', connection_url)
    if match:
        user, password, host, port, database = match.groups()
        await manager.connect(
            db_id="test_db",
            host=host,
            port=int(port),
            database=database,
            user=user,
            password=password,
            min_size=1,
            max_size=5
        )
        yield manager
        await manager.disconnect("test_db")
    else:
        raise ValueError(f"无法解析连接URL: {connection_url}")


@pytest.fixture
async def test_data(real_db_manager):
    """创建测试数据。"""
    pool = real_db_manager.get_pool("test_db")
    async with pool.acquire() as conn:
        # 创建测试表
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS test_users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100),
                email VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS test_orders (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                amount DECIMAL(10, 2),
                status VARCHAR(20)
            )
        """)

        # 插入测试数据
        await conn.execute("""
            INSERT INTO test_users (name, email)
            VALUES
                ('Alice', 'alice@example.com'),
                ('Bob', 'bob@example.com'),
                ('Charlie', 'charlie@example.com'),
                ('David', 'david@example.com'),
                ('Eve', 'eve@example.com')
        """)

        await conn.execute("""
            INSERT INTO test_orders (user_id, amount, status)
            VALUES
                (1, 100.00, 'completed'),
                (1, 250.50, 'pending'),
                (2, 75.25, 'completed'),
                (3, 500.00, 'completed'),
                (1, 125.75, 'completed')
        """)

    yield

    # 清理数据
    async with pool.acquire() as conn:
        await conn.execute("DROP TABLE IF EXISTS test_orders")
        await conn.execute("DROP TABLE IF EXISTS test_users")


@pytest.mark.integration
class TestQueryExecutorIntegration:
    """QueryExecutor 集成测试类。"""

    async def test_execute_simple_select(self, real_db_manager, test_data):
        """测试执行简单SELECT查询。"""
        executor = QueryExecutor(real_db_manager)

        result = await executor.execute("test_db", "SELECT * FROM test_users ORDER BY id")

        assert result['row_count'] == 5
        assert result['columns'] == ['id', 'name', 'email', 'created_at']
        assert result['rows'][0]['name'] == 'Alice'
        assert result['has_more'] is False
        assert result['execution_time'] > 0

    async def test_execute_with_limit_injection(self, real_db_manager, test_data):
        """测试自动LIMIT注入。"""
        executor = QueryExecutor(real_db_manager)

        result = await executor.execute("test_db", "SELECT * FROM test_users", max_rows=3)

        assert result['row_count'] == 3
        assert result['has_more'] is True  # 因为总共有5行
        assert "LIMIT 3" in result['sql']

    async def test_execute_with_existing_limit(self, real_db_manager, test_data):
        """测试保留已存在的LIMIT。"""
        executor = QueryExecutor(real_db_manager)

        result = await executor.execute(
            "test_db",
            "SELECT * FROM test_users ORDER BY id LIMIT 2",
            max_rows=10
        )

        assert result['row_count'] == 2
        assert result['has_more'] is False  # 因为LIMIT 2限制了结果
        assert "LIMIT 2" in result['sql']
        assert "LIMIT 10" not in result['sql']

    async def test_execute_cte_query(self, real_db_manager, test_data):
        """测试CTE查询执行。"""
        executor = QueryExecutor(real_db_manager)

        sql = """
        WITH user_orders AS (
            SELECT u.name, COUNT(o.id) as order_count, SUM(o.amount) as total_amount
            FROM test_users u
            LEFT JOIN test_orders o ON u.id = o.user_id
            GROUP BY u.id, u.name
        )
        SELECT * FROM user_orders WHERE order_count > 0
        ORDER BY total_amount DESC
        """

        result = await executor.execute("test_db", sql, max_rows=10)

        assert result['row_count'] == 3  # Alice, Bob, Charlie
        assert 'name' in result['columns']
        assert 'order_count' in result['columns']
        assert result['rows'][0]['name'] == 'Alice'
        assert result['rows'][0]['order_count'] == 3

    async def test_execute_join_query(self, real_db_manager, test_data):
        """测试JOIN查询执行。"""
        executor = QueryExecutor(real_db_manager)

        sql = """
        SELECT u.name, o.amount, o.status
        FROM test_users u
        JOIN test_orders o ON u.id = o.user_id
        WHERE u.name = 'Alice'
        ORDER BY o.amount
        """

        result = await executor.execute("test_db", sql)

        assert result['row_count'] == 3  # Alice有3个订单
        assert all(row['name'] == 'Alice' for row in result['rows'])

    async def test_execute_aggregation_query(self, real_db_manager, test_data):
        """测试聚合查询执行。"""
        executor = QueryExecutor(real_db_manager)

        sql = """
        SELECT status, COUNT(*) as order_count, SUM(amount) as total_amount
        FROM test_orders
        GROUP BY status
        ORDER BY status
        """

        result = await executor.execute("test_db", sql)

        assert result['row_count'] == 2  # completed, pending
        assert 'status' in result['columns']
        assert 'order_count' in result['columns']

        # 验证数据
        status_map = {row['status']: row for row in result['rows']}
        assert status_map['completed']['order_count'] == 4
        assert status_map['completed']['total_amount'] == 801.0
        assert status_map['pending']['order_count'] == 1

    async def test_execute_query_with_parameters(self, real_db_manager, test_data):
        """测试带参数的查询（检查处理）。"""
        executor = QueryExecutor(real_db_manager)

        # 虽然execute方法不直接处理参数，但我们测试注入的LIMIT是否正确工作
        result = await executor.execute(
            "test_db",
            "SELECT * FROM test_users WHERE name LIKE 'A%'",
            max_rows=10
        )

        assert result['row_count'] == 1
        assert result['rows'][0]['name'] == 'Alice'

    async def test_test_connection_success(self, real_db_manager):
        """测试连接测试成功。"""
        executor = QueryExecutor(real_db_manager)

        success, message = await executor.test_connection("test_db")

        assert success is True
        assert message == "连接正常"

    async def test_test_connection_failure(self, real_db_manager):
        """测试连接测试失败。"""
        executor = QueryExecutor(real_db_manager)

        # 断开连接
        await real_db_manager.disconnect("test_db")

        success, message = await executor.test_connection("test_db")

        assert success is False
        assert "未连接" in message

    async def test_get_query_stats_success(self, real_db_manager, test_data):
        """测试获取查询统计成功。"""
        executor = QueryExecutor(real_db_manager)

        stats = await executor.get_query_stats(
            "test_db",
            "SELECT * FROM test_users WHERE id = 1"
        )

        assert stats is not None
        assert 'plan_rows' in stats
        assert 'node_type' in stats

    async def test_get_query_stats_dangerous_sql(self, real_db_manager):
        """测试危险SQL不执行EXPLAIN。"""
        executor = QueryExecutor(real_db_manager)

        stats = await executor.get_query_stats("test_db", "DROP TABLE test_users")

        assert stats is None

    async def test_execute_dangerous_queries_blocked(self, real_db_manager):
        """测试危险查询被阻止。"""
        executor = QueryExecutor(real_db_manager)

        dangerous_queries = [
            "DROP TABLE test_users",
            "UPDATE test_users SET name = 'hacker'",
            "DELETE FROM test_users",
            "INSERT INTO test_users VALUES (99, 'hacker')",
            "CREATE TABLE evil (id int)",
            "ALTER TABLE test_users DROP COLUMN email",
            "TRUNCATE TABLE test_users",
        ]

        for sql in dangerous_queries:
            with pytest.raises(Exception) as exc:  # SecurityError 或其他异常
                await executor.execute("test_db", sql)
            assert "危险" in str(exc.value) or "DROP" in str(exc.value)

    async def test_execute_query_timeout(self, real_db_manager):
        """测试查询超时。"""
        executor = QueryExecutor(real_db_manager)

        # 使用EXPLAIN ANALYZE创建长时间运行的查询
        sql = """
        WITH RECURSIVE test AS (
            SELECT 1 as n
            UNION ALL
            SELECT n + 1 FROM test WHERE n < 1000000
        )
        SELECT * FROM test
        """

        result = await executor.execute("test_db", sql, timeout=0.1)

        # 查询可能被取消或成功，取决于数据库速度
        assert 'execution_time' in result
        assert result['execution_time'] < 5.0  # 应该很快结束

    async def test_data_types_handling(self, real_db_manager, test_data):
        """测试不同数据类型的处理。"""
        executor = QueryExecutor(real_db_manager)

        result = await executor.execute("test_db", """
            SELECT
                id,
                name,
                email,
                created_at,
                created_at::date as created_date
            FROM test_users
            ORDER BY id
            LIMIT 1
        """)

        assert result['row_count'] == 1
        row = result['rows'][0]
        assert isinstance(row['id'], int)
        assert isinstance(row['name'], str)
        assert 'created_at' in row
        assert 'created_date' in row

    async def test_cte_with_limit_injection(self, real_db_manager, test_data):
        """测试需要LIMIT注入的CTE。"""
        executor = QueryExecutor(real_db_manager)

        sql = """
        WITH monthly_summary AS (
            SELECT
                DATE_TRUNC('month', created_at) as month,
                COUNT(*) as user_count
            FROM test_users
            GROUP BY DATE_TRUNC('month', created_at)
        )
        SELECT * FROM monthly_summary
        """

        result = await executor.execute("test_db", sql, max_rows=10)

        assert result['row_count'] <= 10
        assert "LIMIT 10" in result['sql']

    async def test_error_handling_invalid_sql(self, real_db_manager):
        """测试无效SQL的错误处理。"""
        executor = QueryExecutor(real_db_manager)

        with pytest.raises(Exception):
            await executor.execute("test_db", "INVALID SQL SYNTAX HERE")

    async def test_concurrent_queries(self, real_db_manager, test_data):
        """测试并发查询执行。"""
        executor = QueryExecutor(real_db_manager)

        async def run_query(user_id):
            result = await executor.execute(
                "test_db",
                f"SELECT * FROM test_users WHERE id = {user_id}"
            )
            return result

        # 并发执行多个查询
        tasks = [run_query(i) for i in range(1, 6)]
        results = await asyncio.gather(*tasks)

        assert len(results) == 5
        for result in results:
            assert result['row_count'] == 1
            assert 'name' in result['columns']

    async def test_empty_result_handling(self, real_db_manager):
        """测试空结果集的处理。"""
        executor = QueryExecutor(real_db_manager)

        result = await executor.execute(
            "test_db",
            "SELECT * FROM test_users WHERE id > 1000"
        )

        assert result['row_count'] == 0
        assert len(result['rows']) == 0
        assert len(result['columns']) == 4
        assert result['has_more'] is False
