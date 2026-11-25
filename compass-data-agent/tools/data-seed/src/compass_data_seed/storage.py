"""Bounded-memory CSV sink and simulated source acquisition schedule."""

import csv
import json
from collections import Counter, OrderedDict
from datetime import UTC, datetime
from pathlib import Path

from .contracts import file_hash
from .schema import tables

START = int(datetime(2022, 12, 31, 16, tzinfo=UTC).timestamp())
END = int(datetime(2026, 3, 31, 16, tzinfo=UTC).timestamp())
ORDER_END = int(datetime(2025, 12, 31, 16, tzinfo=UTC).timestamp())
DAY = 86400
SOURCES = {
    "OMS": 300,
    "WMS": 900,
    "POS": 3600,
    "ERP": 3600,
    "CRM": 1800,
    "WEB": 600,
    "ADS": DAY,
    "PIM": DAY,
}
SOURCE_TABLES = {
    "PIM": (
        "channel_listing assortment price_period cost_period campaign "
        "promotion experiment_definition intervention_definition"
    ),
    "CRM": (
        "customer customer_identity customer_identity_link "
        "experiment_assignment intervention_cohort"
    ),
    "WMS": (
        "inventory_lot inventory_document inventory_document_line "
        "procurement_revision stock_allocation_attempt inventory_movement inventory_snapshot "
        "inventory_valuation_snapshot shipment shipment_item "
        "shipment_event return_header return_item return_event"
    ),
    "ERP": "revenue_entry cost_entry order_fee target_monthly",
    "WEB": "web_session behavior_event experiment_exposure order_attribution price_exposure",
    "ADS": "campaign_daily channel_product_daily campaign_attribution_daily",
    "POS": "store_traffic_daily store_operating_day",
}
TABLE_SOURCE = {t: source for source, names in SOURCE_TABLES.items() for t in names.split()}


def stamp(seconds: int) -> str:
    return datetime.fromtimestamp(seconds, UTC).isoformat()


def local_date(seconds: int) -> str:
    return datetime.fromtimestamp(seconds + 8 * 3600, UTC).date().isoformat()


def instant(value: str) -> int:
    return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())


def day_start(value: str) -> int:
    return instant(value + "T00:00:00+08:00")


