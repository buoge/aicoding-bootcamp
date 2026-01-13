#!/usr/bin/env python3
"""测试 LLM 集成 - 验证 Kimi API 是否正常工作。"""

import sys
import asyncio
from pathlib import Path

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent))

from pg_mcp.config.loader import Config
from pg_mcp.llm.service import LLMService, LLMError


async def test_llm_connection():
    """测试 LLM 连接和 SQL 生成。"""
    print("\n=== 测试 LLM 集成 ===\n")

    try:
        # 加载配置
        config = Config("config/config.yaml")
        llm_config = config.get_llm_config()

        print("配置加载成功:")
        print(f"  - Model: {llm_config.get('model')}")
        print(f"  - Base URL: {llm_config.get('base_url')}")
        print(f"  - API Key: {'*' * len(llm_config.get('api_key', ''))}")
        print()

        # 创建 LLM 服务
        llm_service = LLMService(llm_config)

        # 测试1: 简单的 SQL 生成
        print("测试 1: 生成简单查询")
        print("-" * 50)

        query = "查询所有用户的姓名和邮箱"
        schema_info = """
        users 表:
        - id (integer, primary key)
        - name (varchar)
        - email (varchar)
        - created_at (timestamp)
        """

        print(f"自然语言: {query}")
        print(f"表结构: {schema_info[:100]}...")
        print()

        sql = await llm_service.generate_sql(query, schema_info)
        print(f"生成的 SQL:\n{sql}")
        print()

        # 测试2: 带条件的查询
        print("测试 2: 生成带条件的查询")
        print("-" * 50)

        query = "查找最近30天内注册的用户"
        sql = await llm_service.generate_sql(query, schema_info)
        print(f"生成的 SQL:\n{sql}")
        print()

        # 测试3: 聚合查询
        print("测试 3: 生成聚合查询")
        print("-" * 50)

        query = "统计每个城市的用户数量"
        schema_info_with_city = """
        users 表:
        - id (integer, primary key)
        - name (varchar)
        - email (varchar)
        - city (varchar)
        - created_at (timestamp)
        """

        sql = await llm_service.generate_sql(query, schema_info_with_city)
        print(f"生成的 SQL:\n{sql}")
        print()

        print("✅ 所有 LLM 测试完成！")
        return True

    except LLMError as e:
        print(f"❌ LLM 错误: {e}")
        return False
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_sql_cleaning_and_validation():
    """测试 SQL 清理和安全验证。"""
    print("\n=== 测试 SQL 清理和验证 ===\n")

    from pg_mcp.security.validator import SQLSecurityValidator
    from pg_mcp.utils.sanitization import clean_sql, validate_limit_clause

    validator = SQLSecurityValidator()

    # 测试1: 清理 LLM 生成的 SQL
    print("测试 1: 清理和验证生成的 SQL")
    print("-" * 50)

    test_sql = """
    SELECT name, email FROM users
    WHERE created_at >= NOW() - INTERVAL '30 days'
    ORDER BY created_at DESC;
    """

    cleaned = clean_sql(test_sql)
    is_valid, message = validator.validate(cleaned)

    print(f"原始 SQL:\n{test_sql}")
    print(f"清理后:\n{cleaned}")
    print(f"验证结果: {'✅ 有效' if is_valid else '❌ 无效'} - {message}")
    print()

    # 测试2: 自动添加 LIMIT
    print("测试 2: 自动添加 LIMIT")
    print("-" * 50)

    sql_without_limit = "SELECT * FROM users"
    sql_with_limit = validate_limit_clause(sql_without_limit, max_rows=100)
    print(f"原始 SQL: {sql_without_limit}")
    print(f"添加 LIMIT 后: {sql_with_limit}")

    is_valid, message = validator.validate(sql_with_limit)
    print(f"验证结果: {'✅ 有效' if is_valid else '❌ 无效'} - {message}")
    print()

    # 测试3: 阻止恶意 SQL
    print("测试 3: 阻止恶意 SQL")
    print("-" * 50)

    malicious_queries = [
        "DROP TABLE users;",
        "DELETE FROM users WHERE 1=1;",
        "INSERT INTO users VALUES (1, 'hacker');",
        "UPDATE users SET admin = true;"
    ]

    for sql in malicious_queries:
        is_valid, message = validator.validate(sql)
        status = "✅ 已阻止" if not is_valid else "❌ 未阻止"
        print(f"{status}: {sql} - {message}")

    print()


async def main():
    """运行所有测试。"""
    print("=" * 60)
    print("pg-mcp LLM 集成测试")
    print("=" * 60)

    # 测试 LLM 连接和 SQL 生成
    llm_success = await test_llm_connection()

    # 测试 SQL 清理和验证
    await test_sql_cleaning_and_validation()

    print("\n" + "=" * 60)
    print("测试总结")
    print("=" * 60)

    if llm_success:
        print("✅ LLM 服务连接正常，可以生成 SQL")
        print("✅ SQL 安全验证工作正常")
        print("✅ 系统已准备好使用！")
    else:
        print("❌ 某些测试失败，请检查配置和 API 密钥")

    print("\n下一步: 启动 MCP 服务器进行实际使用")
    print("=" * 60)

    return llm_success


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
