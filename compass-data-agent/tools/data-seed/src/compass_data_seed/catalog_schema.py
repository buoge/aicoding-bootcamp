"""Validated, immutable business inputs authored by a model and reviewed as data."""

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

CATALOG_VERSION = "retail-semantic-1"
CATALOG_FILES = (
    "products.jsonl",
    "families.json",
    "business.json",
    "customers.json",
    "geography.json",
    "commerce.json",
    "language.json",
)
QUOTAS = {101: (120, 960), 102: (20, 160), 103: (20, 160)}


def canonical_digest(value) -> str:
    content = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(content.encode()).hexdigest()


def default_catalog() -> Path:
    return Path(__file__).parent / "catalogs" / "retail"


def read_catalog_data(root: Path) -> dict:
    result = {
        name[:-5]: json.loads((root / name).read_text())
        for name in CATALOG_FILES
        if name.endswith(".json")
    }
    result["products"] = [
        json.loads(line)
        for line in (root / "products.jsonl").read_text().splitlines()
        if line.strip()
    ]
    return result


def product_family(data: dict, product: dict) -> dict:
    """Resolve reviewed per-product specifications over the family defaults."""
    return {
        **data["families"][product["family"]],
        **data["business"].get("product_specifications", {}).get(product["key"], {}),
    }


def validate_product(row: dict, data: dict) -> list[str]:
    errors = []
    if not isinstance(row, dict):
        return ["Product must be an object"]
    required = {
        "key",
        "tenant_id",
        "brand",
        "name",
        "family",
        "base_price_cent",
        "base_weight_grams",
        "audience",
        "season",
        "variant_count",
    }
    if set(row) != required:
        return ["Product fields must exactly match the catalog contract"]
    for field in ("key", "brand", "name", "family", "audience", "season"):
        if not isinstance(row[field], str):
            return [f"{field} must be text"]
    for field in ("tenant_id", "base_price_cent", "base_weight_grams", "variant_count"):
        if type(row[field]) is not int:
            return [f"{field} must be an integer"]
    tenant = row["tenant_id"]
    if tenant not in QUOTAS:
        errors.append("Unknown tenant")
    if row["brand"] not in data["business"]["brands"].get(str(tenant), {}):
        errors.append("Brand is not owned by this tenant")
    family = data["families"].get(row["family"])
    if family is None:
        errors.append("Unknown product family")
    name = row["name"]
    if not isinstance(name, str) or len(name) < 6 or not name.startswith(row["brand"] + "·"):
        errors.append("Product must have its own descriptive name and brand")
    elif re.search(r"(?:商品|运动服饰|运动鞋履|系列)\d|\d{3}-\d+$", name):
        errors.append("Placeholder product name")
    for field, lower, upper in (
        ("base_price_cent", 500, 2000000),
        ("base_weight_grams", 5, 100000),
        ("variant_count", 1, 40),
    ):
        if type(row[field]) is not int or not lower <= row[field] <= upper:
            errors.append(f"Invalid {field}")
    if row["audience"] not in {"UNISEX", "MALE", "FEMALE"}:
        errors.append("Invalid audience")
    if row["season"] not in {"ALL", "SUMMER", "WINTER", "SPRING_AUTUMN"}:
        errors.append("Invalid season")
    if family and isinstance(name, str):
        recipe = product_family(data, row)
        values = recipe.get("variant_values")
        if values is not None:
            if (
                not isinstance(values, list)
                or any(not isinstance(v, str) for v in values)
                or len(set(values)) != len(values)
                or len(values) < row["variant_count"]
            ):
                errors.append("Invalid or insufficient explicit variant grid")
            elif family["axis"] == "BALL":
                legal = (
                    {"6号", "7号"}
                    if row["family"] == "basketball"
                    else {"2号", "3号", "4号", "5号"}
                )
                if not set(values) <= legal:
                    errors.append("Illegal ball size for product family")
        if row["family"] == "tennis_ball" and not 56 <= row["base_weight_grams"] <= 59:
            errors.append("Tennis ball base weight must describe one ball")
        if row["family"] == "shuttlecock" and not 5 <= row["base_weight_grams"] <= 6:
            errors.append("Shuttlecock base weight must describe one shuttle")
        if "羽绒" in name and "羽绒" not in family["material"]:
            errors.append("Down product requires down material")
        if family["category"] == 3 and "游泳" in family["sports"]:
            errors.append("Cycling equipment cannot carry swimming sport")
        if family["axis"] == "ALPHA" and row["variant_count"] > 6:
            if row["variant_count"] not in {8, 12, 16}:
                errors.append("Unsupported clothing size grid")
    return errors


