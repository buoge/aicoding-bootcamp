#!/usr/bin/env python3
"""调试服务器启动。"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from pg_mcp.config.loader import Config
from pg_mcp.service.query import QueryService
from pg_mcp.mcp.server import PostgresMCPServer


async def main():
    """调试服务器启动过程。"""
    print("=" * 60)
    print("调试: 服务器启动过程")
    print("=" * 60)

    # 步骤 1: 加载配置
    print("\n[1] 加载配置...")
    try:
        config = Config("config/config.yaml")
        print("✓ 配置加载成功")
    except Exception as e:
        print(f"❌ 配置加载失败: {e}")
        return False

    # 步骤 2: 创建 QueryService
    print("\n[2] 创建 QueryService...")
    try:
        query_service = QueryService(config)
        print("✓ QueryService 创建成功")
    except Exception as e:
        print(f"❌ QueryService 创建失败: {e}")
        import traceback
        traceback.print_exc()
        return False

    # 步骤 3: 创建 MCP Server
    print("\n[3] 创建 MCP Server...")
    try:
        server = PostgresMCPServer(config_path="config/config.yaml")
        print("✓ MCP Server 创建成功")
    except Exception as e:
        print(f"❌ MCP Server 创建失败: {e}")
        import traceback
        traceback.print_exc()
        return False

    # 步骤 4: 服务器运行
    print("\n[4] 运行服务器...")
    print("服务器应该在这里等待输入...")
    try:
        await server.run()
        print("✓ 服务器正常退出")
    except Exception as e:
        print(f"❌ 服务器运行失败: {e}")
        import traceback
        traceback.print_exc()
        return False

    return True


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n服务器被用户中断")
        sys.exit(0)
