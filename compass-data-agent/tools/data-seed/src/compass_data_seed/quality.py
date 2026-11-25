"""Persisted-data diversity checks and course questions, independent of latent state."""

import re
from pathlib import Path


def named_queries(filename):
    source = (Path(__file__).parent / "sql" / filename).read_text()
    return re.findall(r"-- name: (\w+)\n(.*?)(?=-- name:|\Z)", source, re.S)


def quality_report(conn, profile) -> dict:
    checks = {
        name: conn.execute(query).fetchone()[0] for name, query in named_queries("diversity.sql")
    }
    metrics = {}
    queries = dict(named_queries("diversity_metrics.sql"))
    for name, query in queries.items():
        metrics[name] = conn.execute(query).fetchone()[0]
    rows = conn.execute("""WITH first_payment AS (
        SELECT tenant_id,order_id,min(attempted_at) paid FROM core.payment GROUP BY 1,2)
        SELECT extract(epoch FROM (p.paid-o.ordered_at))::int delay,count(*) n
        FROM first_payment p JOIN core.order_header o USING(tenant_id,order_id)
        WHERE o.tenant_id=101 AND NOT(o.ordered_at>='2025-11-10T10:00:00+08'
          AND o.ordered_at<'2025-11-10T11:30:00+08')
        GROUP BY 1""").fetchall()
    metrics["payment_delay_values"] = len(rows)
    metrics["dominant_payment_delay_share"] = max((n for _, n in rows), default=0) / max(
        1, sum(n for _, n in rows)
    )
    if profile != "fixture":
        minimums = dict(
            joined_months=24,
            declared_interest_profiles=12,
            launch_dates=3,
            return_reasons=4,
            shipping_fee_values=10,
            payment_methods=3,
            devices=3,
            campaign_sources=3,
            unsubmitted_sessions=20,
            price_change_share=0.20,
            cost_change_share=0.10,
            distinct_view_order_ratios=10,
            payment_delay_values=20,
        )
        checks.update(
            {"diversity_" + key: int(metrics[key] < limit) for key, limit in minimums.items()}
        )
        checks["diversity_payment_delay_concentration"] = int(
            metrics["dominant_payment_delay_share"] > 0.20
        )
    analyses = []
    for name, query in named_queries("course_questions.sql"):
        cursor = conn.execute(query)
        columns = [d.name for d in cursor.description]
        rows = cursor.fetchall()
        # Analysis SQL casts display amounts and dates explicitly for reproducible JSON.
        values = [
            [v if isinstance(v, (int, float, str, bool, type(None))) else str(v) for v in row]
            for row in rows
        ]
        analyses.append(
            dict(
                question=name,
                columns=columns,
                rows=values,
                status="observed" if rows else "insufficient_sample",
            )
        )
    return dict(
        status="passed" if not any(checks.values()) else "failed",
        checks=checks,
        metrics=metrics,
        course_questions=analyses,
        limits=(
            "Synthetic conditional simulation; no external enterprise calibration; "
            "directional examples are not causal estimates."
        ),
    )