def validate_catalog_data(data: dict) -> dict:
    errors = []
    keys, names = set(), set()
    sports = set(data["business"]["sports"])
    for family, spec in data["families"].items():
        if not set(spec["sports"]) <= sports or not 0 <= spec["category"] <= 7:
            errors.append(f"Invalid family {family}")
    for row in data["products"]:
        errors.extend(f"{row.get('key')}: {error}" for error in validate_product(row, data))
        if row["key"] in keys or row["name"] in names:
            errors.append(f"Duplicate identity/name: {row['key']}")
        keys.add(row["key"])
        names.add(row["name"])
    if errors:
        raise ValueError("Semantic catalog rejected: " + "; ".join(errors))
    for tenant, quota in QUOTAS.items():
        products = [p for p in data["products"] if p["tenant_id"] == tenant]
        actual = len(products), sum(p["variant_count"] for p in products)
        if actual != quota:
            errors.append(f"Tenant {tenant}: expected {quota}, found {actual}")
        if {data["families"][p["family"]]["category"] for p in products} != set(range(8)):
            errors.append(f"Missing product category: {tenant}")
    for role, key in data["business"]["scenario_products"].items():
        if key not in keys:
            errors.append(f"Missing scenario product: {role}")
    for key, spec in data["business"].get("product_specifications", {}).items():
        if key not in keys or set(spec) - {
            "variant_values",
            "base_capacity_liters",
            "capacity_people",
        }:
            errors.append(f"Invalid product specification: {key}")
    if len(data["customers"]["personas"]) < 12:
        errors.append("At least 12 customer archetypes required")
    for persona in data["customers"]["personas"]:
        if not set(persona["sports"]) <= sports or len(persona["channel_weights"]) != 7:
            errors.append(f"Invalid customer archetype: {persona['key']}")
    geo = {(c["city"], d) for c in data["geography"]["cities"] for d in c["districts"]}
    for sites in data["business"]["sites"].values():
        for site in sites:
            if (site[1], site[2]) not in geo:
                errors.append(f"Unknown store location: {site[0]}")
    if errors:
        raise ValueError("Semantic catalog rejected: " + "; ".join(errors))
    return {
        "products": len(keys),
        "skus": sum(p["variant_count"] for p in data["products"]),
        "families": len(data["families"]),
        "personas": len(data["customers"]["personas"]),
        "cities": len(data["geography"]["cities"]),
        "violations": 0,
    }


def freeze_catalog(root: Path, provenance: dict) -> dict:
    if (root / "manifest.json").exists():
        raise ValueError("Catalog already frozen; create a new candidate directory")
    result = validate_catalog_data(read_catalog_data(root))
    if provenance.get("source") not in {"codex_conversation", "model_api"}:
        raise ValueError("Explicit model provenance is required")
    manifest = {
        "schema_version": CATALOG_VERSION,
        "state": "FROZEN",
        "provenance": provenance,
        "files": {f: hashlib.sha256((root / f).read_bytes()).hexdigest() for f in CATALOG_FILES},
        "validation": result,
    }
    manifest["content_hash"] = canonical_digest(manifest)
    (root / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


@dataclass(frozen=True)
class Catalog:
    root: Path
    data: dict
    manifest: dict

    @classmethod
    def read(cls, root: Path | None = None):
        root = root or default_catalog()
        manifest = json.loads((root / "manifest.json").read_text())
        if manifest.get("schema_version") != CATALOG_VERSION or manifest.get("state") != "FROZEN":
            raise ValueError("Frozen semantic catalog required")
        if (
            canonical_digest({k: v for k, v in manifest.items() if k != "content_hash"})
            != manifest["content_hash"]
        ):
            raise ValueError("Catalog manifest hash mismatch")
        if set(manifest["files"]) != set(CATALOG_FILES):
            raise ValueError("Incomplete semantic catalog")
        for name, expected in manifest["files"].items():
            if hashlib.sha256((root / name).read_bytes()).hexdigest() != expected:
                raise ValueError(f"Frozen catalog changed: {name}")
        data = read_catalog_data(root)
        validate_catalog_data(data)
        return cls(root, data, manifest)
