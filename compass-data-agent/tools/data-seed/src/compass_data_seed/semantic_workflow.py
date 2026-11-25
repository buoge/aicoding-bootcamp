"""Explicit model-tool calls and frozen revisions; no mutable mid-run world updates."""

import hashlib
import json
import shutil
from pathlib import Path

from .catalog_schema import CATALOG_FILES, Catalog, freeze_catalog, validate_product
from .semantic import ModelConfig, SemanticGenerator


def product_schema():
    strings = ["key", "brand", "name", "family", "audience", "season"]
    integers = ["tenant_id", "base_price_cent", "base_weight_grams", "variant_count"]
    properties = {k: {"type": "string"} for k in strings}
    properties.update({k: {"type": "integer"} for k in integers})
    return {
        "type": "object",
        "properties": {
            "candidates": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": properties,
                    "required": strings + integers,
                    "additionalProperties": False,
                },
            }
        },
        "required": ["candidates"],
        "additionalProperties": False,
    }


def request_products(parent, slots):
    if not 1 <= len(slots) <= 20 or len(slots) != len(set(slots)):
        raise ValueError("Provide 1–20 distinct product keys for revision")
    products = {p["key"]: p for p in parent.data["products"]}
    if not set(slots) <= products.keys():
        raise ValueError("Revision slots must name existing keys; tenant quotas remain fixed")
    return dict(
        task_kind="product_revision",
        requested_slots=slots,
        accepted_digest=parent.manifest["content_hash"],
        existing_names=[p["name"] for p in products.values() if p["key"] not in slots],
        constraints=dict(
            templates=[products[k] for k in slots],
            families=parent.data["families"],
            brands=parent.data["business"]["brands"],
            rule=(
                "Keep keys, tenant ownership and variant counts; "
                "use concrete names and coherent physical attributes."
            ),
        ),
    )


def candidate_errors(parent, request, response):
    if (
        not isinstance(response, dict)
        or set(response) != {"candidates"}
        or not isinstance(response["candidates"], list)
    ):
        return ["Expected exactly one candidates array"]
    slots = request["requested_slots"]
    products = {p["key"]: p for p in parent.data["products"]}
    errors = []
    received = []
    names = {p["name"] for p in products.values() if p["key"] not in slots}
    for item in response["candidates"]:
        violations = validate_product(item, parent.data)
        errors.extend(violations)
        if violations:
            continue
        key = item["key"]
        received.append(key)
        if key not in slots:
            errors.append("Unrequested product key")
        elif any(item[f] != products[key][f] for f in ("tenant_id", "variant_count")):
            errors.append("Revision changed tenant or SKU quota")
        if item["name"] in names:
            errors.append("Duplicate accepted product name")
        names.add(item["name"])
    if sorted(received) != sorted(slots):
        errors.append("Missing or duplicate requested slots")
    return errors


def revise_products(
    parent_root: Path, slots: list[str], output: Path, *, response_path=None, cache=None
):
    parent = Catalog.read(parent_root)
    round_no = parent.manifest["provenance"].get("expansion_round", 0) + 1
    if round_no > 2:
        raise ValueError("Two semantic expansion rounds exhausted; review the coverage plan")
    if output.exists():
        raise ValueError("Revision output must be a new directory")
    request = request_products(parent, slots)
    if response_path:
        response = json.loads(Path(response_path).read_text())
        source = "codex_conversation"
        model = "explicitly imported conversation-authored response"
    else:
        if cache is None:
            raise ValueError("An explicit model cache directory is required")
        config = ModelConfig.from_environment()
        response = SemanticGenerator(config, cache).generate(
            request, product_schema(), lambda r: candidate_errors(parent, request, r)
        )
        source, model = "model_api", config.model
    errors = candidate_errors(parent, request, response)
    if errors:
        raise ValueError("Rejected semantic revision: " + "; ".join(errors))
    output.mkdir(parents=True)
    for filename in CATALOG_FILES:
        shutil.copyfile(parent.root / filename, output / filename)
    updates = {p["key"]: p for p in response["candidates"]}
    (output / "products.jsonl").write_text(
        "".join(
            json.dumps(updates.get(p["key"], p), ensure_ascii=False, sort_keys=True) + "\n"
            for p in parent.data["products"]
        )
    )
    manifest = freeze_catalog(
        output,
        dict(
            source=source,
            model=model,
            parent_hash=parent.manifest["content_hash"],
            expansion_round=round_no,
            api_call_performed=source == "model_api",
            request=request,
            response_sha256=hashlib.sha256(
                json.dumps(response, sort_keys=True, ensure_ascii=False).encode()
            ).hexdigest(),
        ),
    )
    return dict(
        state=manifest["state"],
        content_hash=manifest["content_hash"],
        expansion_round=round_no,
        output=str(output),
    )
