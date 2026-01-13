#!/usr/bin/env python3
"""启动 pg-mcp 服务器，忽略数据库连接错误。"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from pg_mcp.config.loader import Config
from pg_mcp.mcp.server import PostgresMCPServer


async def main():
    """启动服务器。"""
    print("=" * 60)
    print("pg-mcp 服务器启动 (允许数据库连接失败)")
    print("=" * 60)

    try:
        # 创建服务器 - 这会捕获数据库错误
        server = PostgresMCPServer(config_path="config/config.yaml")

        print("\n✅ 服务器正在运行！")
        print("\n提示: 数据库连接失败，但服务器仍可工作")
        print("你可以使用 list_databases 工具查看数据库状态")

        # 启动服务器（等待客户端连接）
        await server.run()

    except KeyboardInterrupt:
        print("\n\n服务器被用户中断")
        return True
    except Exception as e:
        print(f"\n❌ 服务器错误: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    try:
        success = asyncio.run(main())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n进程被中断")
        sys.exit(0)
