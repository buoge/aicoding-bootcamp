"""清理和验证工具。"""

import re
from typing import Optional


def clean_sql(sql: str) -> str:
    """清理 SQL 查询字符串。

    移除多余的空白字符、处理注释和
    确保正确的格式。

    参数:
        sql: 原始 SQL 字符串

    返回:
        清理后的 SQL 字符串
    """
    if not sql:
        return ""

    # 移除 Windows/DOS 行尾符
    sql = sql.replace("\r\n", "\n").replace("\r", "\n")

    # 移除块注释
    sql = re.sub(r"/\*.*?\*/", "", sql, flags=re.DOTALL)

    # 移除行注释，但要注意引号内的内容
    lines = sql.split("\n")
    cleaned_lines = []
    for line in lines:
        # 跟踪引号状态
        in_single_quote = False
        in_double_quote = False
        comment_pos = len(line)

        for i, char in enumerate(line):
            if char == "'" and not in_double_quote:
                in_single_quote = not in_single_quote
            elif char == '"' and not in_single_quote:
                in_double_quote = not in_double_quote
            elif char == "-" and i + 1 < len(line) and line[i + 1] == "-":
                if not in_single_quote and not in_double_quote:
                    comment_pos = i
                    break

        cleaned_line = line[:comment_pos].rstrip()
        if cleaned_line:
            cleaned_lines.append(cleaned_line)

    sql = " ".join(cleaned_lines)

    # 规范化空白字符（不要在字符串字面量内）
    parts = re.split(r"('[^']*')", sql)
    for i in range(0, len(parts), 2):
        if not parts[i].startswith("'"):
            parts[i] = re.sub(r"\s+", " ", parts[i])

    sql = "".join(parts)

    # 清除 SQL 周围的空白字符
    sql = sql.strip()

    # 确保以分号结尾
    if sql and not sql.endswith(";"):
        sql += ";"

    return sql


def clean_markdown(text: str) -> str:
    """从文本中移除 Markdown 格式化。

    参数:
        text: 可能包含 Markdown 的文本

    返回:
        清理后的纯文本
    """
    if not text:
        return ""

    # 移除代码块
    text = re.sub(r"```[a-zA-Z]*\n?", "", text)  # 开头的 ```
    text = re.sub(r"```", "", text)  # 结尾的 ```

    # 移除内联代码
    text = re.sub(r"`([^`]+)`", r"\1", text)

    # 移除标题
    text = re.sub(r"^#+\s+", "", text, flags=re.MULTILINE)

    # 移除粗体和斜体
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)  # 粗体 **text**
    text = re.sub(r"\*([^*]+)\*", r"\1", text)  # 斜体 *text*
    text = re.sub(r"__([^_]+)__", r"\1", text)  # 粗体 __text__
    text = re.sub(r"_([^_]+)_", r"\1", text)  # 斜体 _text_

    # 移除链接
    text = re.sub(r"\[([^]]+)\]\([^)]+\)", r"\1", text)  # [text](url)

    # 移除图片
    text = re.sub(r"!\[([^]]*)\]\([^)]+\)", "", text)  # ![alt](url)

    # 移除引用
    text = re.sub(r"^>\s+", "", text, flags=re.MULTILINE)

    # 移除水平线
    text = re.sub(r"^[-*_]{3,}$", "", text, flags=re.MULTILINE)

    # 规范化空白字符
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()

    return text


def validate_limit_clause(sql: str, default_limit: int = 1000) -> str:
    """验证 SQL 是否包含 LIMIT 子句，如果没有则添加。

    参数:
        sql: SQL 查询字符串
        default_limit: 要添加的默认限制

    返回:
        具有正确 LIMIT 子句的 SQL

    示例:
        >>> validate_limit_clause("SELECT * FROM users", 100)
        'SELECT * FROM users LIMIT 100;'
        >>> validate_limit_clause("SELECT * FROM users LIMIT 50", 100)
        'SELECT * FROM users LIMIT 50;'
    """
    if not sql or not sql.strip():
        raise ValueError("SQL 查询不能为空")

    # 移除末尾的分号和空白字符
    sql = sql.rstrip("; ")

    # 检查 SQL 是否已包含 LIMIT（不区分大小写）
    # 但需要小心字符串字面量
    pattern = r"LIMIT\s+\d+"
    # 检查 LIMIT 之前是否有 SELECT（过滤掉注释）
    if re.search(pattern, sql, re.IGNORECASE):
        return sql + ";"

    # 添加 LIMIT
    sql_with_limit = f"{sql} LIMIT {default_limit}"

    return sql_with_limit + ";"


