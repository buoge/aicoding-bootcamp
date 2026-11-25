"Read the repository's canonical DDL; no package-supplied SQL is executed."

import graphlib
import re
from functools import lru_cache
from pathlib import Path


@lru_cache
def design_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        path = parent / "mai-specs/998-business-data-seeding-tool/design"
        if (path / "business-schema.sql").is_file():
            return path
    raise RuntimeError("Retail tooling requires the Compass workspace and canonical design SQL")


@lru_cache
def ddl() -> str:
    return (design_root() / "business-schema.sql").read_text()


@lru_cache
def tables() -> dict:
    result = {}
    for name, body in re.findall(r"CREATE TABLE ([\w.]+) \((.*?)\n\);", ddl(), re.S):
        columns = {}
        for line in body.splitlines():
            match = re.match(r"    ([a-z_][a-z0-9_]*) ([a-z][\w(), ]*)(.*)", line)
            if match:
                col = match[1]
                columns[col] = {"required": "NOT NULL" in line, "sql": line.strip()}
        result[name] = columns
    if len(result) != 71 or sum(map(len, result.values())) != 748:
        raise ValueError("Unsupported canonical schema: expected 71 tables and 748 columns")
    return result


def load_order() -> list[str]:
    dependencies = {name: set() for name in tables()}
    for child, parent in re.findall(r"ALTER TABLE ([\w.]+).*? REFERENCES ([\w.]+)", ddl()):
        if child != parent:
            dependencies[child].add(parent)
    return list(graphlib.TopologicalSorter(dependencies).static_order())


def dictionary() -> str:
    """Derived documentation; the SQL remains the sole schema authority."""
    source = ddl()
    comments = {
        name: text.replace("''", "'")
        for name, text in re.findall(
            r"COMMENT ON (?:TABLE|COLUMN) ([\w.]+) IS '((?:[^']|'')*)';", source
        )
    }
    foreign_keys = re.findall(r"ALTER TABLE ([\w.]+).*? REFERENCES [\w.]+[^;]*;", source)
    lines = [
        "# Compass 业务数据字典",
        "",
        "本文件由唯一维护源 [business-schema.sql](business-schema.sql) 派生。",
        "",
        (
            f"当前结构 compass-retail-3：{len(tables())} 张表、"
            f"{sum(map(len, tables().values()))} 个字段、{len(foreign_keys)} 个外键。"
        ),
        (
            "逻辑 core / ops / sec 在独立候选库直接使用；"
            "同库发布时全部映射到新 schema（如 retail_v2）。旧 schema 保留。"
        ),
        "",
    ]
    for table, cols in tables().items():
        lines += [
            f"## {table}",
            "",
            comments.get(table, ""),
            "",
            "| 字段 | SQL 定义 | 说明 |",
            "|---|---|---|",
        ]
        for col, spec in cols.items():
            definition = spec["sql"].rstrip(",").removeprefix(col + " ")
            lines.append(f"| {col} | `{definition}` | {comments.get(table + '.' + col, '')} |")
        match = re.search(r"CREATE TABLE " + re.escape(table) + r" \((.*?)\n\);", source, re.S)
        if match is None:
            raise ValueError(f"Missing table body: {table}")
        body = match[1]
        constraints = [
            line.strip().rstrip(",")
            for line in body.splitlines()
            if line.lstrip().startswith(("PRIMARY KEY", "UNIQUE", "CHECK"))
        ]
        relations = re.findall(r"ALTER TABLE " + re.escape(table) + r" [^;]+;", source)
        lines += ["", "约束与关联：", "", "```sql", *constraints, *relations, "```", ""]
    return "\n".join(lines) + "\n"
