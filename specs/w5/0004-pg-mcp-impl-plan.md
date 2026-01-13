# pg-mcp 实现计划

**版本**: 1.0
**日期**: 2026-01-12
**基于**: 设计文档 (0002-pg-mcp-design.md)

## 目录

1. [项目概述](#1-项目概述)
2. [架构与依赖](#2-架构与依赖)
3. [实现阶段](#3-实现阶段)
4. [阶段详情](#4-阶段详情)
5. [测试策略](#5-测试策略)
6. [附录](#8-附录)

---

## 1. 项目概述

### 1.1 项目目标

构建一个生产就绪的 PostgreSQL MCP（模型上下文协议）服务器，实现以下功能：
- 使用 Kimi-K2 LLM 实现自然语言到 SQL 的转换
- 安全的数据库访问（仅支持只读查询）
- 模式自动发现和缓存
- 全面的错误处理和验证
- 高测试覆盖率和代码质量

### 1.2 成功标准

- **功能性**: 4 个 MCP 工具全部正常运作
- **质量**: 85%+ 测试覆盖率，零类型错误
- **安全性**: 100% 拒绝非 SELECT 查询
- **性能**: P95 响应时间 < 5 秒
- **可靠性**: 95%+ SQL 生成成功率

### 1.3 技术栈

| 层级 | 技术 | 版本 |
|-------|------------|---------|
| 语言 | Python | 3.10+ |
| MCP 框架 | mcp | 0.1.0+ |
| 数据库 | asyncpg | 0.29.0+ |
| SQL 解析 | sqlglot | 20.0.0+ |
| LLM 客户端 | openai | 1.0.0+ |
| 配置 | pyyaml | 6.0+ |
| 测试 | pytest | 7.0.0+ |

---

## 2. 架构与依赖

### 2.1 组件架构

```
┌─────────────────────────────────────────────┐
│ 客户端 (Claude Desktop / IDE)               │
└──────────────┬──────────────────────────────┘
               │ MCP 协议
               ▼
┌─────────────────────────────────────────────┐
│ MCP 服务器层                                │
│  - mcp/server.py (FastMCP)                  │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│ 服务层                                      │
│  - service/query.py (QueryService)          │
└──────────────┬──────────────────────────────┘
               │
       ┌───────┼───────┬────────┐
       │       │       │        │
       ▼       ▼       ▼        ▼
┌─────────┐ ┌─────┐ ┌──────┐ ┌──────┐
│数据库管理 │ │ LLM │ │查询   │ │配置   │
│管理器    │ │服务 │ │执行器 │ │加载器 │
└─────────┘ └─────┘ └──────┘ └──────┘
     │          │       │        │
     │          │       │        │
     ▼          ▼       ▼        ▼
┌─────────┐ ┌─────┐ ┌──────┐ ┌──────┐
│asyncpg  │ │Kimi │ │asyncpg│ │YAML  │
│连接池    │ │API  │ │事务   │ │文件  │
└─────────┘ └─────┘ └──────┘ └──────┘
```

### 2.2 模块依赖

```
database/manager.py
    └── asyncpg
    └── config/loader.py (数据库配置)

database/schema.py
    ├── database/manager.py
    └── asyncpg

llm/service.py
    └── openai
    └── config/loader.py

security/validator.py
    └── sqlglot

query/executor.py
    ├── database/manager.py
    └── security/validator.py

service/query.py
    ├── database/manager.py
    ├── database/schema.py
    ├── llm/service.py
    ├── security/validator.py
    └── query/executor.py

mcp/server.py
    ├── service/query.py
    └── mcp (外部依赖)

main.py
    └── 所有模块
```

### 2.3 实现顺序

**阶段 1**: 基础 → 配置 → 数据库管理器
**阶段 2**: 模式管理器 → 安全验证器
**阶段 3**: 查询执行器 → LLM 服务
**阶段 4**: 服务层 → MCP 服务器
**阶段 5**: 集成与测试
**阶段 6**: 完善与文档

---

## 3. 实现阶段

### 阶段 1: 基础与配置 (3 天)

**依赖**: 无

**目标**:
- 搭建项目结构
- 配置开发工具
- 创建配置系统
- 实现基础数据库连接

**交付物**:
- 完整的项目目录结构
- 包含所有依赖的可用的 pyproject.toml
- 配置 pre-commit 钩子
- 支持 YAML 的配置加载器
- 带连接池的基础 DatabaseManager

**需实现的文件** (12 个文件):
```
./
├── pyproject.toml                    # 项目配置
├── requirements-dev.txt              # 开发依赖
├── .pre-commit-config.yaml          # Git 钩子
├── config/
│   ├── __init__.py
│   ├── config.example.yaml          # 配置示例
│   └── loader.py                    # 配置加载器
├── database/
│   ├── __init__.py
│   └── manager.py                   # 数据库连接池
└── tests/
    ├── __init__.py
    ├── conftest.py                  # 测试固件
    └── test_config_loader.py        # 配置测试
    └── database/test_manager.py     # 数据库管理器测试
```

**优先级**: P0 (关键路径)
**预计工时**: 24 小时

---

### 阶段 2: 数据库与模式层 (4 天)

**依赖**: 阶段 1

**目标**:
- 实现模式自动发现
- 添加模式缓存机制
- 使用 SQLGlot 创建安全验证器

**交付物**:
- 支持自动发现的 SchemaManager
- 内存模式缓存 (LRU)
- 完整的 SQL 安全验证器
- 本层测试覆盖率达到 90%+

**需实现的文件** (8 个文件):
```
database/
│   └── schema.py                    # 模式发现与缓存
security/
│   ├── __init__.py
│   └── validator.py                 # SQL 安全验证
tests/
├── database/test_schema.py          # 模式测试
├── security/test_validator.py       # 验证器测试
└── fixtures/
    ├── __init__.py
    ├── sample_schema.py            # 测试数据
    └── mock_pool.py                # 模拟数据库
```

**优先级**: P0 (关键路径)
**预计工时**: 32 小时

---

### 阶段 3: 查询与 LLM 层 (4 天)

**依赖**: 阶段 2

**目标**:
- 实现支持只读事务的查询执行器
- 集成 Kimi-K2 LLM 服务
- 添加 SQL 清理和验证

**交付物**:
- 安全的查询执行器（支持超时和 LIMIT 注入）
- 可运行的 LLM 服务（使用提示词工程）
- SQL 清理工具
- 错误处理和重试逻辑

**需实现的文件** (10 个文件):
```
query/
│   ├── __init__.py
│   └── executor.py                  # 支持事务的查询执行
llm/
│   ├── __init__.py
│   └── service.py                   # Kimi-K2 集成
utils/
│   ├── __init__.py
│   └── sanitization.py              # SQL/markdown 清理
tests/
├── query/test_executor.py
├── llm/test_service.py
└── utils/test_sanitization.py
scripts/
└── test_llm_integration.py          # 手动 LLM 测试脚本
```

**优先级**: P0 (关键路径)
**预计工时**: 32 小时

---

### 阶段 4: 服务与 MCP 层 (3 天)

**依赖**: 阶段 3

**目标**:
- 实现 QueryService 服务编排
- 创建包含 4 个工具的 MCP 服务器
- 添加错误处理和日志记录

**交付物**:
- 协调所有组件的服务层
- 支持完整工具集的 MCP 服务器
- 全面的错误响应
- 结构化日志记录

**需实现的文件** (8 个文件):
```
service/
│   ├── __init__.py
│   └── query.py                     # 服务编排
mcp/
│   ├── __init__.py
│   └── server.py                    # 带工具的 MCP 服务器
main.py                             # 入口点
tests/
├── service/test_query.py
├── mcp/test_server.py
└── integration/test_end_to_end.py
```

**优先级**: P0 (关键路径)
**预计工时**: 24 小时

---

### 阶段 5: 测试与质量 (3 天)

**依赖**: 阶段 4

**目标**:
- 达到 85%+ 测试覆盖率
- 添加集成测试
- 性能基准测试
- 安全验证

**交付物**:
- 代码覆盖率达到 85%+
- 集成测试套件
- 性能基准测试结果
- 安全测试套件
- 所有测试通过

**需实现的文件** (5 个文件):
```
tests/
│── benchmark/
│   └── test_performance.py         # 性能测试
└── security/
    └── test_security.py            # 安全验证测试
.github/
└── workflows/
    └── ci.yml                      # CI/CD 流水线
pyproject.toml                      # 更新测试配置
```

**优先级**: P1 (重要)
**预计工时**: 24 小时

---

### 阶段 6: 完善与文档 (2 天)

**依赖**: 阶段 5

**目标**:
- 完成文档
- 添加使用示例
- 创建部署指南
- 最终代码审查

**交付物**:
- 完整的 README.md
- API 文档
- 设置指南
- 故障排除指南
- 常用数据库的配置示例

**需实现的文件** (6 个文件):
```
README.md                           # 主要文档
docs/
│── setup.md                         # 设置指南
│── api.md                           # API 参考
├── examples/
│   ├── basic_usage.py              # 基础示例
│   └── advanced_queries.py         # 高级示例
└── troubleshooting.md              # 故障排除指南
```

**优先级**: P2 (可选)
**预计工时**: 16 小时

---

## 4. 阶段详情

### 4.1 阶段 1: 基础与配置

#### 4.1.1 项目结构搭建

**任务 1**: 创建目录结构
```bash
mkdir -p pg-mcp/{config,database,llm,query,security,service,mcp,tests/{unit,integration},utils,docs,scripts}
touch pg-mcp/{README.md,pyproject.toml,requirements-dev.txt,.pre-commit-config.yaml,.gitignore}
```

**任务 2**: 初始化 Python 包
```bash
cd pg-mcp
echo "__version__ = '0.1.0'" > __init__.py
```

#### 4.1.2 配置文件

**文件**: `pyproject.toml`
```toml
[build-system]
requires = ["setuptools>=45", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "pg-mcp"
version = "0.1.0"
description = "使用 AI 技术生成 SQL 的 PostgreSQL MCP 服务器"
authors = [{name = "AI Coding Bootcamp"}]
license = {text = "MIT"}
readme = "README.md"
requires-python = ">=3.10"

keywords = ["postgres", "mcp", "sql", "llm", "kimi"]
classifiers = [
    "Development Status :: 3 - Alpha",
    "Intended Audience :: Developers",
    "License :: OSI Approved :: MIT License",
    "Programming Language :: Python :: 3",
    "Programming Language :: Python :: 3.10",
    "Programming Language :: Python :: 3.11",
    "Programming Language :: Python :: 3.12",
]

dependencies = [
    "mcp>=0.1.0",
    "asyncpg>=0.29.0",
    "sqlglot>=20.0.0",
    "openai>=1.0.0",
    "pyyaml>=6.0",
    "pydantic>=2.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.0.0",
    "pytest-asyncio>=0.21.0",
    "pytest-cov>=4.0.0",
    "pytest-mock>=3.10.0",
    "pytest-xdist>=3.0.0",
    "ruff>=0.6.0",
    "mypy>=1.11.0",
    "bandit>=1.7.8",
    "pre-commit>=3.8.0",
    "testcontainers>=4.0.0",
    "types-PyYAML",
]

[project.urls]
Homepage = "https://github.com/buoge/pg-mcp"
Repository = "https://github.com/buoge/pg-mcp"
Issues = "https://github.com/buoge/pg-mcp/issues"

[project.scripts]
pg-mcp = "pg_mcp.main:main"

[tool.setuptools.packages.find]
where = ["."]
include = ["pg_mcp*"]

[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = [
    "-v",
    "--strict-markers",
    "--strict-config",
    "--cov=pg_mcp",
    "--cov-report=term-missing",
    "--cov-report=html",
    "--cov-fail-under=85",
]
markers = [
    "unit: 单元测试",
    "integration: 集成测试",
    "slow: 耗时较长的测试",
    "security: 安全测试",
]
asyncio_mode = "auto"

[tool.coverage.run]
source = ["pg_mcp"]
omit = [
    "*/tests/*",
    "*/test_*.py",
    "*/__init__.py",
]

[tool.ruff]
line-length = 100
target-version = "py310"

[tool.ruff.lint]
select = [
    "E",   # pycodestyle 错误
    "W",   # pycodestyle 警告
    "F",   # pyflakes
    "I",   # isort
    "B",   # flake8-bugbear
    "C4",  # flake8-comprehensions
    "UP",  # pyupgrade
    "PL",  # pylint
    "TCH", # flake8-type-checking
    "ANN", # flake8-annotations
]
ignore = [
    "PLR2004",  # 魔术值比较
    "PLR0913",  # 参数过多
    "ANN101",   # 缺少 self 类型
    "ANN102",   # 缺少 cls 类型
]

[tool.ruff.lint.isort]
known-first-party = ["pg_mcp"]

[tool.mypy]
python_version = "3.10"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
disallow_any_unimported = true
check_untyped_defs = true
show_error_codes = true
show_error_context = true

[[tool.mypy.overrides]]
module = ["asyncpg.*", "mcp.*", "openai.*"]
ignore_missing_imports = true
```

**文件**: `.pre-commit-config.yaml`
```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
      - id: check-merge-conflict
      - id: debug-statements
      - id: check-docstring-first

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.6.0
    hooks:
      - id: ruff
        args: [--fix, --exit-non-zero-on-fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.11.0
    hooks:
      - id: mypy
        additional_dependencies:
          - pydantic
          - types-PyYAML
```

**文件**: `config/loader.py`
```python
"""支持环境变量的配置加载器。"""

import os
from typing import Any, Dict, Optional
import yaml


class ConfigError(Exception):
    """配置错误。"""
    pass


class Config:
    """pg-mcp 的配置管理器。

    从支持环境变量的 YAML 文件加载配置。
    环境变量应采用格式: ${VAR_NAME}
    """

    def __init__(self, config_path: str = "config/config.yaml") -> None:
        """初始化配置加载器。

        参数:
            config_path: YAML 配置文件路径
        """
        self.config_path = config_path
        self._data: Dict[str, Any] = {}
        self.load()

    def load(self) -> None:
        """从文件加载配置。"""
        if not os.path.exists(self.config_path):
            raise ConfigError(f"配置文件未找到: {self.config_path}")

        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                self._data = yaml.safe_load(f) or {}
        except yaml.YAMLError as e:
            raise ConfigError(f"{self.config_path} 中存在无效的 YAML: {e}")

        # 替换环境变量
        self._replace_env_vars(self._data)

    def _replace_env_vars(self, obj: Any) -> None:
        """递归替换环境变量占位符。"""
        if isinstance(obj, dict):
            for key, value in obj.items():
                if isinstance(value, str) and value.startswith("${") and value.endswith("}"):
                    env_var = value[2:-1]
                    obj[key] = os.getenv(env_var, value)
                else:
                    self._replace_env_vars(value)
        elif isinstance(obj, list):
            for item in obj:
                self._replace_env_vars(item)

    def get(self, key: str, default: Any = None) -> Any:
        """使用点符号获取配置值。

        参数:
            key: 用点分隔的键 (例如: "databases.production.host")
            default: 如果键未找到时的默认值

        返回:
            配置值或默认值
        """
        keys = key.split(".")
        value = self._data

        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default

        return value

    def get_database(self, db_id: str) -> Optional[Dict[str, Any]]:
        """获取数据库配置。

        参数:
            db_id: 数据库标识符

        返回:
            数据库配置字典或 None
        """
        return self.get(f"databases.{db_id}")

    def get_llm_config(self) -> Dict[str, Any]:
        """获取 LLM 配置。

        返回:
            LLM 配置字典
        """
        return self.get("llm", {})

    def get_query_config(self) -> Dict[str, Any]:
        """获取查询配置。

        返回:
            查询配置字典
        """
        return self.get("query", {})

    def list_databases(self) -> list[str]:
        """列出所有已配置的数据库 ID。

        返回:
            数据库标识符列表
        """
        databases = self.get("databases", {})
        return list(databases.keys()) if isinstance(databases, dict) else []

    def validate(self) -> list[str]:
        """验证配置。

        返回:
            验证错误列表 (如果有效则为空)
        """
        errors = []

        # 检查数据库
        databases = self.get("databases", {})
        if not databases:
            errors.append("未配置数据库")

        for db_id, db_config in databases.items():
            required = ["host", "database", "user", "password"]
            for field in required:
                if field not in db_config:
                    errors.append(f"数据库 '{db_id}' 缺少必填字段: {field}")

        # 检查 LLM
        llm_config = self.get_llm_config()
        if not llm_config.get("api_key"):
            errors.append("未配置 LLM API 密钥")

        return errors
```

#### 4.1.3 Database Manager Implementation

**File**: `database/manager.py`
```python
"""使用 asyncpg 连接池的数据库连接管理器。"""

import asyncio
from typing import Optional

import asyncpg

from pg_mcp.exceptions import DatabaseError


class DatabaseManager:
    """使用 asyncpg 连接池管理 PostgreSQL 数据库连接。

    提供连接池、健康检查和安全连接管理。
    """

    def __init__(self) -> None:
        """初始化空的连接池注册表。"""
        self._pools: dict[str, asyncpg.Pool] = {}
        self._lock = asyncio.Lock()

    async def connect(
        self,
        db_id: str,
        host: str,
        database: str,
        user: str,
        password: str,
        port: int = 5432,
        min_size: int = 1,
        max_size: int = 10,
    ) -> bool:
        """为数据库创建连接池。

        参数:
            db_id: 唯一的数据库标识符
            host: 数据库主机
            database: 数据库名称
            user: 数据库用户
            password: 数据库密码
            port: 数据库端口 (默认: 5432)
            min_size: 最小连接池大小
            max_size: 最大连接池大小

        返回:
            如果连接成功返回 True，否则返回 False
        """
        async with self._lock:
            if db_id in self._pools:
                return True  # 已连接

            try:
                pool = await asyncpg.create_pool(
                    host=host,
                    port=port,
                    database=database,
                    user=user,
                    password=password,
                    min_size=min_size,
                    max_size=max_size,
                    command_timeout=30,
                    server_settings={
                        "application_name": f"pg_mcp_{db_id}",
                    },
                )

                # 测试连接
                async with pool.acquire() as conn:
                    await conn.fetch("SELECT 1")

                self._pools[db_id] = pool
                return True

            except asyncpg.Error as e:
                raise DatabaseError(
                    f"连接数据库 '{db_id}' 失败: {e}",
                    details={"host": host, "port": port, "database": database},
                )

    def get_pool(self, db_id: str) -> Optional[asyncpg.Pool]:
        """获取数据库的连接池。

        参数:
            db_id: 数据库标识符

        返回:
            连接池，如果未连接则返回 None
        """
        return self._pools.get(db_id)

    async def disconnect(self, db_id: str) -> None:
        """关闭数据库的连接池。

        参数:
            db_id: 数据库标识符
        """
        pool = self._pools.pop(db_id, None)
        if pool:
            await pool.close()

    async def disconnect_all(self) -> None:
        """关闭所有连接池。"""
        pools = list(self._pools.items())
        self._pools.clear()

        for db_id, pool in pools:
            await pool.close()

    async def health_check(self, db_id: str) -> tuple[bool, str]:
        """检查数据库健康状态。

        参数:
            db_id: 数据库标识符

        返回:
            (是否健康, 消息) 的元组
        """
        pool = self.get_pool(db_id)
        if not pool:
            return False, f"数据库 '{db_id}' 未连接"

        try:
            async with pool.acquire() as conn:
                await conn.fetch("SELECT 1")
                return True, "连接正常"
        except asyncpg.Error as e:
            return False, f"健康检查失败: {e}"

    def list_databases(self) -> list[str]:
        """列出所有已连接的数据库 ID。

        返回:
            数据库标识符列表
        """
        return list(self._pools.keys())
```

### 4.1.4 入口文件

**文件**: `main.py`
```python
"""pg-mcp 服务器的主入口点。"""

import asyncio
import sys
from pathlib import Path

from pg_mcp.config.loader import Config
from pg_mcp.database.manager import DatabaseManager
from pg_mcp.service.query import QueryService
from pg_mcp.mcp.server import PostgresMCPServer
from pg_mcp.exceptions import ConfigError, DatabaseError


async def setup_services(config: Config) -> tuple[DatabaseManager, QueryService]:
    """初始化和配置所有服务。

    参数:
        config: 配置实例

    返回:
        (数据库管理器, 查询服务) 的元组
    """
    db_manager = DatabaseManager()
    query_service = QueryService(config, db_manager)

    # 连接到所有配置的数据库
    print("正在连接数据库...")
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

    return db_manager, query_service


async def main() -> int:
    """主应用程序入口点。

    返回:
        退出代码 (成功为 0，错误为 1)
    """
    try:
        # 加载配置
        print("正在加载配置...")
        config = Config()

        # 验证配置
        errors = config.validate()
        if errors:
            print("配置错误:")
            for error in errors:
                print(f"  ✗ {error}")
            return 1

        print("  ✓ 配置有效")

        # 设置服务
        db_manager, query_service = await setup_services(config)

        # 启动 MCP 服务器
        print("\n正在启动 MCP 服务器...")
        server = PostgresMCPServer(query_service)
        await server.start()

        return 0

    except ConfigError as e:
        print(f"配置错误: {e}")
        return 1

    except KeyboardInterrupt:
        print("\n正在关闭...")
        return 0

    except Exception as e:
        print(f"意外错误: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
```

---

## 5. 测试策略

### 5.1 测试分类

**单元测试** (70%)
- 隔离测试单个组件
- 模拟所有外部依赖
- 快速执行（每个测试 < 100ms）

**集成测试** (20%)
- 测试组件间交互
- 使用内存数据库或 testcontainers
- 中等执行时间（每个测试 < 1s）

**端到端测试** (10%)
- 测试完整流程
- 使用真实 MCP 协议
- 慢速执行可以接受

### 5.2 测试结构

```
tests/
├── __init__.py
├── conftest.py                      # 全局固件
├── unit/                            # 单元测试
│   ├── __init__.py
│   ├── test_config.py
│   └── database/
│       ├── __init__.py
│       └── test_manager.py
├── integration/                     # 集成测试
│   ├── __init__.py
│   ├── test_end_to_end.py
│   └── database/
│       └── test_schema.py
└── fixtures/                        # 测试固件
    ├── __init__.py
    ├── sample_config.py
    └── mock_database.py
```

### 5.3 关键测试用例

**配置加载器测试**:
- 加载有效的 YAML
- 替换环境变量
- 处理缺失的文件
- 验证配置
- 返回默认值

**数据库管理器测试**:
- 创建连接池
- 处理连接错误
- 执行健康检查
- 正确关闭连接
- 管理多个数据库

**模式管理器测试**:
- 从数据库发现模式
- 缓存模式结果
- 按需刷新模式
- 为提示词提取模式文本

**安全验证器测试**:
- 拒绝非 SELECT 查询
- 阻止黑名单关键字
- 解析复杂 SQL
- 检查查询深度
- 允许合法查询

**LLM 服务测试**:
- 从提示词生成 SQL
- 处理 API 错误
- 清理 SQL 输出
- 验证结果
- 重试失败的请求

**查询执行器测试**:
- 执行安全查询
- 拒绝不安全查询
- 自动应用 LIMIT
- 处理超时
- 返回格式化的结果

---

## 6. 附录

### 6.1 配置模板

**文件**: `config/config.example.yaml`
```yaml
# PostgreSQL MCP 服务器配置模板

# 数据库配置
databases:
  # 生产数据库
  production:
    host: "${DB_PROD_HOST}"
    port: 5432
    database: "${DB_PROD_NAME}"
    user: "${DB_PROD_USER}"
    password: "${DB_PROD_PASSWORD}"
    min_pool_size: 1
    max_pool_size: 10

  # 开发数据库
  development:
    host: "localhost"
    port: 5432
    database: "dev_db"
    user: "postgres"
    password: "${DB_DEV_PASSWORD}"
    min_pool_size: 1
    max_pool_size: 5

  # 分析数据库
  analytics:
    host: "${DB_ANALYTICS_HOST}"
    port: 5432
    database: "analytics"
    user: "${DB_ANALYTICS_USER}"
    password: "${DB_ANALYTICS_PASSWORD}"
    min_pool_size: 1
    max_pool_size: 20

# LLM 配置
llm:
  api_key: "${KIMI_API_KEY}"
  base_url: "https://api.moonshot.cn/v1"
  model: "kimi-k2-thinking-turbo"
  temperature: 0.1
  max_tokens: 4000
  timeout: 60
  max_retries: 3

# 查询配置
query:
  max_rows: 1000
  timeout: 30
  enable_explain: true

# 模式配置
schema:
  cache_ttl: 3600  # 1 小时
  max_tables: 20
  max_columns_per_table: 50
```

### 6.2 开发环境设置

**文件**: `.env.example`
```bash
# 数据库配置
DB_PROD_HOST=prod-db.example.com
DB_PROD_NAME=production
DB_PROD_USER=readonly_user
DB_PROD_PASSWORD=secure_password_here

DB_DEV_PASSWORD=dev_password_here

DB_ANALYTICS_HOST=analytics.example.com
DB_ANALYTICS_USER=readonly_user
DB_ANALYTICS_PASSWORD=secure_password_here

# LLM 配置
KIMI_API_KEY=your_kimi_api_key_here

# 可选: 调试模式
LOG_LEVEL=INFO
```

### 6.3 Claude Desktop 集成

**文件**: `claude_desktop_config.example.json`
```json
{
  "mcpServers": {
    "postgres": {
      "command": "python",
      "args": ["/path/to/pg-mcp/main.py"],
      "env": {
        "DB_PROD_PASSWORD": "your_prod_password",
        "DB_ANALYTICS_PASSWORD": "your_analytics_password"
      }
    }
  }
}
```

### 6.4 实现清单

**实现前**:
- [ ] 审查所有需求
- [ ] 搭建开发环境
- [ ] 配置 git 仓库
- [ ] 设置 CI/CD 流水线
- [ ] 创建 GitHub/GitLab 项目

**阶段 1: 基础**:
- [ ] 创建项目结构
- [ ] 设置依赖
- [ ] 配置 pre-commit 钩子
- [ ] 实现配置加载器
- [ ] 编写配置测试
- [ ] 数据库管理器基础

**阶段 2: 数据库层**:
- [ ] 模式发现
- [ ] 缓存机制
- [ ] 安全验证器
- [ ] 集成测试

**阶段 3: LLM 与查询**:
- [ ] LLM 服务集成
- [ ] 查询执行器
- [ ] 错误处理
- [ ] 模拟测试

**阶段 4: 服务与 MCP**:
- [ ] 服务编排
- [ ] MCP 服务器
- [ ] 工具实现
- [ ] 端到端测试

**阶段 5: 测试**:
- [ ] 单元测试 (85%+ 覆盖率)
- [ ] 集成测试
- [ ] 性能基准
- [ ] 安全测试

**阶段 6: 文档**:
- [ ] README.md
- [ ] API 文档
- [ ] 设置指南
- [ ] 使用示例

**部署**:
- [ ] 生产配置
- [ ] 监控设置
- [ ] 错误跟踪
- [ ] 用户培训

---

**文档状态**: 实现计划
**维护者**: AI Coding Bootcamp
**后续步骤**: 开始阶段 1 - 基础搭建