def truncate_sql(sql: str, max_length: int = 200) -> str:
    """将 SQL 截断到最大长度以便显示。

    参数:
        sql: SQL 查询字符串
        max_length: 最大长度

    返回:
        截断后的 SQL 字符串
    """
    if not sql:
        return ""

    if len(sql) <= max_length:
        return sql

    return sql[:max_length] + "..."


def format_sql_results(results: list, columns: list, max_rows: int = 10) -> str:
    """格式化 SQL 结果以便显示。

    参数:
        results: 结果行列表
        columns: 列名列表
        max_rows: 要显示的最大行数

    返回:
        格式化的结果字符串
    """
    if not results:
        return "No results found."

    output = []
    output.append("Results:")
    output.append(f"Columns: {', '.join(columns)}")
    output.append(f"Total rows: {len(results)}")
    output.append("")
    output.append("First {} rows:".format(min(max_rows, len(results))))
    output.append("-" * 50)

    # 添加标题
    output.append(" | ".join(str(col) for col in columns))
    output.append("-" * 50)

    # 添加行
    for i, row in enumerate(results[:max_rows]):
        values = []
        for col in columns:
            val = row.get(col, None)
            if val is None:
                values.append("NULL")
            else:
                # 将值截断以便显示
                val_str = str(val)
                if len(val_str) > 30:
                    val_str = val_str[:27] + "..."
                values.append(val_str)
        output.append(" | ".join(values))

    if len(results) > max_rows:
        output.append(f"\n... and {len(results) - max_rows} more rows")

    return "\n".join(output)


def extract_code_block(text: str, language: str = "sql") -> Optional[str]:
    """从文本中提取代码块。

    参数:
        text: 可能包含代码块的文本
        language: 代码块的语言（例如，'sql'、'json'）

    返回:
        提取的代码或 None
    """
    if not text:
        return None

    # 查找指定语言的代码块
    pattern = f"```{language}\\n(.*?)\\n```"
    match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()

    # 查找任何代码块
    pattern = r"```(?:.*?\\n)?(.*?)\\n```"
    matches = re.findall(pattern, text, re.DOTALL)
    if matches:
        # 使用最长的匹配
        return max(matches, key=len).strip()

    return None


def mask_sensitive_data(sql: str, query: str, secret_regexes: Optional[list] = None) -> tuple[str, str]:
    """屏蔽日志中的敏感数据。

    参数:
        sql: SQL 查询字符串
        query: 自然语言查询字符串
        secret_regexes: 用于检测机密的正则表达式模式列表

    返回:
        包含已屏蔽 SQL 和查询的元组
    """
    if not secret_regexes:
        # 默认机密模式
        secret_regexes = [
            (r"\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b", "[EMAIL]"),  # 电子邮件
            (r"\\b(?:\\d[ -]*?){13,16}\\b", "[CARD_NUMBER]"),  # 信用卡号
            (r"\\b[A-Z0-9]{10,12}\\b", "[ACCOUNT_NUMBER]"),  # 账号
            (r"password\\s*=\\s*'[^']*'", "password = '[PASSWORD]'"),  # 密码
        ]

    masked_sql = sql
    masked_query = query

    for pattern, replacement in secret_regexes:
        masked_sql = re.sub(pattern, replacement, masked_sql, flags=re.IGNORECASE)
        masked_query = re.sub(pattern, replacement, masked_query, flags=re.IGNORECASE)

    return masked_sql, masked_query
