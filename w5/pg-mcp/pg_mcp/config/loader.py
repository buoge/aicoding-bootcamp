"""支持环境变量的配置加载器。"""

import os
from typing import Any, Dict, Optional
import yaml

from pg_mcp.exceptions import ConfigError


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

    def get_schema_config(self) -> Dict[str, Any]:
        """获取模式配置。

        返回:
            模式配置字典
        """
        return self.get("schema", {})

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
            if not isinstance(db_config, dict):
                errors.append(f"数据库 '{db_id}' 配置必须是一个字典")
                continue

            required = ["host", "database", "user", "password"]
            for field in required:
                if field not in db_config or not db_config[field]:
                    errors.append(f"数据库 '{db_id}' 缺少必填字段: {field}")

            # 检查端口号
            if "port" in db_config and not isinstance(db_config["port"], int):
                if isinstance(db_config["port"], str) and db_config["port"].isdigit():
                    db_config["port"] = int(db_config["port"])
                else:
                    errors.append(f"数据库 '{db_id}' 的端口号必须是整数")

        # 检查 LLM
        llm_config = self.get_llm_config()
        if not llm_config.get("api_key"):
            errors.append("未配置 LLM API 密钥")

        if llm_config and not llm_config.get("base_url"):
            errors.append("未配置 LLM base_url")

        # 检查查询配置
        query_config = self.get_query_config()
        if query_config and "max_rows" in query_config and not isinstance(query_config["max_rows"], int):
            errors.append("query.max_rows 必须是整数")

        return errors
