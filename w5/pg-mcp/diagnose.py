#!/usr/bin/env python3
"""诊断脚本 - 检查配置问题。"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

print("=" * 60)
print("pg-mcp 配置诊断")
print("=" * 60)

# 1. 检查配置文件
print("\n[1] 检查配置文件")
print("-" * 60)
config_path = Path("config/config.yaml")
if config_path.exists():
    print(f"✓ 配置文件存在: {config_path.absolute()}")
    print(f"  大小: {config_path.stat().st_size} bytes")
else:
    print(f"✗ 配置文件不存在: {config_path.absolute()}")
    sys.exit(1)

# 2. 加载并验证配置
print("\n[2] 加载配置文件")
print("-" * 60)

from pg_mcp.config.loader import Config

try:
    config = Config(str(config_path))
    print("✓ 配置加载成功")
except Exception as e:
    print(f"✗ 配置加载失败: {e}")
    sys.exit(1)

# 3. 检查数据库配置
print("\n[3] 数据库配置")
print("-" * 60)

databases = config.list_databases()
if not databases:
    print("✗ 没有配置数据库")
    sys.exit(1)

for db_id in databases:
    db_config = config.get_database(db_id)
    print(f"\n  数据库: {db_id}")
    print(f"    Host: {db_config.get('host')}")
    print(f"    Port: {db_config.get('port')}")
    print(f"    Database: {db_config.get('database')}")
    print(f"    User: {db_config.get('user')}")
    password = db_config.get('password')
    if password:
        masked = '*' * len(password)
        print(f"    Password: {masked} ({len(password)} chars)")
    else:
        print(f"    Password: (空) ⚠️  可能无法连接")

# 4. 检查 LLM 配置
print("\n[4] LLM 配置")
print("-" * 60)

llm_config = config.get_llm_config()
if not llm_config:
    print("✗ 没有 LLM 配置")
    sys.exit(1)

api_key = llm_config.get('api_key')
base_url = llm_config.get('base_url')
model = llm_config.get('model')

if api_key:
    masked = '*' * len(str(api_key))
    print(f"  API Key: {masked} ({len(str(api_key))} chars)")
else:
    print("  API Key: (空) ✗")

print(f"  Base URL: {base_url}")
print(f"  Model: {model}")

# 5. 验证配置
print("\n[5] 配置验证")
print("-" * 60)

errors = config.validate()
if errors:
    print("⚠  发现配置问题:")
    for error in errors:
        print(f"  - {error}")
else:
    print("✓ 配置验证通过")

# 6. 总结
print("\n" + "=" * 60)
print("诊断总结")
print("=" * 60)

if errors:
    print("\n❌ 需要修复配置问题")
    for error in errors:
        print(f"   - {error}")
else:
    print("\n✓ 配置正确")
    print("\n下一步:")
    print("  1. 运行: python test_simple.py 测试 LLM")
    print("  2. 如果 LLM 测试失败，检查 API 密钥")
    print("  3. 配置 Claude Desktop 集成")
    print("  4. 启动服务器进行使用")

print("\n Claude Desktop 配置示例:")
print("-" * 60)
print('''{
  "mcpServers": {
    "postgres": {
      "command": "python",
      "args": ["/Users/buoge/Desktop/github/aicoding-bootcamp/w5/pg-mcp/main.py"],
      "env": {
        "PATH": "/opt/anaconda3/bin:$PATH"
      }
    }
  }
}''')
print("=" * 60)
