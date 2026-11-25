"""Relational master data compiled before realized sales are observed."""

import random
from collections import defaultdict
from datetime import date, timedelta

from .storage import DAY, END, START
from .world import build_master

CHANNEL_WEIGHTS = [22, 12, 18, 18, 12, 14, 4]
REGION_WEIGHTS = [29, 23, 17, 11, 6, 9, 5]
RETURNS = [0.13, 0.15, 0.06, 0.05, 0.05, 0.04, 0.07, 0.03]


class Master:
    def __init__(self, sink, profile, quota, catalog=None):
        self.sink, self.profile, self.q = sink, profile, quota
        self.tenant = quota["tenant_id"]
        self.catalog = catalog
        self.customers: dict = {}
        self.product_keys: dict = {}
        self.scenario_customer_keys: list[int] = []
        self.monitor_pool: list[int] = []
        self.prices: dict = {}
        self.costs: dict = {}
        self.rng = random.Random(profile.seed + self.tenant)
        self.skus, self.sites, self.assortments = {}, {}, {}
        self.identity_by_channel = defaultdict(list)
        self.identities, self.member_mini, self.promotions = {}, {}, {}
        self.campaigns = []
        self.next_ids = defaultdict(int)

    def id(self, name):
        self.next_ids[name] += 1
        return self.next_ids[name]

    def emit(self, table, at=None, floor=0, **row):
        return self.sink.emit(table, dict(tenant_id=self.tenant, **row), at, floor)

    def build(self, release):
        build_master(self, release)

    def price_at(self, sku, channel, at):
        for begin, end, key, amount in self.prices[sku, channel]:
            if begin <= at < end:
                return key, amount
        raise ValueError(f"No effective price for SKU {sku}, channel {channel}, time {at}")

    def cost_at(self, sku, at):
        for begin, end, key, amount in self.costs[sku]:
            if begin <= at < end:
                return key, amount
        raise ValueError(f"No effective cost for SKU {sku}, time {at}")


def calendar(sink):
    for n in range((END - START) // DAY):
        value = date(2023, 1, 1) + timedelta(days=n)
        iso = value.isocalendar()
        sink.emit(
            "core.calendar",
            dict(
                calendar_date=value.isoformat(),
                year_no=value.year,
                month_no=value.month,
                day_of_week=value.isoweekday(),
                iso_year=iso.year,
                iso_week=iso.week,
                is_weekend=value.isoweekday() >= 6,
                festival_code="DOUBLE_11"
                if (value.month, value.day) == (11, 11)
                else "MID_YEAR"
                if (value.month, value.day) == (6, 18)
                else "NONE",
            ),
        )
