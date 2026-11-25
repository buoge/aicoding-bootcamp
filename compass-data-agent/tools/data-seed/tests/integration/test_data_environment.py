"Real PostgreSQL logins, invariant tampering, and publication failure/recovery."

import hashlib
import json
import os
from concurrent.futures import ThreadPoolExecutor

import psycopg
import pytest
from compass_data_seed.environment import active_version, environment_lock, publish, rollback
from compass_data_seed.generator import generate
from compass_data_seed.importer import connection_info, load_package
from compass_data_seed.validation import assertions
from psycopg import sql

pytestmark = pytest.mark.skipif(
    not os.environ.get("COMPASS_RETAIL_TEST_ADMIN_URL"),
    reason="Explicit retail PostgreSQL test credential required",
)


def test_new_schema_preserves_existing_relations_and_denies_old_writes(environment):
    from compass_data_seed.schema_environment import publish_schema

    root, package, config, _, _, existing = environment
    database = existing["sources"][0]["database"]

    def fingerprint():
        with psycopg.connect(connection_info(config, database)) as conn:
            return conn.execute(
                "SELECT count(*),sum(hashtextextended(row_to_json(o)::text,0)::numeric) "
                "FROM core.order_header o"
            ).fetchone()

    before = fingerprint()
    state = root / "schema-state"
    schema_config = dict(
        database=database,
        schema="retail_semantic_test",
        state_directory=str(state),
        admin_dsn_env=config["admin_dsn_env"],
    )
    path = root / "schema-config.json"
    path.write_text(json.dumps(schema_config))
    published = publish_schema(package, path, state)
    assert published["status"] == "validated"
    assert fingerprint() == before
    record = json.loads((state / "candidate.json").read_text())
    with psycopg.connect(
        connection_info(config, database, user=record["loader"], password=record["password"]),
        autocommit=True,
    ) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("DELETE FROM core.order_header WHERE false")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("CREATE TABLE core.forbidden(id int)")
    assert publish_schema(package, path, state)["content_hash"] == published["content_hash"]
    access = json.loads((state / "access-report.json").read_text())
    assert len(access) == 74 and all(access.values())
    schema_config["schema"] = "core"
    path.write_text(json.dumps(schema_config))
    with pytest.raises(ValueError, match="namespace"):
        publish_schema(package, path, state)
    assert fingerprint() == before


@pytest.fixture(scope="module")
def environment(tmp_path_factory):
    root = tmp_path_factory.mktemp("retail-integration")
    package = root / "fixture"
    generate("fixture", package, "fixture-integration")
    config = dict(
        environment_id=root.name,
        state_directory=str(root / "state"),
        layout="single-source",
        database_prefix="compass_retail_test_" + hashlib.sha256(str(root).encode()).hexdigest()[:8],
        admin_dsn_env="COMPASS_RETAIL_TEST_ADMIN_URL",
    )
    config_path = root / "config.json"
    config_path.write_text(json.dumps(config))
    state = root / "state"
    result = publish(package, config_path, state)
    return root, package, config, config_path, state, result


def test_fixed_golden_business_results(environment):
    root, package, config, _, state, result = environment
    fixture = json.loads((root / "fixture-private/fixture-map.json").read_text())["101"]
    expected = {
        "stockout": (0, 0, 0, 0),
        "normal": (9000, 0, 9000, 5000),
        "partial_return": (18000, 9000, 9000, 5000),
        "damaged": (18000, 9000, 9000, 10000),
        "rejected": (9000, 0, 9000, 5000),
        "split_payment": (9000, 0, 9000, 5000),
        "paid_cancel": (9000, 9000, 0, 0),
        "failed_payment": (0, 0, 0, 0),
        "retry_payment": (9000, 0, 9000, 5000),
        "rto": (9000, 9000, 0, 0),
        "cross_period": (18000, 9000, 9000, 5000),
        "late": (9000, 0, 9000, 5000),
        "partial_payment_timeout": (4500, 4500, 0, 0),
    }
    with psycopg.connect(connection_info(config, result["sources"][0]["database"])) as conn:
        for item in fixture:
            oid = item["order_id"]
            values = []
            for table in ["payment", "refund"]:
                values.append(
                    conn.execute(
                        sql.SQL(
                            "SELECT coalesce(sum(amount_cent),0) FROM core.{} "
                            "WHERE tenant_id=101 AND order_id=%s AND status='SUCCEEDED'"
                        ).format(sql.Identifier(table)),
                        (oid,),
                    ).fetchall()[0][0]
                )
            for table in ["revenue_entry", "cost_entry"]:
                values.append(
                    conn.execute(
                        sql.SQL(
                            "SELECT coalesce(sum(r.amount_cent),0) FROM core.{} r "
                            "JOIN core.order_unit u USING(tenant_id,order_unit_id) "
                            "WHERE u.tenant_id=101 AND u.order_id=%s"
                        ).format(sql.Identifier(table)),
                        (oid,),
                    ).fetchall()[0][0]
                )
            assert tuple(values) == expected[item["story"]], item


