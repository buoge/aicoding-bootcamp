"""测试 SQL/Markdown 清理工具。"""

import pytest

from pg_mcp.utils import sanitization


class TestSanitization:
    """测试清理功能。"""

    def test_clean_sql_basic(self):
        """测试基本 SQL 清理。"""
        sql = "SELECT   *  FROM    users   WHERE   id  =  1  -- Get user"
        result = sanitization.clean_sql(sql)
        assert result == "SELECT * FROM users WHERE id = 1;"

    def test_clean_sql_multiline(self):
        """测试清理多行 SQL。"""
        sql = """/* Get all users */
        SELECT
            name,
            email
        FROM
            users
        WHERE
            active = true;
        """
        result = sanitization.clean_sql(sql)
        assert "/* Get all users */" not in result
        assert "SELECT name, email FROM users WHERE active = true;" in result

    def test_clean_sql_with_comments(self):
        """测试清理带注释的 SQL。"""
        sql = """
        SELECT * FROM users;  -- Get users
        SELECT * FROM orders;  -- Get orders
        """
        result = sanitization.clean_sql(sql)
        assert '-- Get users' not in result
        assert '-- Get orders' not in result

    def test_clean_sql_empty(self):
        """测试清理空 SQL。"""
        assert sanitization.clean_sql('') == ''
        assert sanitization.clean_sql('   \\n   \\t  ') == ''

    def test_clean_markdown_code_blocks(self):
        """测试清理 Markdown 代码块。"""
        text = """
        Here is the query:
        ```sql
        SELECT * FROM users;
        ```
        """
        result = sanitization.clean_markdown(text)
        assert '```sql' not in result
        assert '```' not in result
        assert 'SELECT * FROM users;' in result

    def test_clean_markdown_headers(self):
        """测试清理 Markdown 标题。"""
        text = """
        # Query Results
        ## Summary
        This shows user data
        """
        result = sanitization.clean_markdown(text)
        assert '#' not in result
        assert 'Query Results' in result
        assert 'Summary' in result
        assert 'This shows user data' in result

    def test_clean_markdown_bold_italic(self):
        """测试清理 Markdown 粗体和斜体。"""
        text = "**bold** and *italic* and __bold__ and _italic_"
        result = sanitization.clean_markdown(text)
        assert '**' not in result
        assert '*' not in result
        assert '__' not in result
        assert '_' not in result
        assert 'bold and italic and bold and italic' in result

    def test_clean_markdown_links(self):
        """测试清理 Markdown 链接。"""
        text = "Check [this link](http://example.com) for more info"
        result = sanitization.clean_markdown(text)
        assert 'this link' in result
        assert 'http://example.com' not in result

    def test_validate_limit_clause_adds_limit(self):
        """测试验证并添加 LIMIT。"""
        sql = "SELECT * FROM users"
        result = sanitization.validate_limit_clause(sql, 100)
        assert result == "SELECT * FROM users LIMIT 100;"

    def test_validate_limit_clause_keeps_existing_limit(self):
        """测试保留已存在的 LIMIT。"""
        sql = "SELECT * FROM users LIMIT 50"
        result = sanitization.validate_limit_clause(sql, 100)
        assert result == "SELECT * FROM users LIMIT 50;"

    def test_validate_limit_clause_empty_raises_error(self):
        """测试验证空 SQL 时抛出错误。"""
        with pytest.raises(ValueError, match="SQL 查询不能为空"):
            sanitization.validate_limit_clause('', 100)

    def test_truncate_sql_short(self):
        """测试截断短 SQL 查询。"""
        sql = "SELECT * FROM users"
        assert sanitization.truncate_sql(sql, 50) == sql

    def test_truncate_sql_long(self):
        """测试截断长 SQL 查询。"""
        sql = "SELECT " + ", ".join([f"col{i}" for i in range(100)]) + " FROM users"
        result = sanitization.truncate_sql(sql, 100)
        assert result.endswith('...')
        assert len(result) == 103  # 100 + "..."

    def test_format_sql_results(self):
        """测试格式化 SQL 结果。"""
        results = [
            {'name': 'Alice', 'age': 30},
            {'name': 'Bob', 'age': 25}
        ]
        columns = ['name', 'age']
        result_str = sanitization.format_sql_results(results, columns, 10)

        assert 'Results:' in result_str
        assert 'Total rows: 2' in result_str
        assert 'Alice' in result_str
        assert 'Bob' in result_str
        assert '30' in result_str
        assert '25' in result_str

    def test_format_sql_results_empty(self):
        """测试格式化空结果。"""
        result_str = sanitization.format_sql_results([], [])
        assert result_str == "No results found."

    def test_format_sql_results_truncate_long_value(self):
        """测试格式化结果时截断长值。"""
        results = [{'data': 'A' * 100}]
        columns = ['data']
        result_str = sanitization.format_sql_results(results, columns, 10)

        assert '...' in result_str  # 长值被截断

    def test_extract_code_block(self):
        """测试提取代码块。"""
        text = """
        Here is the query:
        ```sql
        SELECT * FROM users;
        ```
        """
        result = sanitization.extract_code_block(text, 'sql')
        assert result == "SELECT * FROM users;"

    def test_extract_code_block_any_language(self):
        """测试提取任意语言的代码块。"""
        text = """
        ```
        {\"key\": \"value\"}
        ```
        """
        result = sanitization.extract_code_block(text)
        assert '{"key": "value"}' in result

    def test_extract_code_block_no_match(self):
        """测试不匹配的代码块提取。"""
        text = "No code blocks here"
        result = sanitization.extract_code_block(text, 'sql')
        assert result is None

    def test_mask_sensitive_data_email(self):
        """测试屏蔽邮箱。"""
        sql = "SELECT * FROM users WHERE email = 'user@example.com'"
        query = "Find user with email user@example.com"
        masked_sql, masked_query = sanitization.mask_sensitive_data(sql, query)

        assert '[EMAIL]' in masked_sql
        assert '[EMAIL]' in masked_query
        assert 'user@example.com' not in masked_sql

    def test_mask_sensitive_data_credit_card(self):
        """测试屏蔽信用卡号。"""
        sql = "SELECT * FROM payments WHERE card = '1234 5678 9012 3456'"
        query = "Get payments for card 1234567890123456"
        masked_sql, masked_query = sanitization.mask_sensitive_data(sql, query)

        assert '[CARD_NUMBER]' in masked_sql

    def test_mask_sensitive_data_password(self):
        """测试屏蔽密码。"""
        sql = "SELECT * FROM users WHERE password = 'secret123'"
        query = "Find user with password secret123"
        masked_sql, masked_query = sanitization.mask_sensitive_data(sql, query)

        assert '[PASSWORD]' in masked_sql
        assert 'secret123' not in masked_sql

    def test_clean_sql_with_string_literals(self):
        """测试清理包含字符串字面量的 SQL。"""
        sql = "SELECT 'Hello   World' as msg, name FROM users -- comment"
        result = sanitization.clean_sql(sql)
        assert "Hello   World" in result  # 保留字符串中的空格
        assert '-- comment' not in result

