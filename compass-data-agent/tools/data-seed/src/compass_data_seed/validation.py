"Independent SQL gates. A candidate stays unpublished on any failed check."

import re
import time
from pathlib import Path

from psycopg import sql

from .schema import tables


def assertions():
    source = (Path(__file__).parent / "sql/assertions.sql").read_text()
    return [
        (m[0], m[1].strip())
        for m in re.findall(r"-- name: (\w+)\n(.*?)(?=-- name:|\Z)", source, re.S)
    ]


def validate_database(conn, manifest: dict, root: Path | None = None) -> dict:
    checks: dict = {}
    started = time.monotonic()
    conn.execute("SET statement_timeout='180s'")
    conn.execute("SET max_parallel_workers_per_gather=0")
    conn.execute("SET work_mem='32MB'")
    for name, query in assertions():
        if name == "order_quotas" and manifest["data_profile"]["name"] == "diagnostic":
            # A predeclared broad size envelope; final cell totals are never fixed.
            checks["diagnostic_order_range"] = conn.execute(
                "SELECT (count(*) NOT BETWEEN 70000 AND 140000)::int FROM core.order_header"
            ).fetchone()[0]
        else:
            checks[name] = conn.execute(query).fetchone()[0]
    expected = {
        t: sum(f["row_count"] for f in manifest["files"] if f["logical_asset_id"] == t)
        for t in tables()
    }
    checks["release_catalog_identity"] = int(
        conn.execute(
            "SELECT catalog_sha256 FROM ops.dataset_release WHERE release_id=%s",
            (manifest["release_id"],),
        ).fetchall()
        != [(manifest["semantic_generation"]["content_hash"],)]
    )
    checks["loaded_row_counts"] = sum(
        conn.execute(
            sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(*t.split(".")))
        ).fetchone()[0]
        != n
        for t, n in expected.items()
        if t
        not in {
            "ops.dataset_release",
            "ops.generation_run",
            "ops.file_manifest",
            "sec.principal",
            "sec.principal_region",
        }
    )
    checks["source_batch_visibility"] = 0
    checks["batch_business_window"] = 0
    for table, cols in tables().items():
        if "load_batch_id" in cols:
            checks["source_batch_visibility"] += conn.execute(
                sql.SQL(
                    "SELECT count(*) FROM {} t JOIN ops.ingestion_batch b ON "
                    "b.tenant_id=t.tenant_id AND b.batch_id=t.load_batch_id WHERE "
                    "t.available_at<b.received_at"
                ).format(sql.Identifier(*table.split(".")))
            ).fetchone()[0]
    for table, event in {
        "order_header": "ordered_at",
        "payment": "attempted_at",
        "refund": "attempted_at",
        "inventory_movement": "event_at",
        "shipment_item": "shipped_at",
        "return_header": "requested_at",
        "revenue_entry": "recognized_at",
        "cost_entry": "recognized_at",
        "behavior_event": "event_at",
        "web_session": "started_at",
    }.items():
        checks["batch_business_window"] += conn.execute(
            sql.SQL(
                "SELECT count(*) FROM core.{} t JOIN ops.ingestion_batch b "
                "ON b.tenant_id=t.tenant_id AND b.batch_id=t.load_batch_id "
                "WHERE t.{}<b.source_from OR t.{}>=b.source_to"
            ).format(sql.Identifier(table), sql.Identifier(event), sql.Identifier(event))
        ).fetchone()[0]
    checks["watermark_batch_counts"] = conn.execute("""
        WITH day_counts AS (SELECT tenant_id,source_system,
          date_trunc('day',(source_to-interval '1 microsecond') AT TIME ZONE 'Asia/Shanghai')
            AT TIME ZONE 'Asia/Shanghai'+interval '1 day' AS observed_at,
          count(*) expected,count(*) FILTER(WHERE received_at <=
            date_trunc('day',(source_to-interval '1 microsecond') AT TIME ZONE 'Asia/Shanghai')
              AT TIME ZONE 'Asia/Shanghai'+interval '1 day') arrived
          FROM ops.ingestion_batch GROUP BY 1,2,3)
        SELECT count(*) FROM ops.source_watermark w LEFT JOIN day_counts d
        USING(tenant_id,source_system,observed_at)
        WHERE w.expected_batches<>coalesce(d.expected,0)
           OR w.arrived_batches<>coalesce(d.arrived,0)
    """).fetchone()[0]
    # Validate every declared parent-visibility dependency using the actual composite FK.
    checks["parent_visibility"] = 0
    fk_rows = conn.execute(
        "SELECT n.nspname||'.'||t.relname,pn.nspname||'.'||p.relname,\n    "
        "    ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY "
        "k(id,n) JOIN pg_attribute a ON a.attrelid=c.conrelid AND "
        "a.attnum=k.id ORDER BY k.n),\n        ARRAY(SELECT a.attname FROM "
        "unnest(c.confkey) WITH ORDINALITY k(id,n) JOIN pg_attribute a ON "
        "a.attrelid=c.confrelid AND a.attnum=k.id ORDER BY k.n)\n        "
        "FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN "
        "pg_namespace n ON n.oid=t.relnamespace\n        JOIN pg_class p "
        "ON p.oid=c.confrelid JOIN pg_namespace pn ON "
        "pn.oid=p.relnamespace WHERE c.contype='f'"
    ).fetchall()
    visibility_failures = {}
    for child, parent, child_cols, parent_cols in fk_rows:
        if getattr(conn, "schema", None):
            schema = conn.schema
            if not child.startswith(schema + ".") or not parent.startswith(schema + "."):
                continue
            names = {t.split(".")[1]: t for t in tables()}
            child = names.get(child.split(".")[1], child)
            parent = names.get(parent.split(".")[1], parent)
        if "available_at" not in tables().get(child, {}) or "available_at" not in tables().get(
            parent, {}
        ):
            continue
        join = sql.SQL(" AND ").join(
            sql.SQL("c.{}=p.{}").format(sql.Identifier(a), sql.Identifier(b))
            for a, b in zip(child_cols, parent_cols, strict=True)
        )
        count = conn.execute(
            sql.SQL(
                "SELECT count(*) FROM {} c JOIN {} p ON {} WHERE c.available_at<p.available_at"
            ).format(sql.Identifier(*child.split(".")), sql.Identifier(*parent.split(".")), join)
        ).fetchone()[0]
        checks["parent_visibility"] += count
        if count:
            visibility_failures[child + "->" + parent] = count
    # Replay every daily balance from movements, including opening balance before materialization.
    checks["snapshot_replay"] = conn.execute(
        "\n      WITH daily AS (SELECT tenant_id,site_id,sku_id,(event_at "
        "AT TIME ZONE 'Asia/Shanghai')::date d,\n        "
        "sum(sellable_delta) s,sum(quarantine_delta) "
        "q,sum(reserved_delta) r,sum(in_transit_delta) "
        "t,sum(damaged_delta) z\n        FROM core.inventory_movement "
        "GROUP BY 1,2,3,4),\n      replay AS (SELECT "
        "a.tenant_id,a.site_id,a.sku_id,c.calendar_date,\n        "
        "sum(coalesce(d.s,0)) OVER w s,sum(coalesce(d.q,0)) OVER w "
        "q,sum(coalesce(d.r,0)) OVER w r,\n        sum(coalesce(d.t,0)) "
        "OVER w t,sum(coalesce(d.z,0)) OVER w z\n        FROM "
        "core.assortment a JOIN core.calendar c ON "
        "c.calendar_date>=a.valid_from AND c.calendar_date<a.valid_to\n    "
        "    LEFT JOIN daily d ON (d.tenant_id,d.site_id,d.sku_id,d.d)=(a"
        ".tenant_id,a.site_id,a.sku_id,c.calendar_date)\n        WINDOW w "
        "AS (PARTITION BY a.tenant_id,a.site_id,a.sku_id ORDER BY "
        "c.calendar_date ROWS UNBOUNDED PRECEDING))\n      SELECT count(*) "
        "FROM core.inventory_snapshot s JOIN replay r ON "
        "(s.tenant_id,s.site_id,s.sku_id,s.snapshot_date)=(r.tenant_id,r."
        "site_id,r.sku_id,r.calendar_date)\n      WHERE "
        "(s.sellable_qty,s.quarantine_qty,s.reserved_qty,s.in_transit_qty"
        ",s.damaged_qty) IS DISTINCT FROM (r.s,r.q,r.r,r.t,r.z)\n    "
    ).fetchone()[0]
    checks["valuation_replay"] = conn.execute(
        "\n      WITH daily AS (SELECT "
        "m.tenant_id,m.site_id,m.sku_id,(m.event_at AT TIME ZONE "
        "'Asia/Shanghai')::date d,\n        "
        "sum(m.sellable_delta*l.unit_cost_cent) amount FROM "
        "core.inventory_movement m JOIN core.inventory_lot l "
        "USING(tenant_id,lot_id) GROUP BY 1,2,3,4),\n      replay AS "
        "(SELECT a.tenant_id,a.site_id,a.sku_id,c.calendar_date,sum(coale"
        "sce(d.amount,0)) OVER(PARTITION BY "
        "a.tenant_id,a.site_id,a.sku_id ORDER BY c.calendar_date) amount\n "
        "       FROM core.assortment a JOIN core.calendar c ON "
        "c.calendar_date>=a.valid_from AND c.calendar_date<a.valid_to\n    "
        "    LEFT JOIN daily d ON (d.tenant_id,d.site_id,d.sku_id,d.d)=(a"
        ".tenant_id,a.site_id,a.sku_id,c.calendar_date))\n      SELECT "
        "count(*) FROM core.inventory_valuation_snapshot s JOIN replay r "
        "ON (s.tenant_id,s.site_id,s.sku_id,s.snapshot_date)=(r.tenant_id"
        ",r.site_id,r.sku_id,r.calendar_date) WHERE "
        "s.sellable_value_cent<>r.amount\n    "
    ).fetchone()[0]
    monitor = conn.execute(
        "SELECT date_trunc('minute',p.attempted_at) AS "
        "minute_bucket,count(*) attempts,count(*) FILTER(WHERE "
        "p.status='SUCCEEDED') successes\n        FROM core.payment p JOIN "
        "core.order_header o USING(tenant_id,order_id) WHERE "
        "o.tenant_id=101 AND o.channel_id=4\n        AND "
        "p.attempted_at>='2025-11-10T10:00:00+08' AND "
        "p.attempted_at<'2025-11-10T11:30:00+08' GROUP BY 1 ORDER BY 1"
    ).fetchall()
    assignments = conn.execute(
        "SELECT experiment_id,variant,count(*) FROM "
        "core.experiment_assignment GROUP BY 1,2 ORDER BY 1,2"
    ).fetchall()
    if manifest["data_profile"]["name"] == "demo":
        checks["monitor_density"] = int(
            len(monitor) != 90
            or any(
                n != 100 or s != (90 if 30 <= i < 60 else 98) for i, (_, n, s) in enumerate(monitor)
            )
        )
        checks["experiment_density"] = int(
            assignments != [(1, "A", 3000), (1, "B", 3000), (2, "A", 3200), (2, "B", 800)]
        )
    checks["fifo_reservations"] = check_fifo(conn)
    scenario_results = check_scenarios(conn, root, manifest) if root else {}
    if root:
        scenario_results["S08"] = dict(
            passed=checks.get("experiment_density", 0) == 0,
            assignments=assignments,
            expected_outcome="balanced experiment; second experiment SRM blocks inference"
            if manifest["data_profile"]["name"] in {"demo", "diagnostic"}
            else "insufficient_sample",
        )
        scenario_results["S11"] = dict(
            passed=checks.get("monitor_density", 0) == 0,
            attempts=sum(r[1] for r in monitor),
            successes=sum(r[2] for r in monitor),
            expected_outcome="98% / 90% / 98%"
            if manifest["data_profile"]["name"] == "demo"
            else "insufficient_sample",
        )
    checks.update({"scenario_" + k: int(not v["passed"]) for k, v in scenario_results.items()})
    from .quality import quality_report

    if manifest["data_profile"]["name"] == "diagnostic":
        from .quality import named_queries

        checks.update(
            {
                "diagnostic_" + name: conn.execute(query).fetchone()[0]
                for name, query in named_queries("diagnostic_checks.sql")
            }
        )
    diversity = quality_report(conn, manifest["data_profile"]["name"])
    checks.update({"semantic_" + k: v for k, v in diversity["checks"].items()})
    result = dict(
        diversity=diversity,
        status="passed" if not any(checks.values()) else "failed",
        checks=checks,
        visibility_failures=visibility_failures,
        scenario_results=scenario_results,
        elapsed_seconds=round(time.monotonic() - started, 3),
        reference=dict(
            total_orders=conn.execute("SELECT count(*) FROM core.order_header").fetchone()[0],
            monitor_attempts=sum(r[1] for r in monitor),
            monitor_successes=sum(r[2] for r in monitor),
            experiment_assignments=assignments,
        ),
    )
    return result


