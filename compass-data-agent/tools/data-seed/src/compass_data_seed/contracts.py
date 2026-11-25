"""Strict package/profile contracts and deterministic hashes."""

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

from .schema import ddl, tables

VERSION = "compass-retail-3"
GENERATOR_VERSION = "3.0.0"
REGISTERED_SEEDS = (20261019, 20261117, 20261213)
REFERENCE_TIME = "2025-12-15T01:00:00+00:00"


def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()


def digest(value) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def file_hash(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def code_hash() -> str:
    root = Path(__file__).parent
    return digest(
        {
            str(p.relative_to(root)): file_hash(p)
            for p in sorted(root.rglob("*"))
            if p.suffix in {".py", ".sql"}
        }
    )


@dataclass(frozen=True)
class Profile:
    name: str
    seed: int
    tenants: tuple[dict, ...]
    snapshot_start: str
    scenarios: tuple[str, ...]
    order_start: str = "2023-01-01"
    order_end_exclusive: str = "2026-01-01"
    simulation_end_exclusive: str = "2026-04-01"
    reference_time: str = REFERENCE_TIME
    source_mode: str = "PURE_SYNTHETIC"
    ingestion_mode: str = "continuous"

    @classmethod
    def read(cls, name: str, seed: int | None = None):
        if name not in {"fixture", "dev", "demo", "diagnostic"}:
            raise ValueError(
                "Supported profiles: fixture, dev, demo, diagnostic; P6 extensions are not enabled"
            )
        obj = json.loads((Path(__file__).parent / "profiles" / f"{name}.json").read_text())
        obj["tenants"] = tuple(obj["tenants"])
        obj["scenarios"] = tuple(obj["scenarios"])
        if seed is not None:
            if seed not in REGISTERED_SEEDS:
                raise ValueError("Profile seed is not preregistered")
            obj["seed"] = seed
        result = cls(**obj)
        if name == "demo" and [t["orders"] for t in result.tenants] != [90000, 5000, 5000]:
            raise ValueError("Demo quota conflict")
        return result

    def to_dict(self):
        from dataclasses import asdict

        return asdict(self)


def safe_path(root: Path, relative: str) -> Path:
    path = Path(relative)
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise ValueError(f"Unsafe package path: {relative}")
    resolved = (root / path).resolve()
    if not resolved.is_relative_to(root.resolve()) or (root / path).is_symlink():
        raise ValueError(f"Package path escapes controlled root: {relative}")
    return resolved


def release_name(value: str) -> str:
    if not re.fullmatch(r"[a-z][a-z0-9_-]{0,47}", value):
        raise ValueError("release_id must be 1–48 lowercase ASCII letters/digits/_/-")
    return value


def validate_manifest(
    root: Path, *, check_rows: bool = True, catalog_root: Path | None = None
) -> dict:
    import csv

    manifest = json.loads((root / "manifest.json").read_text())
    if manifest.get("package_kind") != "business" or manifest.get("schema_version") != VERSION:
        raise ValueError("Unsupported package kind or schema version")
    release_name(manifest["release_id"])
    if manifest.get("generator_version") != GENERATOR_VERSION:
        raise ValueError("Unsupported generator version")
    profile = manifest.get("data_profile", {})
    if digest(profile) != digest(
        Profile.read(profile.get("name", ""), profile.get("seed")).to_dict()
    ):
        raise ValueError("Profile does not match the registered production configuration")
    if (
        manifest.get("profile_sha256") != digest(profile)
        or manifest.get("source_mode") != profile["source_mode"]
        or manifest.get("seed") != profile["seed"]
        or manifest.get("reference_time") != profile["reference_time"]
        or manifest.get("package_id") != manifest["release_id"]
    ):
        raise ValueError("Profile metadata conflict")
    if manifest.get("layout") != "single-source":
        raise ValueError("This release supports single-source only")
    if manifest.get("schema_sha256") != hashlib.sha256(ddl().encode()).hexdigest():
        raise ValueError("Canonical schema hash mismatch")
    from .catalog_schema import Catalog

    catalog = Catalog.read(catalog_root)
    if manifest.get("semantic_generation") != catalog.manifest:
        raise ValueError("Frozen semantic catalog hash/provenance mismatch")
    expected = manifest["content_hash"]
    if digest({k: v for k, v in manifest.items() if k != "content_hash"}) != expected:
        raise ValueError("Manifest content hash mismatch")
    paths, assets = set(), set()
    for entry in manifest["files"]:
        path = safe_path(root, entry["relative_path"])
        if str(path) in paths:
            raise ValueError("Duplicate file path")
        paths.add(str(path))
        asset = entry["logical_asset_id"]
        if not isinstance(entry["row_count"], int) or entry["row_count"] < 0:
            raise ValueError("Invalid row count")
        if (
            asset
            in {
                "ops.dataset_release",
                "ops.generation_run",
                "ops.file_manifest",
                "sec.principal",
                "sec.principal_region",
            }
            and entry["row_count"]
        ):
            raise ValueError("Deployment metadata must be an empty template")
        if (
            entry["visibility"] not in {"public", "metadata"}
            or "private" in Path(entry["relative_path"]).parts
        ):
            raise ValueError("Private oracle is not a business asset")
        if entry["format"] not in {"csv", "json", "markdown", "sql"}:
            raise ValueError("Unsupported file format")
        if file_hash(path) != entry["sha256"]:
            raise ValueError(f"File hash mismatch: {entry['relative_path']}")
        if asset in tables():
            if entry["format"] != "csv":
                raise ValueError("Table files must be CSV")
            assets.add(asset)
            with path.open(newline="") as stream:
                rows = csv.reader(stream)
                if next(rows) != list(tables()[asset]):
                    raise ValueError(f"Column order mismatch: {asset}")
                if check_rows and sum(1 for _ in rows) != entry["row_count"]:
                    raise ValueError(f"Row count mismatch: {asset}")
        elif not asset.startswith("scenario.") and asset not in {"dictionary", "reference_queries"}:
            raise ValueError(f"Unregistered asset: {asset}")
    if assets != set(tables()):
        raise ValueError(
            "Package must enumerate all registered tables, including empty deployment tables"
        )
    actual = {
        str(p.resolve()) for p in root.rglob("*") if p.is_file() and p.name != "manifest.json"
    }
    if actual != paths:
        raise ValueError("Unregistered files in business package")
    return manifest
