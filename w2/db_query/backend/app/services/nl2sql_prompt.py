from app.models.connection import TableInfo


def build_context(tables: list[TableInfo]) -> str:
    lines = []
    for t in tables:
        cols = ", ".join([c.get("name") if isinstance(c, dict) else getattr(c, "name", "") for c in t.columns])
        lines.append(f"{t.schema}.{t.name} ({'VIEW' if t.is_view else 'TABLE'}): {cols}")
    return "\n".join(lines)