def check_fifo(conn):
    "Reconstruct each lot from persisted movements, independent of generator state."
    from collections import defaultdict

    lots = {
        (t, lot): (received, cost)
        for t, lot, received, cost in conn.execute(
            "SELECT tenant_id,lot_id,received_at,unit_cost_cent FROM core.inventory_lot"
        ).fetchall()
    }
    balances = defaultdict(lambda: [0, 0])
    pairs = defaultdict(set)
    failures = 0
    with conn.cursor(name="fifo_reference") as cursor:
        cursor.itersize = 10000
        cursor.execute(
            "SELECT tenant_id,site_id,sku_id,lot_id,movement_type,\n           "
            " sellable_delta,reserved_delta,event_at,event_seq FROM "
            "core.inventory_movement\n            ORDER BY "
            "tenant_id,event_at,event_seq"
        )
        for tenant, site, sku, lot, kind, sellable, reserved, _at, _ in cursor:
            if lot is None:
                continue
            pair = tenant, site, sku
            key = tenant, lot
            if kind == "RESERVE":
                eligible = [
                    candidate
                    for candidate in pairs[pair]
                    if balances[candidate][0] > balances[candidate][1]
                ]
                oldest = min(eligible, key=lambda k: (lots[k][0], k[1])) if eligible else None
                if oldest != key:
                    failures += 1
            pairs[pair].add(key)
            balances[key][0] += sellable
            balances[key][1] += reserved
    return failures


