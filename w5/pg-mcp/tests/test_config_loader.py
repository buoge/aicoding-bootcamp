"""测试配置加载器。"""

import os
import tempfile
from pathlib import Path

import pytest
import yaml

from pg_mcp.config.loader import Config, ConfigError


class TestConfig:
    """测试配置加载器功能。"""

    def test_load_valid_config(self):
        """测试加载有效的配置文件。"""
        config_data = {
            "databases": {
                "test_db": {
                    "host": "localhost",
                    "port": 5432,
                    "database": "test",
                    "user": "testuser",
                    "password": "secretpassword"
                }
            },
            "llm": {
                "api_key": "test_key",
                "model": "test_model"
            },
            "query": {
                "max_rows": 100
            }
        }

        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.safe_dump(config_data, f)
            config_path = f.name

        try:
            config = Config(config_path)
            assert config.get("llm.api_key") == "test_key"
            assert config.get("query.max_rows") == 100
        finally:
            os.unlink(config_path)

    def test_config_with_env_vars(self):
        """测试配置中的环境变量替换。"""
        os.environ["TEST_HOST"] = "testhost.example.com"
        os.environ["TEST_PASSWORD"] = "secret"

        config_data = {
            "databases": {
                "test_db": {
                    "host": "${TEST_HOST}",
                    "password": "${TEST_PASSWORD}"
                }
            }
        }

        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.safe_dump(config_data, f)
            config_path = f.name

        try:
            config = Config(config_path)
            db_config = config.get_database("test_db")
            assert db_config["host"] == "testhost.example.com"
            assert db_config["password"] == "secret"
        finally:
            os.unlink(config_path)
            del os.environ["TEST_HOST"]
            del os.environ["TEST_PASSWORD"]

    def test_get_database_config(self):
        """测试获取数据库配置。"""
        config_data = {
            "databases": {
                "prod": {
                    "host": "prod.example.com",
                    "database": "production"
                },
                "dev": {
                    "host": "localhost",
                    "database": "development"
                }
            }
        }

        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.safe_dump(config_data, f)
            config_path = f.name

        try:
            config = Config(config_path)
            prod_config = config.get_database("prod")
            assert prod_config["host"] == "prod.example.com"

            dev_config = config.get_database("dev")
            assert dev_config["host"] == "localhost"

            missing_config = config.get_database("nonexistent")
            assert missing_config is None
        finally:
            os.unlink(config_path)

    def test_get_llm_config(self):
        """测试获取 LLM 配置。"""
        config_data = {
            "llm": {
                "api_key": "kimi_key",
                "model": "kimi-k2-thinking-turbo",
                "temperature": 0.1
            }
        }

        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.safe_dump(config_data, f)
            config_path = f.name

        try:
            config = Config(config_path)
            llm_config = config.get_llm_config()
            assert llm_config["api_key"] == "kimi_key"
            assert llm_config["model"] == "kimi-k2-thinking-turbo"
            assert llm_config["temperature"] == 0.1
        finally:
            os.unlink(config_path)

    def test_get_query_config(self):
        """测试获取查询配置。"""
        config_data = {
            "query": {
                "max_rows": 1000,
                "timeout": 30
            }
        }

        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.safe_dump(config_data, f)
            config_path = f.name

        try:
            config = Config(config_path)
            query_config = config.get_query_config()
            assert query_config["max_rows"] == 1000
            assert query_config["timeout"] == 30
        finally:
            os.unlink(config_path)

    def test_list_databases(self):
        """测试列出所有配置的数据库。"""
        config_data = {
            "databases": {
                "db1": {"host": "host1"},
                "db2": {"host": "host2"},
                "db3": {"host": "host3"}
            }
        }

        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.safe_dump(config_data, f)
            config_path = f.name

        try:
            config = Config(config_path)
            databases = config.list_databases()
            assert len(databases) == 3
            assert "db1" in databases
            assert "db2" in databases
            assert "db3" in databases
        finally:
            os.unlink(config_path)

    def test_validate_empty_config(self):
        """测试空配置的验证。"""
        config_data = {}

        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.safe_dump(config_data, f)
            config_path = f.name

        try:
            config = Config(config_path)
            errors = config.validate()
            assert len(errors) > 0
            assert any("未配置数据库" in e for e in errors)
        finally:
            os.unlink(config_path)

    def test_validate_missing_database_fields(self):
        """测试缺少数据库必填字段的验证。"""
        config_data = {
            "databases": {
                "incomplete_db": {
                    "host": "localhost"
                    # Missing database, user, password
                }
            }
        }

        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.safe_dump(config_data, f)
            config_path = f.name

        try:
            config = Config(config_path)
            errors = config.validate()
            assert len(errors) > 0
            assert any("missing" in e.lower() for e in errors)
        finally:
            os.unlink(config_path)

    def test_validate_missing_llm_config(self):
        """测试缺少 LLM 配置的验证。"""
        config_data = {
            "databases": {
                "test": {
                    "host": "localhost",
                    "database": "test",
                    "user": "user",
                    "password": "pass"
                }
            }
            # Missing llm config
        }

        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.safe_dump(config_data, f)
            config_path = f.name

        try:
            config = Config(config_path)
            errors = config.validate()
            assert len(errors) > 0
            assert any("llm" in e.lower() for e in errors)
        finally:
            os.unlink(config_path)

    def test_load_nonexistent_config(self):
        """测试加载不存在的配置文件。"""
        with pytest.raises(ConfigError) as exc_info:
            Config("/nonexistent/path/config.yaml")
        assert "配置文件未找到" in str(exc_info.value)

    def test_load_invalid_yaml(self):
        """测试加载无效的 YAML 文件。"""
        invalid_yaml = """
        databases:
          - db1
          db2: invalid syntax: [
        """

        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            f.write(invalid_yaml)
            config_path = f.name

        try:
            with pytest.raises(ConfigError) as exc_info:
                Config(config_path)
            assert "无效的 YAML" in str(exc_info.value)
        finally:
            os.unlink(config_path)

    def test_get_with_default(self):
        """测试获取带有默认值的配置项。"""
        config_data = {
            "existing_key": {
                "nested_key": "value"
            }
        }

        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.safe_dump(config_data, f)
            config_path = f.name

        try:
            config = Config(config_path)
            # 获取存在的值
            assert config.get("existing_key.nested_key") == "value"
            # 获取不存在的值，返回默认值
            assert config.get("nonexistent.key", "default") == "default"
            assert config.get("missing_key") is None
        finally:
            os.unlink(config_path)

    def test_nested_dict_access(self):
        """测试嵌套字典访问。"""
        config_data = {
            "level1": {
                "level2": {
                    "level3": "deep_value"
                },
                "other": "value"
            }
        }

        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.safe_dump(config_data, f)
            config_path = f.name

        try:
            config = Config(config_path)
            assert config.get("level1.level2.level3") == "deep_value"
            assert config.get("level1.other") == "value"
        finally:
            os.unlink(config_path)

    def test_empty_string_env_var(self):
        """测试空字符串环境变量。"""
        os.environ["EMPTY_VAR"] = ""

        config_data = {
            "databases": {
                "test": {
                    "password": "${EMPTY_VAR}"
                }
            }
        }

        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.safe_dump(config_data, f)
            config_path = f.name

        try:
            config = Config(config_path)
            db_config = config.get_database("test")
            assert db_config["password"] == ""
        finally:
            os.unlink(config_path)
            del os.environ["EMPTY_VAR"]
