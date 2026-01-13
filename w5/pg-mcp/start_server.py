#!/usr/bin/env python3
"""启动 pg-mcp 服务器并保持运行。"""

import asyncio
import sys
from pathlib import Path

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent))

from pg_mcp.config.loader import Config
from pg_mcp.mcp.server import PostgresMCPServer
from pg_mcp.service.query import QueryService
from pg_mcp.database.manager import DatabaseManager
from pg_mcp.exceptions import ConfigError, DatabaseError


async def start_server():
    """启动并运行服务器。"""
    print("=" * 60)
    print("pg-mcp 服务器启动")
    print("=" * 60)

    try:
        # 加载配置
        print("\n[1/4] 加载配置...")
        config = Config("config/config.yaml")
        print("✓ 配置加载成功")

        # 验证配置
        errors = config.validate()
        if errors:
            print("⚠ 配置警告:")
            for error in errors:
                print(f"  - {error}")
        else:
            print("✓ 配置验证通过")

        # 初始化数据库管理器
        print("\n[2/4] 初始化数据库管理器...")
        db_manager = DatabaseManager()
        query_service = QueryService(config)

        # 连接到数据库
        print("\n[3/4] 连接到数据库...")
        for db_id in config.list_databases():
            db_config = config.get_database(db_id)
            if not db_config:
                print(f"  ⚠ 跳过 {db_id}: 未找到配置")
                continue

            try:
                await db_manager.connect(
                    db_id=db_id,
                    host=db_config["host"],
                    database=db_config["database"],
                    user=db_config["user"],
                    password=db_config["password"],
                    port=db_config.get("port", 5432),
                    min_size=db_config.get("min_pool_size", 1),
                    max_size=db_config.get("max_pool_size", 10),
                )
                print(f"  ✓ 已连接到 {db_id}")
            except DatabaseError as e:
                print(f"  ✗ 连接 {db_id} 失败: {e.message}")
                print(f"    请检查数据库配置")
                # 不退出，继续启动服务器

        # 启动 MCP 服务器
        print("\n[4/4] 启动 MCP 服务器...")
        config_path = "config/config.yaml"
        server = PostgresMCPServer(config_path)

        print("\n" + "=" * 60)
        print("🎉 pg-mcp 服务器已启动！")
        print("=" * 60)
        print("\n配置的数据库:")
        for db_id in config.list_databases():
            db_config = config.get_database(db_id)
            if db_config:
                print(f"  - {db_id}: {db_config['host']}:{db_config['port']}/{db_config['database']}")

        print(f"\nLLM 配置:")
        llm_config = config.get_llm_config()
        print(f"  - Model: {llm_config.get('model')}")
        print(f"  - Base URL: {llm_config.get('base_url')}")
        print(f"  - Temperature: {llm_config.get('temperature')}")

        print("\n" + "=" * 60)
        print("服务器正在运行，等待 MCP 客户端连接...")
        print("按 Ctrl+C 停止服务器")
        print("=" * 60)

        # 启动服务器
        try:
            await server.run()
        except KeyboardInterrupt:
            print("\n\n收到停止信号，正在关闭服务器...")

    except ConfigError as e:
        print(f"❌ 配置错误: {e}")
        print("请检查 config/config.yaml 文件")
        return False

    except KeyboardInterrupt:
        print("\n\n服务器被用户中断")
        return True

    except Exception as e:
        print(f"❌ 启动失败: {e}")
        import traceback
        traceback.print_exc()
        return False

    finally:
        print("\n清理资源...")
        if 'db_manager' in locals():
            await db_manager.disconnect_all()
        print("服务器已关闭")

    return True


if __name__ == "__main__":
    try:
        success = asyncio.run(start_server())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n进程被中断")
        sys.exit(0)
