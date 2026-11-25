"Load only registered, empty, isolated candidates. All constraints stay enabled."

import hashlib
import json
import os
import re
import secrets
import time
from datetime import UTC, datetime
from pathlib import Path

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo

from .contracts import safe_path, validate_manifest
from .schema import design_root, load_order, tables


def connection_info(config: dict, db: str | None = None, *, user=None, password=None):
    key = config["admin_dsn_env"]
    if not re.fullmatch(r"COMPASS_RETAIL_[A-Z_]+", key):
        raise ValueError("Only explicit COMPASS_RETAIL_* credentials are accepted")
    if key not in os.environ:
        raise ValueError(f"Set deployment credential environment variable {key}")
    info = conninfo_to_dict(os.environ[key])
    info.setdefault("connect_timeout", "10")
    if db:
        info["dbname"] = db
    if user:
        info["user"] = user
    if password:
        info["password"] = password
    return make_conninfo(**{key: str(value) for key, value in info.items()})


def read_config(path: Path):
    config = json.loads(path.read_text())
    if config.get("layout") != "single-source":
        raise ValueError("Unsupported layout")
    if not re.fullmatch(r"compass_retail_[a-z0-9_]{1,20}", config.get("database_prefix", "")):
        raise ValueError(
            "Target prefix must be an explicitly registered compass_retail_* namespace"
        )
    if config.get("environment_id") is None:
        raise ValueError("Missing environment_id")
    return config


def candidate_name(config, manifest):
    return config["database_prefix"] + "_" + manifest["content_hash"][:12]


def load_package(
    root: Path, config: dict, state: Path, *, fail_after_table: str | None = None
) -> dict:
    load_started = time.monotonic()
    manifest = validate_manifest(
        root,
        catalog_root=Path(config["semantic_catalog"]) if config.get("semantic_catalog") else None,
    )
    database = candidate_name(config, manifest)
    marker = state / "candidates" / (database + ".json")
    marker.parent.mkdir(parents=True, exist_ok=True)
    if marker.exists():
        existing = json.loads(marker.read_text())
        if existing["content_hash"] != manifest["content_hash"]:
            raise ValueError("Candidate hash conflict")
        if existing["status"] == "validated":
            return existing
        raise ValueError(
            "Interrupted candidate exists; use explicit retry to remove this "
            "registered failed candidate"
        )
    with psycopg.connect(connection_info(config), autocommit=True) as admin:
        if admin.execute("SELECT 1 FROM pg_database WHERE datname=%s", (database,)).fetchone():
            raise ValueError("Unregistered/nonempty target: refusing to use an existing database")
        loader = database + "_loader"
        password = secrets.token_urlsafe(32)
        record: dict = dict(
            database=database,
            loader=loader,
            password=password,
            release_id=manifest["release_id"],
            content_hash=manifest["content_hash"],
            status="loading",
            started_at=datetime.now(UTC).isoformat(),
        )
        # Registration precedes resource creation, so crashes cannot lose ownership provenance.
        fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as out:
            json.dump(record, out, indent=2)
        admin.execute(
            sql.SQL(
                "CREATE ROLE {} LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB "
                "NOCREATEROLE NOINHERIT NOBYPASSRLS"
            ).format(sql.Identifier(loader), sql.Literal(password))
        )
        admin.execute(
            sql.SQL("CREATE DATABASE {} OWNER {}").format(
                sql.Identifier(database), sql.Identifier(loader)
            )
        )
        admin.execute(
            sql.SQL("REVOKE ALL ON DATABASE {} FROM PUBLIC").format(sql.Identifier(database))
        )
    try:
        from alembic import command
        from alembic.config import Config
        from sqlalchemy import create_engine

        migration = Config()
        workspace = design_root().parents[2]
        migration.set_main_option("script_location", str(workspace / "tools/data-seed/migrations"))
        engine = create_engine(
            "postgresql+psycopg://",
            creator=lambda: psycopg.connect(
                connection_info(config, database, user=loader, password=password)
            ),
        )
        try:
            with engine.begin() as migrated:
                migration.attributes["connection"] = migrated
                command.upgrade(migration, "head")
        finally:
            engine.dispose()
        with psycopg.connect(
            connection_info(config, database, user=loader, password=password)
        ) as conn:
            # Canonical empty-database migration. BEGIN/COMMIT are managed by this transaction.

            conn.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
            load_data(conn, root, manifest, record, fail_after_table)
        with psycopg.connect(connection_info(config, database), autocommit=True) as conn:
            conn.execute("ANALYZE")
        record["status"] = "loaded"
        record["load_seconds"] = round(time.monotonic() - load_started, 3)
        record["finished_at"] = datetime.now(UTC).isoformat()
    except BaseException:
        record["status"] = "failed"
        marker.write_text(json.dumps(record, indent=2))
        raise
    marker.write_text(json.dumps(record, indent=2))
    return record


