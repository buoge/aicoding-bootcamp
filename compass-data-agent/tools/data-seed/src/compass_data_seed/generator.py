"Produce immutable candidate packages; publishing requires independent SQL validation."

import hashlib
import json
import resource
import shutil
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from .catalog_schema import Catalog
from .contracts import (
    GENERATOR_VERSION,
    VERSION,
    Profile,
    code_hash,
    digest,
    file_hash,
    release_name,
)
from .master import Master, calendar
from .reports import reports
from .scenarios import build_scenarios
from .schema import ddl
from .schema import dictionary as render_dictionary
from .semantic import MissingSemantic, record_missing_semantic
from .simulation import Simulation
from .storage import END, Sink, stamp


def generate(profile_name: str, output: Path, release_id: str, *, seed=None, catalog=None) -> dict:
    profile = Profile.read(profile_name, seed)
    semantic_catalog = Catalog.read(catalog)
    release_name(release_id)
    started = time.monotonic()
    actual_started = datetime.now(UTC).isoformat()
    private = output.parent / (output.name + "-private")
    if private.exists():
        raise ValueError("Private output directory already exists; select a fresh output path")
    sink = Sink(output)
    try:
        source_hash = code_hash()
        private.mkdir(mode=0o700)
        source_root = private / "source"
        source_root.mkdir(parents=True)
        shutil.copytree(
            Path(__file__).parent,
            source_root / "compass_data_seed",
            ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
        )
        shutil.copytree(semantic_catalog.root, private / "semantic-input")
        calendar(sink)
        simulations = []
        for quota in profile.tenants:
            print(
                f"Generating {profile_name} tenant {quota['tenant_id']}: {quota['orders']} orders",
                flush=True,
            )
            master = Master(sink, profile, quota, semantic_catalog)
            master.build(release_id)
            (private / f"customer-traits-{master.tenant}.json").write_text(
                json.dumps(master.customers, ensure_ascii=False)
            )
            (private / f"scenario-bindings-{master.tenant}.json").write_text(
                json.dumps(
                    dict(
                        products=master.product_keys,
                        members=master.scenario_customer_keys,
                        monitor_skus=master.monitor_pool,
                    )
                )
            )
            simulation = Simulation(master).run()
            reports(simulation)
            simulations.append(simulation)
        print("Generating acquisition batches and watermarks", flush=True)
        sink.ingestion(
            [q["tenant_id"] for q in profile.tenants],
            compact=profile.ingestion_mode == "referenced-batches",
        )
        files = sink.finish()
        private = output.parent / (output.name + "-private")
        files += build_scenarios(output, private, profile, simulations)
        reference = output / "reference.sql"
        reference.write_text((Path(__file__).parent / "sql/reference.sql").read_text())
        files.append(
            dict(
                relative_path="reference.sql",
                sha256=file_hash(reference),
                format="sql",
                schema_ref="reference_queries",
                row_count=0,
                visibility="public",
                logical_asset_id="reference_queries",
            )
        )
        dictionary = output / "dictionary.md"
        dictionary.write_text(render_dictionary())
        files.append(
            dict(
                relative_path="dictionary.md",
                sha256=file_hash(dictionary),
                format="markdown",
                schema_ref="dictionary",
                row_count=0,
                visibility="public",
                logical_asset_id="dictionary",
            )
        )
        manifest = dict(
            profile_sha256=digest(profile.to_dict()),
            knowledge_cutoff=stamp(END + 86400),
            schema_version=VERSION,
            semantic_generation=semantic_catalog.manifest,
            package_kind="business",
            package_id=release_id,
            release_id=release_id,
            generator_version=GENERATOR_VERSION,
            generator_source_sha256=source_hash,
            schema_sha256=hashlib.sha256(ddl().encode()).hexdigest(),
            seed=profile.seed,
            data_profile=profile.to_dict(),
            reference_time=profile.reference_time,
            layout="single-source",
            source_mode="PURE_SYNTHETIC",
            files=files,
        )
        manifest["content_hash"] = digest(manifest)
        if code_hash() != source_hash:
            raise ValueError("Generator source changed during production; select a fresh output")
        (output / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
        )
        private = output.parent / (output.name + "-private")
        private.mkdir(mode=0o700, exist_ok=True)
        (private / "fixture-map.json").write_text(
            json.dumps({s.m.tenant: s.fixture_map for s in simulations}, indent=2)
        )
        report = dict(
            release_id=release_id,
            content_hash=manifest["content_hash"],
            actual_started_at=actual_started,
            actual_finished_at=datetime.now(UTC).isoformat(),
            elapsed_seconds=round(time.monotonic() - started, 3),
            peak_rss_bytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            * (1 if sys.platform == "darwin" else 1024),
            row_counts=dict(sorted(sink.counts.items())),
            bytes=sum(p.stat().st_size for p in output.rglob("*") if p.is_file()),
        )
        (private / "generation-report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n"
        )
        return report
    except MissingSemantic as error:
        path = record_missing_semantic(
            private / "expansion-requests", error.kind, error.slots, error.context
        )
        (private / "run-state.json").write_text(
            json.dumps(
                dict(
                    state="NEEDS_EXPANSION",
                    request=str(path),
                    catalog_hash=semantic_catalog.manifest["content_hash"],
                )
            )
        )
        raise
    finally:
        sink.close()
