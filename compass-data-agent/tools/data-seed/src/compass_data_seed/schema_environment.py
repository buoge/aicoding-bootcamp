"""Publish into a new schema in a registered database, preserving all existing schemas."""

import hashlib
import json
import re
import secrets
from datetime import UTC, datetime
from pathlib import Path

import psycopg
from psycopg import sql

from .access import deploy_access, verify_access
from .contracts import validate_manifest
from .environment import atomic_json, bind_state, environment_lock
from .importer import connection_info, load_data
from .namespace import MappedConnection, mapped, physical_schema
from .schema import ddl, tables
from .validation import validate_database


def publish_schema(root: Path, config_path: Path, state: Path):
    config = json.loads(config_path.read_text())
    bind_state(config, state)
    database = config.get("database", "")
    if not re.fullmatch(r"compass_retail_[a-z0-9_]{1,46}", database):
        raise ValueError("An explicitly registered compass_retail_* database is required")
    schema = physical_schema(config["schema"])
    manifest = validate_manifest(
        root,
        catalog_root=Path(config["semantic_catalog"]) if config.get("semantic_catalog") else None,
    )
    marker = state / "candidate.json"
    with environment_lock(state):
        if marker.exists():
            record = json.loads(marker.read_text())
            if (
                record["content_hash"] != manifest["content_hash"]
                or record["database"] != database
                or record["schema"] != schema
            ):
                raise ValueError("Registered schema candidate conflicts with requested release")
            if record["status"] == "validated":
                with psycopg.connect(connection_info(config, database)) as raw:
                    conn = mapped(raw, record)
                    actual = conn.execute(
                        "SELECT input_sha256 FROM ops.generation_run WHERE stage='IMPORT'"
                    ).fetchone()
                    if actual != (manifest["content_hash"],):
                        raise ValueError("Registered schema identity changed")
                return {k: v for k, v in record.items() if k not in {"password", "accounts"}}
            raise ValueError(
                "An interrupted schema candidate exists; inspect it and use a fresh schema"
            )
        prefix = "cr_" + hashlib.sha256((database + "/" + schema).encode()).hexdigest()[:20]
        record = dict(
            database=database,
            schema=schema,
            role_prefix=prefix,
            loader=prefix + "_loader",
            password=secrets.token_urlsafe(32),
            release_id=manifest["release_id"],
            content_hash=manifest["content_hash"],
            status="loading",
            started_at=datetime.now(UTC).isoformat(),
        )
        with psycopg.connect(connection_info(config, database), autocommit=True) as admin:
            if admin.execute("SELECT 1 FROM pg_namespace WHERE nspname=%s", (schema,)).fetchone():
                raise ValueError(
                    "Target schema already exists; refusing to overwrite unregistered data"
                )
            atomic_json(marker, record)
            admin.execute(
                sql.SQL(
                    "CREATE ROLE {} LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB "
                    "NOCREATEROLE NOINHERIT NOBYPASSRLS"
                ).format(sql.Identifier(record["loader"]), sql.Literal(record["password"]))
            )
            admin.execute(
                sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(
                    sql.Identifier(database), sql.Identifier(record["loader"])
                )
            )
            admin.execute(
                sql.SQL("CREATE SCHEMA {} AUTHORIZATION {}").format(
                    sql.Identifier(schema), sql.Identifier(record["loader"])
                )
            )
            admin.execute(
                sql.SQL("REVOKE ALL ON SCHEMA {} FROM PUBLIC").format(sql.Identifier(schema))
            )
            # Refuse loading if inherited/public grants unexpectedly permit modifying old tables.
            writable = admin.execute(
                """SELECT n.nspname,c.relname FROM pg_class c
                JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%%'
                AND n.nspname<>'information_schema'
                AND has_table_privilege(%s,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')""",
                (record["loader"],),
            ).fetchall()
            if writable:
                record["status"] = "failed"
                atomic_json(marker, record)
                raise ValueError(
                    "Loader inherits write privileges on existing tables; refusing import"
                )
        try:
            with psycopg.connect(
                connection_info(
                    config, database, user=record["loader"], password=record["password"]
                )
            ) as raw:
                conn = MappedConnection(raw, schema)
                source = re.sub(r"^CREATE SCHEMA (?:core|ops|sec);\s*", "", ddl(), flags=re.M)
                source = re.sub(r"^(?:BEGIN|COMMIT);\s*", "", source, flags=re.M)
                conn.execute(source)
                conn.commit()
                load_data(conn, root, manifest, record)
                for table in tables():
                    conn.execute(sql.SQL("ANALYZE {}").format(sql.Identifier(*table.split("."))))
            with psycopg.connect(connection_info(config, database)) as raw:
                report = validate_database(mapped(raw, record), manifest, root)
            atomic_json(state / "business-report.json", report)
            if report["status"] != "passed":
                raise ValueError(f"Business validation failed: {report['checks']}")
            accounts = deploy_access(config, record, lambda r: atomic_json(marker, r))
            access = verify_access(config, record, accounts)
            atomic_json(state / "access-report.json", access)
            with psycopg.connect(connection_info(config, database)) as raw:
                conn = mapped(raw, record)
                conn.execute(
                    "UPDATE ops.dataset_release SET status='PUBLISHED' WHERE release_id=%s",
                    (manifest["release_id"],),
                )
            record["status"] = "validated"
            record["finished_at"] = datetime.now(UTC).isoformat()
            record["accounts"] = accounts
            atomic_json(marker, record)
            # This is a separate state root; the previous release's active.json is untouched.
            result = {k: v for k, v in record.items() if k not in {"password", "accounts"}}
            atomic_json(state / "active.json", result)
            return result
        except BaseException:
            record["status"] = "failed"
            atomic_json(marker, record)
            raise
