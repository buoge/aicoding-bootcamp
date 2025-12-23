from typing import Tuple
from sqlglot import parse_one, exp


class SqlValidationError(ValueError):
    pass


def validate_and_patch(sql: str) -> Tuple[str, bool]:
    """
    Validate SQL is a SELECT and append LIMIT 1000 if missing.

    Returns (patched_sql, limit_added)
    Raises SqlValidationError if not allowed.
    """
    try:
        tree = parse_one(sql, read="postgres")
    except Exception as exc:  # pragma: no cover - thin wrapper
        raise SqlValidationError(f"SQL parse error: {exc}") from exc

    if not isinstance(tree, exp.Select) and not isinstance(tree, exp.Subqueryable):
        raise SqlValidationError("Only SELECT statements are allowed")

    limit_added = False
    if not tree.args.get("limit"):
        tree = tree.limit(1000)
        limit_added = True

    return tree.sql(dialect="postgres"), limit_added

