"""Conditional demand, browsing opportunities and logistics from frozen business inputs.

The order count is a quota. Failed opportunities remain observable; conversion rates
describe this conditional simulation, not a calibrated market demand forecast.
"""

import math
from collections import Counter, defaultdict
from datetime import UTC, datetime

from .semantic import MissingSemantic
from .storage import DAY, ORDER_END, day_start, local_date, stamp
from .world import entity_rng


def seasonal_weight(item, region, month):
    north = region in (3, 5, 7)
    if item["season"] == "WINTER":
        return (
            (3.4 if north else 1.5)
            if month in (11, 12, 1, 2)
            else 0.12
            if month in (6, 7, 8)
            else 0.7
        )
    if item["season"] == "SUMMER":
        return 2.3 if month in (5, 6, 7, 8) else 0.35 if north and month in (11, 12, 1, 2) else 0.85
    if item["season"] == "SPRING_AUTUMN":
        return 1.8 if month in (3, 4, 5, 9, 10) else 0.55
    if "露营" in item["sports"]:
        return 1.8 if month in (4, 5, 9, 10) else 0.4 if north and month in (12, 1, 2) else 1
    return 1


class Demand:
    def __init__(self, simulation):
        self.sim, self.m = simulation, simulation.m
        self.rng = entity_rng(self.m.profile.seed, self.m.tenant, "opportunities", "demand")
        self.traffic = defaultdict(lambda: [0, 0, 0])
        self.footfall = Counter()
        self.visitor_sets = defaultdict(set)
        self.cart_sets = defaultdict(set)
        self.visit_serial = 0
        self.ad_plan, self.ad_used = {}, Counter()
        for campaign, begin, end in self.m.campaigns:
            info = self.m.campaign_info[campaign]
            for at in range(begin, min(end, ORDER_END), DAY):
                for region, share in enumerate([0.29, 0.23, 0.17, 0.11, 0.06, 0.09, 0.05], 1):
                    rng = entity_rng(
                        self.m.profile.seed, self.m.tenant, [campaign, at, region], "media-plan"
                    )
                    budget = round(info["daily_budget_cent"] * share * rng.uniform(0.8, 1.2))
                    cpc = max(1, round(info["cpc_cent"] * rng.uniform(0.7, 1.3)))
                    clicks = budget // cpc
                    impressions = round(clicks / max(0.001, info["ctr"] * rng.uniform(0.65, 1.35)))
                    self.ad_plan[local_date(at), campaign, region] = (
                        impressions,
                        clicks,
                        clicks * cpc,
                    )

    def basket(self, at, o, available):
        m, rng = self.m, self.rng
        ordinary_basket = o["story"] == "background" or (
            self.sim.diagnostic and o["story"] == "experiment"
        )
        person = m.customers[m.identities[o["identity"]]["customer"]]
        month = datetime.fromtimestamp(at + 28800, UTC).month
        skus = [s for s in available if m.skus[s]["launched"] <= at < m.skus[s]["discontinued"]]
        if o.get("sku") in skus:
            quantity = 2 if o["story"] in ("partial_return", "damaged", "cross_period") else 1
            return [(1, o["sku"], quantity)]
        if not skus:
            raise MissingSemantic(
                "product_coverage",
                [f"channel-{o['channel']}-{local_date(at)}"],
                dict(tenant=m.tenant, date=local_date(at), channel=o["channel"]),
            )
        weights = []
        for sku in skus:
            v = m.skus[sku]
            preference = 3.8 if set(v["sports"]) & set(person["interests"]) else 0.65
            gender = 1 if v["audience"] in ("UNISEX", person["gender"]) else 0.18
            size = 1
            if v["axis"] == "EU":
                size = max(0.04, math.exp(-(((int(v["size"]) - person["eu"]) / 1.3) ** 2)))
            elif v["axis"] == "ALPHA":
                size = 3 if v["size"] == person["alpha"] else 0.6
            price = m.price_at(sku, o["channel"], at)[1]
            budget = min(1, (person["budget"] / max(price, 1)) ** (1.2 + person["sensitivity"]))
            weights.append(
                v["weight"]
                * preference
                * gender
                * size
                * budget
                * seasonal_weight(v, o["region"], month)
            )
        count = rng.choices([1, 2, 3, 4], [63, 25, 9, 3])[0] if ordinary_basket else 1
        primary = o.get("sku") or rng.choices(skus, weights)[0]
        if primary not in skus:
            raise ValueError("Scenario references a product outside its selling lifecycle")
        chosen = [primary]
        for _ in range(count - 1):
            complements = m.catalog.data["commerce"]["complements"].get(
                m.skus[primary]["family"], []
            )
            matching = [i for i, s in enumerate(skus) if m.skus[s]["family"] in complements]
            if matching and rng.random() < 0.68:
                chosen.append(
                    rng.choices([skus[i] for i in matching], [weights[i] for i in matching])[0]
                )
            else:
                chosen.append(rng.choices(skus, weights)[0])
        raw = []
        for sku in chosen:
            quantity = 2 if o["story"] in ("partial_return", "damaged", "cross_period") else 1
            if ordinary_basket:
                quantity = rng.choices([1, 2, 3], [91, 8, 1])[0]
            raw.append((len(raw) + 1, sku, quantity))
        return raw

    def discount(self, at, o):
        if "shown_discount_bps" in o:
            return o["shown_discount_bps"]
        if self.m.profile.name == "fixture" or o["story"] != "background":
            return 1000
        month = datetime.fromtimestamp(at + 28800, UTC).month
        sensitivity = self.m.customers[self.m.identities[o["identity"]]["customer"]]["sensitivity"]
        rates, weights = ([0, 500, 1000, 1500, 2000, 2500, 3000], [30, 20, 22, 12, 8, 5, 3])
        if month in (6, 11) or o["channel"] == 7:
            weights = [5, 7, 12, 21, 26, 20, 9]
        return self.rng.choices(
            rates, [w * (1 + sensitivity * i / 4) for i, w in enumerate(weights)]
        )[0]

    def address(self, at, o):
        m = self.m
        person = m.customers[m.identities[o["identity"]]["customer"]]
        rng = entity_rng(person["address_seed"], m.tenant, "home", "address")
        city = person["city"]
        temporary = (
            self.rng.random() < m.catalog.data["customers"]["cross_city_delivery_probability"]
        )
        if temporary or m.cities[city]["region"] != o["region"]:
            city = self.rng.choice(m.region_cities[o["region"]])
            rng = entity_rng(m.profile.seed, m.tenant, o["oid"], "temporary-address")
        if person["moved"] and at >= day_start("2024-08-01"):
            rng = entity_rng(person["address_seed"], m.tenant, "new-home", "address")
        district = rng.choice([d for d, v in m.districts.items() if v["city"] == city])
        data = m.catalog.data["geography"]
        street = rng.choice(data["synthetic_streets"])
        community = rng.choice(data["synthetic_communities"])
        line = (
            f"合成地址·{street}{rng.randint(1, 399)}号·{community}"
            f"{rng.randint(1, 24)}幢{rng.randint(1, 28)}层{rng.randint(1, 4):02}室"
        )
        return dict(
            city=city,
            district=district,
            name=person["name"],
            line=line,
            kind="TEMPORARY" if temporary else rng.choices(["HOME", "OFFICE"], [83, 17])[0],
        )

    def logistics(self, o, site, units):
        weight = sum(self.m.skus[u["sku"]]["weight_grams"] for u in units) + 250
        origin = self.m.sites[site]
        same_city = origin["city"] == o["city"]
        same_region = origin["region"] == o["region"]
        lane = 0 if same_city else 1 if same_region else 2
        if o["region"] in (5, 7) and not same_region:
            lane = 3
        fee = [400, 550, 750, 1000][lane] + max(0, math.ceil(weight / 1000) - 1) * [
            120,
            180,
            260,
            380,
        ][lane]
        delay = round(self.rng.uniform(1 + lane * 0.65, 2.3 + lane) * DAY)
        if datetime.fromtimestamp(o["created"] + 28800, UTC).month == 11:
            delay += self.rng.randrange(2 * DAY)
        return fee, delay, (3 + lane) * DAY

    def return_reason(self, sku):
        product = self.m.skus[sku]
        reasons = ["QUALITY", "NOT_NEEDED", "DESCRIPTION", "OTHER"]
        weights = [18, 42, 28, 12]
        if product["axis"] in {"ALPHA", "EU", "HEAD", "FOOT"}:
            reasons.append("SIZE")
            weights.append(70)
        if (
            product["product_key"]
            == self.m.catalog.data["business"]["scenario_products"]["quality"]
        ):
            weights[0] *= 3
        reason = self.rng.choices(reasons, weights)[0]
        text = self.rng.choice(self.m.catalog.data["language"]["return_descriptions"][reason])
        return reason, text

    def opportunity(self, at, o, sku, *, submitted=False, campaign=None):
        m, rng = self.m, self.rng
        views = rng.choices([1, 2, 3, 4, 5], [40, 30, 18, 9, 3])[0]
        cart = submitted or rng.random() < 0.28
        self.visit_serial += 1
        start = max(day_start(local_date(at)), at - rng.randint(90, 1500))
        identity = o.get("identity") if submitted or rng.random() < 0.25 else None
        if identity is not None and m.identities[identity]["first"] > start:
            if submitted:
                start = min(at, m.identities[identity]["first"])
            else:
                identity = None
        visitor = identity if identity is not None else -self.visit_serial
        extras = sorted(set(u["sku"] for u in o["units"]) - {sku}) if submitted else []
        for viewed_sku in [sku] + extras:
            counts_key = local_date(at), o["channel"], viewed_sku, o["region"]
            self.traffic[counts_key][0] += views if viewed_sku == sku else 1
            self.visitor_sets[counts_key].add(visitor)
            if cart:
                self.cart_sets[counts_key].add(visitor)
            self.traffic[counts_key][1] = len(self.visitor_sets[counts_key])
            self.traffic[counts_key][2] = len(self.cart_sets[counts_key])
        if o.get("selling"):
            self.footfall[local_date(at), o["selling"]] += 1
        if o["channel"] not in (4, 5):
            return None, None
        sid = m.id("session")
        known = m.emit(
            "web_session",
            start,
            session_id=sid,
            channel_id=o["channel"],
            region_id=o["region"],
            identity_id=identity,
            anonymous_token=f"ANON-{m.tenant}-{sid}",
            campaign_id=campaign,
            started_at=stamp(start),
            device_type=rng.choices(["MOBILE", "DESKTOP", "TABLET"], [82, 14, 4])[0],
        )
        events = ["PAGE_VIEW"]
        if rng.random() < 0.58:
            events.append("SEARCH")
        events += ["PRODUCT_VIEW"] * views
        if cart:
            events.append("ADD_CART")
        events = [(kind, sku) for kind in events]
        for extra in extras:
            events.extend([("PRODUCT_VIEW", extra), ("ADD_CART", extra)])
        if submitted:
            events.append(("CHECKOUT_SUBMITTED", sku))
        product = m.skus[sku]
        for seq, (kind, event_sku) in enumerate(events, 1):
            instant = start + (at - start) * seq // len(events)
            query = None
            if kind == "SEARCH":
                query = rng.choice(m.catalog.data["language"]["search_patterns"]).format(
                    type=product["product_type"],
                    sport=rng.choice(product["sports"]),
                    name=product["name"],
                )
            m.emit(
                "behavior_event",
                instant,
                floor=max(known, o.get("known", 0) if kind == "CHECKOUT_SUBMITTED" else 0),
                behavior_event_id=m.id("behavior"),
                session_id=sid,
                region_id=o["region"],
                event_seq=seq,
                event_type=kind,
                sku_id=event_sku,
                order_id=o["oid"] if kind == "CHECKOUT_SUBMITTED" else None,
                reason_code="NORMAL",
                event_at=stamp(instant),
                search_query=query,
            )
        if self.sim.diagnostic:
            price_id, amount = m.price_at(sku, o["channel"], at)
            bps = o.get("shown_discount_bps", 0)
            m.emit(
                "price_exposure",
                at,
                floor=known,
                exposure_id=m.id("price_exposure"),
                identity_id=identity,
                session_id=sid,
                sku_id=sku,
                channel_id=o["channel"],
                region_id=o["region"],
                price_id=price_id,
                shown_list_cent=amount,
                shown_offer_cent=amount * (10000 - bps) // 10000,
                viewed_at=stamp(at),
            )
        return sid, start

    def record_order_flow(self, o, at):
        primary = o["units"][0]["sku"]
        if self.sim.diagnostic:
            campaign = o.get("campaign")
            sid, touch = self.opportunity(
                at, o, o.get("view_sku", primary), submitted=True, campaign=campaign
            )
            attributed = campaign is not None and sid is not None
            self.m.emit(
                "order_attribution",
                at + DAY,
                floor=o["known"],
                attribution_id=self.m.id("attribution"),
                order_id=o["oid"],
                region_id=o["region"],
                campaign_id=campaign if attributed else None,
                session_id=sid if attributed else None,
                touch_at=stamp(touch) if attributed and touch is not None else None,
                model_version="LAST_NON_DIRECT_7D_V1",
                credit=1,
                evidence_type="OWNED_TOUCH"
                if attributed
                else "ORGANIC"
                if sid
                else "UNATTRIBUTABLE",
                computed_at=stamp(at + DAY),
            )
            if campaign is not None and o["channel"] < 4:
                self.sim.diagnostic.campaign_orders[local_date(at), campaign].append(o)
            return
        person = self.m.customers[self.m.identities[o["identity"]]["customer"]]
        rate = [0.16, 0.14, 0.12, 0.24, 0.25, 0.4, 0.35][o["channel"] - 1]
        rate *= 0.8 + person["frequency"] * 0.12
        # Geometric failed opportunities precede the quota's next submission.
        for _ in range(200):
            if self.rng.random() < min(0.7, rate):
                break
            self.opportunity(at, o, primary)
        else:
            raise ValueError("Opportunity budget exhausted before order quota")
        campaign = None
        for cid, begin, end in self.m.campaigns:
            key = local_date(at), cid, o["region"]
            if (
                begin <= at < end
                and self.m.campaign_info[cid]["channel"] == o["channel"]
                and self.rng.random() < 0.3
            ):
                if self.ad_used[key] < self.ad_plan[key][1]:
                    campaign = cid
                    self.ad_used[key] += 1
                    break
        sid, touch = self.opportunity(at, o, primary, submitted=True, campaign=campaign)
        attributed = campaign is not None and sid is not None
        self.m.emit(
            "order_attribution",
            at + DAY,
            floor=o["known"],
            attribution_id=self.m.id("attribution"),
            order_id=o["oid"],
            region_id=o["region"],
            campaign_id=campaign if attributed else None,
            session_id=sid if attributed else None,
            touch_at=stamp(touch) if attributed and touch is not None else None,
            model_version="LAST_NON_DIRECT_7D_V1",
            credit=1,
            evidence_type="OWNED_TOUCH" if attributed else "ORGANIC" if sid else "UNATTRIBUTABLE",
            computed_at=stamp(at + DAY),
        )

    def finish_media(self):
        # Unused planned clicks are real non-converting opportunities, not scaled orders.
        for (date, campaign, region), (_, clicks, _) in sorted(self.ad_plan.items()):
            info = self.m.campaign_info[campaign]
            at = day_start(date) + 12 * 3600
            pool = [
                s
                for s, v in self.m.skus.items()
                if v["launched"] <= at < v["discontinued"]
                and set(v["sports"]) & set(info["sports"])
            ]
            if not pool:
                pool = [
                    s for s, v in self.m.skus.items() if v["launched"] <= at < v["discontinued"]
                ]
            for _ in range(clicks - self.ad_used[date, campaign, region]):
                self.opportunity(
                    at + self.rng.randrange(8 * 3600),
                    dict(channel=info["channel"], region=region),
                    self.rng.choice(pool),
                    campaign=campaign,
                )
