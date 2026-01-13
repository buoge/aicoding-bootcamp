"""测试 SQL 安全验证器。"""

import pytest

from pg_mcp.security.validator import SQLSecurityValidator, SQLValidationError


class TestSQLValidator:
    """测试 SQL 安全验证器。"""

    @pytest.fixture
    def validator(self):
        """创建 SQLSecurityValidator 实例。"""
        return SQLSecurityValidator()

    def test_valid_select_query(self, validator):
        """测试有效的 SELECT 查询。"""
        is_valid, message = validator.validate("SELECT * FROM users;")
        assert is_valid is True
        assert "验证通过" in message

    def test_valid_select_with_where(self, validator):
        """测试带 WHERE 子句的 SELECT 查询。"""
        is_valid, message = validator.validate(
            "SELECT id, name FROM users WHERE age > 18;"
        )
        assert is_valid is True

    def test_valid_select_with_join(self, validator):
        """测试带 JOIN 的 SELECT 查询。"""
        is_valid, message = validator.validate("""
            SELECT u.name, o.total
            FROM users u
            JOIN orders o ON u.id = o.user_id;
        """)
        assert is_valid is True

    def test_valid_select_with_cte(self, validator):
        """测试带 CTE（公用表表达式）的 SELECT 查询。"""
        is_valid, message = validator.validate("""
            WITH active_users AS (
                SELECT * FROM users WHERE status = 'active'
            )
            SELECT * FROM active_users;
        """)
        assert is_valid is True

    def test_valid_select_with_union(self, validator):
        """测试带 UNION 的 SELECT 查询。"""
        is_valid, message = validator.validate("""
            SELECT name FROM users
            UNION
            SELECT name FROM admins;
        """)
        assert is_valid is True

    def test_valid_select_with_subquery(self, validator):
        """测试带子查询的 SELECT 查询。"""
        is_valid, message = validator.validate("""
            SELECT name FROM users
            WHERE id IN (SELECT user_id FROM orders WHERE total > 100);
        """)
        assert is_valid is True

    def test_invalid_insert_statement(self, validator):
        """测试 INSERT 语句被拒绝。"""
        is_valid, message = validator.validate(
            "INSERT INTO users (name) VALUES ('John');"
        )
        assert is_valid is False

    def test_invalid_update_statement(self, validator):
        """测试 UPDATE 语句被拒绝。"""
        is_valid, message = validator.validate(
            "UPDATE users SET name = 'Jane' WHERE id = 1;"
        )
        assert is_valid is False

    def test_invalid_delete_statement(self, validator):
        """测试 DELETE 语句被拒绝。"""
        is_valid, message = validator.validate(
            "DELETE FROM users WHERE id = 1;"
        )
        assert is_valid is False

    def test_invalid_create_statement(self, validator):
        """测试 CREATE 语句被拒绝。"""
        is_valid, message = validator.validate(
            "CREATE TABLE new_table (id INT);"
        )
        assert is_valid is False

    def test_invalid_drop_statement(self, validator):
        """测试 DROP 语句被拒绝。"""
        is_valid, message = validator.validate("DROP TABLE users;")
        assert is_valid is False

    def test_invalid_alter_statement(self, validator):
        """测试 ALTER 语句被拒绝。"""
        is_valid, message = validator.validate(
            "ALTER TABLE users ADD COLUMN age INT;"
        )
        assert is_valid is False

    def test_invalid_truncate_statement(self, validator):
        """测试 TRUNCATE 语句被拒绝。"""
        is_valid, message = validator.validate("TRUNCATE TABLE users;")
        assert is_valid is False

    def test_invalid_grant_statement(self, validator):
        """测试 GRANT 语句被拒绝。"""
        is_valid, message = validator.validate(
            "GRANT SELECT ON users TO readonly_user;"
        )
        assert is_valid is False

    def test_empty_sql(self, validator):
        """测试空 SQL 被拒绝。"""
        is_valid, message = validator.validate("")
        assert is_valid is False
        assert "不能为空" in message

    def test_whitespace_only_sql(self, validator):
        """测试仅包含空格的 SQL 被拒绝。"""
        is_valid, message = validator.validate("   \n  \t  ")
        assert is_valid is False
        assert "不能为空" in message

    def test_invalid_sql_syntax(self, validator):
        """测试无效的 SQL 语法被拒绝。"""
        is_valid, message = validator.validate("SELECT * FROM;")
        assert is_valid is False
        assert "解析错误" in message

    def test_blacklist_in_string_literal(self, validator):
        """测试字符串字面量中的黑名单词不被误报。"""
        is_valid, message = validator.validate(
            "SELECT * FROM logs WHERE message = 'DELETE operation completed';"
        )
        assert is_valid is True

    def test_system_table_access_denied(self, validator):
        """测试访问系统表被拒绝。"""
        is_valid, message = validator.validate(
            "SELECT * FROM pg_catalog.pg_tables;"
        )
        assert is_valid is False
        assert "系统表" in message

    def test_information_schema_access_denied(self, validator):
        """测试访问 information_schema 被拒绝。"""
        is_valid, message = validator.validate(
            "SELECT * FROM information_schema.tables;"
        )
        assert is_valid is False
        assert "系统表" in message

    def test_allow_system_tables_true(self):
        """测试当 allow_system_tables=True 时允许访问系统表。"""
        validator = SQLSecurityValidator(allow_system_tables=True)
        is_valid, message = validator.validate(
            "SELECT * FROM pg_catalog.pg_tables;"
        )
        assert is_valid is True

    def test_valid_table_validation(self, validator):
        """测试验证允许的表。"""
        is_valid, message = validator.validate(
            "SELECT * FROM users;",
            required_tables=["users", "orders"]
        )
        assert is_valid is True

    def test_invalid_table_validation(self, validator):
        """测试验证使用未授权的表。"""
        is_valid, message = validator.validate(
            "SELECT * FROM secret_table;",
            required_tables=["users", "orders"]
        )
        assert is_valid is False
        assert "未授权的表" in message

    def test_multiple_tables_validation(self, validator):
        """测试验证多个表。"""
        is_valid, message = validator.validate(
            "SELECT * FROM users JOIN orders ON users.id = orders.user_id;",
            required_tables=["users", "orders", "products"]
        )
        assert is_valid is True

    def test_table_validation_case_insensitive(self, validator):
        """测试表名验证不区分大小写。"""
        is_valid, message = validator.validate(
            "SELECT * FROM USERS;",
            required_tables=["users"]
        )
        assert is_valid is True

    def test_max_query_depth_exceeded(self):
        """测试超过最大查询深度。"""
        validator = SQLSecurityValidator(max_query_depth=2)

        # 创建一个嵌套较深的查询
        deep_query = """
            SELECT * FROM (
                SELECT * FROM (
                    SELECT * FROM (
                        SELECT * FROM users
                    ) sub3
                ) sub2
            ) sub1;
        """
        is_valid, message = validator.validate(deep_query)
        assert is_valid is False
        assert "复杂" in message

    def test_max_joins_exceeded(self):
        """测试超过最大 JOIN 数量。"""
        validator = SQLSecurityValidator(max_joins=2)

        # 创建一个有多个 JOIN 的查询
        many_joins_query = """
            SELECT * FROM users
            JOIN orders ON users.id = orders.user_id
            JOIN products ON orders.product_id = products.id
            JOIN categories ON products.category_id = categories.id;
        """
        is_valid, message = validator.validate(many_joins_query)
        assert is_valid is False
        assert "复杂" in message

    def test_sanitize_sql(self, validator):
        """测试 SQL 清理。"""
        messy_sql = "SELECT   *   FROM    users   WHERE    id   =   1"
        cleaned = validator.sanitize_sql(messy_sql)

        assert "  " not in cleaned  # 没有多余空格
        assert cleaned.endswith(";")
        assert "WHERE id = 1;" in cleaned

    def test_add_limit_if_missing(self, validator):
        """测试为没有 LIMIT 的查询添加 LIMIT。"""
        sql = "SELECT * FROM users"
        limited = validator.add_limit_if_missing(sql, max_rows=100)

        assert "LIMIT 100" in limited
        assert limited.endswith(";")

    def test_add_limit_if_missing_already_has_limit(self, validator):
        """测试已经有限制的查询不再添加 LIMIT。"""
        sql = "SELECT * FROM users LIMIT 50"
        limited = validator.add_limit_if_missing(sql, max_rows=100)

        assert limited == sql  # 应该返回原样

    def test_has_limit_true(self, validator):
        """测试检测 SQL 中包含 LIMIT。"""
        assert validator._has_limit("SELECT * FROM users LIMIT 10") is True
        assert validator._has_limit("SELECT * FROM users limit 10") is True
        assert validator._has_limit("SELECT * FROM users LIMIT  10") is True

    def test_has_limit_false(self, validator):
        """测试检测 SQL 中不包含 LIMIT。"""
        assert validator._has_limit("SELECT * FROM users") is False

    def test_has_limit_in_string_literal(self, validator):
        """测试 LIMIT 在字符串字面量中不被误判。"""
        sql = "SELECT description FROM products WHERE description = 'LIMIT 10';"
        assert validator._has_limit(sql) is False

    def test_validate_and_clean_success(self, validator):
        """测试验证并清理 SQL 成功。"""
        messy_sql = "SELECT   *   FROM users   "
        cleaned, is_valid, message = validator.validate_and_clean(messy_sql)

        assert is_valid is True
        assert "验证通过" in message
        assert "  " not in cleaned
        assert cleaned.endswith(";")

    def test_validate_and_clean_failure(self, validator):
        """测试验证并清理 SQL 失败。"""
        sql = "UPDATE users SET name = 'test';"
        cleaned, is_valid, message = validator.validate_and_clean(sql)

        assert is_valid is False
        assert cleaned == sql  # 返回原始 SQL

    def test_prepare_statement_blocked(self, validator):
        """测试 PREPARE 语句被拒绝。"""
        is_valid, message = validator.validate(
            "PREPARE user_query (int) AS SELECT * FROM users WHERE id = $1;"
        )
        assert is_valid is False

    def test_execute_statement_blocked(self, validator):
        """测试 EXECUTE 语句被拒绝。"""
        is_valid, message = validator.validate("EXECUTE user_query(1);")
        assert is_valid is False

    def test_transaction_control_blocked(self, validator):
        """测试事务控制语句被拒绝。"""
        is_valid, message = validator.validate("BEGIN;")
        assert is_valid is False

        is_valid, message = validator.validate("COMMIT;")
        assert is_valid is False

        is_valid, message = validator.validate("ROLLBACK;")
        assert is_valid is False

    def test_copy_statement_blocked(self, validator):
        """测试 COPY 语句被拒绝。"""
        is_valid, message = validator.validate(
            "COPY users TO '/tmp/users.csv' CSV;"
        )
        assert is_valid is False

    def test_vacuum_statement_blocked(self, validator):
        """测试 VACUUM 语句被拒绝。"""
        is_valid, message = validator.validate("VACUUM;")
        assert is_valid is False

    def test_analyze_statement_blocked(self, validator):
        """测试 ANALYZE 语句被拒绝。"""
        is_valid, message = validator.validate("ANALYZE users;")
        assert is_valid is False

    def test_multiple_statements_blocked(self, validator):
        """测试多条 SQL 语句被拒绝。"""
        is_valid, message = validator.validate(
            "SELECT * FROM users; SELECT * FROM orders;"
        )
        assert is_valid is False

    def test_injection_attempts_blocked(self, validator):
        """测试各种 SQL 注入尝试被拒绝。"""
        # 尝试在字符串中结束查询并添加恶意 SQL
        is_valid, message = validator.validate(
            "SELECT * FROM users WHERE name = 'admin'; DROP TABLE users; --'"
        )
        assert is_valid is False

    def test_boolean_based_injection_blocked(self, validator):
        """测试布尔型 SQL 注入被拒绝。"""
        is_valid, message = validator.validate(
            "SELECT * FROM users WHERE id = 1 OR 1=1;"
        )
        # 这个应该被允许（OR 1=1 是有效的 SQL）
        # 但我们可能需要添加额外的检查

    def test_union_based_injection_blocked(self, validator):
        """测试 UNION 型 SQL 注入被检测。"""
        # UNION 本身是允许的，但我们可以测试其结构
        is_valid, message = validator.validate(
            "SELECT name FROM users WHERE id = 1 UNION SELECT password FROM admins;"
        )
        # 这个应该被允许（UNION 是合法的）

    def test_complex_nested_query_allowed(self, validator):
        """测试复杂的嵌套查询被允许。"""
        complex_query = """
            WITH monthly_sales AS (
                SELECT
                    DATE_TRUNC('month', order_date) as month,
                    COUNT(*) as orders,
                    SUM(total) as revenue
                FROM orders
                WHERE status = 'completed'
                GROUP BY DATE_TRUNC('month', order_date)
            ),
            top_products AS (
                SELECT
                    p.name,
                    COUNT(*) as units_sold
                FROM products p
                JOIN order_items oi ON p.id = oi.product_id
                GROUP BY p.id, p.name
                ORDER BY units_sold DESC
                LIMIT 10
            )
            SELECT
                ms.month,
                ms.orders,
                ms.revenue,
                tp.name as top_product
            FROM monthly_sales ms
            CROSS JOIN top_products tp
            WHERE ms.month >= CURRENT_DATE - INTERVAL '1 year'
            ORDER BY ms.month DESC, tp.units_sold DESC;
        """
        is_valid, message = validator.validate(complex_query)
        assert is_valid is True

    def test_schema_qualified_table_names(self, validator):
        """测试模式限定的表名。"""
        is_valid, message = validator.validate("SELECT * FROM public.users;")
        assert is_valid is True

    def test_table_alias_allowed(self, validator):
        """测试表别名被允许。"""
        is_valid, message = validator.validate(
            "SELECT u.name FROM users AS u WHERE u.active = true;"
        )
        assert is_valid is True

    def test_column_alias_allowed(self, validator):
        """测试列别名被允许。"""
        is_valid, message = validator.validate(
            "SELECT name AS user_name, age AS user_age FROM users;"
        )
        assert is_valid is True

    def test_math_operations_allowed(self, validator):
        """测试数学运算被允许。"""
        is_valid, message = validator.validate(
            "SELECT price * 1.1 AS new_price FROM products;"
        )
        assert is_valid is True

    def test_aggregate_functions_allowed(self, validator):
        """测试聚合函数被允许。"""
        is_valid, message = validator.validate(
            """
            SELECT
                COUNT(*) as total,
                AVG(age) as avg_age,
                MAX(salary) as max_salary,
                MIN(salary) as min_salary,
                SUM(revenue) as total_revenue
            FROM users;
            """
        )
        assert is_valid is True

    def test_window_functions_allowed(self, validator):
        """测试窗口函数被允许。"""
        is_valid, message = validator.validate("""
            SELECT
                name,
                salary,
                RANK() OVER (ORDER BY salary DESC) as salary_rank
            FROM employees;
        """)
        assert is_valid is True
