"""pg-mcp 的自定义异常模块。

该模块定义了所有 pg-mcp 特定的异常类型，用于不同的错误场景。
"""

from typing import Any, Optional


class PGMCPErr(Exception):
    """pg-mcp 的基本异常。"""

    def __init__(self, message: str, details: Optional[dict[str, Any]] = None) -> None:
        """初始化异常。

        参数:
            message: 错误消息
            details: 可选的包含详细错误信息的字典
        """
        super().__init__(message)
        self.message = message
        self.details = details or {}


class ConfigError(PGMCPErr):
    """配置加载或验证失败。"""


class DatabaseError(PGMCPErr):
    """数据库操作失败。"""


class SchemaError(PGMCPErr):
    """模式发现或管理失败。"""


class SecurityError(PGMCPErr):
    """SQL 安全检查失败。"""


class QueryError(PGMCPErr):
    """查询执行失败。"""


class LLMError(PGMCPErr):
    """LLM 服务调用失败。"""


class ValidationError(PGMCPErr):
    """验证失败。"""