class Sink:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=False)
        self.handles = OrderedDict()
        self.counts = Counter()
        self.files = {}
        self.batch_counts = Counter()
        self.pending_at_observation = {}
        self.columns = {t: list(cols) for t, cols in tables().items()}
        self.required = {
            t: {c for c, spec in cols.items() if spec["required"]} for t, cols in tables().items()
        }

    def known(self, tenant: int, source: str, event_at: int, floor: int = 0):
        interval = SOURCES[source]
        slot = max(0, (event_at - START) // interval + 1)
        received = START + slot * interval
        # One declared OMS outage: arrivals are delayed by a day, never overwritten.
        if source == "OMS" and day_start("2025-09-28") < received <= day_start("2025-09-29"):
            received += DAY
        batch = (list(SOURCES).index(source) + 1) * 10_000_000 + slot
        return max(received, floor), batch

    def emit(self, table: str, row: dict, at: int | None = None, floor: int = 0) -> int:
        table = table if "." in table else "core." + table
        row = dict(row)
        available = at or START
        if "load_batch_id" in self.columns[table]:
            source = TABLE_SOURCE.get(table.split(".")[1], "OMS")
            available, batch = self.known(row["tenant_id"], source, at or START, floor)
            if available > END + DAY:
                raise ValueError(f"Event exceeds acquisition tail: {table} {stamp(available)}")
            row["available_at"] = stamp(available)
            row["load_batch_id"] = batch
            self.batch_counts[row["tenant_id"], batch] += 1
            event_at = at or START
            # Watermarks begin at START; pre-history buckets are never observed.
            observed = max(START, START + ((event_at - START) // DAY + 1) * DAY)
            while observed < available and observed <= END:
                key = row["tenant_id"], source, observed
                self.pending_at_observation[key] = min(
                    event_at, self.pending_at_observation.get(key, event_at)
                )
                observed += DAY
        missing = self.required[table] - row.keys()
        unknown = row.keys() - set(self.columns[table])
        if missing or unknown:
            raise ValueError(f"{table}: missing={missing}, unknown={unknown}")
        month = local_date(at)[:7] if at else "all"
        relative = f"tables/{table}/{month}.csv"
        if relative not in self.files:
            path = self.root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("w", newline="") as f:
                csv.writer(f, lineterminator="\n").writerow(self.columns[table])
            self.files[relative] = {"logical_asset_id": table, "row_count": 0}
        if relative not in self.handles:
            if len(self.handles) >= 64:
                _, (old, _) = self.handles.popitem(last=False)
                old.close()
            handle = (self.root / relative).open("a", newline="")
            self.handles[relative] = handle, csv.writer(handle, lineterminator="\n")
        self.handles.move_to_end(relative)
        values = []
        for col in self.columns[table]:
            value = row.get(col)
            if isinstance(value, bool):
                value = "true" if value else "false"
            values.append(value)
        self.handles[relative][1].writerow(values)
        self.files[relative]["row_count"] += 1
        self.counts[table] += 1
        return available

    def close(self):
        for handle, _ in self.handles.values():
            handle.close()
        self.handles.clear()

    def finish(self) -> list[dict]:
        self.close()
        for table, cols in self.columns.items():
            if table not in self.counts:
                relative = f"tables/{table}/all.csv"
                path = self.root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                with path.open("w", newline="") as f:
                    csv.writer(f, lineterminator="\n").writerow(cols)
                self.files[relative] = {"logical_asset_id": table, "row_count": 0}
        return [
            dict(
                relative_path=path,
                sha256=file_hash(self.root / path),
                format="csv",
                schema_ref=entry["logical_asset_id"],
                visibility="metadata"
                if not entry["logical_asset_id"].startswith("core.")
                else "public",
                **entry,
            )
            for path, entry in sorted(self.files.items())
        ]

    def ingestion(self, tenants, compact=False):
        for tenant in tenants:
            for source_index, (source, interval) in enumerate(SOURCES.items(), 1):
                slots = (
                    sorted(
                        {
                            b % 10_000_000
                            for t, b in self.batch_counts
                            if t == tenant and b // 10_000_000 == source_index
                        }
                    )
                    if compact
                    else range((END - START) // interval + 2)
                )
                by_day = {}
                for slot in slots:
                    end = START + slot * interval
                    bucket = max(0, (end - START - 1) // DAY + 1)
                    by_day.setdefault(bucket, []).append(slot)
                for slot in slots:
                    end = START + slot * interval
                    begin = end - interval if slot else START - 4 * 366 * DAY
                    received = end
                    if source == "OMS" and day_start("2025-09-28") < end <= day_start("2025-09-29"):
                        received += DAY
                    batch_id = source_index * 10_000_000 + slot
                    self.emit(
                        "ops.ingestion_batch",
                        dict(
                            tenant_id=tenant,
                            batch_id=batch_id,
                            source_system=source,
                            source_from=stamp(begin),
                            source_to=stamp(end),
                            received_at=stamp(received),
                            status="READY" if received == end else "DELAYED",
                            row_count=self.batch_counts.get((tenant, batch_id), 0),
                        ),
                        at=end,
                    )
                for day in range((END - START) // DAY + 1):
                    observed = START + day * DAY
                    scheduled = by_day.get(day, [])
                    expected = len(scheduled)
                    missing = []
                    complete = observed
                    for slot in scheduled:
                        end = START + slot * interval
                        received = end + (
                            DAY
                            if source == "OMS"
                            and day_start("2025-09-28") < end <= day_start("2025-09-29")
                            else 0
                        )
                        if received > observed:
                            missing.append(source_index * 10_000_000 + slot)
                            complete = min(complete, end - interval)
                    pending = self.pending_at_observation.get((tenant, source, observed), observed)
                    complete = min(complete, pending)
                    delayed = bool(missing) or complete < observed
                    self.emit(
                        "ops.source_watermark",
                        dict(
                            tenant_id=tenant,
                            source_system=source,
                            observed_at=stamp(observed),
                            complete_through=stamp(complete),
                            expected_batches=expected,
                            arrived_batches=expected - len(missing),
                            status="DELAYED" if delayed else "COMPLETE",
                            missing_batch_ids=json.dumps(missing),
                        ),
                        at=observed,
                    )