def load_data(conn, root, manifest, record, fail_after_table=None):
    conn.execute(
        """INSERT INTO ops.dataset_release(release_id,schema_version,
        generator_commit,contoso_commit,config_sha256,catalog_sha256,master_seed,
        order_start,order_end_exclusive,simulation_end_exclusive,published_as_of,
        status,created_at,source_mode)
        VALUES(%s,%s,%s,NULL,%s,%s,%s,%s,%s,%s,%s,'BUILDING',clock_timestamp(),'PURE_SYNTHETIC')""",
        (
            manifest["release_id"],
            manifest["schema_version"],
            "source-sha256:" + manifest["generator_source_sha256"],
            manifest["profile_sha256"],
            manifest["semantic_generation"]["content_hash"],
            manifest["seed"],
            manifest["data_profile"]["order_start"],
            manifest["data_profile"]["order_end_exclusive"],
            manifest["data_profile"]["simulation_end_exclusive"],
            manifest["knowledge_cutoff"],
        ),
    )
    for table in load_order():
        print(f"Loading {table}", flush=True)
        entries = [f for f in manifest["files"] if f["logical_asset_id"] == table]
        for entry in sorted(entries, key=lambda f: f["relative_path"]):
            with conn.cursor().copy(
                sql.SQL("COPY {} ({}) FROM STDIN WITH (FORMAT CSV, HEADER true)").format(
                    sql.Identifier(*table.split(".")),
                    sql.SQL(",").join(map(sql.Identifier, tables()[table])),
                )
            ) as copy:
                hasher = hashlib.sha256()
                with safe_path(root, entry["relative_path"]).open("rb") as stream:
                    while chunk := stream.read(1024 * 1024):
                        hasher.update(chunk)
                        copy.write(chunk)
                if hasher.hexdigest() != entry["sha256"]:
                    raise ValueError("Package changed during COPY; transaction rolled back")
            # Commit a verified partition in the isolated candidate. Query roles are
            # created only after all tables pass validation; failure requires rebuild.
            conn.commit()
        if fail_after_table == table:
            raise RuntimeError("Injected interrupted import")
    conn.execute(
        (
            "INSERT INTO ops.generation_run(run_id,release_id,stage,status,"
            "started_at,finished_at,input_sha256) VALUES(%s,%s,'IMPORT','SUCCEEDED',"
            "%s,clock_timestamp(),%s)"
        ),
        (
            "import:" + manifest["release_id"],
            manifest["release_id"],
            record["started_at"],
            manifest["content_hash"],
        ),
    )
    with conn.cursor() as cursor:
        cursor.executemany(
            """INSERT INTO ops.file_manifest(file_id,release_id,run_id,
            tenant_id,asset_name,partition_key,relative_path,row_count,byte_size,sha256,
            logical_sha256,schema_sha256,committed_at)
            VALUES(%s,%s,%s,NULL,%s,%s,%s,%s,%s,%s,%s,%s,clock_timestamp())""",
            [
                (
                    f"{manifest['release_id']}:{i}",
                    manifest["release_id"],
                    "import:" + manifest["release_id"],
                    entry["logical_asset_id"],
                    Path(entry["relative_path"]).stem,
                    entry["relative_path"],
                    entry["row_count"],
                    safe_path(root, entry["relative_path"]).stat().st_size,
                    entry["sha256"],
                    entry["sha256"],
                    manifest["schema_sha256"],
                )
                for i, entry in enumerate(manifest["files"])
            ],
        )
