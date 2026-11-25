"""Frozen opportunity plans. Outcomes never feed back into the opportunity budget."""

import json
from collections import defaultdict
from datetime import UTC, datetime

from .storage import DAY, ORDER_END, START, day_start, local_date, stamp
from .world import entity_rng

PRICE_AT = day_start("2025-06-02")
PRICE_ID = "PRICE_2025_SOFTSHELL"
SUPPLY_BEGIN = day_start("2025-09-01")
SUPPLY_END = day_start("2025-09-21")


def is_diagnostic(m):
    return m.profile.name == "diagnostic"


def price_skus(m):
    return sorted(s for s, v in m.skus.items() if v["product_key"] == "101-p001")[:2]


class Diagnostic:
    def __init__(self, sim):
        self.sim, self.m = sim, sim.m
        self.order_count = 0
        self.opportunities = 0
        self.campaign_orders = defaultdict(list)
        self.cash = defaultdict(list)
        self.refunds = defaultdict(list)
        self.first_platform_paid = {}
        self.latest_knowledge = defaultdict(int)
        self.price_members = []
        self.submission_facts = defaultdict(list)
        self.payment_facts = defaultdict(list)

    def enqueue(self, at, key, **params):
        params["opportunity_key"] = key
        self.sim.schedule(at, 2, self.opportunity, params)

    def schedule(self, boundaries):
        m = self.m
        for index, (at, params) in enumerate(boundaries):
            self.enqueue(at, ["boundary", index], probability=1, **params)
        # Fixed visits per business day. Seasonality changes visits, never backfills purchases.
        for at in range(START, ORDER_END, DAY):
            month = datetime.fromtimestamp(at + 28800, UTC).month
            seasonal = [0.85, 0.75, 0.95, 1.05, 1.1, 1.25, 1, 1, 1.05, 1.1, 1.3, 1.2][month - 1]
            rng = entity_rng(m.profile.seed, m.tenant, local_date(at), "visit-plan")
            eligible = {
                ch: [
                    i
                    for i in ids
                    if m.identities[i]["first"] <= at
                    and m.identities[i]["customer"] not in m.scenario_members
                ]
                for ch, ids in m.identity_by_channel.items()
            }
            channels = [ch for ch in range(1, 6) if eligible[ch]]
            for i in range(round(m.q["orders"] * 2.8 / 1096 * seasonal)):
                channel = rng.choices(channels, [22, 12, 18, 18, 12][: len(channels)])[0]
                identity = rng.choice(eligible[channel])
                person = m.customers[m.identities[identity]["customer"]]
                probability = [0.24, 0.22, 0.19, 0.29, 0.30][channel - 1]
                probability *= min(1.3, 0.85 + person["frequency"] * 0.06)
                self.enqueue(
                    at + rng.randrange(DAY),
                    ["online", local_date(at), i],
                    story="background",
                    channel=channel,
                    identity=identity,
                    region=person["region"],
                    probability=probability,
                )
            for site, info in m.sites.items():
                if info["kind"] == "WAREHOUSE" or info["opened"] > at:
                    continue
                channel = 7 if info["kind"] == "OUTLET" else 6
                ids = eligible[channel]
                local_ids = [
                    i
                    for i in ids
                    if m.customers[m.identities[i]["customer"]]["region"] == info["region"]
                ]
                if not ids:
                    continue
                visits = max(1, round(m.q["orders"] / 90000 * 7 * seasonal))
                probability = 0.36
                if m.tenant == 101 and info["region"] == 1:
                    if site in (1, 6) and at >= day_start("2024-01-01"):
                        probability = 0.19
                    if site == 5:
                        visits *= 3
                        probability = 0.39
                for i in range(visits):
                    identity = rng.choice(local_ids if local_ids and rng.random() < 0.8 else ids)
                    self.enqueue(
                        at + (10 * 3600) + rng.randrange(11 * 3600),
                        ["store", site, local_date(at), i],
                        story="background",
                        channel=channel,
                        identity=identity,
                        region=info["region"],
                        selling=site,
                        probability=probability,
                    )
        # Media budget creates its own visits, including all nonconverters.
        for (date, campaign, region), (_, clicks, _) in sorted(self.sim.demand.ad_plan.items()):
            at = day_start(date)
            info = m.campaign_info[campaign]
            channel = info["channel"]
            ids = [
                i
                for i in m.identity_by_channel[channel]
                if m.identities[i]["first"] <= at
                and m.identities[i]["customer"] not in m.scenario_members
            ]
            rng = entity_rng(m.profile.seed, m.tenant, [date, campaign, region], "paid-visits")
            skus = [
                s
                for s, v in m.skus.items()
                if v["launched"] <= at < v["discontinued"]
                and set(v["sports"]) & set(info["sports"])
            ]
            if clicks == 0:
                continue
            if not ids or not skus:
                raise ValueError("Media plan lacks eligible identities or products")
            for i in range(clicks):
                self.enqueue(
                    at + 3600 + rng.randrange(22 * 3600),
                    ["media", campaign, date, region, i],
                    story="background",
                    channel=channel,
                    identity=rng.choice(ids),
                    region=region,
                    sku=rng.choice(skus),
                    campaign=campaign,
                    probability=0.10 if date.startswith("2025-06") else 0.18,
                )
        if m.tenant == 101:
            for i, (at, params) in enumerate(self.sim.experiments()):
                self.enqueue(at, ["experiment", i], probability=1, **params)
            self.price_cohort()
            self.supply_story()

    def price_cohort(self):
        m = self.m
        skus = price_skus(m)
        self.price_members = m.scenario_customer_keys[10000:12000]
        registered = PRICE_AT - 13 * 7 * DAY
        linked_site_identities = {
            value["customer"]: key
            for key, value in m.identities.items()
            if value["channel"] == 5
            and value["link_known"] is not None
            and value["link_known"] <= PRICE_AT
        }
        definition_known = m.emit(
            "intervention_definition",
            registered,
            intervention_id=PRICE_ID,
            channel_id=4,
            starts_at=stamp(PRICE_AT),
            registered_at=stamp(registered),
            pre_weeks=12,
            post_weeks=8,
            outcome_definition=(
                "ITT; paid conversion/week; no successful payment in fixed 60 days"
                " after 2025-06-02; maturity 2025-08-01"
            ),
            identification_limit=(
                "Comparable SKU cohort; check pretrends, substitution and cross-"
                "channel migration. Observational evidence does not establish "
                "permanent churn or an isolated causal effect."
            ),
        )
        for i, member in enumerate(self.price_members):
            treated = i < 1000
            sku = skus[0 if treated else 1]
            person = m.customers[member]
            identity = m.member_mini[member]
            m.emit(
                "intervention_cohort",
                registered,
                floor=definition_known,
                intervention_id=PRICE_ID,
                customer_id=member,
                identity_id=identity,
                sku_id=sku,
                region_id=person["region"],
                cohort_group="TREATED" if treated else "CONTROL",
                eligible_at=stamp(registered),
            )
            # Eight full weeks support the weekly comparison. A ninth common week
            # keeps opportunity generation alive through the separate 60-day outcome.
            for week in range(-12, 9):
                rng = entity_rng(m.profile.seed, m.tenant, [member, week], "price-visit")
                at = PRICE_AT + week * 7 * DAY + rng.randrange(7 * DAY)
                probability = min(0.55, 0.24 + person["frequency"] * 0.035)
                purchase_sku = sku
                migration_identity = None
                if treated and week >= 0:
                    response = entity_rng(
                        m.profile.seed, m.tenant, member, "price-response"
                    ).random()
                    if response < 0.15:
                        purchase_sku = skus[1]
                        probability *= 0.90
                    elif response >= 0.85 and member in linked_site_identities:
                        migration_identity = linked_site_identities[member]
                        probability *= 0.90
                    elif response >= 0.25:
                        probability *= max(0.20, 0.7 - person["sensitivity"] * 0.2)
                        at += rng.randrange(3 * DAY)
                self.enqueue(
                    at,
                    ["price", member, week],
                    story="intervention",
                    channel=4,
                    identity=identity,
                    region=person["region"],
                    sku=purchase_sku,
                    view_sku=sku,
                    migration_identity=migration_identity,
                    probability=probability,
                    shown_discount_bps=0,
                )
        # Both comparable SKUs receive the same published replenishment policy, before visits.
        for at in range(registered, PRICE_AT + 9 * 7 * DAY, 14 * DAY):
            for sku in skus:
                self.sim.schedule(at, 0, self.study_supply, sku)

    def study_supply(self, at, sku):
        self.sim.inventory.supply(at, 7, sku, 700)

    def supply_story(self):
        m = self.m
        self.sim.schedule(SUPPLY_BEGIN - 12 * DAY, 0, self.supply_buffer, None)
        self.sim.schedule(SUPPLY_BEGIN, 0, self.plan_delay, None)
        self.sim.schedule(day_start("2025-09-12"), 0, self.rescue, None)
        ids = [
            i
            for i in m.identity_by_channel[4]
            if m.identities[i]["first"] < SUPPLY_BEGIN
            and m.identities[i]["customer"] not in m.scenario_members
        ]
        for at in range(SUPPLY_BEGIN + 2 * DAY, SUPPLY_END, DAY):
            rng = entity_rng(m.profile.seed, m.tenant, at, "supply-visits")
            for i in range(16):
                self.enqueue(
                    at + 10 * 3600 + rng.randrange(10 * 3600),
                    ["supply", at, i],
                    story="supply",
                    channel=4,
                    region=1,
                    identity=rng.choice(ids),
                    sku=m.stockout_sku,
                    route_site=7,
                    probability=0.75,
                )

    def supply_buffer(self, at, _):
        self.sim.inventory.supply(at, 8, self.m.stockout_sku, 300)

    def plan_delay(self, at, _):
        inventory, sku = self.sim.inventory, self.m.stockout_sku
        # A dated network rebalance moves real available stock; no stock is deleted.
        inventory.transfer(at, dict(src=7, dst=8, sku=sku, qty=inventory.available(7, sku)))
        inventory.supply(at, 7, sku, 40, planned=at + DAY, actual=at + DAY)
        inventory.supply(
            at,
            7,
            sku,
            400,
            planned=day_start("2025-09-06"),
            actual=day_start("2025-09-16"),
            notice=day_start("2025-09-04"),
        )

    def rescue(self, at, _):
        inventory = self.sim.inventory
        qty = min(80, max(0, inventory.available(8, self.m.stockout_sku) - 50))
        inventory.transfer(at, dict(src=8, dst=7, sku=self.m.stockout_sku, qty=qty))

    def opportunity(self, at, params):
        m, sim = self.m, self.sim
        key = params["opportunity_key"]
        params["rng"] = sim.rng = entity_rng(m.profile.seed, m.tenant, key, "lifecycle")
        params["demand_rng"] = sim.demand.rng = entity_rng(m.profile.seed, m.tenant, key, "browse")
        self.opportunities += 1
        probability = params.pop("probability")
        rng = entity_rng(m.profile.seed, m.tenant, params["opportunity_key"], "decision")
        migration = params.pop("migration_identity", None)
        if migration is not None:
            # The first channel records an actual visit; a successful decision then
            # checks out through the customer's already-linked second identity.
            sim.demand.opportunity(at, params, params["view_sku"])
        if rng.random() >= probability:
            if migration is not None:
                return
            skus = m.assortments[params["selling"]] if params.get("selling") else list(m.skus)
            pool = [s for s in skus if m.skus[s]["launched"] <= at < m.skus[s]["discontinued"]]
            sku = params.get("sku") or rng.choices(pool, [m.skus[s]["weight"] for s in pool])[0]
            sim.demand.opportunity(at, params, sku, campaign=params.get("campaign"))
            return
        if migration is not None:
            params.update(channel=5, identity=migration)
            params.pop("view_sku", None)
        self.order_count += 1
        params["oid"] = self.order_count
        sim.create(at, params)

    def record_cash(self, at, o, amount, known, refund=False):
        (self.refunds if refund else self.cash)[o["oid"]].append((at, amount, known))
        self.latest_knowledge[local_date(o["created"])] = max(
            self.latest_knowledge[local_date(o["created"])], known if not refund else 0
        )
        if not refund and o["channel"] < 4:
            self.first_platform_paid.setdefault((o["channel"], o["identity"]), (at, o["oid"]))

    def public_binding(self):
        return dict(
            version="diagnostic-1",
            tenant_id=101,
            seed=self.m.profile.seed,
            as_of="2026-04-01T00:00:00+08:00",
            stores=dict(
                region=1,
                same_store_ids=[1, 6],
                new_store_ids=[5],
                before=["2023-01-01", "2024-01-01"],
                after=["2024-01-01", "2025-01-01"],
            ),
            procurement=dict(
                sku_id=self.m.stockout_sku,
                site_id=7,
                alternative_site_id=8,
                before=["2025-09-03", "2025-09-06"],
                during=["2025-09-06", "2025-09-14"],
                after=["2025-09-16", "2025-09-21"],
                safety_stock=50,
            ),
            price=dict(
                intervention_id=PRICE_ID,
                treated_sku=price_skus(self.m)[0],
                control_sku=price_skus(self.m)[1],
                channel=4,
                starts_at=stamp(PRICE_AT),
                cohort_formed_at=stamp(PRICE_AT - 13 * 7 * DAY),
                counterexample_channel=3,
                counterexample_sku=price_skus(self.m)[0],
                counterexample=(
                    "June platform campaigns also change traffic composition; "
                    "aggregate June sales cannot identify a pure price effect."
                ),
            ),
            traffic=dict(
                channel_id=3,
                campaign_ids=[30],
                before=["2025-05-01", "2025-05-21"],
                during=["2025-06-01", "2025-06-21"],
                after=["2025-07-01", "2025-07-21"],
                sku_ids=sorted(
                    s for s, v in self.m.skus.items() if v["launched"] <= day_start("2025-05-01")
                ),
                denominator=(
                    "Sum of SKU/day/region product visitors; not deduplicated channel UV. "
                    "Keep the same SKU set, including zero-visit cells, across all windows."
                ),
                interpretation=(
                    "Decompose product-mix and within-product paid conversion; inspect "
                    "price, stock, payment and period readiness. Concurrent media and "
                    "price changes do not identify an isolated causal effect."
                ),
            ),
            monitor=dict(dense_fixture="demo", ordinary_world_minute_samples="insufficient"),
            scope_overlap=[
                (
                    "Supply routing is limited to the bound SKU/site/September window;"
                    " experiments exclude supply and price members."
                ),
                (
                    "June media composition changes affect platforms; registered price"
                    " cohort uses channel 4."
                ),
            ],
        )

    def reports(self):
        m = self.m
        coverage = sorted(
            {
                (date, campaign)
                for date, campaign, _ in self.sim.demand.ad_plan
                if m.campaign_info[campaign]["channel"] < 4
            }
        )
        missing_period = min(coverage) if coverage else None
        for date, campaign in coverage:
            orders = self.campaign_orders.get((date, campaign), [])
            channel = m.campaign_info[campaign]["channel"]
            # Freeze acquired paid orders at day + 7; subsequent versions only mature refunds.
            frozen_at = day_start(date) + 8 * DAY
            cohort = [
                o
                for o in orders
                if any(
                    at < frozen_at and known <= frozen_at for at, _, known in self.cash[o["oid"]]
                )
            ]
            paid = sum(
                value
                for o in cohort
                for at, value, known in self.cash[o["oid"]]
                if at < frozen_at and known <= frozen_at
            )
            new_buyers = len(
                {
                    o["identity"]
                    for o in cohort
                    if self.first_platform_paid.get((channel, o["identity"]), (None, None))[1]
                    == o["oid"]
                }
            )
            for version, days in [(1, 8), (2, 61)]:
                observed = day_start(date) + days * DAY
                refund = sum(
                    value
                    for o in cohort
                    for at, value, known in self.refunds[o["oid"]]
                    if at < observed and known <= observed
                )
                # A small declared platform feed lacks attribution; unknown stays unknown.
                missing = (date, campaign) == missing_period
                m.emit(
                    "campaign_attribution_daily",
                    observed,
                    campaign_id=campaign,
                    channel_id=channel,
                    cohort_date=date,
                    attribution_model="PLATFORM_LAST_CLICK_7D",
                    model_version="1",
                    report_version=version,
                    coverage_status="UNKNOWN" if missing else "KNOWN",
                    attributed_paid_cent=None if missing else paid,
                    attributed_refund_cent=None if missing else refund,
                    new_buyer_count=None if missing else new_buyers,
                    new_buyer_definition=(
                        "FIRST_PAID_ON_THIS_PLATFORM_SINCE_2023_01_01; not enterprise-new;"
                        " attribution cohort frozen at day+7"
                    ),
                    observed_at=stamp(observed),
                )
        if m.tenant == 101:
            path = m.sink.root / "scenarios" / "diagnostic-bindings.json"
            path.write_text(json.dumps(self.public_binding(), ensure_ascii=False, indent=2) + "\n")
