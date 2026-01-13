# pg-mcp 测试计划

**版本**: 1.0
**日期**: 2026-01-13
**基于**: 实现计划 (0004-pg-mcp-impl-plan.md) 和 设计文档 (0002-pg-mcp-design.md)

## 目录

1. [测试策略概述](#1-测试策略概述)
2. [测试架构与组织](#2-测试架构与组织)
3. [单元测试详述](#3-单元测试详述)
4. [集成测试详述](#4-集成测试详述)
5. [端到端测试详述](#5-端到端测试详述)
6. [性能测试](#6-性能测试)
7. [安全测试](#7-安全测试)
8. [测试数据管理](#8-测试数据管理)
9. [测试覆盖率要求](#9-测试覆盖率要求)
10. [CI/CD 与自动化](#10-cicd-与自动化)
11. [测试工具与技术](#11-测试工具与技术)
12. [时间线与里程碑](#12-时间线与里程碑)
13. [风险与缓解措施](#13-风险与缓解措施)

---

## 1. 测试策略概述

### 1.1 测试哲学

pg-mcp 测试策略遵循"测试金字塔"原则，强调:

- **单元测试为主** (70%): 快速、隔离、可重复
- **集成测试为辅** (20%): 验证组件协作、边界情况
- **端到端测试为顶** (10%): 验证完整用户流程

所有测试必须满足:
- ✅ 完全自动化，支持 CI/CD 集成
- ✅ 每个测试可在 < 1 秒内完成（单元测试 < 100ms）
- ✅ 可并行执行
- ✅ 无外部依赖（使用模拟和打桩）
- ✅ 清晰的命名规范
- ✅ 独立的测试数据，避免测试间污染

### 1.2 质量目标

| 指标 | 目标值 | 测量方式 | 优先级 |
|------|--------|----------|--------|
| 代码覆盖率 | ≥ 85% | pytest-cov | P0 |
| 单元测试通过率 | 100% | pytest 执行 | P0 |
| 集成测试通过率 | 100% | pytest 执行 | P0 |
| 安全测试通过率 | 100% | 专门安全套件 | P0 |
| 性能 P95 | < 5 秒 | pytest-benchmark | P1 |
| SQL 生成成功率 | ≥ 95% | 端到端测试 | P1 |
| 类型检查 | 0 错误 | mypy | P0 |
| Lint 检查 | 0 警告 | ruff | P0 |

### 1.3 测试分类

```
测试金字塔
    ┌─────────────────────┐  E2E (10%)
    │  E2E Tests          │  - 完整工作流
    │  - Full workflows   │  - 真实环境
    └─────────────────────┘
    ┌─────────────────────┐  Integration (20%)
    │  Integration Tests  │  - 组件协作
    │  - Component        │  - 边界测试
    │    collaboration    │  - 数据库集成
    └─────────────────────┘
    ┌─────────────────────┐  Unit (70%)
    │  Unit Tests         │  - 隔离测试
    │  - Isolated tests   │  - 快速执行
    │  - Logic validation │  - 全路径覆盖
    └─────────────────────┘
```

---

## 2. 测试架构与组织

### 2.1 测试目录结构

```
pg-mcp/
├── tests/                          # 主测试目录
│   ├── __init__.py
│   ├── conftest.py                 # 全局固件配置
│   ├── fixtures/                   # 共享测试数据
│   │   ├── __init__.py
│   │   ├── sample_schema.py        # 模拟数据库模式
│   │   ├── mock_config.py          # 模拟配置
│   │   └── test_data.sql          # 测试数据 SQL
│   │
│   ├── unit/                       # 单元测试（70%）
│   │   ├── __init__.py
│   │   ├── test_config_loader.py  # 配置加载器测试
│   │   ├── database/
│   │   │   ├── __init__.py
│   │   │   ├── test_manager.py    # 数据库管理器测试
│   │   │   └── test_schema.py     # 模式管理器测试
│   │   ├── security/
│   │   │   ├── __init__.py
│   │   │   └── test_validator.py  # 安全验证器测试
│   │   ├── llm/
│   │   │   ├── __init__.py
│   │   │   └── test_service.py    # LLM 服务测试
│   │   ├── query/
│   │   │   ├── __init__.py
│   │   │   └── test_executor.py   # 查询执行器测试
│   │   └── service/
│   │       ├── __init__.py
│   │       └── test_query.py      # 服务层测试
│   │
│   ├── integration/               # 集成测试（20%）
│   │   ├── __init__.py
│   │   ├── test_end_to_end.py     # 端对端集成
│   │   ├── test_mcp_server.py     # MCP 服务器集成
│   │   └── database/
│   │       ├── __init__.py
│   │       └── test_real_db.py    # 真实数据库集成
│   │
│   ├── e2e/                       # 端到端测试（10%）
│   │   ├── __init__.py
│   │   ├── test_workflows.py      # 完整工作流测试
│   │   ├── test_mcp_protocol.py   # MCP 协议测试
│   │   └── test_user_scenarios.py # 用户场景测试
│   │
│   ├── benchmark/                 # 性能基准测试
│   │   ├── __init__.py
│   │   ├── test_performance.py    # 性能测试
│   │   └── conftest.py           # 性能测试固件
│   │
│   └── security/                  # 安全专项测试
│       ├── __init__.py
│       ├── test_security.py       # 安全测试套件
│       └── test_sql_injection.py  # SQL 注入测试
│
└── pyproject.toml                # 测试配置
```

### 2.2 测试固件架构

**conftest.py 核心固件:**

```python
# tests/conftest.py
import pytest
import asyncio
from unittest.mock import Mock, AsyncMock
import tempfile
import os


@pytest.fixture(scope='session')
def event_loop():
    """创建全局事件循环用于异步测试。"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def mock_db_pool():
    """模拟 asyncpg 连接池。"""
    pool = Mock()
    pool.acquire = AsyncMock()
    pool.close = AsyncMock()
    return pool


@pytest.fixture
def mock_db_connection():
    """模拟数据库连接。"""
    conn = Mock()
    conn.fetch = AsyncMock(return_value=[{'id': 1, 'name': 'test'}])
    conn.execute = AsyncMock()
    return conn


@pytest.fixture
def temp_config_file():
    """创建临时配置文件用于测试。"""
    config_content = """
databases:
  test_db:
    host: localhost
    port: 5432
    database: test_db
    user: test_user
    password: test_pass

llm:
  api_key: test_key
  model: test_model

query:
  max_rows: 100
"""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
        f.write(config_content)
        temp_path = f.name

    yield temp_path
    # 清理
    os.unlink(temp_path)


@pytest.fixture
def sample_schema():
    """提供标准测试用的数据库模式。"""
    return {
        'tables': {
            'public.users': {
                'columns': [
                    {'column_name': 'id', 'data_type': 'integer', 'is_nullable': 'NO'},
                    {'column_name': 'name', 'data_type': 'varchar', 'is_nullable': 'NO'},
                    {'column_name': 'email', 'data_type': 'varchar', 'is_nullable': 'NO'},
                ]
            },
            'public.orders': {
                'columns': [
                    {'column_name': 'id', 'data_type': 'integer', 'is_nullable': 'NO'},
                    {'column_name': 'user_id', 'data_type': 'integer', 'is_nullable': 'NO'},
                    {'column_name': 'amount', 'data_type': 'numeric', 'is_nullable': 'NO'},
                ]
            }
        }
    }


@pytest.fixture
def mock_openai_client():
    """模拟 OpenAI/Kimi 客户端。"""
    client = Mock()
    client.chat = Mock()
    client.chat.completions = Mock()
    client.chat.completions.create = AsyncMock()
    return client
```

### 2.3 测试标记分类

```python
# 测试标记用于选择性执行
pytestmark = [
    pytest.mark.unit,           # 单元测试
    pytest.mark.integration,    # 集成测试
    pytest.mark.e2e,           # 端到端测试
    pytest.mark.slow,          # 慢速测试（> 1秒）
    pytest.mark.security,      # 安全测试
    pytest.mark.performance,   # 性能测试
    pytest.mark.needs_db,      # 需要数据库
    pytest.mark.needs_llm,     # 需要 LLM API
]

# 使用示例:
# pytest -m "unit"              # 只运行单元测试
# pytest -m "not slow"          # 排除慢速测试
# pytest -m "integration" -v    # 运行集成测试
```

---

## 3. 单元测试详述

### 3.1 配置加载器测试 (tests/unit/test_config_loader.py)

**目标**: 100% 覆盖率，验证配置加载和验证逻辑

```python
# 测试覆盖率: 15 个测试用例
test_load_valid_yaml()             # 加载有效 YAML
test_replace_env_vars()            # 环境变量替换
test_missing_config_file()         # 缺失配置文件
test_invalid_yaml_syntax()         # 无效 YAML 语法
test_get_simple_key()              # 获取简单键值
test_get_nested_key()              # 获取嵌套键值
test_get_default_value()           # 获取默认值
test_get_database_config()         # 获取数据库配置
test_get_llm_config()              # 获取 LLM 配置
test_list_databases()              # 列出所有数据库
test_validate_success()            # 验证成功
test_validate_missing_databases()  # 验证失败：缺少数据库
test_validate_missing_db_fields()  # 验证失败：缺少字段
test_validate_missing_api_key()    # 验证失败：缺少 API 密钥
test_complex_nested_access()       # 复杂嵌套访问
```

**关键断言:**
- ✅ 正确解析 YAML 结构
- ✅ 环境变量占位符 `${VAR}` 被正确替换
- ✅ 验证所有必需配置字段
- ✅ 返回有意义的错误信息
- ✅ 支持点分路径访问（如 `databases.production.host`）

### 3.2 数据库管理器测试 (tests/unit/database/test_manager.py)

**目标**: 95% 覆盖率，验证连接池管理和错误处理

```python
# 测试覆盖率: 18 个测试用例
test_connect_success()             # 连接成功
test_connect_invalid_credentials() # 无效凭据
test_connect_timeout()             # 连接超时
test_connect_duplicate()           # 重复连接（幂等）
test_get_pool_exists()             # 获取存在的连接池
test_get_pool_not_exists()         # 获取不存在的连接池
test_disconnect_single()           # 断开单个连接
test_disconnect_all()              # 断开所有连接
test_disconnect_nonexistent()      # 断开不存在的数据库
test_health_check_success()        # 健康检查成功
test_health_check_failure()        # 健康检查失败
test_health_check_not_connected()  # 健康检查：未连接
test_list_databases_empty()        # 列出数据库：空
test_list_databases_multiple()     # 列出数据库：多个
test_concurrent_connections()      # 并发连接
test_connection_pool_limits()      # 连接池限制
test_acquire_connection()          # 获取连接
test_release_connection()          # 释放连接
```

**关键断言:**
- ✅ 成功创建 asyncpg 连接池
- ✅ 正确处理连接错误（无效凭据、主机不可达）
- ✅ 幂等连接（重复连接不报错）
- ✅ 线程安全的连接池管理
- ✅ 正确清理资源（断开连接时关闭池）

### 3.3 模式管理器测试 (tests/unit/database/test_schema.py)

**目标**: 90% 覆盖率，验证模式发现和缓存

```python
# 测试覆盖率: 12 个测试用例
test_discover_schema_success()     # 发现模式成功
test_discover_schema_empty_db()    # 发现模式：空数据库
test_discover_schema_no_connection() # 发现模式：无连接
test_get_schema_from_cache()       # 从缓存获取模式
test_get_schema_populate_cache()   # 获取模式并填充缓存
test_refresh_schema()              # 刷新模式缓存
test_refresh_schema_clears_old()   # 刷新清除旧缓存
test_get_schema_text_simple()      # 获取模式文本：简单
test_get_schema_text_max_tables()  # 获取模式文本：限制表数
test_get_schema_text_empty()       # 获取模式文本：空
test_schema_cache_lifecycle()      # 模式缓存生命周期
test_concurrent_schema_access()    # 并发模式访问
```

**关键断言:**
- ✅ 正确查询 PostgreSQL 系统表（information_schema）
- ✅ 提取表名、列名、数据类型、可空性
- ✅ 忽略系统 schemas（pg_catalog、information_schema）
- ✅ LRU 缓存机制正确工作
- ✅ 模式文本格式化正确（用于 LLM prompt）

### 3.4 SQL 安全验证器测试 (tests/unit/security/test_validator.py)

**目标**: 100% 覆盖率，这是最关键的安全组件 ⚠️

```python
# 测试覆盖率: 25+ 个测试用例

# ==== 黑名单关键字测试 ====
test_reject_insert()               # 拒绝 INSERT
test_reject_update()               # 拒绝 UPDATE
test_reject_delete()               # 拒绝 DELETE
test_reject_drop()                 # 拒绝 DROP
test_reject_truncate()             # 拒绝 TRUNCATE
test_reject_alter()                # 拒绝 ALTER
test_reject_create()               # 拒绝 CREATE
test_reject_grant()                # 拒绝 GRANT
test_reject_begin_transaction()    # 拒绝 BEGIN/COMMIT
test_reject_copy()                 # 拒绝 COPY

# ==== SQL 解析验证 ====
test_accept_simple_select()        # 接受简单 SELECT
test_accept_select_with_join()     # 接受 JOIN
test_accept_select_with_where()    # 接受 WHERE
test_accept_select_with_subquery() # 接受子查询
test_reject_non_select_statement() # 拒绝非 SELECT 语句
test_reject_malformed_sql()        # 拒绝畸形 SQL

# ==== 查询深度限制 ====
test_accept_shallow_subquery()     # 接受浅层子查询
test_reject_deeply_nested_query()  # 拒绝深层嵌套
test_query_depth_boundary()        # 查询深度边界（3级）

# ==== 边界情况 ====
test_empty_sql()                   # 空 SQL
test_whitespace_only()             # 仅空白字符
test_sql_injection_attempts()      # SQL 注入尝试
test_case_insensitive_blacklist()  # 大小写不敏感黑名单
test_unicode_in_sql()              # SQL 中的 Unicode 字符
```

**关键断言:**
- ✅ 100% 拒绝所有非 SELECT 操作（INSERT、UPDATE、DELETE、DDL）
- ✅ 通过 sqlglot 正确解析 SQL 语法
- ✅ 查询嵌套深度 ≤ 3 层
- ✅ 大小写不敏感的关键字检测
- ✅ 详细的安全错误信息

### 3.5 LLM 服务测试 (tests/unit/llm/test_service.py)

**目标**: 85% 覆盖率，模拟外部 API

```python
# 测试覆盖率: 14 个测试用例
test_generate_sql_success()        # 生成 SQL 成功
test_generate_sql_api_error()      # API 错误处理
test_generate_sql_timeout()        # 超时处理
test_generate_sql_cleanup_markdown() # 清理 Markdown
test_generate_sql_with_schema()    # 带模式的 SQL 生成
test_generate_sql_empty_response() # 空响应处理

test_validate_result_success()     # 验证结果成功
test_validate_result_low_score()   # 验证结果：低分
test_validate_result_parse_json()  # 解析 JSON 验证结果
test_validate_result_api_failure() # API 失败回退
test_validate_result_empty_preview() # 空预览验证

test_retry_on_failure()            # 失败重试
test_exponential_backoff()         # 指数退避
test_invalid_api_key()             # 无效 API 密钥
```

**关键断言:**
- ✅ 正确处理 OpenAI/Kimi API 响应
- ✅ 清理 LLM 返回的 Markdown 格式 SQL
- ✅ 解析 JSON 格式的验证结果
- ✅ 实现指数退避重试机制
- ✅ 优雅处理 API 错误（超时、配额耗尽、无效密钥）

### 3.6 查询执行器测试 (tests/unit/query/test_executor.py)

**目标**: 90% 覆盖率，验证安全执行和结果格式化

```python
# 测试覆盖率: 16 个测试用例
test_execute_simple_select()       # 执行简单 SELECT
test_execute_with_join()           # 执行 JOIN
test_execute_injects_limit()       # 注入 LIMIT
test_execute_respects_existing_limit() # 尊重现有 LIMIT
test_execute_readonly_transaction() # 只读事务
test_execute_timeout()             # 查询超时
test_execute_connection_error()    # 连接错误
test_execute_empty_result()        # 空结果集
test_execute_large_result()        # 大数据结果集
test_execute_column_types()        # 列类型处理
test_execute_formatted_results()   # 格式化结果
test_execute_execution_time()      # 执行时间记录

test_test_connection_success()     # 测试连接成功
test_test_connection_failure()     # 测试连接失败
test_test_connection_no_pool()     # 测试连接：无连接池

test_concurrent_queries()          # 并发查询
```

**关键断言:**
- ✅ 使用只读事务（`readonly=True`）
- ✅ 自动注入 LIMIT（如果没有则添加）
- ✅ 正确格式化结果为字典列表
- ✅ 记录执行时间和行数
- ✅ 正确处理多种 PostgreSQL 数据类型

### 3.7 服务层测试 (tests/unit/service/test_query.py)

**目标**: 85% 覆盖率，验证服务编排

```python
# 测试覆盖率: 20 个测试用例

# query_database 方法
test_query_database_flow()         # 完整查询流程
test_query_database_no_llm()       # 无 LLM 服务
test_query_database_schema_error() # 模式获取错误
test_query_database_sql_generation_error() # SQL 生成错误
test_query_database_execution_error() # 执行错误
test_query_database_with_validation() # 带验证的查询
test_query_database_validation_error() # 验证错误

# execute_sql 方法
test_execute_sql_flow()            # 执行 SQL 流程
test_execute_sql_unsafe_rejected() # 不安全 SQL 被拒绝
test_execute_sql_security_validator_error() # 安全验证器错误

test_list_databases_flow()         # 列出数据库流程
test_list_databases_empty()        # 列出数据库为空

test_refresh_schema_flow()         # 刷新模式流程

# 边界情况
test_concurrent_queries_different_dbs() # 并发查询不同数据库
test_query_cancelled()             # 查询取消
test_service_initialization_error() # 服务初始化错误
test_missing_database_config()     # 缺失数据库配置
```

---

## 4. 集成测试详述

### 4.1 集成测试原则

- 使用 **testcontainers** 运行真实 PostgreSQL
- 不需要外部 LLM API（使用模拟）
- 测试完整组件链
- 验证边界条件和错误传播

### 4.2 数据库集成的测试 (tests/integration/database/test_real_db.py)

```python
# 测试覆盖率: 10 个测试用例

test_real_postgres_connection()    # 真实 PostgreSQL 连接
test_real_postgres_schema_discovery() # 真实模式发现
test_real_postgres_query_execution() # 真实查询执行
test_real_postgres_readonly_mode() # 真实只读模式
test_real_postgres_transaction_isolation() # 事务隔离
test_real_postgres_multiple_databases() # 多数据库
test_real_postgres_connection_pool() # 连接池行为
test_real_postgres_error_handling() # 错误处理
test_real_postgres_data_types()    # 数据类型处理
test_real_postgres_concurrent_access() # 并发访问
```

**关键断言:**
- ✅ 使用 testcontainers 启动真实 PostgreSQL
- ✅ 验证模式发现准确反映数据库结构
- ✅ 确认只读事务确实无法修改数据
- ✅ 测试真实连接池行为（连接复用、超时）

### 4.3 MCP 服务器集成测试 (tests/integration/test_mcp_server.py)

```python
# 测试覆盖率: 8 个测试用例

test_mcp_server_start()            # 服务器启动
test_mcp_list_tools()              # 列出工具
test_mcp_call_query_database()     # 调用 query_database 工具
test_mcp_call_execute_sql()        # 调用 execute_sql 工具
test_mcp_call_list_databases()     # 调用 list_databases 工具
test_mcp_call_refresh_schema()     # 调用 refresh_schema 工具
test_mcp_error_handling()          # 错误处理
test_mcp_concurrent_requests()     # 并发请求
```

### 4.4 端到端集成测试 (tests/integration/test_end_to_end.py)

```python
# 测试覆盖率: 12 个测试用例

test_e2e_simple_query_flow()       # 简单查询流程
test_e2e_complex_query_with_join() # 复杂 JOIN 查询
test_e2e_sql_direct_execution()    # 直接 SQL 执行
test_e2e_schema_refresh_flow()     # 模式刷新流程
test_e2e_database_listing()        # 数据库列表
test_e2e_error_propagation()       # 错误传播
test_e2e_concurrent_users()        # 多用户并发
test_e2e_long_running_query()      # 长时间查询
test_e2e_rapid_queries()           # 快速连续查询
test_e2e_mixed_operations()        # 混合操作
test_e2e_resource_cleanup()        # 资源清理
test_e2e_recovery_from_errors()    # 错误恢复
```

---

## 5. 端到端测试详述

### 5.1 端到端测试定义

端到端测试验证完整的用户场景，包括:
- 真实 MCP 协议通信
- 完整的服务链（MCP → Service → LLM/DB/Security）
- 真实或高保真模拟的环境

### 5.2 测试用例设计

```python
# 用户场景 1: 数据分析师查询销售数据
test_user_story_sales_analysis():
    # 场景: "查询上个月销售额最高的 10 个产品"
    # Steps:
    # 1. 用户通过 MCP 发送自然语言查询
    # 2. 服务器解析请求并获取数据库模式
    # 3. LLM 生成 SQL
    # 4. 安全验证器检查 SQL
    # 5. 查询执行器在只读事务中执行
    # 6. 结果通过 MCP 返回给用户
    # 7. 可选：结果验证

# 用户场景 2: 直接 SQL 执行
test_user_story_direct_sql():
    # 场景: "直接执行 SELECT * FROM orders LIMIT 100"
    # Steps:
    # 1. 安全验证器严格检查 SQL
    # 2. 确保只允许 SELECT
    # 3. 执行并返回结果

# 用户场景 3: 数据库探索
test_user_story_explore_databases():
    # 场景: "列出所有可用的数据库"
    # 验证: 返回正确的数据库列表和连接状态
```

### 5.3 自动化端到端测试套件

```python
# tests/e2e/test_workflows.py

# 测试覆盖率: 8 个场景
test_workflow_natural_language_to_results() # 自然语言到结果
test_workflow_direct_sql_safe_only()       # 直接 SQL（仅安全）
test_workflow_database_management()        # 数据库管理
test_workflow_schema_refresh()             # 模式刷新
test_workflow_error_recovery()             # 错误恢复
test_workflow_concurrent_requests()        # 并发请求
test_workflow_long_session()               # 长会话
```

---

## 6. 性能测试

### 6.1 性能基准测试 (tests/benchmark/test_performance.py)

**目标**: P95 响应时间 < 5 秒

```python
# 测试覆盖率: 10 个基准测试
def test_bench_config_load(benchmark):        # 配置加载基准
def test_bench_db_connection(benchmark):      # 数据库连接基准
def test_bench_schema_discovery(benchmark):   # 模式发现基准
def test_bench_schema_cache_hit(benchmark):   # 模式缓存命中基准
def test_bench_security_validation(benchmark): # 安全验证基准
def test_bench_llm_sql_generation(benchmark): # LLM SQL 生成基准
def test_bench_query_execution_small(benchmark): # 小查询执行基准
def test_bench_query_execution_large(benchmark): # 大查询执行基准
def test_bench_concurrent_queries(benchmark):    # 并发查询基准
def test_bench_mcp_round_trip(benchmark):        # MCP 往返基准
```

**性能阈值:**
| 操作 | P50 | P95 | P99 |
|------|-----|-----|-----|
| 配置加载 | < 50ms | < 100ms | < 200ms |
| 数据库连接 | < 100ms | < 500ms | < 1s |
| 模式发现 | < 500ms | < 2s | < 5s |
| 模式缓存命中 | < 10ms | < 20ms | < 50ms |
| 安全验证 | < 50ms | < 100ms | < 200ms |
| LLM 生成 | < 1s | < 3s | < 5s |
| 查询执行（小）| < 100ms | < 500ms | < 1s |
| 查询执行（大）| < 1s | < 5s | < 10s |
| MCP 往返 | < 100ms | < 500ms | < 1s |

### 6.2 负载测试策略

```bash
# 使用 pytest 并行执行模拟负载
pytest -n auto --dist=loadfile       # 自动并行
pytest --benchmark-min-time=0.1      # 最小基准时间
pytest --benchmark-warmup=on         # 启用预热
```

---

## 7. 安全测试

### 7.1 SQL 注入测试 (tests/security/test_sql_injection.py) ⚠️

```python
# 测试覆盖率: 30+ 个注入测试用例

test_sqli_union_select()           # UNION SELECT 注入
test_sqli_comment_based()          # 注释注入
test_sqli_stacked_queries()        # 堆叠查询注入
test_sqli_time_based()             # 基于时间的注入
test_sqli_boolean_based()          # 基于布尔的注入
test_sqli_error_based()            # 基于错误的注入
test_sqli_second_order()           # 二阶注入
test_sqli_out_of_band()            # 带外注入
test_sqli_utf8_bypass()            # UTF-8 绕过尝试
test_sqli_double_encoding()        # 双重编码绕过
test_sqli_escaped_quotes()         # 转义引号尝试
# ... 更多注入变体
```

**验证所有注入被阻止:**
- ✅ 100% 拒绝非 SELECT 语句
- ✅ SQLGlot 解析失败或检测到黑名单关键字
- ✅ 返回安全错误（不泄露数据库细节）

### 7.2 权限和访问测试

```python
test_readonly_enforcement()        # 强制只读
test_no_ddl_allowed()              # 禁止 DDL
test_no_dml_allowed()              # 禁止 DML
test_transaction_isolation()       # 事务隔离
test_connection_privileges()       # 连接权限
```

### 7.3 数据泄露测试

```python
test_no_error_details_exposed()    # 不暴露错误详情
test_no_stack_traces()             # 不暴露堆栈跟踪
test_safe_error_messages()         # 安全错误信息
test_no_config_exposure()          # 配置信息不泄露
```

---

## 8. 测试数据管理

### 8.1 测试数据库种子

```sql
-- tests/fixtures/test_data.sql

-- 创建测试表
CREATE TABLE IF NOT EXISTS test_users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS test_orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES test_users(id),
    amount NUMERIC(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入测试数据
INSERT INTO test_users (name, email) VALUES
    ('Alice Johnson', 'alice@example.com'),
    ('Bob Smith', 'bob@example.com'),
    ('Carol White', 'carol@example.com'),
    ('David Brown', 'david@example.com'),
    ('Eve Davis', 'eve@example.com');

INSERT INTO test_orders (user_id, amount, status) VALUES
    (1, 100.50, 'completed'),
    (1, 250.00, 'completed'),
    (2, 75.25, 'pending'),
    (3, 500.00, 'completed'),
    (4, 150.75, 'pending');
```

### 8.2 测试数据工厂

```python
# tests/fixtures/test_factories.py
class TestDataFactory:
    """生成测试数据的工厂类。"""

    @staticmethod
    def create_config(databases=None, llm=None):
        """创建测试配置。"""
        return {
            'databases': databases or {
                'test_db': {
                    'host': 'localhost',
                    'port': 5432,
                    'database': 'test_db',
                    'user': 'test_user',
                    'password': 'test_pass'
                }
            },
            'llm': llm or {
                'api_key': 'test_key',
                'model': 'test_model'
            },
            'query': {
                'max_rows': 100
            }
        }

    @staticmethod
    def create_schema(tables=2, columns_per_table=3):
        """创建测试模式。"""
        schema = {'tables': {}}
        for i in range(tables):
            table_name = f'public.table_{i}'
            schema['tables'][table_name] = {
                'columns': [
                    {
                        'column_name': f'col_{j}',
                        'data_type': 'integer' if j == 0 else 'varchar',
                        'is_nullable': 'NO' if j == 0 else 'YES'
                    }
                    for j in range(columns_per_table)
                ]
            }
        return schema
```

---

## 9. 测试覆盖率要求

### 9.1 覆盖率阈值

在 `pyproject.toml` 中强制要求:
```toml
[tool.coverage.run]
source = ["pg_mcp"]
omit = [
    "*/tests/*",
    "*/test_*.py",
    "*/__init__.py",
    "*/main.py",  # 入口点难以测试
]

[tool.coverage.report]
precision = 2
show_missing = True
skip_covered = False

[tool.pytest.ini_options]
addopts = [
    "--cov=pg_mcp",
    "--cov-report=term-missing",
    "--cov-report=html",
    "--cov-fail-under=85",  # 关键：低于 85% 失败
]
```

### 9.2 分模块覆盖率目标

| 模块 | 目标覆盖率 | 关键文件 |
|------|-----------|----------|
| config/loader.py | 95% | 配置加载 |
| database/manager.py | 95% | 连接池管理 |
| database/schema.py | 90% | 模式发现 |
| security/validator.py | **100%** | SQL 安全验证 ⚠️ |
| llm/service.py | 85% | LLM 集成 |
| query/executor.py | 90% | 查询执行 |
| service/query.py | 85% | 服务编排 |
| mcp/server.py | 80% | MCP 服务器 |
| **整体** | **≥ 85%** | **所有代码** |

---

## 10. CI/CD 与自动化

### 10.1 GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        ports:
          - 5432:5432

    strategy:
      matrix:
        python-version: ["3.10", "3.11", "3.12"]

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python ${{ matrix.python-version }}
        uses: actions/setup-python@v4
        with:
          python-version: ${{ matrix.python-version }}
          cache: 'pip'

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -e ".[dev]"

      - name: Run linting
        run: |
          ruff check pg_mcp tests
          ruff format --check pg_mcp tests

      - name: Run type checking
        run: mypy pg_mcp

      - name: Run security scan
        run: bandit -r pg_mcp -ll

      - name: Run unit tests
        run: pytest -m "unit" --cov --cov-report=xml

      - name: Run integration tests
        run: pytest -m "integration" --cov --cov-report=xml --cov-append

      - name: Run security tests
        run: pytest -m "security" --cov --cov-report=xml --cov-append

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage.xml
          flags: unittests
          fail_ci_if_error: true

      - name: Run benchmark
        run: pytest tests/benchmark/ --benchmark-json output.json

      - name: Check coverage threshold
        run: |
          coverage report --fail-under=85
```

### 10.2 预提交钩子

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
      - id: debug-statements

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
          - pytest

  - repo: local
    hooks:
      - id: pytest-unit
        name: Run unit tests
        entry: pytest -m "unit" -x
        language: system
        pass_filenames: false
        always_run: true
```

### 10.3 测试执行命令

```bash
# 运行所有测试
pytest

# 按类型运行
pytest -m "unit"
pytest -m "integration"
pytest -m "e2e"
pytest -m "not slow"

# 并行执行
pytest -n auto  # 使用所有 CPU 核心

# 覆盖率
pytest --cov --cov-report=html
open htmlcov/index.html

# 性能测试
pytest tests/benchmark/ --benchmark-only

# 安全测试
pytest -m "security" -v

# 持续模式
pytest -f  # 文件变化自动重跑

# 失败时调试
pytest --pdb  # 失败时进入调试器
```

---

## 11. 测试工具与技术

### 11.1 核心测试框架

| 工具 | 用途 | 版本 |
|------|------|------|
| pytest | 测试框架 | ≥ 7.0.0 |
| pytest-asyncio | 异步测试 | ≥ 0.21.0 |
| pytest-cov | 覆盖率 | ≥ 4.0.0 |
| pytest-mock | 模拟 | ≥ 3.10.0 |
| pytest-xdist | 并行测试 | ≥ 3.0.0 |
| pytest-benchmark | 性能基准 | ≥ 4.0.0 |
| pytest-testmon | 智能测试 | ≥ 2.0.0 |

### 11.2 模拟与固件

| 工具 | 用途 | 示例 |
|------|------|------|
| unittest.mock | 标准模拟 | Mock, MagicMock, AsyncMock |
| pytest fixtures | 复用固件 | mock_db_pool, sample_schema |
| respx | HTTPX 模拟 | 模拟 LLM API 调用 |
| faker | 假数据生成 | 生成测试数据 |

### 11.3 数据库测试工具

| 工具 | 用途 | 场景 |
|------|------|------|
| testcontainers | 真实 PostgreSQL | 集成测试 |
| pytest-postgresql | PostgreSQL 固件 | 快速测试 |
| sqlalchemy | 测试数据种子 | 设置测试数据 |

### 11.4 测试监控

```python
# pytest.ini
[pytest]
addopts =
    --verbose
    --tb=short
    --strict-markers
    --durations=10  # 显示最慢的 10 个测试
    -ra            # 显示所有测试结果摘要

# 生成测试报告
pytest --html=report.html --self-contained-html
```

---

## 12. 时间线与里程碑

### 12.1 测试实施时间表

| 阶段 | 测试任务 | 预计时间 | 依赖 |
|------|----------|----------|------|
| **阶段 1** | 基础测试套件 | 12 小时 | 阶段 1 完成 |
| | - config loader 测试 | 3h | |
| | - database manager 测试 | 4h | |
| | - CI/CD 搭建 | 5h | |
| **阶段 2** | 数据库层测试 | 16 小时 | 阶段 2 完成 |
| | - schema manager 测试 | 6h | |
| | - security validator 测试 | 6h | |
| | - 集成测试基础 | 4h | |
| **阶段 3** | LLM & 查询层测试 | 16 小时 | 阶段 3 完成 |
| | - LLM service 测试 | 6h | |
| | - query executor 测试 | 6h | |
| | - 端到端测试 | 4h | |
| **阶段 4** | 服务 & MCP 测试 | 12 小时 | 阶段 4 完成 |
| | - service layer 测试 | 6h | |
| | - MCP server 测试 | 6h | |
| **阶段 5** | 质量与性能 | 16 小时 | 阶段 5 完成 |
| | - 达到 85% 覆盖率 | 8h | |
| | - 性能基准测试 | 4h | |
| | - 安全测试套件 | 4h | |
| **阶段 6** | 测试完善 | 8 小时 | 阶段 6 完成 |
| | - 测试文档 | 4h | |
| | - 测试优化 | 4h | |
| **总计** | **完整测试套件** | **80 小时** | |

### 12.2 质量门限

每个阶段必须通过的质量检查:

```
阶段 1:
✓ 所有 config 和 database manager 测试通过
✓ 覆盖率 ≥ 80%
✓ CI/CD 流水线运行成功

阶段 2:
✓ Schema 和 security 测试 100% 通过
✓ Security validator 100% 覆盖率
✓ 集成测试基础就位

阶段 3:
✓ LLM 和 query 测试通过
✓ 端到端测试覆盖主要流程
✓ 性能基准建立

阶段 4:
✓ 服务和 MCP 测试 100% 通过
✓ 所有 E2E 测试通过
✓ 整体覆盖率 ≥ 85%

阶段 5:
✓ 覆盖率稳定 ≥ 85%
✓ 所有性能测试通过
✓ 安全测试套件 100% 通过
✓ 无已知安全漏洞

阶段 6:
✓ 测试文档完整
✓ 测试运行时间优化（总时间 < 5 分钟）
✓ 所有测试稳定可靠（无 flaky 测试）
```

---

## 13. 风险与缓解措施

### 13.1 测试风险识别

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| Flaky 测试 | 中 | 高 | 1. 使用重试机制<br>2. 隔离不稳定测试<br>3. 增加等待时间 |
| 测试执行慢 | 低 | 中 | 1. 并行执行<br>2. 使用内存数据库<br>3. 测试标记分类 |
| LLM API 不稳定 | 中 | 高 | 1. 完善模拟<br>2. 离线测试模式<br>3. 缓存响应 |
| 覆盖率不达标 | 低 | 高 | 1. 增量测试<br>2. 重点覆盖关键路径<br>3. 删除不可测试代码 |
| 安全测试遗漏 | 低 | 极高 | 1. 使用安全测试清单<br>2. 外部安全审计<br>3. Bug 赏金计划 |
| 集成测试复杂 | 中 | 中 | 1. 使用 testcontainers<br>2. 提供测试环境脚本<br>3. 文档化设置步骤 |
| 测试维护成本高 | 中 | 中 | 1. 清晰的测试结构<br>2. 共享固件<br>3. 测试代码审查 |

### 13.2 故障排查指南

**问题**: 测试在 CI 中失败但在本地通过
```bash
# 调试步骤
1. 检查环境变量是否设置
2. 验证依赖版本匹配
3. 运行 CI 容器本地测试
4. 增加测试详细输出: pytest -vv
```

**问题**: LLM 相关测试超时
```bash
# 解决方案
1. 检查 API 密钥和配额
2. 使用 pytest --timeout=60
3. 模拟 LLM 响应进行离线测试
4. 增加指数退避重试
```

**问题**: PostgreSQL 连接失败
```bash
# 解决方案
1. 检查 testcontainers 启动
2. 验证端口映射: docker ps
3. 增加等待时间: time.sleep(5)
4. 查看容器日志: docker logs <container>
```

**问题**: 覆盖率不达标
```bash
# 分析方法
1. 生成 HTML 报告: pytest --cov-report=html
2. 查看未覆盖行: open htmlcov/index.html
3. 识别关键路径（红色区域）
4. 优先添加单元测试
```

---

## 附录

### 附录 A: 测试开发清单

```
添加新测试时：
□ 测试文件命名: test_*.py
□ 测试函数命名: test_*()
□ 添加类型注解
□ 添加 docstring 说明测试目的
□ 遵循 AAA 模式（Arrange, Act, Assert）
□ 使用描述性的变量名
□ 清理测试数据（使用固件）
□ 添加适当的标记（@pytest.mark）
□ 运行测试确保通过
□ 检查覆盖率影响
□ 代码审查前自审
```

### 附录 B: 测试命令速查表

```bash
# 快速开发
pytest -x                          # 首次失败停止
pytest -k "test_name"             # 运行特定测试
pytest --lf                        # 只运行上次失败的
pytest --ff                        # 先运行失败的

# 覆盖率
pytest --cov=pg_mcp
pytest --cov-report=term-missing   # 显示缺失行
pytest --cov-report=html          # HTML 报告

# 调试
pytest --pdb                       # 失败时进入 pdb
pytest --trace                     # 进入跟踪模式
pytest -vv                         # 详细输出

# 性能
pytest --durations=0              # 显示所有测试时间
pytest --benchmark-only           # 只运行基准
pytest --benchmark-histogram      # 生成直方图

# 安全测试
pytest -m "security" -v           # 详细的安全测试
bandit -r pg_mcp/ -f json -o bandit-report.json
```

### 附录 C: 测试最佳实践

1. **测试独立**: 每个测试应该可以独立运行，不依赖其他测试
2. **快速执行**: 单元测试 < 100ms，集成测试 < 1s
3. **清晰命名**: `test_should_[expected_behavior]_when_[condition]`
4. **单一职责**: 每个测试只验证一个概念
5. **明确断言**: 每个断言有清晰的信息
6. **避免魔法数字**: 使用常量或固件
7. **测试可读性**: 优先于 DRY，测试应该自文档化
8. **模拟外部**: 测试单元时不依赖外部系统
9. **边界测试**: 测试边界条件和异常情况
10. **持续维护**: 失败的测试立即修复

### 附录 D: 外部资源

- [pytest 文档](https://docs.pytest.org/)
- [Python 测试最佳实践](https://testing.googleblog.com/)
- [测试驱动开发](https://www.obeythetestinggoat.com/)
- [AsyncIO 测试模式](https://pytest-asyncio.readthedocs.io/)
- [安全测试指南](https://owasp.org/www-project-web-security-testing-guide/)

---

**文档状态**: 测试计划
**创建日期**: 2026-01-13
**作者**: AI Coding Bootcamp
**审核状态**: 待审阅
**关联文档**:
- [PRD](./0001-pg-mcp-prd.md)
- [设计文档](./0002-pg-mcp-design.md)
- [实现计划](./0004-pg-mcp-impl-plan.md)

**后续步骤**:
1. 审阅和批准测试计划
2. 搭建测试基础设施
3. 开始编写单元测试（阶段 1）
4. 建立 CI/CD 流水线
