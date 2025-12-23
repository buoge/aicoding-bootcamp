import json
from typing import List

from sqlalchemy import text
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import metadata_store
from app.models.connection import ColumnInfo, TableInfo


def fetch_postgres_metadata(connection_url: str) -> List[TableInfo]:
    engine = create_engine(connection_url)
    query = text(
        """
        SELECT t.table_schema,
               t.table_name,
               t.table_type,
               c.column_name,
               c.data_type
        FROM information_schema.tables t
        JOIN information_schema.columns c
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY t.table_schema, t.table_name, c.ordinal_position;
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(query).all()

    tables: dict[tuple[str, str], dict] = {}
    for schema, table_name, table_type, col_name, data_type in rows:
        key = (schema, table_name)
        if key not in tables:
            tables[key] = {
                "schema": schema,
                "name": table_name,
                "is_view": table_type.lower() == "view",
                "columns": [],
            }
        tables[key]["columns"].append({"name": col_name, "data_type": data_type})

    return [
        TableInfo(
            schema=v["schema"],
            name=v["name"],
            is_view=v["is_view"],
            columns=[ColumnInfo(**c) for c in v["columns"]],
        )
        for v in tables.values()
    ]


def sync_metadata(db: Session, connection_url: str, name: str | None = None):
    # ensure sqlite metadata tables exist
    metadata_store.init_db()

    url_str = str(connection_url)
    conn = metadata_store.upsert_connection(db, connection_url=url_str, name=name)
    tables = fetch_postgres_metadata(url_str)

    serialized = [
        (t.schema, t.name, t.is_view, json.dumps([c.model_dump() for c in t.columns]))
        for t in tables
    ]
    metadata_store.replace_metadata(db, conn.id, serialized)
    conn = metadata_store.update_last_synced(db, conn.id)
    return conn, tables


def list_connections(db: Session):
    metadata_store.init_db()
    return metadata_store.list_connections(db)


def get_metadata(db: Session, connection_id: int):
    metadata_store.init_db()
    return metadata_store.get_metadata(db, connection_id)


def update_connection_name(db: Session, connection_id: int, name: str | None):
    metadata_store.init_db()
    return metadata_store.update_connection_name(db, connection_id, name)

