"Serialized candidate import and atomic manifest publication; old releases stay intact."

import fcntl
import json
import os
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

import psycopg
from psycopg import sql

from .access import deploy_access, verify_access
from .contracts import validate_manifest
from .importer import connection_info, load_package, read_config
from .validation import validate_database


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    fd = os.open(temp, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "w") as out:
        json.dump(value, out, ensure_ascii=False, indent=2)
        out.write("\n")
        out.flush()
        os.fsync(out.fileno())
    os.replace(temp, path)
    fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


@contextmanager
def environment_lock(state: Path):
    state.mkdir(parents=True, mode=0o700, exist_ok=True)
    with (state / "operation.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ValueError("Environment operation conflict") from error
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def bind_state(config, state):
    registered = config.get("state_directory")
    if not registered or Path(registered).resolve() != state.resolve():
        raise ValueError("State directory must match the registered deployment configuration")


def active_version(state):
    path = state / "active.json"
    return json.loads(path.read_text())["content_hash"] if path.exists() else None


def check_identity(config, record):
    with psycopg.connect(connection_info(config, record["database"])) as conn:
        row = conn.execute(
            "SELECT release_id,input_sha256 FROM ops.generation_run WHERE stage='IMPORT'"
        ).fetchone()
        if row != (record["release_id"], record["content_hash"]):
            raise ValueError("Source release/hash does not match the manifest")


def publish(root: Path, config_path: Path, state: Path, *, expected_active=None):
    config = read_config(config_path)
    bind_state(config, state)
    manifest = validate_manifest(
        root,
        catalog_root=Path(config["semantic_catalog"]) if config.get("semantic_catalog") else None,
    )
    with environment_lock(state):
        if active_version(state) != expected_active:
            raise ValueError("Active version changed; expected-active conflict")
        releases = state / "releases"
        releases.mkdir(exist_ok=True)
        release_path = releases / (manifest["release_id"] + ".json")
        if release_path.exists():
            old = json.loads(release_path.read_text())
            if old["content_hash"] != manifest["content_hash"]:
                raise ValueError("Same release ID has different content")
            check_identity(config, old["sources"][0])
            atomic_json(state / "active.json", old)
            return old
        record = load_package(root, config, state)
        marker = state / "candidates" / (record["database"] + ".json")
        try:
            print("Validating business facts, scenario inputs and source visibility", flush=True)
            with psycopg.connect(connection_info(config, record["database"])) as conn:
                report = validate_database(conn, manifest, root)
            atomic_json(state / "reports" / (record["database"] + "-business.json"), report)
            if report["status"] != "passed":
                raise ValueError(f"Business validation failed: {report['checks']}")
            print("Validating real restricted source logins", flush=True)
            accounts = deploy_access(config, record, lambda value: atomic_json(marker, value))
            record["accounts"] = accounts
            atomic_json(marker, record)
            access = verify_access(config, record, accounts)
            atomic_json(state / "reports" / (record["database"] + "-access.json"), access)
            with psycopg.connect(connection_info(config, record["database"])) as conn:
                conn.execute("UPDATE ops.dataset_release SET status='PUBLISHED'")
            record["status"] = "validated"
            atomic_json(marker, record)
            source = {k: record[k] for k in ("database", "release_id", "content_hash", "status")}
            source["source_id"] = "retail_data"
            source["credential_refs"] = {
                key: f"deployment:{record['database']}:{key}" for key in accounts
            }
            result = dict(
                environment_id=config["environment_id"],
                layout="single-source",
                release_id=manifest["release_id"],
                content_hash=manifest["content_hash"],
                schema_version=manifest["schema_version"],
                mapping_version="single-source-1",
                sources=[source],
                published_at=datetime.now(UTC).isoformat(),
                validation_refs=[
                    str(state / "reports" / (record["database"] + "-business.json")),
                    str(state / "reports" / (record["database"] + "-access.json")),
                ],
            )
            check_identity(config, source)
            atomic_json(release_path, result)
            atomic_json(state / "active.json", result)
            return result
        except BaseException:
            record["status"] = "failed"
            atomic_json(marker, record)
            raise


def rollback(release_id, config_path, state, expected_active):
    from .contracts import release_name

    release_name(release_id)
    config = read_config(config_path)
    bind_state(config, state)
    with environment_lock(state):
        if active_version(state) != expected_active:
            raise ValueError("Active version changed")
        manifest = json.loads((state / "releases" / (release_id + ".json")).read_text())
        for source in manifest["sources"]:
            check_identity(config, source)
        atomic_json(state / "active.json", manifest)
        return manifest


def retry_failed(root, config_path, state):
    from .importer import candidate_name

    config = read_config(config_path)
    bind_state(config, state)
    manifest = validate_manifest(
        root,
        catalog_root=Path(config["semantic_catalog"]) if config.get("semantic_catalog") else None,
    )
    name = candidate_name(config, manifest)
    with environment_lock(state):
        marker = state / "candidates" / (name + ".json")
        record = json.loads(marker.read_text())
        if (
            record["status"] not in {"failed", "loading", "loaded", "validated"}
            or record["content_hash"] != manifest["content_hash"]
        ):
            raise ValueError("Only this registered failed candidate may be rebuilt")
        from .access import PROFILES

        if record["database"] != name or record["loader"] != name + "_loader":
            raise ValueError("Candidate ownership marker does not match registered namespace")
        if any(
            key not in PROFILES or account["role"] != name + "_" + key
            for key, account in record.get("accounts", {}).items()
        ):
            raise ValueError("Unregistered source role in candidate marker")
        for path in (state / "releases").glob("*.json"):
            if any(s["database"] == name for s in json.loads(path.read_text())["sources"]):
                raise ValueError("Published candidate cannot be cleaned")
        with psycopg.connect(connection_info(config), autocommit=True) as admin:
            admin.execute(
                sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(name))
            )
            for account in record.get("accounts", {}).values():
                admin.execute(
                    sql.SQL("DROP ROLE IF EXISTS {}").format(sql.Identifier(account["role"]))
                )
            admin.execute(
                sql.SQL("DROP ROLE IF EXISTS {}").format(sql.Identifier(record["loader"]))
            )
        marker.unlink()
