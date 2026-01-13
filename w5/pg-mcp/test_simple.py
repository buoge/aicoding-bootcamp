#!/usr/bin/env python3
"""最简测试 - 验证 LLM 配置和基本功能。"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from pg_mcp.config.loader import Config
from pg_mcp.llm.service import LLMService


async def test_llm_only():
    """只测试 LLM，不依赖数据库。"""
    print("=" * 60)
    print("pg-mcp 最简功能测试")
    print("=" * 60)

    try:
        # 加载配置
        print("\n[1/3] 加载配置...")
        config = Config("config/config.yaml")
        print("✓ 配置加载成功")

        # 获取 LLM 配置
        llm_config = config.get_llm_config()
        print(f"\n[2/3] LLM 配置:")
        print(f"  Model: {llm_config.get('model')}")
        print(f"  Base URL: {llm_config.get('base_url')}")
        print(f"  API Key: {'*' * len(llm_config.get('api_key', ''))} ({len(llm_config.get('api_key', ''))} chars)")

        # 测试 LLM 连接
        print(f"\n[3/3] 测试 LLM 连接...")
        llm = LLMService(llm_config)

        # 简单的测试查询
        test_query = "查询前10个用户的姓名和邮箱"
        schema_info = """
        表: users
        字段:
        - id (integer)
        - name (varchar)
        - email (varchar)
        - created_at (timestamp)
        """

        print(f"\n测试查询: {test_query}")
        print(f"表结构: {schema_info[:100]}...")
        print("\n等待 LLM 响应...")

        sql = await llm.generate_sql(test_query, schema_info)
        print(f"\n✅ 成功生成 SQL:")
        print("-" * 60)
        print(sql)
        print("-" * 60)

        print("\n" + "=" * 60)
        print("🎉 测试完成！")
        print("LLM 服务正常工作，可以生成 SQL")
        print("=" * 60)

        return True

    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = asyncio.run(test_llm_only())
    sys.exit(0 if success else 1)