def check_scenarios(conn, root, manifest):
    import csv
    from collections import Counter
    from datetime import date

    def rows(name):
        with (root / "scenarios" / name).open(newline="") as stream:
            return list(csv.DictReader(stream))

    checks: dict = {}
    basic = conn.execute("""SELECT
        (SELECT count(*) FROM core.order_header WHERE customer_id IS NULL),
        (SELECT count(*) FROM core.channel_product_daily WHERE submitted_orders=0
          AND paid_amount_cent=0),
        (SELECT count(*) FROM core.order_header WHERE order_date='2026-02-01'),
        (SELECT count(*) FROM ops.source_watermark WHERE status='DELAYED'),
        (SELECT count(*) FROM core.stock_allocation_attempt WHERE outcome='INSUFFICIENT'),
        (SELECT count(*) FROM core.return_item)
    """).fetchone()
    checks["S01"] = dict(
        passed=basic[1] > 0 and basic[2] == 0 and basic[3] > 0,
        zero_rows=basic[1],
        empty_window_rows=basic[2],
        delayed_observations=basic[3],
    )
    checks["S02"] = dict(
        passed=basic[0] > 0,
        unknown_member_orders=basic[0],
        filters="tenant, order_date, channel_id, region_id; count orders before joining units",
    )
    s05: dict = dict(
        passed=basic[4] > 0 and basic[5] > 0,
        stockout_attempts=basic[4],
        return_items=basic[5],
        inference="observable mechanisms; no guaranteed causal effect",
    )
    named_stockout = conn.execute("""
        WITH shortage AS (
          SELECT a.tenant_id,a.sku_id,a.site_id,a.attempted_at,k.spu_id
          FROM core.stock_allocation_attempt a JOIN core.sku k USING(tenant_id,sku_id)
          JOIN core.spu p USING(tenant_id,spu_id)
          WHERE a.tenant_id=101 AND p.spu_code='101-P037'
            AND k.color_code='BLACK' AND k.size_value='42' AND a.outcome='INSUFFICIENT'
          ORDER BY a.attempted_at LIMIT 1),
        alternatives AS (
          SELECT m.sku_id,sum(m.sellable_delta-m.reserved_delta) available
          FROM shortage s JOIN core.sku k ON k.tenant_id=s.tenant_id AND k.spu_id=s.spu_id
          JOIN core.inventory_movement m ON m.tenant_id=k.tenant_id AND m.sku_id=k.sku_id
          WHERE m.site_id=s.site_id AND m.event_at<=s.attempted_at AND k.sku_id<>s.sku_id
          GROUP BY 1)
        SELECT (SELECT count(*) FROM shortage),
          (SELECT count(*) FROM alternatives WHERE available>0),
          (SELECT count(*) FROM shortage s JOIN core.order_unit u
             ON u.tenant_id=s.tenant_id AND u.sku_id=s.sku_id
           JOIN core.order_unit_event e
             ON e.tenant_id=u.tenant_id AND e.order_unit_id=u.order_unit_id
           WHERE e.event_type='DELIVERED' AND e.event_at>s.attempted_at)
    """).fetchone()
    s05["named_black_42"] = dict(
        shortage_cases=named_stockout[0],
        available_alternative_skus=named_stockout[1],
        later_delivered_units=named_stockout[2],
    )
    s05["passed"] = (
        bool(s05["passed"])
        and all(n > 0 for n in named_stockout[:2])
        and (manifest["data_profile"]["name"] == "fixture" or named_stockout[2] > 0)
    )
    checks["S05"] = s05
    if manifest["data_profile"]["name"] == "demo":
        raw = rows("campaign-list.csv")
        missing = sum(not r["customer_id"] for r in raw)
        malformed = sum(bool(r["customer_id"]) and not r["customer_id"].isdigit() for r in raw)
        valid = [r["customer_id"] for r in raw if r["customer_id"].isdigit()]
        clean = set(valid)
        known = {
            str(r[0])
            for r in conn.execute("SELECT customer_id FROM core.customer WHERE tenant_id=101")
        }
        checks["S03"] = dict(
            passed=(
                len(raw),
                len(clean),
                len(valid) - len(clean),
                missing,
                malformed,
                len(clean - known),
            )
            == (2000, 1700, 100, 100, 100, 50),
            raw=len(raw),
            valid_unique=len(clean),
            duplicates=len(valid) - len(clean),
            missing=missing,
            malformed=malformed,
            unknown_members=len(clean - known),
        )
        cohort = rows("intervention-cohort.csv")
        observations = rows("intervention-observations.csv")
        actual = {
            (int(c), int(w)): (int(n), int(v))
            for c, w, n, v in conn.execute(
                """SELECT o.customer_id,floor((o.order_date-date '2025-06-02')/7.0)::int,
            count(*) FILTER(WHERE p.paid>0),sum(coalesce(p.paid,0)) FROM core.order_header o
            LEFT JOIN (SELECT tenant_id,order_id,sum(amount_cent) paid FROM core.payment
            WHERE status='SUCCEEDED' GROUP BY 1,2) p USING(tenant_id,order_id)
            WHERE o.tenant_id=101 AND o.customer_id=ANY(%s)
            AND o.order_date>=date '2025-06-02'-84 AND o.order_date<date '2025-06-02'+56
            GROUP BY 1,2""",
                ([int(r["customer_id"]) for r in cohort],),
            ).fetchall()
        }
        correct = all(
            actual.get((int(r["customer_id"]), int(r["relative_week"])), (0, 0))
            == (int(r["paid_orders"]), int(r["paid_amount_cent"]))
            for r in observations
        )
        checks["S09"] = dict(
            passed=len(cohort) == 2000
            and len(observations) == 40000
            and correct
            and Counter(r["treated"] for r in cohort) == {"0": 1000, "1": 1000},
            units=len(cohort),
            weeks=20,
            outcome=(
                "observational; negative cohort selected on pretrend; default causal claim blocked"
            ),
        )
    expected_finance = int(
        conn.execute("""SELECT coalesce(sum(amount_cent),0) FROM core.revenue_entry
        WHERE tenant_id=101 AND recognized_at>='2025-09-01T00:00:00+08'
        AND recognized_at<'2025-10-01T00:00:00+08'""").fetchone()[0]
    )
    reconciliation: dict[str, object] = dict(
        passed=int(rows("finance-snapshot.csv")[0]["amount_cent"]) == expected_finance,
        finance_cent=expected_finance,
    )
    bridge = conn.execute("""WITH cash AS (
        SELECT tenant_id,order_id,amount_cent,attempted_at,available_at FROM core.payment
          WHERE status='SUCCEEDED'
        UNION ALL SELECT tenant_id,order_id,-amount_cent,attempted_at,available_at FROM core.refund
          WHERE status='SUCCEEDED'),
        totals AS (SELECT coalesce(sum(c.amount_cent),0) full_cash,
          coalesce(sum(c.amount_cent) FILTER(WHERE
            c.available_at<='2025-09-29T00:00:00+08'),0) known_cash,
          coalesce(sum(c.amount_cent) FILTER(WHERE
            c.attempted_at<'2025-09-29T00:00:00+08'),0) business_cash
          FROM cash c JOIN core.order_header o USING(tenant_id,order_id)
          WHERE o.tenant_id=101 AND o.order_date>='2025-09-01' AND o.order_date<'2025-10-01'
          AND c.attempted_at<'2025-10-01T00:00:00+08'),
        extras AS (SELECT coalesce(-sum(amount_cent) FILTER(WHERE
          entry_type='RETURN_ACCEPTED'),0) returns,
          coalesce(sum(amount_cent) FILTER(WHERE order_unit_id%7=0),0) duplicate
          FROM core.revenue_entry WHERE tenant_id=101 AND recognized_at>='2025-09-01T00:00:00+08'
          AND recognized_at<'2025-10-01T00:00:00+08' AND available_at<='2025-09-29T00:00:00+08')
        SELECT full_cash,known_cash,returns,duplicate,business_cash FROM totals CROSS JOIN extras
    """).fetchone()
    expected_operating = int(bridge[1] + bridge[2] + bridge[3])
    reconciliation["passed"] = bool(reconciliation["passed"]) and (
        int(rows("operating-snapshot.csv")[0]["amount_cent"]) == expected_operating
    )
    reconciliation.update(
        operating_cent=expected_operating,
        bridge_cent=dict(
            cash_basis=int(bridge[0]) - expected_finance,
            late=int(bridge[1] - bridge[4]),
            business_cutoff=int(bridge[4] - bridge[0]),
            returns=int(bridge[2]),
            duplicate_join=int(bridge[3]),
            unexplained=0,
        ),
    )
    if manifest["data_profile"]["name"] == "demo":
        reconciliation["passed"] = bool(reconciliation["passed"]) and all(
            int(value) != 0
            for value in [bridge[0] - expected_finance, bridge[1] - bridge[4], bridge[2], bridge[3]]
        )
    checks["S04"] = reconciliation
    windows = rows("forecast-windows.csv")
    checks["S07"] = dict(
        passed=len(windows) == 3
        and all(
            (
                date.fromisoformat(r["holdout_end_exclusive"][:10])
                - date.fromisoformat(r["holdout_start"][:10])
            ).days
            == 84
            for r in windows
        )
        and len(rows("sales-history.csv")) == 1096,
        backtest_windows=3,
        holdout_weeks=12,
    )
    weeks = rows("weekly-windows.csv")
    checks["S10"] = dict(
        passed=len(weeks) == 8 and sum(r["initial_status"] == "DELAYED" for r in weeks) == 1,
        periods=8,
        late_period=4,
    )
    docs = list((root / "scenarios").glob("*.md"))
    note_rows, note_cent = conn.execute("""
        SELECT count(*),coalesce(sum(amount_cent),0) FROM core.revenue_entry
        WHERE tenant_id=101 AND recognized_at>='2025-09-01T00:00:00+08'
          AND recognized_at<'2025-10-01T00:00:00+08'
          AND available_at<='2025-10-02T00:00:00+08'
    """).fetchone()
    note = (root / "scenarios/september-revenue-note.md").read_text()
    note_matches = f"可见{note_rows}条收入分录，净额{note_cent / 100:.2f}元" in note
    checks["S06"] = dict(
        passed=6 <= len(docs) <= 10 and note_matches,
        documents=len(docs),
        revenue_note_matches=note_matches,
    )
    reference_sql = (Path(__file__).parent / "sql/reference.sql").read_text()
    retention_sql = reference_sql.split("-- S12:", 1)[1].split("-- S04:", 1)[0]
    retention_sql = "WITH params AS" + retention_sql.split("WITH params AS", 1)[1]
    retention = conn.execute(retention_sql).fetchall()
    checks["S12"] = dict(
        passed=bool(retention)
        and all(
            (r[7] == "IMMATURE" and r[5] is None and r[6] is None)
            or (r[7] == "INSUFFICIENT_SAMPLE" and r[4] < 100 and r[6] is None)
            or (r[7] == "MATURE" and r[4] >= 100 and 0 <= r[5] <= r[4] and 0 <= r[6] <= 1)
            for r in retention
        ),
        cells=len(retention),
        statuses=dict(Counter(r[7] for r in retention)),
        zero_activity_cells=sum(r[5] == 0 for r in retention),
        refund_rule="delivered-purchase events retained; cash refunds are separate guardrails",
    )
    return checks
