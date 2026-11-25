"FIFO lots and explicit physical/reservation buckets driven by the event queue."

from collections import defaultdict, deque

from .storage import DAY, END, START, local_date, stamp


class Inventory:
    def __init__(self, master, schedule):
        self.m, self.schedule = master, schedule
        self.lots = {}
        self.by_pair = defaultdict(list)
        self.buckets = defaultdict(
            lambda: [0, 0, 0, 0, 0]
        )  # sellable, quarantine, reserved, transit, damaged
        self.knowledge = defaultdict(int)
        self.pending = defaultdict(int)
        self.sequence = 0
        self.observed_demand = defaultdict(deque)
        weights = sum(s["weight"] for s in master.skus.values())
        self.forecast = {
            sku: master.q["orders"] * 1.8 / 1096 * s["weight"] / weights
            for sku, s in master.skus.items()
        }

    def move(
        self,
        at,
        site,
        sku,
        kind,
        deltas,
        source_kind,
        source_id,
        *,
        lot=None,
        doc=None,
        unit=None,
        ret=None,
        leg=1,
        txn=None,
        floor=0,
    ):
        key = site, sku
        self.sequence += 1
        buckets = self.buckets[key]
        for i, n in enumerate(deltas):
            buckets[i] += n
        if min(buckets) < 0 or buckets[2] > buckets[0]:
            raise ValueError(
                f"Inventory invariant violated {self.m.tenant} {key} {kind}: {buckets}"
            )
        if lot is not None:
            self.lots[lot]["sellable"] += deltas[0]
            self.lots[lot]["reserved"] += deltas[2]
            if self.lots[lot]["sellable"] < self.lots[lot]["reserved"]:
                raise ValueError("FIFO lot over-reserved")
        known = self.m.emit(
            "inventory_movement",
            at,
            floor=floor,
            movement_id=self.sequence,
            site_id=site,
            region_id=self.m.sites[site]["region"],
            sku_id=sku,
            lot_id=lot,
            inventory_doc_line_id=doc,
            order_unit_id=unit,
            return_item_id=ret,
            movement_type=kind,
            sellable_delta=deltas[0],
            quarantine_delta=deltas[1],
            reserved_delta=deltas[2],
            in_transit_delta=deltas[3],
            damaged_delta=deltas[4],
            event_at=stamp(at),
            event_seq=self.sequence,
            business_txn_id=txn or source_id,
            source_kind=source_kind,
            source_event_id=source_id,
            source_leg_no=leg,
        )
        self.knowledge[key] = max(known, self.knowledge[key])
        return known

    def lot(self, at, site, sku, origin, parent=None):
        lot = self.m.id("lot")
        cost_id, cost = (None, self.lots[parent]["cost"]) if parent else self.m.cost_at(sku, at)
        self.lots[lot] = dict(site=site, sku=sku, cost=cost, sellable=0, reserved=0, received=at)
        self.by_pair[site, sku].append(lot)
        self.m.emit(
            "inventory_lot",
            at,
            lot_id=lot,
            site_id=site,
            region_id=self.m.sites[site]["region"],
            sku_id=sku,
            parent_lot_id=parent,
            cost_id=cost_id,
            received_at=stamp(at),
            unit_cost_cent=cost,
            origin_type=origin,
        )
        return lot

    def document(self, at, due, site, sku, qty, kind, from_site=None, reason="FORECAST"):
        doc = self.m.id("inventory_doc")
        line = self.m.id("inventory_doc_line")
        region = self.m.sites[site]["region"]
        self.m.emit(
            "inventory_document",
            at,
            inventory_doc_id=doc,
            document_no=f"DOC{doc}",
            doc_type=kind,
            from_site_id=from_site,
            to_site_id=site,
            region_id=region,
            created_at=stamp(at),
            planned_at=stamp(due),
            reason_code=reason,
        )
        self.m.emit(
            "inventory_document_line",
            at,
            inventory_doc_line_id=line,
            inventory_doc_id=doc,
            region_id=region,
            sku_id=sku,
            quantity=qty,
        )
        return line

    def supply(self, at, site, sku, qty, opening=False, *, planned=None, actual=None, notice=None):
        due = (
            planned
            if planned is not None
            else at
            if opening
            else at + (4 + self.m.rng.randrange(6)) * DAY
        )
        from .world import entity_rng

        if actual is None:
            rng = entity_rng(
                self.m.profile.seed, self.m.tenant, [site, sku, at], "supplier-arrival"
            )
            actual = (
                due
                if opening or self.m.profile.name != "diagnostic"
                else due + rng.choices([0, DAY, 2 * DAY, 4 * DAY], [75, 14, 8, 3])[0]
            )
        line = self.document(at, due, site, sku, qty, "OPENING" if opening else "PURCHASE")
        if opening:
            lot = self.lot(at, site, sku, "OPENING")
            self.move(
                at,
                site,
                sku,
                "OPENING",
                [qty, 0, 0, 0, 0],
                "DOCUMENT_LINE",
                line,
                lot=lot,
                doc=line,
            )
        else:
            self.pending[site, sku] += qty
            self.move(
                at,
                site,
                sku,
                "TRANSIT_IN",
                [0, 0, 0, qty, 0],
                "DOCUMENT_LINE",
                line,
                doc=line,
                leg=1,
            )
            if actual > due:
                notified = notice if notice is not None else max(at, due - DAY)
                self.m.emit(
                    "procurement_revision",
                    notified,
                    inventory_doc_line_id=line,
                    revision_no=1,
                    region_id=self.m.sites[site]["region"],
                    notified_at=stamp(notified),
                    revised_due_at=stamp(actual),
                    reason_code="SUPPLIER_DELAY",
                    notice_text="供应商发运排期调整，预计到仓时间按本次通知更新，采购单原承诺日期保留。",
                )
            self.schedule(actual, 0, self.receive, (site, sku, qty, line))

    def receive(self, at, args):
        site, sku, qty, line = args
        self.pending[site, sku] -= qty
        lot = self.lot(at, site, sku, "PURCHASE")
        self.move(
            at,
            site,
            sku,
            "RECEIPT",
            [qty, 0, 0, -qty, 0],
            "DOCUMENT_LINE",
            line,
            lot=lot,
            doc=line,
            leg=2,
        )

    def initialize(self):
        for site, skus in self.m.assortments.items():
            for sku in skus:
                at = max(START, self.m.sites[site]["opened"], self.m.skus[sku]["launched"])
                self.schedule(at, 0, self.opening, (site, sku))
        self.schedule(START + DAY, 0, self.review, None)
        # A planned campaign buffer, fixed before realized monitor orders exist.
        if self.m.profile.name == "demo" and self.m.tenant == 101:
            from .storage import day_start

            self.schedule(day_start("2025-11-01"), 0, self.campaign_supply, None)
        self.schedule(START + 2 * DAY, 0, self.transfer, None)
        from .storage import day_start

        self.schedule(day_start("2025-09-01"), 0, self.boundary_supply, None)

    def opening(self, at, args):
        site, sku = args
        if sku == self.m.stockout_sku:
            return
        target = max(
            3, round(self.forecast[sku] * (35 if self.m.sites[site]["kind"] == "WAREHOUSE" else 21))
        )
        self.supply(at, site, sku, 100 if self.m.profile.name == "fixture" else target, True)

    def boundary_supply(self, at, args):
        self.supply(at, self.m.q["stores"] + 1, self.m.baseline_sku, 100)

    def campaign_supply(self, at, args):
        site = self.m.q["stores"] + 1
        for sku in self.m.monitor_pool:
            self.supply(at, site, sku, 10000 // len(self.m.monitor_pool) + 100)

    def observe(self, at, sku, quantity, known):
        self.observed_demand[sku].append((at, quantity, known))

    def review(self, at, args):
        for sku, values in self.observed_demand.items():
            while values and values[0][0] < at - 28 * DAY:
                values.popleft()
            if at > START + 28 * DAY:
                observed = sum(q for _, q, known in values if known <= at) / 28
                self.forecast[sku] = 0.75 * self.forecast[sku] + 0.25 * observed
        for site, skus in self.m.assortments.items():
            if self.m.sites[site]["opened"] > at:
                continue
            for sku in skus:
                if not self.m.skus[sku]["launched"] <= at < self.m.skus[sku]["discontinued"]:
                    continue
                from .diagnostic import SUPPLY_BEGIN, SUPPLY_END

                if (
                    self.m.profile.name == "diagnostic"
                    and self.m.tenant == 101
                    and site == 7
                    and sku == self.m.stockout_sku
                    and SUPPLY_BEGIN <= at < SUPPLY_END
                ):
                    continue
                position = self.available(site, sku) + self.pending[site, sku]
                minimum = max(1, round(self.forecast[sku] * 10))
                target = max(
                    3,
                    round(
                        self.forecast[sku]
                        * (35 if self.m.sites[site]["kind"] == "WAREHOUSE" else 21)
                    ),
                )
                if position < minimum and at < END - 14 * DAY:
                    self.supply(at, site, sku, target - position)
        if at + 7 * DAY < END:
            self.schedule(at + 7 * DAY, 0, self.review, None)

    def available(self, site, sku):
        b = self.buckets[site, sku]
        return b[0] - b[2]

    def choose(self, site, sku):
        for lot in self.by_pair[site, sku]:
            if self.lots[lot]["sellable"] > self.lots[lot]["reserved"]:
                return lot
        raise ValueError("Allocation without FIFO stock")

    def transfer(self, at, args):
        if args is not None:
            for _ in range(args["qty"]):
                self.transfer_one(at, args["src"], args["dst"], args["sku"])
            return
        src = self.m.q["stores"] + 1
        dst = 1
        sku = next(iter(self.m.assortments[dst]))
        self.transfer_one(at, src, dst, sku)

    def transfer_one(self, at, src, dst, sku):
        if self.available(src, sku) < 1:
            return
        parent = self.choose(src, sku)
        line = self.document(at, at + 2 * DAY, dst, sku, 1, "TRANSFER", src)
        self.move(
            at,
            src,
            sku,
            "TRANSFER_OUT",
            [-1, 0, 0, 0, 0],
            "DOCUMENT_LINE",
            line,
            lot=parent,
            doc=line,
            leg=1,
        )
        self.move(
            at, dst, sku, "TRANSIT_IN", [0, 0, 0, 1, 0], "DOCUMENT_LINE", line, doc=line, leg=2
        )
        self.schedule(at + 2 * DAY, 0, self.transfer_in, (dst, sku, parent, line))

    def transfer_in(self, at, args):
        dst, sku, parent, line = args
        lot = self.lot(at, dst, sku, "TRANSFER", parent)
        self.move(
            at,
            dst,
            sku,
            "TRANSFER_IN",
            [1, 0, 0, -1, 0],
            "DOCUMENT_LINE",
            line,
            lot=lot,
            doc=line,
            leg=3,
        )

    def snapshot(self, at, args):
        for site, skus in self.m.assortments.items():
            if self.m.sites[site]["opened"] > at:
                continue
            for sku in skus:
                if self.m.skus[sku]["launched"] > at:
                    continue
                b = self.buckets[site, sku]
                common = dict(
                    snapshot_date=local_date(at),
                    site_id=site,
                    region_id=self.m.sites[site]["region"],
                    sku_id=sku,
                    as_of=stamp(at),
                )
                self.m.emit(
                    "inventory_snapshot",
                    at,
                    floor=self.knowledge[site, sku],
                    **common,
                    sellable_qty=b[0],
                    quarantine_qty=b[1],
                    reserved_qty=b[2],
                    in_transit_qty=b[3],
                    damaged_qty=b[4],
                    available_qty=b[0] - b[2],
                )
                value = sum(
                    self.lots[lot]["sellable"] * self.lots[lot]["cost"]
                    for lot in self.by_pair[site, sku]
                )
                self.m.emit(
                    "inventory_valuation_snapshot",
                    at,
                    floor=self.knowledge[site, sku],
                    **common,
                    sellable_value_cent=value,
                )
        if at + DAY < END:
            self.schedule(at + DAY, 9, self.snapshot, None)
