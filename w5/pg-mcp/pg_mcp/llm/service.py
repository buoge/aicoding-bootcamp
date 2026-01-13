"""LLM 服务，集成 Kimi-K2 API。"""

import asyncio
import json
import re
from typing import Any, Dict, List, Optional

from openai import AsyncOpenAI, OpenAIError

from pg_mcp.exceptions import LLMError


DEFAULT_SYSTEM_PROMPT = """你是一个 PostgreSQL SQL 专家。将自然语言查询转换为有效的 SQL。

核心规则：
1. 只允许生成 SELECT 查询
2. 使用正确的 JOIN 和过滤器
3. 优化性能并处理 NULL 值
4. 只返回 SQL，不要包含解释
5. 使用模式中的正确表和列名
6. 使用聚合函数时，始终包含 GROUP BY 子句
7. 对于日期操作，使用 PostgreSQL 的日期函数
8. 在适当的地方使用 LIMIT 子句

格式说明：
- 使用 PostgreSQL 方言
- 将表名放在双引号中："table_name"
- 将列名放在双引号中："column_name"
- 使用正确的类型转换
}"""

DEFAULT_VALIDATION_PROMPT = """验证 SQL 查询结果是否符合用户的意图。

验证标准：
1. 结果是否匹配用户的原始请求？
2. 是否存在明显的数据异常（NULL 值、离群值）？
3. 数据是否完整？
4. SQL 语法是否正确？
5. 查询是否高效？

提供一个包含以下内容的 JSON 响应：
- validation_score: 0-100 的分数
- issues_found: 发现的问题列表
- suggestions: 改进建议列表
- is_correct: 布尔值，表示结果是否正确
- confidence: 置信度（high/medium/low）
"""


class LLMService:
    """LLM 服务，集成 Kimi-K2 API。

    提供 SQL 生成、结果验证和提示词管理。
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.moonshot.cn/v1",
        model: str = "kimi-k2-thinking-turbo",
        system_prompt: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: int = 4000,
        timeout: int = 60,
        max_retries: int = 3,
    ) -> None:
        """初始化 LLM 服务。

        参数:
            api_key: Kimi API 密钥
            base_url: API 基础 URL
            model: 要使用的模型名称
            system_prompt: 用于 SQL 生成的系统提示词
            temperature: 模型温度（创造性）
            max_tokens: 最大响应令牌数
            timeout: API 请求超时（秒）
            max_retries: 失败请求的最大重试次数
        """
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
            max_retries=max_retries,
        )
        self.model = model
        self.system_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
        self.validation_prompt = DEFAULT_VALIDATION_PROMPT
        self.temperature = temperature
        self.max_tokens = max_tokens

    async def generate_sql(
        self,
        query: str,
        schema_text: str,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        """从自然语言查询生成 SQL。

        参数:
            query: 自然语言查询
            schema_text: 数据库模式文本
            model: 要使用的模型（覆盖默认值）
            temperature: 温度覆盖
            max_tokens: 最大令牌覆盖

        返回:
            生成的 SQL 查询

        引发:
            LLMError: 如果生成失败
        """
        # 构建提示词
        prompt = f"""{self.system_prompt}

Schema Context:
{schema_text}

User Query: {query}

请提供 SQL 查询："""

        try:
            response = await self.client.chat.completions.create(
                model=model or self.model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": prompt},
                ],
                temperature=temperature or self.temperature,
                max_tokens=max_tokens or self.max_tokens,
            )

            if not response.choices or not response.choices[0].message:
                raise LLMError("LLM 返回了空的响应")

            sql = response.choices[0].message.content.strip()

            # 清理 SQL（移除 Markdown 标记和其他无关文本）
            sql = self._clean_generated_sql(sql)

            # 验证生成的 SQL 不是空的或只是一个占位符
            if not sql or len(sql.strip()) < 10:
                raise LLMError("生成的 SQL 太短或不完整")

            return sql

        except OpenAIError as e:
            raise LLMError(f"OpenAI API 调用失败: {e}", details={"model": model or self.model})
        except Exception as e:
            raise LLMError(f"SQL 生成失败: {e}")

    async def validate_result(
        self,
        user_query: str,
        sql: str,
        result_preview: str,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """验证查询结果。

        参数:
            user_query: 原始用户查询
            sql: 生成的 SQL
            result_preview: 结果预览（JSON 字符串）
            model: 要使用的模型覆盖

        返回:
            包含验证信息的字典
        """
        prompt = f"""{self.validation_prompt}