def test_idempotence_conflict_and_bad_file_do_not_replace_active(environment, tmp_path):
    import shutil

    _, package, _, config, state, result = environment
    same = publish(package, config, state, expected_active=result["content_hash"])
    assert same == result
    bad = tmp_path / "bad"
    shutil.copytree(package, bad)
    next((bad / "tables/core.payment").glob("*.csv")).write_text("broken")
    with pytest.raises(ValueError, match="hash mismatch"):
        publish(bad, config, state, expected_active=result["content_hash"])
    assert active_version(state) == result["content_hash"]
    with pytest.raises(ValueError, match="Active version changed"):
        publish(package, config, state, expected_active="stale")


def test_real_permissions_and_mutation_detected(environment):
    _, package, config, _, state, result = environment
    database = result["sources"][0]["database"]
    access = json.loads((state / "reports" / (database + "-access.json")).read_text())
    assert len(access) >= 40 and all(access.values())
    with psycopg.connect(connection_info(config, database)) as conn:
        conn.execute(
            "UPDATE core.revenue_entry SET amount_cent=amount_cent+1 WHERE "
            "tenant_id=101 AND entry_type='DELIVERY'"
        )
        query = dict(assertions())["revenue_amount_and_event"]
        assert conn.execute(query).fetchall()[0][0] > 0
        conn.rollback()


def test_environment_lock_rejects_concurrent_operation(environment):
    state = environment[4]

    def enter():
        with environment_lock(state):
            return True

    with environment_lock(state), ThreadPoolExecutor(max_workers=1) as pool:
        with pytest.raises(ValueError, match="operation conflict"):
            pool.submit(enter).result()


def test_unregistered_database_is_never_used(environment, tmp_path):
    _, package, config, _, _, result = environment
    with pytest.raises(ValueError, match="Unregistered/nonempty"):
        load_package(package, config, tmp_path / "other-state")


def test_import_interrupt_and_retry_then_rollback(environment):
    from compass_data_seed.environment import retry_failed

    root, _, config, config_path, state, result = environment
    package = root / "next"
    generate("fixture", package, "fixture-next")
    with pytest.raises(RuntimeError, match="Injected"):
        load_package(package, config, state, fail_after_table="core.order_header")
    assert active_version(state) == result["content_hash"]
    retry_failed(package, config_path, state)
    next_release = publish(package, config_path, state, expected_active=result["content_hash"])
    assert next_release["content_hash"] != result["content_hash"]
    reverted = rollback(result["release_id"], config_path, state, next_release["content_hash"])
    assert reverted == result


def test_same_release_different_valid_content_rejected(environment, tmp_path):
    import shutil

    from compass_data_seed.contracts import digest, file_hash

    _, package, _, config, state, result = environment
    modified = tmp_path / "modified"
    shutil.copytree(package, modified)
    path = modified / "scenarios/inventory-policy.md"
    path.write_text(path.read_text() + "\nRevised business document.\n")
    manifest = json.loads((modified / "manifest.json").read_text())
    next(f for f in manifest["files"] if f["relative_path"] == "scenarios/inventory-policy.md")[
        "sha256"
    ] = file_hash(path)
    manifest["content_hash"] = digest({k: v for k, v in manifest.items() if k != "content_hash"})
    (modified / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="Same release ID has different content"):
        publish(modified, config, state, expected_active=result["content_hash"])
    assert active_version(state) == result["content_hash"]


