"""测试固件和配置。"""

import asyncio
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, Generator
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
import yaml


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """创建一个事件循环用于所有测试。"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def sample_config_data() -> Dict[str, Any]:
    """示例配置数据。"""
    return {
        "databases": {
            "test_db": {
                "host": "localhost",
                "port": 5432,
                "database": "test_database",
                "user": "test_user",
                "password": "test_password",
                "min_pool_size": 1,
                "max_pool_size": 5,
            }
        },
        "llm": {
            "api_key": "test-api-key",
            "base_url": "https://api.moonshot.cn/v1",
            "model": "kimi-k2-thinking-turbo",
            "temperature": 0.1,
            "max_tokens": 4000,
            "timeout": 60,
            "max_retries": 3,
        },
        "query": {
            "max_rows": 1000,
            "timeout": 30,
            "enable_explain": True,
        },
        "schema": {
            "cache_ttl": 3600,
            "max_tables": 20,
            "max_columns_per_table": 50,
        },
    }


@pytest.fixture
def sample_config_file(sample_config_data: Dict[str, Any]) -> Generator[str, None, None]:
    """创建临时配置文件。"""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(sample_config_data, f)
        temp_path = f.name

    yield temp_path

    # 清理
    os.unlink(temp_path)


@pytest.fixture
def mock_connection() -> MagicMock:
    """模拟数据库连接。"""
    mock_conn = MagicMock()
    mock_conn.fetch = AsyncMock(return_value=[{"id": 1, "name": "test"}])
    mock_conn.execute = AsyncMock(return_value="DONE")
    return mock_conn


@pytest.fixture
def mock_pool() -> MagicMock:
    """模拟数据库连接池。"""
    mock_pool = MagicMock()

    # 创建一个上下文管理器返回值
    mock_pool.acquire = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock()
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

    return mock_pool


@pytest.fixture
def mock_asyncpg_pool() -> Generator[MagicMock, None, None]:
    """使用 patch 模拟 asyncpg.create_pool。"""
    with patch("asyncpg.create_pool") as mock_create_pool:
        mock_pool = AsyncMock()
        mock_pool.acquire = MagicMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock()
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_pool.close = AsyncMock()

        mock_create_pool.return_value = mock_pool
        yield mock_create_pool


@pytest.fixture
def sample_schema() -> Dict[str, Any]:
    """示例数据库模式。"""
    return {
        "tables": {
            "users": {
                "schema": "public",
                "name": "users",
                "columns": [
                    {"name": "id", "type": "integer", "nullable": False, "primary_key": True},
                    {"name": "username", "type": "varchar(50)", "nullable": False, "primary_key": False},
                    {"name": "email", "type": "varchar(100)", "nullable": False, "primary_key": False},
                    {"name": "created_at", "type": "timestamp", "nullable": False, "primary_key": False},
                ],
                "primary_keys": ["id"],
            },
            "orders": {
                "schema": "public",
                "name": "orders",
                "columns": [
                    {"name": "id", "type": "integer", "nullable": False, "primary_key": True},
                    {"name": "user_id", "type": "integer", "nullable": False, "primary_key": False},
                    {"name": "total", "type": "decimal(10,2)", "nullable": False, "primary_key": False},
                    {"name": "status", "type": "varchar(20)", "nullable": False, "primary_key": False},
                ],
                "primary_keys": ["id"],
            },
        }
    }


@pytest.fixture
def sample_schema_text() -> str:
    """示例模式文本。"""
    return """Database Schema:

Table: users
  - id: integer NOT NULL
  - username: varchar(50) NOT NULL
  - email: varchar(100) NOT NULL
  - created_at: timestamp NOT NULL

Table: orders
  - id: integer NOT NULL
  - user_id: integer NOT NULL
  - total: decimal(10,2) NOT NULL
  - status: varchar(20) NOT NULL
"""


@pytest.fixture
def mock_llm_response() -> str:
    """模拟 LLM 响应。"""
    return """```sql
SELECT * FROM users WHERE active = true LIMIT 10;
```"""


@pytest.fixture
def mock_llm_validation_response() -> str:
    """模拟 LLM 验证响应。"""
    return """```json
{
  "validation_score": 95,
  "issues_found": [],
  "suggestions": ["可以考虑按创建时间排序"],
  "is_correct": true,
  "confidence": "high"
}
```"""


@pytest.fixture
def valid_select_queries() -> list[str]:
    """有效的 SELECT 查询列表。"""
    return [
        "SELECT * FROM users",
        "SELECT id, username FROM public.users WHERE active = true",
        "SELECT u.id, o.total FROM users u JOIN orders o ON u.id = o.user_id",
        "SELECT COUNT(*) FROM users",
        "SELECT * FROM users ORDER BY created_at DESC LIMIT 10",
        "WITH active_users AS (SELECT * FROM users WHERE active = true) SELECT * FROM active_users",
    ]


@pytest.fixture
def invalid_queries() -> list[Dict[str, str]]:
    """无效/危险的查询列表。"""
    return [
        {"query": "DROP TABLE users", "reason": "DROP statement"},
        {"query": "DELETE FROM users WHERE id = 1", "reason": "DELETE statement"},
        {"query": "INSERT INTO users (name) VALUES ('test')", "reason": "INSERT statement"},
        {"query": "UPDATE users SET name = 'test'", "reason": "UPDATE statement"},
        {"query": "CREATE TABLE test (id INT)", "reason": "CREATE statement"},
        {"query": "TRUNCATE TABLE users", "reason": "TRUNCATE statement"},
        {"query": "ALTER TABLE users ADD COLUMN test TEXT", "reason": "ALTER statement"},
        {"query": "GRANT ALL ON users TO public", "reason": "GRANT statement"},
        {"query": "BEGIN TRANSACTION", "reason": "Transaction control"},
        {"query": "VACUUM FULL", "reason": "System operation"},
    ]


@pytest.fixture
def mock_openai_client() -> Generator[MagicMock, None, None]:
    """模拟 OpenAI 客户端。"""
    with patch("pg_mcp.llm.service.AsyncOpenAI") as mock_client_class:
        mock_client = MagicMock()
        mock_client.chat = MagicMock()
        mock_client.chat.completions = MagicMock()
        mock_client.chat.completions.create = AsyncMock()
        mock_client_class.return_value = mock_client
        yield mock_client


@pytest.fixture
def mock_config_loader() -> Generator[MagicMock, None, None]:
    """模拟 config loader。"""
    with patch("pg_mcp.config.loader.yaml") as mock_yaml:
        # 我们不在全局级别修补 yaml，而是直接使用 sample_config_data
        yield mock_yaml


@pytest.fixture(autouse=True)
def setup_test_env():
    """设置测试环境变量。"""
    os.environ["TEST_API_KEY"] = "test-key-123"
    os.environ["TEST_DB_PASSWORD"] = "test-pass-456"
    yield
    # 清理
    os.environ.pop("TEST_API_KEY", None)
    os.environ.pop("TEST_DB_PASSWORD", None)
