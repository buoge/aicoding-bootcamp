"One time-ordered business process per tenant; all amounts are integer cents."

import csv
import heapq
import math
import random
from collections import Counter, defaultdict
from datetime import UTC, datetime
from itertools import accumulate

from .demand import Demand
from .inventory import Inventory
from .master import CHANNEL_WEIGHTS, RETURNS
from .storage import DAY, END, ORDER_END, START, day_start, local_date, stamp

STORIES = [
    "stockout",
    "normal",
    "partial_return",
    "damaged",
    "rejected",
    "split_payment",
    "paid_cancel",
    "failed_payment",
    "retry_payment",
    "rto",
    "cross_period",
    "late",
    "partial_payment_timeout",
]


def apportion(n, weights):
    total = sum(weights)
    exact = [n * w / total for w in weights]
    result = [math.floor(v) for v in exact]
    for i in sorted(range(len(weights)), key=lambda i: (-(exact[i] - result[i]), i))[
        : n - sum(result)
    ]:
        result[i] += 1
    return result


def divide(amount, weights):
    total = sum(weights)
    base = [amount * w // total for w in weights]
    left = amount - sum(base)
    for i in sorted(range(len(weights)), key=lambda i: (-(amount * weights[i] % total), i))[:left]:
        base[i] += 1
    return base


class Simulation:
    def __init__(self, master):
        self.m = master
        self.rng = random.Random(master.profile.seed + master.tenant * 13)
        self.queue = []
        self.serial = 0
        self.inventory = Inventory(master, self.schedule)
        self.daily = defaultdict(lambda: [0, 0, 0])
        self.orders_summary = []
        self.fixture_map = []
        self.experiment_members = set()
        self.demand = Demand(self)
        from .diagnostic import Diagnostic

        self.diagnostic = Diagnostic(self) if master.profile.name == "diagnostic" else None

    def schedule(self, at, priority, callback, args):
        if at >= END:
            raise ValueError("Business event exceeds 90 day tail")
        self.serial += 1
        heapq.heappush(self.queue, (at, priority, self.serial, callback, args))

    def candidates(self):
        m = self.m
        candidates = []
        if m.tenant == 101:
            for index, story in enumerate(STORIES):
                at = START + 3600 if story == "stockout" else day_start("2025-09-24") + index * 60
                if story == "late":
                    at = day_start("2025-09-28") + 12 * 3600
                candidates.append(
                    (
                        at,
                        dict(
                            story=story,
                            channel=4,
                            identity=m.member_mini[
                                m.scenario_customer_keys[index % m.q["customers"]]
                            ],
                            region=1,
                            sku=m.stockout_sku if story == "stockout" else m.baseline_sku,
                        ),
                    )
                )
        if self.diagnostic:
            self.diagnostic.schedule(candidates)
            return
        if m.profile.name == "demo" and m.tenant == 101:
            candidates += self.experiments()
            candidates += self.intervention()
            monitor_customers = [
                c
                for c in m.scenario_customer_keys
                if m.customers[c]["joined"] < day_start("2025-11-09")
            ]
            for minute in range(90):
                failures = 10 if 30 <= minute < 60 else 2
                # Deterministically interleave failures, preserving exact minute denominators.
                failed = set(self.rng.sample(range(100), failures))
                for i in range(100):
                    at = day_start("2025-11-10") + 10 * 3600 + minute * 60 + self.rng.randrange(60)
                    customer = self.rng.choice(monitor_customers)
                    candidates.append(
                        (
                            at,
                            dict(
                                story="monitor_fail" if i in failed else "monitor_success",
                                channel=4,
                                identity=m.member_mini[customer],
                                region=1,
                                sku=self.rng.choice(m.monitor_pool),
                            ),
                        )
                    )
        remaining = m.q["orders"] - len(candidates)
        if remaining < 0:
            raise ValueError("Profile scenario reservations exceed order quota")
        weights = []
        month_weights = [0.85, 0.75, 0.95, 1.05, 1.1, 1.35, 1, 1, 1.05, 1.1, 1.55, 1.2]
        dow = [0.92, 0.91, 0.95, 0.97, 1.05, 1.16, 1.12]
        for day in range((ORDER_END - START) // DAY):
            dt = datetime.fromtimestamp(START + day * DAY + 8 * 3600, UTC)
            weights.append(
                [0.85, 1, 1.15][dt.year - 2023] * month_weights[dt.month - 1] * dow[dt.weekday()]
            )
        background_identities = {
            channel: [
                i for i in identities if m.identities[i]["customer"] not in m.scenario_members
            ]
            for channel, identities in m.identity_by_channel.items()
        }
        for day, count in enumerate(apportion(remaining, weights)):
            beginning = START + day * DAY
            eligible = {
                ch: [i for i in ids if m.identities[i]["first"] < beginning]
                for ch, ids in background_identities.items()
            }
            channels = [ch for ch, ids in eligible.items() if ids]
            identity_weights = {
                ch: list(
                    accumulate(
                        m.customers[m.identities[i]["customer"]]["frequency"]
                        * m.customers[m.identities[i]["customer"]]["channel_weights"][ch - 1]
                        for i in ids
                    )
                )
                for ch, ids in eligible.items()
            }
            if count and not channels:
                raise ValueError("No customer identity eligible for background demand")
            for _ in range(count):
                channel = self.rng.choices(channels, [CHANNEL_WEIGHTS[ch - 1] for ch in channels])[
                    0
                ]
                identity = self.rng.choices(
                    eligible[channel], cum_weights=identity_weights[channel]
                )[0]
                person = m.customers[m.identities[identity]["customer"]]
                hours = list(range(10, 21)) if channel >= 6 else list(range(24))
                hour_weights = (
                    [1] * len(hours)
                    if channel >= 6
                    else [
                        0.3,
                        0.1,
                        0.08,
                        0.06,
                        0.06,
                        0.1,
                        0.25,
                        0.6,
                        1,
                        1.2,
                        1.3,
                        1.4,
                        1.8,
                        1.5,
                        1.1,
                        1.2,
                        1.2,
                        1.4,
                        2,
                        2.5,
                        2.8,
                        2.6,
                        1.7,
                        0.8,
                    ]
                )
                at = (
                    beginning
                    + self.rng.choices(hours, hour_weights)[0] * 3600
                    + self.rng.randrange(3600)
                )
                if day_start("2025-11-10") + 10 * 3600 <= at < day_start("2025-11-10") + 12 * 3600:
                    at += 2 * 3600
                candidates.append(
                    (
                        at,
                        dict(
                            story="background",
                            channel=channel,
                            identity=identity,
                            region=person["region"],
                        ),
                    )
                )
        candidates.sort(key=lambda x: (x[0], x[1]["story"], x[1]["identity"]))
        for oid, (at, params) in enumerate(candidates, 1):
            params["oid"] = oid
            self.schedule(at, 2, self.create, params)

    def intervention(self):
        candidates = []
        beginning = day_start("2025-06-02")
        for i in range(2000):
            member = self.m.scenario_customer_keys[10000 + i]
            for week in range(-12, 8):
                probability = min(0.6, 0.20 + self.m.customers[member]["frequency"] * 0.09)
                if i < 1000 and week >= 0:
                    probability += 0.10
                if self.rng.random() < probability:
                    at = beginning + week * 7 * DAY + self.rng.randrange(7 * DAY)
                    # Fixed local business hours keep daily cutoffs straightforward.
                    at = day_start(local_date(at)) + 12 * 3600
                    candidates.append(
                        (
                            at,
                            dict(
                                story="intervention",
                                channel=4,
                                identity=self.m.member_mini[member],
                                region=self.m.customers[member]["region"],
                            ),
                        )
                    )
        return candidates

    def experiments(self):
        import json

        m = self.m
        candidates = []
        for exp, n, n_a, start, end, offset in [
            (1, 6000, 3000, "2025-09-01", "2025-09-15", 0),
            (2, 4000, 3200, "2025-09-15", "2025-10-01", 6000),
        ]:
            beginning, finish = day_start(start), day_start(end)
            m.emit(
                "experiment_definition",
                beginning - 7 * DAY,
                experiment_id=exp,
                experiment_code=f"EXP{exp}",
                channel_id=4,
                campaign_id=None,
                randomization_unit="CUSTOMER",
                allocation_a="0.5",
                starts_at=stamp(beginning),
                ends_at=stamp(finish),
                primary_metric="MEMBER_PAID_CONVERSION",
                outcome_window_days=7,
                guardrail_window_days=30,
                decision_rule=json.dumps(
                    {
                        "alpha": 0.05,
                        "srm_alpha": 0.001,
                        "analysis": "intention_to_treat",
                        "mechanism": (
                            "B tests prominent recommendations with reduced size guidance; "
                            "monitor conversion and refund harm among exposed members"
                        ),
                        "minimum_group_size": 100,
                        "guardrail": (
                            "refund cents / original paid cents for orders submitted within 7 "
                            "days of assignment; refunds within 30 days of assignment"
                        ),
                        "maximum_refund_rate_increase_pp": 3,
                        "adopt": (
                            "SRM passes AND conversion CI lower bound > 0 AND refund-rate "
                            "increase upper bound <= 3pp; otherwise hold"
                        ),
                        "maturity_anchor": "assignment",
                    }
                ),
                registered_at=stamp(beginning - 7 * DAY),
            )
            members = m.scenario_customer_keys[offset : offset + n]
            self.rng.shuffle(members)
            for i, member in enumerate(members):
                variant = "A" if i < n_a else "B"
                assigned = beginning + self.rng.randrange(DAY)
                region = m.customers[member]["region"]
                known = m.emit(
                    "experiment_assignment",
                    assigned,
                    experiment_id=exp,
                    unit_id=member,
                    variant=variant,
                    channel_id=4,
                    region_id=region,
                    assigned_at=stamp(assigned),
                )
                exposures = self.rng.choices([0, 1, 2, 3, 4], [5, 20, 40, 30, 5])[0]
                for j in range(exposures):
                    exposed = assigned + 3600 + j * 600
                    m.emit(
                        "experiment_exposure",
                        exposed,
                        floor=known,
                        exposure_id=m.id("exposure"),
                        experiment_id=exp,
                        unit_id=member,
                        variant=variant,
                        channel_id=4,
                        region_id=region,
                        session_id=None,
                        exposed_at=stamp(exposed),
                    )
                if self.rng.random() < (0.10 if variant == "A" or exposures == 0 else 0.15):
                    candidates.append(
                        (
                            assigned + 2 * 3600 + self.rng.randrange(6 * DAY),
                            dict(
                                story="experiment",
                                return_multiplier=4.5
                                if variant == "B" and exposures > 0 and self.diagnostic
                                else 1,
                                experiment_variant=variant,
                                channel=4,
                                identity=m.member_mini[member],
                                region=region,
                            ),
                        )
                    )
        return candidates

    def run(self):
        self.inventory.initialize()
        self.candidates()
        self.schedule(
            day_start(self.m.profile.snapshot_start) + DAY - 1, 9, self.inventory.snapshot, None
        )
        path = self.m.sink.root / "scenarios" / f"candidate-lines-{self.m.tenant}.csv"
        path.parent.mkdir(exist_ok=True)
        self.candidate_count = 0
        with path.open("w", newline="") as stream:
            self.candidate_writer = csv.writer(stream, lineterminator="\n")
            self.candidate_writer.writerow(
                [
                    "tenant_id",
                    "proposal_id",
                    "raw_line_no",
                    "sku_id",
                    "quantity",
                    "list_unit_cent",
                    "order_id",
                    "order_line_id",
                ]
            )
            while self.queue:
                at, _, _, callback, args = heapq.heappop(self.queue)
                entity = (
                    args
                    if isinstance(args, dict)
                    else args[0]
                    if isinstance(args, tuple) and args and isinstance(args[0], dict)
                    else {}
                )
                if "rng" in entity:
                    self.rng = entity["rng"]
                    self.demand.rng = entity["demand_rng"]
                callback(at, args)
        if not self.diagnostic:
            self.demand.finish_media()
        return self

    def status(self, o, at, status, reason="NORMAL"):
        o["status_seq"] += 1
        known = self.m.emit(
            "order_status_event",
            at,
            floor=o["known"],
            status_event_id=self.m.id("status_event"),
            order_id=o["oid"],
            region_id=o["region"],
            event_seq=o["status_seq"],
            status=status,
            reason_code=reason,
            event_at=stamp(at),
        )
        o["known"] = max(o["known"], known)

    def unit_event(self, o, u, at, kind):
        u["seq"] += 1
        event = self.m.id("unit_event")
        known = self.m.emit(
            "order_unit_event",
            at,
            floor=o["known"],
            unit_event_id=event,
            order_unit_id=u["id"],
            region_id=o["region"],
            event_seq=u["seq"],
            event_type=kind,
            reason_code="NORMAL",
            event_at=stamp(at),
        )
        return event, known

    def create(self, at, o):
        m, rng = self.m, self.rng
        oid, channel, region = o["oid"], o["channel"], o["region"]
        o.update(units=[], status_seq=0, payments=[], paid=0, known=0, created=at)
        offline = channel >= 6
        selling = None
        if offline:
            sites = [
                s for s, v in m.sites.items() if v["kind"] != "WAREHOUSE" and v["opened"] <= at
            ]
            desired = [s for s in sites if (m.sites[s]["kind"] == "OUTLET") == (channel == 7)]
            selling = o.get("selling") or rng.choice(desired or sites)
            o["region"] = region = m.sites[selling]["region"]
        o["selling"] = selling
        available_skus = m.assortments[selling] if selling else list(m.skus)
        raw_lines = self.demand.basket(at, o, available_skus)
        basket = Counter()
        for _, sku, qty in raw_lines:
            basket[sku] += qty
        bps = self.demand.discount(at, o)
        promotion, bps = m.promotions[channel, bps]
        prices = {sku: m.price_at(sku, channel, at) for sku in basket}
        gross = sum(prices[s][1] * q for s, q in basket.items())
        discount = gross * bps // 10000
        unit_prices = [prices[s][1] for s, q in basket.items() for _ in range(q)]
        unit_discounts = iter(divide(discount, unit_prices))
        identity = m.identities[o["identity"]]
        customer = (
            identity["customer"]
            if identity["linked"] is not None
            and identity["linked"] < at
            and identity["link_known"] <= at
            else None
        )
        address = self.demand.address(at, o)
        city = m.sites[selling]["city"] if selling else address["city"]
        o.update(customer=customer, payable=gross - discount, city=city)

        o["known"] = m.emit(
            "order_header",
            at,
            order_id=oid,
            order_no=f"ORD{oid}",
            contoso_proposal_id=f"SYNTHETIC:{m.tenant}:{oid}",
            channel_id=channel,
            org_unit_id=10 + region if offline else 2,
            region_id=region,
            demand_geo_id=city,
            selling_site_id=selling,
            identity_id=o["identity"],
            customer_id=customer,
            ordered_at=stamp(at),
            order_date=local_date(at),
            currency="CNY",
            gross_cent=gross,
            discount_cent=discount,
            payable_cent=gross - discount,
            payment_deadline=stamp(at + 1800),
        )
        if not offline:
            m.emit(
                "order_delivery_address",
                at,
                floor=o["known"],
                order_id=oid,
                region_id=region,
                recipient_name=address["name"],
                district_geo_id=address["district"],
                address_line=address["line"],
                address_kind=address["kind"],
                captured_at=stamp(at),
            )
        for line_no, (sku, qty) in enumerate(basket.items(), 1):
            line = m.id("order_line")
            for raw_no, raw_sku, raw_qty in raw_lines:
                if raw_sku == sku:
                    self.candidate_writer.writerow(
                        [
                            m.tenant,
                            f"SYNTHETIC:{m.tenant}:{oid}",
                            raw_no,
                            sku,
                            raw_qty,
                            prices[sku][1],
                            oid,
                            line,
                        ]
                    )
                    self.candidate_count += 1
            units = []
            for _unit_no in range(1, qty + 1):
                ud = next(unit_discounts)
                units.append(
                    dict(
                        id=m.id("order_unit"),
                        sku=sku,
                        net=prices[sku][1] - ud,
                        discount=ud,
                        seq=0,
                    )
                )
            m.emit(
                "order_line",
                at,
                floor=o["known"],
                order_line_id=line,
                order_id=oid,
                region_id=region,
                channel_id=channel,
                line_no=line_no,
                sku_id=sku,
                listing_id=m.listings[sku, channel],
                price_id=prices[sku][0],
                quantity=qty,
                list_unit_cent=prices[sku][1],
                gross_cent=prices[sku][1] * qty,
                discount_cent=sum(u["discount"] for u in units),
                net_cent=sum(u["net"] for u in units),
            )
            for unit_no, u in enumerate(units, 1):
                m.emit(
                    "order_unit",
                    at,
                    floor=o["known"],
                    order_unit_id=u["id"],
                    order_line_id=line,
                    order_id=oid,
                    region_id=region,
                    sku_id=sku,
                    unit_no=unit_no,
                    gross_cent=u["net"] + u["discount"],
                    discount_cent=u["discount"],
                    net_cent=u["net"],
                )
                m.emit(
                    "discount_allocation",
                    at,
                    floor=o["known"],
                    allocation_id=m.id("discount"),
                    order_unit_id=u["id"],
                    region_id=region,
                    promotion_id=promotion,
                    apply_seq=1,
                    discount_cent=u["discount"],
                )
            o["units"].extend(units)
            self.daily[local_date(at), channel, sku, region][0] += 1
        self.status(o, at, "CREATED")
        for u in o["units"]:
            self.unit_event(o, u, at, "CREATED")
        if o["story"] in STORIES:
            self.fixture_map.append(
                dict(
                    order_id=oid, story=o["story"], payable_cent=o["payable"], units=len(o["units"])
                )
            )
        if self.diagnostic:
            for sku in basket:
                key = local_date(at), channel, sku, region
                self.diagnostic.submission_facts[key].append(o["known"])
                self.diagnostic.latest_knowledge[local_date(at)] = max(
                    self.diagnostic.latest_knowledge[local_date(at)], o["known"]
                )
        self.demand.record_order_flow(o, at)
        # Atomic allocation: every line must be satisfiable before any reservation is committed.
        chosen = {}
        success = True
        for sku, qty in basket.items():
            self.inventory.observe(at, sku, qty, o["known"])
            sites = (
                [selling]
                if selling
                else [
                    s
                    for s, v in m.sites.items()
                    if v["kind"] == "WAREHOUSE" and sku in m.assortments[s]
                ]
            )
            site = o.get("route_site") or max(sites, key=lambda s: self.inventory.available(s, sku))
            before = self.inventory.available(site, sku)
            if o["story"] == "stockout":
                before = self.inventory.available(site, sku)
            chosen[sku] = (site, before, qty)
            success = success and before >= qty
        for sku, (site, before, qty) in chosen.items():
            m.emit(
                "stock_allocation_attempt",
                at,
                floor=o["known"],
                allocation_attempt_id=m.id("allocation"),
                allocation_group_id=oid,
                order_id=oid,
                region_id=region,
                site_id=site,
                sku_id=sku,
                requested_qty=qty,
                available_before_qty=before,
                outcome="COMMITTED"
                if success
                else "INSUFFICIENT"
                if before < qty
                else "ROLLED_BACK",
                attempted_at=stamp(at),
            )
        if not success:
            self.cancel(at + 1, (o, "STOCKOUT"))
            return
        for u in o["units"]:
            site = chosen[u["sku"]][0]
            lot = self.inventory.choose(site, u["sku"])
            u.update(site=site, lot=lot)
            event, known = self.unit_event(o, u, at, "RESERVED")
            self.inventory.move(
                at,
                site,
                u["sku"],
                "RESERVE",
                [0, 0, 1, 0, 0],
                "UNIT_EVENT",
                event,
                lot=lot,
                unit=u["id"],
                floor=known,
            )
        self.status(o, at, "RESERVED")
        pay_at = (
            at
            if o["story"].startswith("monitor")
            else at + min(900, max(3, round(rng.lognormvariate(3.3 if offline else 4.5, 0.8))))
        )
        self.schedule(pay_at, 3, self.pay, (o, 0))

    def pay(self, at, args):
        o, attempt = args
        forced_fail = (
            o["story"] in ("failed_payment", "monitor_fail")
            or o["story"] == "retry_payment"
            and attempt == 0
            or o["story"] == "partial_payment_timeout"
            and attempt > 0
        )
        forced_success = o["story"] in STORIES or o["story"] in ("monitor_success",)
        success_probability = 0.94
        if (
            self.diagnostic
            and o["channel"] == 4
            and day_start("2025-11-10") + 10 * 3600 + 1800
            <= at
            < day_start("2025-11-10") + 11 * 3600
        ):
            success_probability = 0.78
        success = not forced_fail and (forced_success or self.rng.random() < success_probability)
        amount = o["payable"] - o["paid"]
        split = (
            success
            and attempt == 0
            and (
                o["story"] in ("split_payment", "partial_payment_timeout")
                or o["story"] not in STORIES
                and not o["story"].startswith("monitor_")
                and self.rng.random() < 0.02
            )
        )
        if split:
            amount //= 2
        payment = self.m.id("payment")
        known = self.m.emit(
            "payment",
            at,
            floor=o["known"],
            payment_id=payment,
            order_id=o["oid"],
            region_id=o["region"],
            payment_no=f"PAY{payment}",
            method=self.rng.choice(
                self.m.catalog.data["commerce"]["payment_methods"][str(o["channel"])]
            ),
            status="SUCCEEDED" if success else "FAILED",
            amount_cent=amount,
            attempted_at=stamp(at),
        )
        o["known"] = known
        if success:
            if self.diagnostic:
                self.diagnostic.record_cash(at, o, amount, known)
            previous_paid = o["paid"]
            o["paid"] += amount
            skus = sorted({u["sku"] for u in o["units"]})
            weights = [sum(u["net"] for u in o["units"] if u["sku"] == sku) for sku in skus]
            previous = divide(previous_paid, weights)
            cumulative = divide(o["paid"], weights)
            for sku, before, after in zip(skus, previous, cumulative, strict=True):
                daily = self.daily[local_date(o["created"]), o["channel"], sku, o["region"]]
                daily[1] += int(previous_paid == 0)
                daily[2] += after - before
                if self.diagnostic:
                    key = local_date(o["created"]), o["channel"], sku, o["region"]
                    self.diagnostic.payment_facts[key].append(
                        (known, int(previous_paid == 0), after - before)
                    )
            o["payments"].append([payment, amount])
            self.fee(o, at, "PAYMENT_SERVICE", max(1, amount * 60 // 10000), "PAYMENT", payment)
            if split:
                self.schedule(at + 30, 3, self.pay, (o, attempt + 1))
                return
            self.status(o, at, "PAID")
            for u in o["units"]:
                self.unit_event(o, u, at, "PAID")
            if (
                o["story"] == "paid_cancel"
                or o["story"] not in STORIES
                and not o["story"].startswith("monitor_")
                and self.rng.random() < 0.02
            ):
                self.schedule(at + 300, 1, self.cancel, (o, "CUSTOMER_CANCEL"))
            else:
                self.schedule(
                    at
                    + (
                        self.rng.randint(20, 180)
                        if o["selling"]
                        else self.rng.randint(2 * 3600, 3 * DAY)
                    ),
                    4,
                    self.ship,
                    o,
                )
        elif attempt < 3 and (
            o["story"] == "retry_payment"
            or o["story"] not in STORIES
            and not o["story"].startswith("monitor_")
            and self.rng.random() < 0.25
        ):
            self.schedule(
                min(o["created"] + 1700, at + self.rng.randint(10, 180)),
                3,
                self.pay,
                (o, attempt + 1),
            )
        else:
            self.schedule(o["created"] + 1800, 1, self.cancel, (o, "PAYMENT_TIMEOUT"))

    def cancel(self, at, args):
        o, reason = args
        for u in o["units"]:
            if "lot" in u:
                event, known = self.unit_event(o, u, at, "RELEASED")
                self.inventory.move(
                    at,
                    u["site"],
                    u["sku"],
                    "RELEASE",
                    [0, 0, -1, 0, 0],
                    "UNIT_EVENT",
                    event,
                    lot=u["lot"],
                    unit=u["id"],
                    floor=known,
                )
            self.unit_event(o, u, at, "CANCELLED")
        self.status(o, at, "CANCELLED", reason)
        if o["paid"]:
            self.schedule(at + DAY, 7, self.refund, (o, o["units"], "CANCEL"))
        self.summarize(o, False)

    def ship(self, at, o):
        by_site = defaultdict(list)
        for u in o["units"]:
            by_site[u["site"]].append(u)
        o["shipments_remaining"] = len(by_site)
        for site, units in by_site.items():
            shipment = self.m.id("shipment")
            logistics_fee, transit_time, promised = self.demand.logistics(o, site, units)
            known = self.m.emit(
                "shipment",
                at,
                floor=o["known"],
                shipment_id=shipment,
                order_id=o["oid"],
                region_id=o["region"],
                from_site_id=site,
                shipment_no=f"SHP{shipment}",
                fulfillment_type="POS" if o["selling"] else "DELIVERY",
                created_at=stamp(at),
                promised_at=stamp(at + promised),
            )
            self.shipment_event(o, at, shipment, site, 1, "SHIPPED", known)
            for u in units:
                u["shipment_item"] = self.m.id("shipment_item")
                self.m.emit(
                    "shipment_item",
                    at,
                    floor=known,
                    shipment_item_id=u["shipment_item"],
                    shipment_id=shipment,
                    order_unit_id=u["id"],
                    order_id=o["oid"],
                    region_id=o["region"],
                    sku_id=u["sku"],
                    from_site_id=site,
                    lot_id=u["lot"],
                    shipped_at=stamp(at),
                )
                ue, uk = self.unit_event(o, u, at, "SHIPPED")
                self.inventory.move(
                    at,
                    site,
                    u["sku"],
                    "SHIP",
                    [-1, 0, -1, 0, 0],
                    "UNIT_EVENT",
                    ue,
                    lot=u["lot"],
                    unit=u["id"],
                    floor=uk,
                )
            if not o["selling"]:
                self.fee(
                    o,
                    at,
                    "OUTBOUND_LOGISTICS",
                    600 if self.m.profile.name == "fixture" else logistics_fee,
                    "SHIPMENT",
                    shipment,
                )
            rto = (
                o["story"] == "rto"
                or o["story"] not in STORIES
                and not o["story"].startswith("monitor_")
                and self.rng.random() < 0.01
            )
            self.schedule(
                at + (self.rng.randint(10, 120) if o["selling"] else transit_time),
                5,
                self.deliver,
                (o, shipment, site, units, rto),
            )
        self.status(o, at, "SHIPPED")

    def shipment_event(self, o, at, shipment, site, seq, kind, floor=0):
        event = self.m.id("shipment_event")
        known = self.m.emit(
            "shipment_event",
            at,
            floor=max(floor, o["known"]),
            shipment_event_id=event,
            shipment_id=shipment,
            order_id=o["oid"],
            region_id=o["region"],
            from_site_id=site,
            event_seq=seq,
            event_type=kind,
            event_at=stamp(at),
        )
        o["known"] = max(o["known"], known)
        return event

    def deliver(self, at, args):
        o, shipment, site, units, rto = args
        event = self.shipment_event(
            o, at, shipment, site, 2, "DELIVERY_FAILED" if rto else "DELIVERED"
        )
        if rto:
            self.schedule(at + 2 * DAY, 0, self.rto, (o, shipment, site, units))
            return
        for u in units:
            self.unit_event(o, u, at, "DELIVERED")
            self.finance(o, u, at, "revenue_entry", "DELIVERY", u["net"], shipment_event=event)
            self.finance(
                o,
                u,
                at,
                "cost_entry",
                "DELIVERY",
                self.inventory.lots[u["lot"]]["cost"],
                shipment_event=event,
            )
            self.fee(o, at, "COMMISSION", u["net"] * 300 // 10000, "SHIPMENT", shipment, unit=u)
        o["shipments_remaining"] -= 1
        if o["shipments_remaining"] == 0:
            self.status(o, at, "COMPLETED")
            self.summarize(o, True)
        for index, u in enumerate(units):
            story = o["story"]
            forced = (
                story in ("partial_return", "damaged", "rejected", "cross_period") and index == 0
            )
            item = self.m.skus[u["sku"]]
            probability = RETURNS[item["category"]]
            if item["product_key"] == self.m.catalog.data["business"]["scenario_products"][
                "quality"
            ] and day_start("2025-05-01") <= o["created"] < day_start("2025-07-01"):
                probability *= 2.2
            if (
                forced
                or story not in STORIES
                and not story.startswith("monitor_")
                and self.rng.random() < min(0.9, probability * o.get("return_multiplier", 1))
            ):
                self.schedule(
                    at + (20 if story == "cross_period" else self.rng.randint(1, 30)) * DAY,
                    6,
                    self.return_request,
                    (o, u),
                )

    def rto(self, at, args):
        o, shipment, site, units = args
        event = self.shipment_event(o, at, shipment, site, 3, "RETURNED_TO_ORIGIN")
        for leg, u in enumerate(units, 1):
            self.inventory.move(
                at,
                site,
                u["sku"],
                "RTO_RECEIPT",
                [1, 0, 0, 0, 0],
                "SHIPMENT_EVENT",
                event,
                lot=u["lot"],
                unit=u["id"],
                leg=leg,
                floor=o["known"],
            )
            self.unit_event(o, u, at, "CANCELLED")
        self.schedule(at + DAY, 7, self.refund, (o, units, "CANCEL"))
        o["shipments_remaining"] -= 1
        if o["shipments_remaining"] == 0:
            self.status(o, at, "CANCELLED", "RTO")
            self.summarize(o, False)

    def return_request(self, at, args):
        o, u = args
        ret = self.m.id("return")
        item = self.m.id("return_item")
        # Cross-location returns are allowed while original sales attribution stays immutable.
        receiving = 1 if u["sku"] in self.m.assortments[1] else u["site"]
        known = self.m.emit(
            "return_header",
            at,
            floor=o["known"],
            return_id=ret,
            order_id=o["oid"],
            region_id=o["region"],
            return_no=f"RET{ret}",
            request_channel_id=o["channel"],
            receiving_site_id=receiving,
            requested_at=stamp(at),
        )
        reason, description = self.demand.return_reason(u["sku"])
        self.m.emit(
            "return_item",
            at,
            floor=known,
            return_item_id=item,
            return_id=ret,
            order_id=o["oid"],
            region_id=o["region"],
            order_unit_id=u["id"],
            shipment_item_id=u["shipment_item"],
            reason_code=reason,
            reason_description=description,
        )
        r = dict(o=o, u=u, item=item, ret=ret, site=receiving, seq=0, known=known)
        self.return_event(r, at, "REQUESTED")
        self.schedule(at + self.rng.randint(1, 10) * DAY, 6, self.return_receive, r)

    def return_event(self, r, at, kind, lot=None):
        r["seq"] += 1
        event = self.m.id("return_event")
        known = self.m.emit(
            "return_event",
            at,
            floor=r["known"],
            return_event_id=event,
            return_item_id=r["item"],
            order_unit_id=r["u"]["id"],
            region_id=r["o"]["region"],
            event_seq=r["seq"],
            event_type=kind,
            site_id=r["site"],
            restocked_lot_id=lot,
            event_at=stamp(at),
        )
        r["known"] = known
        return event

    def return_receive(self, at, r):
        event = self.return_event(r, at, "RECEIVED")
        self.inventory.move(
            at,
            r["site"],
            r["u"]["sku"],
            "RETURN_RECEIVE",
            [0, 1, 0, 0, 0],
            "RETURN_EVENT",
            event,
            unit=r["u"]["id"],
            ret=r["item"],
            floor=r["known"],
        )
        self.schedule(at + self.rng.randint(1, 3) * DAY, 6, self.return_accept, r)

    def return_accept(self, at, r):
        o, u = r["o"], r["u"]
        rejected = (
            o["story"] == "rejected"
            or o["story"] not in STORIES
            and not o["story"].startswith("monitor_")
            and self.rng.random() < 0.03
        )
        if rejected:
            self.return_event(r, at, "REJECTED")
            # Remains quarantined awaiting customer pickup; no invented sale/cost reversal.
            return
        event = self.return_event(r, at, "ACCEPTED")
        o["known"] = max(o["known"], r["known"])
        self.finance(o, u, at, "revenue_entry", "RETURN_ACCEPTED", -u["net"], return_event=event)
        self.fee(o, at, "RETURN_LOGISTICS", 800, "RETURN", r["ret"], unit=u)
        self.schedule(at + self.rng.randint(1, 14) * DAY, 7, self.refund, (o, [u], "RETURN"))
        r["damaged"] = (
            o["story"] == "damaged"
            or o["story"] not in STORIES
            and not o["story"].startswith("monitor_")
            and self.rng.random() < 0.12
        )
        self.schedule(at + self.rng.randint(1, 7) * DAY, 0, self.return_stock, r)

    def return_stock(self, at, r):
        o, u, site = r["o"], r["u"], r["site"]
        if r["damaged"]:
            event = self.return_event(r, at, "DAMAGED")
            self.inventory.move(
                at,
                site,
                u["sku"],
                "DAMAGE",
                [0, -1, 0, 0, 1],
                "RETURN_EVENT",
                event,
                unit=u["id"],
                ret=r["item"],
                floor=r["known"],
            )
            self.schedule(at + DAY, 0, self.scrap, r)
        else:
            lot = self.inventory.lot(at, site, u["sku"], "RETURN", u["lot"])
            event = self.return_event(r, at, "RESTOCKED", lot)
            self.inventory.move(
                at,
                site,
                u["sku"],
                "RESTOCK",
                [1, -1, 0, 0, 0],
                "RETURN_EVENT",
                event,
                lot=lot,
                unit=u["id"],
                ret=r["item"],
                floor=r["known"],
            )
            o["known"] = max(o["known"], r["known"])
            self.finance(
                o,
                u,
                at,
                "cost_entry",
                "RESTOCK",
                -self.inventory.lots[u["lot"]]["cost"],
                return_event=event,
            )

    def scrap(self, at, r):
        event = self.return_event(r, at, "SCRAPPED")
        self.inventory.move(
            at,
            r["site"],
            r["u"]["sku"],
            "SCRAP",
            [0, 0, 0, 0, -1],
            "RETURN_EVENT",
            event,
            unit=r["u"]["id"],
            ret=r["item"],
            floor=r["known"],
        )

    def refund(self, at, args):
        o, units, kind = args
        amounts = [u["net"] for u in units]
        if kind == "CANCEL" and o["paid"] < o["payable"]:
            amounts = divide(sum(p[1] for p in o["payments"]), amounts)
        remaining = [(u, value) for u, value in zip(units, amounts, strict=True) if value]
        for payment in o["payments"]:
            if not remaining:
                break
            allocations = []
            while remaining and payment[1] > 0:
                u, value = remaining.pop(0)
                amount = min(value, payment[1])
                allocations.append((u, amount))
                payment[1] -= amount
                if amount < value:
                    remaining.insert(0, (u, value - amount))
            if not allocations:
                continue
            refund = self.m.id("refund")
            known = self.m.emit(
                "refund",
                at,
                floor=o["known"],
                refund_id=refund,
                payment_id=payment[0],
                order_id=o["oid"],
                region_id=o["region"],
                refund_no=f"REF{refund}",
                status="SUCCEEDED",
                refund_type=kind,
                amount_cent=sum(v for _, v in allocations),
                attempted_at=stamp(at),
            )
            if self.diagnostic:
                self.diagnostic.record_cash(
                    at, o, sum(v for _, v in allocations), known, refund=True
                )
            for u, value in allocations:
                self.m.emit(
                    "refund_allocation",
                    at,
                    floor=known,
                    refund_allocation_id=self.m.id("refund_allocation"),
                    refund_id=refund,
                    order_id=o["oid"],
                    region_id=o["region"],
                    order_unit_id=u["id"],
                    amount_cent=value,
                )
        if remaining:
            raise ValueError("Refund exceeds original successful cash")

    def finance(self, o, u, at, table, kind, amount, shipment_event=None, return_event=None):
        fields = dict(
            order_unit_id=u["id"],
            region_id=o["region"],
            entry_type=kind,
            shipment_event_id=shipment_event,
            return_event_id=return_event,
            amount_cent=amount,
            recognized_at=stamp(at),
        )
        fields[table + "_id"] = self.m.id(table)
        if table == "revenue_entry":
            fields["quantity_delta"] = 1 if kind == "DELIVERY" else -1
        else:
            fields["lot_id"] = u["lot"]
        self.m.emit(table, at, floor=o["known"], **fields)

    def fee(self, o, at, kind, amount, source, source_id, unit=None):
        fee = self.m.id("fee")
        self.m.emit(
            "order_fee",
            at,
            floor=o["known"],
            fee_id=fee,
            order_id=o["oid"],
            region_id=o["region"],
            order_unit_id=unit["id"] if unit else None,
            fee_type=kind,
            amount_cent=amount,
            recognized_at=stamp(at),
            source_system="ERP",
            source_fee_no=f"FEE{fee}",
            reversal_of_fee_id=None,
            source_event_kind=source,
            source_event_id=source_id,
        )

    def summarize(self, o, delivered):
        self.orders_summary.append(
            dict(
                order_id=o["oid"],
                date=local_date(o["created"]),
                channel=o["channel"],
                region=o["region"],
                customer=o["customer"],
                payable=o["payable"],
                paid=o["paid"],
                delivered=delivered,
                story=o["story"],
            )
        )
