"Derived source reports preserve coverage, zero rows, and revision history."

from .storage import DAY, ORDER_END, START, day_start, local_date, stamp
from .world import entity_rng


def visible_report_version(histories, cutoff):
    """Declare a version only when all currently visible detail keys agree."""
    versions = {
        max(visible)[1]
        for history in histories.values()
        if (visible := [row for row in history if row[0] <= cutoff])
    }
    return next(iter(versions)) if len(versions) == 1 else None


def reports(sim):
    m = sim.m
    period_visibility = {}
    detail_visibility = {}
    # Explicit source coverage includes every nonzero fact combination and declared zero cells.
    coverage = set(sim.daily) | set(sim.demand.traffic)
    for n in range((ORDER_END - START) // DAY):
        coverage.add((local_date(START + n * DAY), 1, m.baseline_sku, 7))
    for date, channel, sku, region in sorted(coverage):
        submitted, paid, amount = sim.daily.get((date, channel, sku, region), [0, 0, 0])
        views, visitors, carts = sim.demand.traffic.get((date, channel, sku, region), [0, 0, 0])
        cutoff = day_start(date) + DAY + 3600
        versions = [(1, submitted, paid, amount, cutoff)]
        if date == "2025-09-28" and submitted:
            versions = [(1, 0, 0, 0, cutoff), (2, submitted, paid, amount, cutoff + 2 * DAY)]
        if sim.diagnostic:
            latest = sim.diagnostic.latest_knowledge[date]
            if latest > versions[-1][-1]:
                versions.append((versions[-1][0] + 1, submitted, paid, amount, latest))
        for version, s, p, a, observed in versions:
            if sim.diagnostic:
                key = date, channel, sku, region
                s = sum(known <= observed for known in sim.diagnostic.submission_facts[key])
                p = sum(
                    count
                    for known, count, _ in sim.diagnostic.payment_facts[key]
                    if known <= observed
                )
                a = sum(
                    value
                    for known, _, value in sim.diagnostic.payment_facts[key]
                    if known <= observed
                )
            known = m.emit(
                "channel_product_daily",
                observed,
                report_date=date,
                channel_id=channel,
                sku_id=sku,
                region_id=region,
                product_views=views,
                product_visitors=visitors,
                add_cart_users=carts,
                submitted_orders=s,
                paid_orders=p,
                paid_amount_cent=a,
                report_version=version,
                source_updated_at=stamp(observed),
            )
            period_visibility[date, version] = max(known, period_visibility.get((date, version), 0))
            detail_visibility.setdefault(date, {}).setdefault((channel, sku, region), []).append(
                (known, version)
            )
    for (date, campaign, region), (impressions, clicks, spend) in sorted(
        sim.demand.ad_plan.items()
    ):
        observed = day_start(date) + DAY
        m.emit(
            "campaign_daily",
            observed,
            report_date=date,
            campaign_id=campaign,
            channel_id=m.campaign_info[campaign]["channel"],
            region_id=region,
            impressions=impressions,
            clicks=clicks,
            spend_cent=spend,
            report_version=1,
            source_updated_at=stamp(observed),
        )
    for site, info in m.sites.items():
        if info["kind"] == "WAREHOUSE":
            continue
        for at in range(max(START, info["opened"]), ORDER_END, DAY):
            # Observed aggregate footfall; no invented individual offline tracking.
            rng = entity_rng(m.profile.seed, m.tenant, [info["name"], at], "store-visits")
            visits = sim.demand.footfall[local_date(at), site] + (
                0 if sim.diagnostic else round(info["area"] * 0.12 * rng.lognormvariate(0, 0.35))
            )
            m.emit(
                "store_traffic_daily",
                at + DAY,
                report_date=local_date(at),
                site_id=site,
                region_id=info["region"],
                visits=visits,
                report_version=1,
                source_updated_at=stamp(at + DAY),
            )

            if sim.diagnostic:
                m.emit(
                    "store_operating_day",
                    at - 7 * DAY,
                    site_id=site,
                    region_id=info["region"],
                    business_date=local_date(at),
                    open_minutes=660,
                    reason_code="REGULAR",
                )
    if sim.diagnostic:
        sim.diagnostic.reports()
        for date in sorted({date for date, _ in period_visibility}):
            beginning = day_start(date)
            first_visible = period_visibility[date, 1]
            has_revision = (date, 2) in period_visibility
            final_visible = max(at for (day, _), at in period_visibility.items() if day == date)
            rows: list[tuple[int, str, str, int | None, int | None]] = [
                (beginning + DAY, "PENDING", "REPORT_NOT_RECEIVED", None, None)
            ]
            if has_revision:
                rows.append(
                    (
                        first_visible,
                        "PARTIAL",
                        "SOURCE_PERIOD_RECONCILIATION_PENDING",
                        visible_report_version(detail_visibility[date], first_visible),
                        None,
                    )
                )
            # This source's daily closure is declared only after all emitted payment facts
            # and the source report have become visible. Revision rows remain immutable.
            complete_at = max(final_visible, sim.diagnostic.latest_knowledge[date])
            rows.append(
                (
                    complete_at,
                    "COMPLETE",
                    "SOURCE_CLOSED_AND_RECONCILED",
                    visible_report_version(detail_visibility[date], complete_at),
                    complete_at,
                )
            )
            for observed, status, reason, version, reconciled in rows:
                m.emit(
                    "ops.asset_period_status",
                    observed,
                    asset_id="core.channel_product_daily",
                    period_start=date,
                    period_end=local_date(beginning + DAY),
                    observed_at=stamp(observed),
                    status=status,
                    reason_code=reason,
                    last_visible_report_version=version,
                    source_coverage_end=stamp(beginning + DAY) if reconciled else None,
                    reconciled_at=stamp(reconciled) if reconciled else None,
                    available_at=stamp(observed),
                )
