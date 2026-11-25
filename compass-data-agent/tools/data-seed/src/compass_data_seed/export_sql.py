"""Portable learner delivery: ordinary SQL statements, no client metacommands or files."""

import csv
import hashlib
import re
from pathlib import Path

from .contracts import file_hash, validate_manifest
from .namespace import physical_schema, remap
from .schema import ddl, load_order, tables


def literal(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def export_sql(root: Path, output: Path, schema="retail_course", *, catalog=None) -> dict:
    schema = physical_schema(schema)
    manifest = validate_manifest(root, catalog_root=catalog)
    if output.exists():
        raise ValueError("SQL output already exists; choose a new artifact path")
    output.parent.mkdir(parents=True, exist_ok=True)
    source = re.sub(r"^CREATE SCHEMA (?:core|ops|sec);\s*", "", ddl(), flags=re.M)
    source = re.sub(r"^(?:BEGIN|COMMIT);\s*", "", source, flags=re.M)
    counts = {}
    try:
        with output.open("x", encoding="utf-8", newline="\n") as stream:
            stream.write(
                "-- 企业级Agent工程架构实战营 · Compass 合成经营数据\n"
                "-- Connect to an existing PostgreSQL database; execute the whole SQL script.\n"
                "-- Requires CREATE on that database. No superuser, extensions or external files.\n"
                "-- Existing target schema causes failure. Stop on the first error and ROLLBACK.\n"
                f"-- release: {manifest['release_id']}\n"
                f"-- package SHA-256: {manifest['content_hash']}\n"
                "BEGIN;\nSET LOCAL standard_conforming_strings = on;\n"
                "SET LOCAL TIME ZONE 'UTC';\n"
                f'CREATE SCHEMA "{schema}";\n'
            )
            stream.write(remap(source, schema))
            # Deployment metadata is reproducible and carries no source credentials or roles.
            profile = manifest["data_profile"]
            columns = (
                "release_id,schema_version,generator_commit,contoso_commit,config_sha256,"
                "catalog_sha256,master_seed,order_start,order_end_exclusive,"
                "simulation_end_exclusive,published_as_of,status,created_at,source_mode"
            )
            values = [
                manifest["release_id"],
                manifest["schema_version"],
                "source-sha256:" + manifest["generator_source_sha256"],
                None,
                manifest["profile_sha256"],
                manifest["semantic_generation"]["content_hash"],
                manifest["seed"],
                profile["order_start"],
                profile["order_end_exclusive"],
                profile["simulation_end_exclusive"],
                manifest["knowledge_cutoff"],
                "PUBLISHED",
                manifest["knowledge_cutoff"],
                "PURE_SYNTHETIC",
            ]
            stream.write(
                f'\nINSERT INTO "{schema}".dataset_release ({columns}) VALUES ('
                + ",".join(map(literal, values))
                + ");\n"
            )
            for table in load_order():
                columns = ",".join('"' + c + '"' for c in tables()[table])
                prefix = f'INSERT INTO "{schema}"."{table.split(".")[1]}" ({columns}) VALUES\n'
                batch, total = [], 0
                for entry in manifest["files"]:
                    if entry["logical_asset_id"] != table:
                        continue
                    with (root / entry["relative_path"]).open(newline="") as handle:
                        rows = csv.reader(handle)
                        next(rows)
                        for row in rows:
                            batch.append(
                                "(" + ",".join(literal(v) if v else "NULL" for v in row) + ")"
                            )
                            total += 1
                            if len(batch) >= 500:
                                stream.write(prefix + ",\n".join(batch) + ";\n")
                                batch = []
                if batch:
                    stream.write(prefix + ",\n".join(batch) + ";\n")
                counts[table] = 1 if table == "ops.dataset_release" else total
            stream.write(
                f'CREATE TABLE "{schema}".course_asset '
                "(asset_path text PRIMARY KEY, logical_asset_id text NOT NULL, "
                "sha256 char(64) NOT NULL, content text NOT NULL);\n"
            )
            for entry in manifest["files"]:
                if entry["logical_asset_id"] in tables():
                    continue
                if entry["visibility"] != "public":
                    continue
                content = (root / entry["relative_path"]).read_text()
                if entry["format"] == "sql":
                    content = remap(content, schema)
                values = [
                    entry["relative_path"],
                    entry["logical_asset_id"],
                    hashlib.sha256(content.encode()).hexdigest(),
                    content,
                ]
                stream.write(
                    f'INSERT INTO "{schema}".course_asset VALUES ('
                    + ",".join(map(literal, values))
                    + ");\n"
                )
            stream.write(
                f'INSERT INTO "{schema}".course_asset VALUES ('
                + ",".join(
                    map(
                        literal,
                        [
                            "manifest.json",
                            "package_manifest",
                            file_hash(root / "manifest.json"),
                            (root / "manifest.json").read_text(),
                        ],
                    )
                )
                + ");\n"
            )
            # Count check is part of the atomic import. FKs and CHECKs stay enabled throughout.
            stream.write("DO $course_import$ BEGIN\n")
            for table, total in counts.items():
                stream.write(
                    f'IF (SELECT count(*) FROM "{schema}"."{table.split(".")[1]}") '
                    f"<> {total} THEN RAISE EXCEPTION 'Row count mismatch: {table}'; END IF;\n"
                )
            stream.write("END $course_import$;\nCOMMIT;\n")
            for table in load_order():
                stream.write(f'ANALYZE "{schema}"."{table.split(".")[1]}";\n')
        report = dict(
            file=str(output),
            bytes=output.stat().st_size,
            sha256=file_hash(output),
            schema=schema,
            package_sha256=manifest["content_hash"],
            table_rows=counts,
        )
        output.with_suffix(".sha256").write_text(file_hash(output) + "  " + output.name + "\n")
        return report
    except BaseException:
        output.unlink(missing_ok=True)
        raise
