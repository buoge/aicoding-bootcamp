from typing import List
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.db import metadata_store
from app.models.query import QueryRequest, QueryResult, QueryColumn
from app.services.sql_guard import validate_and_patch, SqlValidationError


def run_query(db: Session, payload: QueryRequest) -> QueryResult:
    # ensure metadata store exists
    metadata_store.init_db()
    meta = metadata_store.get_metadata(db, payload.connection_id)
    if not meta:
        raise ValueError("Connection not found")
    conn, _ = meta
    conn_url = conn.connection_url

    patched_sql, limit_added = validate_and_patch(payload.sql)

    engine = create_engine(conn_url)
    with engine.connect() as connection:
        result = connection.execute(text(patched_sql))
        rows = result.fetchall()

        # Use result.keys() for column names; type info optional
        columns: List[QueryColumn] = [QueryColumn(name=col) for col in result.keys()]

    message = "LIMIT 1000 applied automatically" if limit_added else None
    return QueryResult(columns=columns, rows=[list(r) for r in rows], limit_added=limit_added, message=message)

