"Package integrity and deterministic business invariants without database access."

import csv
import json

import pytest
from compass_data_seed.contracts import digest, safe_path, validate_manifest
from compass_data_seed.generator import generate
from compass_data_seed.simulation import apportion, divide


@pytest.fixture(scope="module")
def business_package(tmp_path_factory):
    root = tmp_path_factory.mktemp("retail")
    package = root / "business"
    generate("fixture", package, "test-fixture")
    return package


def test_same_configuration_has_same_content(business_package):
    other = business_package.parent / "repeated"
    generate("fixture", other, "test-fixture")
    first = validate_manifest(business_package)
    second = validate_manifest(other)
    assert first["content_hash"] == second["content_hash"]
    assert {
        f["logical_asset_id"] for f in first["files"] if f["relative_path"].startswith("tables/")
    }
    assert (
        len(
            {
                f["logical_asset_id"]
                for f in first["files"]
                if f["relative_path"].startswith("tables/")
            }
        )
        == 71
    )


def test_conservation_at_cent_and_quota_boundaries():
    for amount in [0, 1, 2, 99, 100, 10001]:
        result = divide(amount, [100, 100, 100])
        assert sum(result) == amount
        assert max(result) - min(result) <= 1
    assert apportion(100000, [90, 5, 5]) == [90000, 5000, 5000]
    assert divide(1, [1, 1]) == [1, 0]


def test_package_tamper_and_private_files_rejected(business_package, tmp_path):
    import shutil

    package = tmp_path / "business"
    shutil.copytree(business_package, package)
    path = package / "tables/core.order_header/all.csv"
    path = next((package / "tables/core.order_header").glob("*.csv"))
    with path.open("a") as out:
        out.write("bad-row\n")
    with pytest.raises(ValueError, match="hash mismatch"):
        validate_manifest(package)
    shutil.copyfile(business_package / path.relative_to(package), path)
    (package / "private-answers.json").write_text("{}")
    with pytest.raises(ValueError, match="Unregistered files"):
        validate_manifest(package)


def test_path_traversal_and_symlink_escape(tmp_path):
    with pytest.raises(ValueError):
        safe_path(tmp_path, "../escape")
    with pytest.raises(ValueError):
        safe_path(tmp_path, "/etc/passwd")
    (tmp_path / "escape").symlink_to("/etc")
    with pytest.raises(ValueError):
        safe_path(tmp_path, "escape/passwd")


def test_profile_conflict_is_not_implicitly_accepted(business_package, tmp_path):
    import shutil

    package = tmp_path / "business"
    shutil.copytree(business_package, package)
    manifest = json.loads((package / "manifest.json").read_text())
    manifest["data_profile"]["seed"] += 1
    manifest["content_hash"] = digest({k: v for k, v in manifest.items() if k != "content_hash"})
    (package / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="Profile"):
        validate_manifest(package)


def test_private_oracles_are_separate(business_package):
    assert not list(business_package.rglob("*oracle*"))
    oracle = business_package.parent / "business-private/reconciliation-oracle.csv"
    with oracle.open() as f:
        values = {r["term"]: int(r["amount_cent"]) for r in csv.DictReader(f)}
    assert (
        sum(v for k, v in values.items() if k != "total_difference") == values["total_difference"]
    )


def test_application_database_url_is_not_a_retail_target(monkeypatch):
    from compass_data_seed.importer import connection_info

    monkeypatch.setenv("DATABASE_URL", "postgresql://example.invalid/application")
    monkeypatch.delenv("COMPASS_RETAIL_ADMIN_URL", raising=False)
    with pytest.raises(ValueError, match="COMPASS_RETAIL_ADMIN_URL"):
        connection_info({"admin_dsn_env": "COMPASS_RETAIL_ADMIN_URL"})


def test_business_batch_is_stable_when_parent_evidence_arrives_later(tmp_path):
    from compass_data_seed.storage import DAY, Sink, day_start

    sink = Sink(tmp_path / "clock")
    at = day_start("2025-09-28") + 60
    received, batch = sink.known(101, "OMS", at)
    assert received == day_start("2025-09-29") + 300
    delayed, same_batch = sink.known(101, "OMS", at, received + DAY)
    assert same_batch == batch
    assert delayed == received + DAY
    before, _ = sink.known(101, "OMS", day_start("2025-09-28") - 60)
    assert before == day_start("2025-09-28")


def test_daily_report_status_tracks_visible_detail_versions():
    from compass_data_seed.reports import visible_report_version

    # One detail has a prompt correction; the other is corrected two days later.
    history = {"prompt": [(10, 1), (10, 2)], "delayed": [(10, 1), (30, 2)]}
    assert visible_report_version(history, 9) is None
    assert visible_report_version(history, 10) is None
    assert visible_report_version(history, 29) is None
    assert visible_report_version(history, 30) == 2
    history["uncorrected"] = [(10, 1)]
    assert visible_report_version(history, 30) is None


def test_package_cannot_supply_deployment_principals(business_package, tmp_path):
    import shutil

    package = tmp_path / "business"
    shutil.copytree(business_package, package)
    manifest = json.loads((package / "manifest.json").read_text())
    next(f for f in manifest["files"] if f["logical_asset_id"] == "sec.principal")["row_count"] = 1
    manifest["content_hash"] = digest({k: v for k, v in manifest.items() if k != "content_hash"})
    (package / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="Deployment metadata"):
        validate_manifest(package)


def test_private_source_snapshot_has_standalone_module(business_package):
    import os
    import subprocess
    import sys

    source = business_package.parent / "business-private/source"
    result = subprocess.run(
        [sys.executable, "-m", "compass_data_seed", "--help"],
        cwd=source,
        env={**os.environ, "PYTHONPATH": str(source)},
        capture_output=True,
        text=True,
        check=True,
    )
    assert "export-sql" in result.stdout
    assert (source / "compass_data_seed/generator.py").is_file()
    assert not (source / "compass_agent").exists()


def test_relocated_migration_resolves_canonical_schema():
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from compass_data_seed.schema import ddl, design_root

    migration = Config()
    migration.set_main_option(
        "script_location", str(design_root().parents[2] / "tools/data-seed/migrations")
    )
    revision = ScriptDirectory.from_config(migration).get_revision("head")
    assert revision is not None
    assert revision.revision == "retail_0001"
    assert revision.module.ddl() == ddl()