def test_restricted_login_cannot_connect_to_another_candidate(environment):
    root, _, config, _, state, result = environment
    record = json.loads(
        (state / "candidates" / (result["sources"][0]["database"] + ".json")).read_text()
    )
    others = [
        json.loads(p.read_text())["database"]
        for p in (state / "candidates").glob("*.json")
        if json.loads(p.read_text())["database"] != record["database"]
    ]
    if not others:
        other = root / "isolated-connect-test"
        generate("fixture", other, "isolated-connect-test")
        others = [load_package(other, config, state)["database"]]
    account = record["accounts"]["a_all"]
    with pytest.raises(psycopg.OperationalError, match="permission denied for database"):
        psycopg.connect(
            connection_info(config, others[0], user=account["role"], password=account["password"])
        )


def test_real_zero_empty_delayed_and_unavailable_are_distinct(environment):
    _, _, config, _, _, result = environment
    with psycopg.connect(connection_info(config, result["sources"][0]["database"])) as conn:
        assert (
            conn.execute(
                "SELECT count(*) FROM core.order_header WHERE order_date='2026-02-01'"
            ).fetchall()[0][0]
            == 0
        )
        assert (
            conn.execute(
                "SELECT count(*) FROM core.channel_product_daily "
                "WHERE submitted_orders=0 AND paid_amount_cent=0"
            ).fetchall()[0][0]
            > 0
        )
        assert (
            conn.execute(
                "SELECT count(*) FROM ops.source_watermark WHERE status='DELAYED'"
            ).fetchall()[0][0]
            > 0
        )
    with pytest.raises(psycopg.OperationalError, match="does not exist"):
        psycopg.connect(connection_info(config, "compass_retail_nonexistent_test_target"))


def test_portable_sql_import_and_collision_are_atomic(environment):
    from compass_data_seed.export_sql import export_sql

    root, package, config, _, _, result = environment
    path = root / "learner.sql"
    exported = export_sql(package, path)
    database = result["sources"][0]["database"]
    source = path.read_text()
    with psycopg.connect(connection_info(config, database), autocommit=True) as conn:
        conn.execute(source)
        for table, count in exported["table_rows"].items():
            actual = conn.execute(
                sql.SQL("SELECT count(*) FROM {}").format(
                    sql.Identifier("retail_course", table.split(".")[1])
                )
            ).fetchone()
            assert actual == (count,), table
        assert conn.execute("SELECT count(*) FROM retail_course.order_header").fetchone() == (17,)
        with pytest.raises(psycopg.errors.DuplicateSchema):
            conn.execute(source)
        conn.execute("ROLLBACK")
        assert conn.execute("SELECT count(*) FROM retail_course.order_header").fetchone() == (17,)
        assert conn.execute("SELECT count(*) FROM core.order_header").fetchone() == (17,)
        assets = conn.execute(
            "SELECT asset_path,sha256,content FROM retail_course.course_asset"
        ).fetchall()
        assert assets
        for asset_path, sha256, content in assets:
            assert hashlib.sha256(content.encode()).hexdigest() == sha256, asset_path
        reference = next(content for path, _, content in assets if path == "reference.sql")
        assert '"retail_course".order_header' in reference
        for coverage, reconciled in [(None, "2025-10-01"), ("2025-09-29", None)]:
            with pytest.raises(psycopg.errors.CheckViolation):
                conn.execute(
                    """INSERT INTO retail_course.asset_period_status
                    (tenant_id,asset_id,period_start,period_end,observed_at,status,reason_code,
                    source_coverage_end,reconciled_at,available_at)
                    VALUES (101,'probe','2025-09-28','2025-09-29','2025-10-01','COMPLETE',
                    'PROBE',%s,%s,'2025-10-01')""",
                    (coverage, reconciled),
                )
