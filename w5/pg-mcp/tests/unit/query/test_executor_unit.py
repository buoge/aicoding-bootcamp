"""QueryExecutor 单元测试。"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
import asyncpg
from pg_mcp.query.executor import QueryExecutor, QueryExecutionError
from pg_mcp.database.manager import DatabaseManager
from pg_mcp.exceptions import DatabaseError, SecurityError


class TestQueryExecutorInit:
    """测试 QueryExecutor 初始化。"""

    def test_init_with_valid_db_manager(self):
        """测试使用有效的 DatabaseManager 初始化。"""
        db_manager = Mock(spec=DatabaseManager)
        executor = QueryExecutor(db_manager)

        assert executor.db_manager == db_manager


class TestQueryExecutorExecute:
    """测试 execute 方法。"""

    @pytest.fixture
    def mock_db_manager(self):
        """创建模拟的 DatabaseManager。"""
        manager = Mock(spec=DatabaseManager)
        manager.get_pool = Mock(return_value=None)
        return manager

    @pytest.fixture
    def mock_pool(self):
        """创建模拟的连接池。"""
        return AsyncMock(spec=asyncpg.Pool)

    @pytest.fixture
    def mock_connection(self):
        """创建模拟的数据库连接。"""
        conn = AsyncMock(spec=asyncpg.Connection)
        conn.transaction = MagicMock(return_value=AsyncMock())
        conn.execute = AsyncMock()
        conn.fetch = AsyncMock()
        conn.get_settings = Mock(return_value={})
        return conn

    @pytest.mark.asyncio
    async def test_execute_select_query_success(self, mock_db_manager, mock_pool, mock_connection):
        """测试成功执行 SELECT 查询。"""
        # 设置模拟
        mock_db_manager.get_pool = Mock(return_value=mock_pool)
        mock_pool.acquire = AsyncMock(return_value=mock_connection)
        # 创建类似Record的对象
        rows = [
            type('Record', (), {'keys': lambda: ['id', 'name'], 'get': lambda self, k: getattr(self, k)})(),
            type('Record', (), {'keys': lambda: ['id', 'name'], 'get': lambda self, k: getattr(self, k)})()
        ]
        rows[0].id = 1
        rows[0].name = 'Alice'
        rows[1].id = 2
        rows[1].name = 'Bob'

        mock_connection.fetch = AsyncMock(return_value=rows)

        executor = QueryExecutor(mock_db_manager)
        result = await executor.execute('test_db', 'SELECT * FROM users LIMIT 10')

        # 验证结果
        assert result['row_count'] == 2
        assert result['columns'] == ['id', 'name']
        assert len(result['rows']) == 2
        assert result['rows'][0] == {'id': 1, 'name': 'Alice'}
        assert result['rows'][1] == {'id': 2, 'name': 'Bob'}
        assert result['has_more'] is False
        assert 'execution_time' in result
        assert result['sql'] == 'SELECT * FROM users LIMIT 10'

    @pytest.mark.asyncio
    async def test_execute_adds_limit_automatically(self, mock_db_manager, mock_pool, mock_connection):
        """测试自动添加 LIMIT。"""
        mock_db_manager.get_pool = Mock(return_value=mock_pool)
        mock_pool.acquire = AsyncMock(return_value=mock_connection)
        mock_connection.fetch = AsyncMock(return_value=[])

        executor = QueryExecutor(mock_db_manager)
        result = await executor.execute('test_db', 'SELECT * FROM users')

        # 验证执行时SQL包含LIMIT
        call_args = mock_connection.fetch.call_args[0][0]
        assert 'LIMIT' in call_args
        assert '1000' in call_args

    @pytest.mark.asyncio
    async def test_execute_keeps_existing_limit(self, mock_db_manager, mock_pool, mock_connection):
        """测试保留已存在的 LIMIT。"""
        mock_db_manager.get_pool = Mock(return_value=mock_pool)
        mock_pool.acquire = AsyncMock(return_value=mock_connection)
        mock_connection.fetch = AsyncMock(return_value=[])

        executor = QueryExecutor(mock_db_manager)
        result = await executor.execute('test_db', 'SELECT * FROM users LIMIT 50')

        # 验证LIMIT保持为50
        call_args = mock_connection.fetch.call_args[0][0]
        assert 'LIMIT 50' in call_args
        assert 'LIMIT 1000' not in call_args

    @pytest.mark.asyncio
    async def test_execute_cte_query_with_limit(self, mock_db_manager, mock_pool, mock_connection):
        """测试CTE查询自动添加LIMIT。"""
        mock_db_manager.get_pool = Mock(return_value=mock_pool)
        mock_pool.acquire = AsyncMock(return_value=mock_connection)
        mock_connection.fetch = AsyncMock(return_value=[])

        executor = QueryExecutor(mock_db_manager)
        sql = '''
        WITH active_users AS (
            SELECT * FROM users WHERE active = true
        )
        SELECT * FROM active_users
        '''
        await executor.execute('test_db', sql)

        # 验证LIMIT被添加
        call_args = mock_connection.fetch.call_args[0][0]
        assert 'LIMIT 1000' in call_args

    @pytest.mark.asyncio
    async def test_execute_with_custom_max_rows(self, mock_db_manager, mock_pool, mock_connection):
        """测试自定义最大行数限制。"""
        mock_db_manager.get_pool = Mock(return_value=mock_pool)
        mock_pool.acquire = AsyncMock(return_value=mock_connection)
        mock_connection.fetch = AsyncMock(return_value=[
            asyncpg.Record({'id': i}) for i in range(500)
        ])

        executor = QueryExecutor(mock_db_manager)
        result = await executor.execute('test_db', 'SELECT * FROM users', max_rows=500)

        # 验证LIMIT为500
        call_args = mock_connection.fetch.call_args[0][0]
        assert 'LIMIT 500' in call_args
        # 验证超过max_rows时has_more为True
        assert result['has_more'] is True

    @pytest.mark.asyncio
    async def test_execute_database_not_connected(self, mock_db_manager):
        """测试未连接数据库时的错误处理。"""
        mock_db_manager.get_pool = Mock(return_value=None)

        executor = QueryExecutor(mock_db_manager)

        with pytest.raises(DatabaseError, match="未连接"):
            await executor.execute('nonexistent_db', 'SELECT 1')

    @pytest.mark.asyncio
    async def test_execute_query_timeout(self, mock_db_manager, mock_pool, mock_connection):
        """测试查询超时处理。"""
        mock_db_manager.get_pool = Mock(return_value=mock_pool)
        mock_pool.acquire = AsyncMock(return_value=mock_connection)
        mock_connection.fetch = AsyncMock(side_effect=asyncpg.exceptions.QueryCanceledError(
            "Query canceled due to statement_timeout"
        ))

        executor = QueryExecutor(mock_db_manager)

        with pytest.raises(QueryExecutionError, match="查询超时"):
            await executor.execute('test_db', 'SELECT * FROM users', timeout=1.0)

    @pytest.mark.asyncio
    async def test_execute_dangerous_sql_blocked(self, mock_db_manager):
        """测试危险SQL被阻止。"""
        dangerous_queries = [
            'DROP TABLE users',
            'DELETE FROM users',
            'UPDATE users SET name = "hacker"',
            'INSERT INTO users VALUES (1, "hacker")',
            'CREATE TABLE evil (id int)',
            'ALTER TABLE users DROP COLUMN name',
            'TRUNCATE TABLE users',
        ]

        executor = QueryExecutor(mock_db_manager)
        mock_db_manager.get_pool = Mock(return_value=Mock())

        for sql in dangerous_queries:
            with pytest.raises(SecurityError, match="包含危险关键词"):
                await executor.execute('test_db', sql)

    @pytest.mark.asyncio
    async def test_execute_query_execution_error(self, mock_db_manager, mock_pool, mock_connection):
        """测试查询执行错误。"""
        mock_db_manager.get_pool = Mock(return_value=mock_pool)
        mock_pool.acquire = AsyncMock(return_value=mock_connection)
        mock_connection.fetch = AsyncMock(side_effect=asyncpg.exceptions.SyntaxError(
            "语法错误"
        ))

        executor = QueryExecutor(mock_db_manager)

        with pytest.raises(QueryExecutionError, match="查询执行错误"):
            await executor.execute('test_db', 'INVALID SQL')

    @pytest.mark.asyncio
    async def test_execute_timeout_configuration(self, mock_db_manager, mock_pool, mock_connection):
        """测试超时配置。"""
        mock_db_manager.get_pool = Mock(return_value=mock_pool)
        mock_pool.acquire = AsyncMock(return_value=mock_connection)
        mock_connection.fetch = AsyncMock(return_value=[])
        mock_connection.get_settings = Mock(return_value={'statement_timeout': '30000'})

        executor = QueryExecutor(mock_db_manager)
        await executor.execute('test_db', 'SELECT 1', timeout=5.0)

        # 验证超时设置被调用
        mock_connection.execute.assert_any_call('SET LOCAL statement_timeout = 5000')
        # 验证超时被恢复
        mock_connection.execute.assert_called_with('SET LOCAL statement_timeout = 30000')

    @pytest.mark.asyncio
    async def test_execute_returns_empty_result_format(self, mock_db_manager, mock_pool, mock_connection):
        """测试空结果集的返回格式。"""
        mock_db_manager.get_pool = Mock(return_value=mock_pool)
        mock_pool.acquire = AsyncMock(return_value=mock_connection)
        mock_connection.fetch = AsyncMock(return_value=[])

        executor = QueryExecutor(mock_db_manager)
        result = await executor.execute('test_db', 'SELECT * FROM empty_table')

        assert result['row_count'] == 0
        assert result['rows'] == []
        assert result['columns'] == []
        assert result['has_more'] is False
        assert result['execution_time'] >= 0

    @pytest.mark.asyncio
    async def test_execute_batch_queries_blocked(self, mock_db_manager, mock_pool, mock_connection):
        """测试批处理查询被阻止。"""
        mock_db_manager.get_pool = Mock(return_value=mock_pool)
        executor = QueryExecutor(mock_db_manager)

        batch_sql = "SELECT 1; SELECT 2; SELECT 3;"

        with pytest.raises(SecurityError):
            await executor.execute('test_db', batch_sql)

    def test_has_limit_clause_simple_select(self):
        """测试简单SELECT语句中检测LIMIT。"""
        executor = QueryExecutor(Mock())

        assert executor._has_limit_clause("SELECT * FROM users LIMIT 10") is True
        assert executor._has_limit_clause("SELECT * FROM users LIMIT \$1") is True
        assert executor._has_limit_clause("SELECT * FROM users LIMIT ALL") is True
        assert executor._has_limit_clause("SELECT * FROM users") is False

    def test_has_limit_clause_with_subqueries(self):
        """测试带子查询的语句中检测LIMIT。"""
        executor = QueryExecutor(Mock())

        # 外部查询有LIMIT
        sql = """
        SELECT * FROM (
            SELECT * FROM users WHERE active = true
        ) AS active_users
        LIMIT 50
        """
        assert executor._has_limit_clause(sql) is True

    def test_contains_dangerous_keywords(self):
        """测试危险关键词检测。"""
        executor = QueryExecutor(Mock())

        dangerous_cases = [
            'DROP TABLE users',
            'UPDATE users SET name = "John"',
            'DELETE FROM users WHERE id = 1',
            'INSERT INTO users VALUES (1, "John")',
            'CREATE TABLE test (id int)',
            'ALTER TABLE users ADD COLUMN email text',
            'TRUNCATE TABLE users',
            'GRANT SELECT ON users TO guest',
            'COPY users TO \'/tmp/users.csv\'',
            'VACUUM FULL users',
        ]

        for sql in dangerous_cases:
            assert executor._contains_dangerous_keywords(sql) is True

        safe_cases = [
            'SELECT * FROM users',
            'SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id',
            "SELECT * FROM users WHERE name = 'DROP TABLE'",  # 在字符串中
            'WITH active_users AS (SELECT * FROM users WHERE active = true) SELECT * FROM active_users',
        ]

        for sql in safe_cases:
            assert executor._contains_dangerous_keywords(sql) is False

    def test_parse_explain_plan(self):
        """测试EXPLAIN计划解析。"""
        executor = QueryExecutor(Mock())

        # 测试有效的EXPLAIN结果
        plan_data = [{
            'Plan': {
                'Node Type': 'Seq Scan',
                'Total Cost': 100.0,
                'Startup Cost': 0.0,
                'Actual Total Time': 10.5,
                'Actual Rows': 1000,
                'Plan Rows': 1000
            }
        }]

        result = executor._parse_explain_plan(plan_data)

        assert result['node_type'] == 'Seq Scan'
        assert result['scan_type'] == '顺序扫描'
        assert result['total_cost'] == 100.0

    def test_get_scan_type(self):
        """测试扫描类型转换。"""
        executor = QueryExecutor(Mock())

        assert executor._get_scan_type({'Node Type': 'Seq Scan'}) == '顺序扫描'
        assert executor._get_scan_type({'Node Type': 'Index Scan'}) == '索引扫描'
        assert executor._get_scan_type({'Node Type': 'Hash Join'}) == 'Hash Join'


class TestQueryExecutorTestConnection:
    """测试 test_connection 方法。"""

    @pytest.fixture
    def mock_db_manager(self):
        """创建模拟的 DatabaseManager。"""
        manager = Mock(spec=DatabaseManager)
        manager.get_pool = Mock(return_value=None)
        return manager

    @pytest.mark.asyncio
    async def test_test_connection_success(self, mock_db_manager):
        """测试连接测试成功。"""
        pool = AsyncMock(spec=asyncpg.Pool)
        conn = AsyncMock(spec=asyncpg.Connection)

        mock_db_manager.get_pool = Mock(return_value=pool)
        pool.acquire = AsyncMock(return_value=conn)
        conn.fetch = AsyncMock(return_value=[{'test': 1}])

        executor = QueryExecutor(mock_db_manager)
        success, message = await executor.test_connection('test_db')

        assert success is True
        assert message == "连接正常"

    @pytest.mark.asyncio
    async def test_test_connection_failure(self, mock_db_manager):
        """测试连接测试失败。"""
        pool = AsyncMock(spec=asyncpg.Pool)

        mock_db_manager.get_pool = Mock(return_value=pool)
        pool.acquire = AsyncMock(side_effect=asyncpg.exceptions.ConnectionError("连接失败"))

        executor = QueryExecutor(mock_db_manager)
        success, message = await executor.test_connection('test_db')

        assert success is False
        assert "连接失败" in message

    @pytest.mark.asyncio
    async def test_test_connection_no_pool(self, mock_db_manager):
        """测试无连接池时的连接测试。"""
        mock_db_manager.get_pool = Mock(return_value=None)

        executor = QueryExecutor(mock_db_manager)
        success, message = await executor.test_connection('nonexistent_db')

        assert success is False
        assert "未连接" in message


class TestQueryExecutorGetQueryStats:
    """测试 get_query_stats 方法。"""

    @pytest.fixture
    def mock_db_manager(self):
        """创建模拟的 DatabaseManager。"""
        manager = Mock(spec=DatabaseManager)
        manager.get_pool = Mock(return_value=None)
        return manager

    @pytest.fixture
    def mock_pool(self):
        """创建模拟的连接池。"""
        return AsyncMock(spec=asyncpg.Pool)

    @pytest.fixture
    def mock_connection(self):
        """创建模拟的数据库连接。"""
        conn = AsyncMock(spec=asyncpg.Connection)
        conn.transaction = MagicMock(return_value=AsyncMock())
        conn.fetch = AsyncMock()
        return conn

    @pytest.mark.asyncio
    async def test_get_query_stats_success(self, mock_db_manager, mock_pool, mock_connection):
        """测试成功获取查询统计。"""
        mock_db_manager.get_pool = Mock(return_value=mock_pool)
        mock_pool.acquire = AsyncMock(return_value=mock_connection)

        explain_result = [{
            'Plan': {
                'Node Type': 'Index Scan',
                'Total Cost': 50.0,
                'Startup Cost': 0.0,
                'Actual Total Time': 5.2,
                'Actual Rows': 100,
                'Plan Rows': 100
            }
        }]
        mock_connection.fetch = AsyncMock(return_value=explain_result)

        executor = QueryExecutor(mock_db_manager)
        stats = await executor.get_query_stats('test_db', 'SELECT * FROM users WHERE id = 1')

        assert stats is not None
        assert stats['node_type'] == 'Index Scan'
        assert stats['total_cost'] == 50.0
        assert stats['scan_type'] == '索引扫描'

    @pytest.mark.asyncio
    async def test_get_query_stats_dangerous_sql(self, mock_db_manager):
        """测试危险SQL不执行EXPLAIN。"""
        executor = QueryExecutor(mock_db_manager)
        stats = await executor.get_query_stats('test_db', 'DROP TABLE users')

        assert stats is None

    @pytest.mark.asyncio
    async def test_get_query_stats_no_pool(self, mock_db_manager):
        """测试无连接池时返回None。"""
        mock_db_manager.get_pool = Mock(return_value=None)

        executor = QueryExecutor(mock_db_manager)
        stats = await executor.get_query_stats('test_db', 'SELECT 1')

        assert stats is None

    @pytest.mark.asyncio
    async def test_get_query_stats_empty_result(self, mock_db_manager, mock_pool, mock_connection):
        """测试EXPLAIN返回空结果。"""
        mock_db_manager.get_pool = Mock(return_value=mock_pool)
        mock_pool.acquire = AsyncMock(return_value=mock_connection)
        mock_connection.fetch = AsyncMock(return_value=[])

        executor = QueryExecutor(mock_db_manager)
        stats = await executor.get_query_stats('test_db', 'SELECT * FROM users')

        assert stats == {}


class TestQueryExecutorAddLimitIfNeeded:
    """测试 _add_limit_if_needed 方法。"""

    def setup_method(self):
        """设置测试环境。"""
        self.executor = QueryExecutor(Mock())

    def test_add_limit_to_select_without_limit(self):
        """测试为无LIMIT的SELECT添加LIMIT。"""
        sql = "SELECT * FROM users"
        result = self.executor._add_limit_if_needed(sql, 100)

        assert "LIMIT 100" in result

    def test_add_limit_to_cte_without_limit(self):
        """测试为无LIMIT的CTE添加LIMIT。"""
        sql = "WITH active_users AS (SELECT * FROM users WHERE active = true) SELECT * FROM active_users"
        result = self.executor._add_limit_if_needed(sql, 100)

        assert "LIMIT 100" in result

    def test_no_limit_in_insert(self):
        """测试不修改INSERT语句。"""
        sql = "INSERT INTO users (name) VALUES ('test')"
        result = self.executor._add_limit_if_needed(sql, 100)

        assert result == sql
        assert "LIMIT" not in result

    def test_no_limit_in_update(self):
        """测试不修改UPDATE语句。"""
        sql = "UPDATE users SET name = 'test' WHERE id = 1"
        result = self.executor._add_limit_if_needed(sql, 100)

        assert result == sql
        assert "LIMIT" not in result

    def test_no_limit_add_when_already_exists(self):
        """测试当LIMIT已存在时不添加。"""
        sql = "SELECT * FROM users LIMIT 50"
        result = self.executor._add_limit_if_needed(sql, 100)

        assert result == sql
        assert "LIMIT 50" in result

    def test_limit_with_existing_semicolon(self):
        """测试处理带有分号的SQL。"""
        sql = "SELECT * FROM users;"
        result = self.executor._add_limit_if_needed(sql, 100)

        assert result == "SELECT * FROM users\nLIMIT 100"

    def test_limit_with_complex_cte(self):
        """测试为复杂CTE添加LIMIT。"""
        sql = """
        WITH RECURSIVE org_tree AS (
            SELECT id, name, manager_id
            FROM employees
            WHERE manager_id IS NULL
            UNION ALL
            SELECT e.id, e.name, e.manager_id
            FROM employees e
            INNER JOIN org_tree ot ON e.manager_id = ot.id
        )
        SELECT * FROM org_tree
        """
        result = self.executor._add_limit_if_needed(sql, 100)

        assert "LIMIT 100" in result


class TestQueryExecutorIsInSubquery:
    """测试 _is_in_subquery 方法。"""

    def setup_method(self):
        """设置测试环境。"""
        self.executor = QueryExecutor(Mock())

    def test_limit_in_main_query(self):
        """测试主查询中的LIMIT。"""
        sql = "SELECT * FROM (SELECT id FROM users) AS u LIMIT 10"
        pattern = r'\\bLIMIT\\s+\\d+\\b'

        result = self.executor._is_in_subquery(sql, pattern)

        assert result is False

    def test_limit_in_subquery(self):
        """测试子查询中的LIMIT。"""
        sql = "SELECT * FROM (SELECT id FROM users LIMIT 5) AS u"

        import re
        match = re.search(r'\\bLIMIT\\s+\\d+\\b', sql)
        if match:
            result = self.executor._is_in_subquery(sql, match.group())
            assert result is True

    def test_nested_subqueries_with_limit(self):
        """测试嵌套子查询中的LIMIT。"""
        sql = """
        SELECT * FROM (
            SELECT * FROM (
                SELECT id FROM users LIMIT 5
            ) AS inner_query
        ) AS outer_query
        """

        import re
        matches = re.finditer(r'\\bLIMIT\\s+\\d+\\b', sql)
        for match in matches:
            result = self.executor._is_in_subquery(sql, match.group())
            assert result is True


class TestQueryExecutorFormat:
    """测试查询结果格式。"""

    @pytest.mark.asyncio
    async def test_result_format_with_complex_data(self, mock_db_manager, mock_pool, mock_connection):
        """测试复杂数据类型的结果格式。"""
        from datetime import datetime
        from decimal import Decimal

        mock_db_manager.get_pool = Mock(return_value=mock_pool)
        mock_pool.acquire = AsyncMock(return_value=mock_connection)

        # 创建包含不同类型的记录
        records = [
            asyncpg.Record({
                'id': 1,
                'name': 'Alice',
                'created_at': datetime(2024, 1, 1, 10, 30),
                'price': Decimal('19.99'),
                'active': True,
                'metadata': {'key': 'value'}
            })
        ]
        mock_connection.fetch = AsyncMock(return_value=records)

        executor = QueryExecutor(mock_db_manager)
        result = await executor.execute('test_db', 'SELECT * FROM products')

        assert result['row_count'] == 1
        assert len(result['rows']) == 1
        assert isinstance(result['rows'][0], dict)
        assert result['rows'][0]['id'] == 1
        assert result['rows'][0]['name'] == 'Alice'
        assert result['rows'][0]['price'] == 19.99  # Decimal 转换为 float
        assert result['rows'][0]['active'] is True

    @pytest.mark.asyncio
    async def test_execution_time_accuracy(self, mock_db_manager, mock_pool, mock_connection):
        """测试执行时间的准确性。"""
        import time

        mock_db_manager.get_pool = Mock(return_value=mock_pool)
        mock_pool.acquire = AsyncMock(return_value=mock_connection)

        async def slow_fetch(*args, **kwargs):
            await asyncio.sleep(0.1)
            return []

        mock_connection.fetch = slow_fetch

        executor = QueryExecutor(mock_db_manager)
        result = await executor.execute('test_db', 'SELECT 1')

        assert result['execution_time'] >= 0.1
        assert isinstance(result['execution_time'], float)