用户查询: {user_query}
生成的 SQL: {sql}
结果预览: {result_preview}

验证："""

        try:
            response = await self.client.chat.completions.create(
                model=model or self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=1000,
            )

            validation_text = response.choices[0].message.content

            # 提取 JSON
            validation_data = self._extract_json_from_response(validation_text)

            if not validation_data:
                # 如果没有 JSON，尝试创建基本响应
                validation_data = {
                    "validation_score": 80,
                    "issues_found": ["无法解析验证响应"],
                    "suggestions": ["请手动检查结果"],
                    "is_correct": True,
                    "confidence": "medium",
                }

            return validation_data

        except OpenAIError as e:
            return {
                "validation_score": 0,
                "issues_found": [f"验证 API 调用失败: {e}"],
                "suggestions": [],
                "is_correct": False,
                "confidence": "low",
            }
        except Exception as e:
            return {
                "validation_score": 0,
                "issues_found": [f"验证失败: {e}"],
                "suggestions": [],
                "is_correct": False,
                "confidence": "low",
            }

    async def improve_query(
        self,
        sql: str,
        schema_text: str,
        feedback: str,
        model: Optional[str] = None,
    ) -> str:
        """根据反馈改进 SQL 查询。

        参数:
            sql: 原始 SQL 查询
            schema_text: 数据库模式文本
            feedback: 改进反馈
            model: 模型覆盖

        返回:
            改进的 SQL 查询
        """
        prompt = f"""改进以下 SQL 查询：

原始 SQL:
```sql
{sql}
```

模式上下文:
{schema_text}

反馈:
{feedback}

请提供改进后的 SQL 查询："""

        response = await self.client.chat.completions.create(
            model=model or self.model,
            messages=[
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=self.max_tokens,
        )

        improved_sql = response.choices[0].message.content.strip()
        return self._clean_generated_sql(improved_sql)

    def _clean_generated_sql(self, sql: str) -> str:
        """清理生成的 SQL。

        移除 Markdown 代码块、多余字符和无关文本。
        """
        if not sql:
            return ""

        # 移除 Markdown 代码块
        if "```sql" in sql:
            start = sql.find("```sql") + 6
            end = sql.find("```", start)
            if end > start:
                sql = sql[start:end]
        elif "```" in sql:
            # 查找所有代码块并提取 SQL
            pattern = r"```(?:sql)?(.*?)```"
            matches = re.findall(pattern, sql, re.DOTALL | re.IGNORECASE)
            if matches:
                # 使用最长的匹配
                sql = max(matches, key=len).strip()

        # 移除常见的前缀/后缀
        sql = re.sub(r"^SQL:\s*", "", sql, flags=re.IGNORECASE)
        sql = re.sub(r"^Query:\s*", "", sql, flags=re.IGNORECASE)
        sql = re.sub(r"```$", "", sql)

        # 移除注释
        sql = re.sub(r"--.*$", "", sql, flags=re.MULTILINE)
        sql = re.sub(r"/\*.*?\*/", "", sql, flags=re.DOTALL)

        # 规范化空白符
        sql = " ".join(sql.split())

        return sql.strip()

    def _extract_json_from_response(self, text: str) -> Optional[Dict[str, Any]]:
        """从 LLM 响应中提取 JSON。

        参数:
            text: LLM 响应文本

        返回:
            解析的 JSON 字典或 None
        """
        try:
            # 尝试直接解析
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # 查找 JSON 代码块
        if "```json" in text:
            start = text.find("```json") + 7
            end = text.find("```", start)
            if end > start:
                json_str = text[start:end]
                try:
                    return json.loads(json_str.strip())
                except json.JSONDecodeError:
                    pass

        # 查找任何 JSON 对象
        import re

        json_pattern = r"\{[^}]*\}"
        matches = re.findall(json_pattern, text)
        for match in matches:
            try:
                return json.loads(match)
            except json.JSONDecodeError:
                continue

        return None

    async def test_connection(self) -> bool:
        """测试 LLM 服务连接。

        返回:
            如果连接成功返回 True
        """
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": "Hello"}],
                max_tokens=10,
            )
            return True
        except Exception:
            return False

    def get_model_info(self) -> Dict[str, Any]:
        """获取模型信息。

        返回:
            包含模型信息的字典
        """
        return {
            "model": self.model,
            "base_url": self.client.base_url,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "system_prompt_length": len(self.system_prompt),
        }
