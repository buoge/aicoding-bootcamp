"""Semantic contracts, bounded model failures and namespace isolation regressions."""

import copy
import io
import json
import urllib.error

import pytest
from compass_data_seed.catalog_schema import Catalog, product_family, validate_catalog_data
from compass_data_seed.contracts import Profile
from compass_data_seed.master import Master
from compass_data_seed.namespace import physical_schema, remap
from compass_data_seed.semantic import ModelConfig, SemanticGenerator, record_missing_semantic
from compass_data_seed.storage import DAY, START
from compass_data_seed.world import entity_rng, variants


def response(value, *, finish="stop", refusal=None):
    return io.BytesIO(
        json.dumps(
            {
                "id": "synthetic-test",
                "usage": {"total_tokens": 12},
                "choices": [
                    {
                        "finish_reason": finish,
                        "message": {"content": json.dumps(value), "refusal": refusal},
                    }
                ],
            }
        ).encode()
    )


def validate(value):
    return (
        [] if value == {"name": "山野·岚行软壳夹克"} else ["Concrete non-placeholder name required"]
    )


def test_catalog_has_exact_legal_variants_and_frozen_provenance():
    catalog = Catalog.read()
    assert catalog.manifest["provenance"]["source"] == "codex_conversation"
    assert catalog.manifest["provenance"]["api_call_performed"] is False
    sizes = {}
    for product in catalog.data["products"]:
        result = variants(
            product,
            product_family(catalog.data, product),
            entity_rng(1, product["tenant_id"], product["key"], "test"),
        )
        assert len(result) == product["variant_count"]
        assert len({(v["color"], v["size"]) for v in result}) == len(result)
        assert all(v["weight"] > 0 for v in result)
        sizes[product["tenant_id"]] = sizes.get(product["tenant_id"], 0) + len(result)
    assert sizes == {101: 960, 102: 160, 103: 160}


def test_physical_product_specs_are_consistent_with_the_named_product():
    data = Catalog.read().data
    for product in data["products"]:
        result = variants(
            product, product_family(data, product), entity_rng(1, 101, product["key"], "spec")
        )
        if product["family"] == "football":
            assert {v["size"] for v in result} <= {"2号", "3号", "4号", "5号"}
        if product["family"] == "basketball":
            assert {v["size"] for v in result} == {"6号", "7号"}
        if product["family"] in {"tennis_ball", "shuttlecock"}:
            lower, upper = (56, 59) if product["family"] == "tennis_ball" else (5, 6)
            for v in result:
                attrs = v["attributes"]
                assert lower <= attrs["unit_weight_grams"] <= upper
                assert v["weight"] == attrs["unit_weight_grams"] * attrs["pack_units"]
        if product["key"] == "101-p067":
            assert all(10 <= v["attributes"]["capacity_liters"] <= 25 for v in result)
        if "重装" in product["name"]:
            assert all(45 <= v["attributes"]["capacity_liters"] <= 75 for v in result)


def test_bad_ball_recipe_and_pack_weight_rejected():
    data = copy.deepcopy(Catalog.read().data)
    data["families"]["football"]["variant_values"][-1] = "7号"
    with pytest.raises(ValueError, match="Illegal ball size"):
        validate_catalog_data(data)
    data = copy.deepcopy(Catalog.read().data)
    next(p for p in data["products"] if p["family"] == "tennis_ball")["base_weight_grams"] = 174
    with pytest.raises(ValueError, match="one ball"):
        validate_catalog_data(data)


def test_invalid_provider_envelope_is_recorded_and_bounded(tmp_path, monkeypatch):
    monkeypatch.setenv("COMPASS_SEED_MODEL_API_KEY", "test-only-key")
    monkeypatch.setattr("urllib.request.urlopen", lambda *a, **kw: io.BytesIO(b"[]"))
    model = SemanticGenerator(ModelConfig("https://example.invalid/v1", "test-model"), tmp_path)
    with pytest.raises(ValueError, match="repair limit"):
        model.generate({"task_kind": "products"}, {"type": "object"}, validate)
    assert json.loads((tmp_path / "budget.json").read_text())["requests"] == 3


@pytest.mark.parametrize(
    "change",
    [
        {"name": "运动服饰103-1"},
        {"family": "unknown-family"},
        {"base_price_cent": -1},
        {"name": "山野·假羽绒夹克", "family": "running_top"},
        {"brand": "unregistered-brand"},
    ],
)
def test_semantically_invalid_catalog_is_rejected(change):
    data = copy.deepcopy(Catalog.read().data)
    data["products"][0].update(change)
    with pytest.raises(ValueError):
        validate_catalog_data(data)


def test_frozen_catalog_tamper_rejected(tmp_path):
    import shutil

    catalog = Catalog.read()
    target = tmp_path / "catalog"
    shutil.copytree(catalog.root, target)
    path = target / "products.jsonl"
    path.write_text(path.read_text() + "\n")
    with pytest.raises(ValueError, match="Frozen catalog changed"):
        Catalog.read(target)


def test_model_repairs_once_then_reuses_cache_without_credentials(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setenv("COMPASS_SEED_MODEL_API_KEY", "test-only-key")

    def invoke(request, timeout):
        calls.append(json.loads(request.data))
        return response({"name": "商品123"} if len(calls) == 1 else {"name": "山野·岚行软壳夹克"})

    monkeypatch.setattr("urllib.request.urlopen", invoke)
    model = SemanticGenerator(ModelConfig("https://example.invalid/v1", "test-model"), tmp_path)
    request = {"task_kind": "products", "requested_slots": ["softshell"]}
    accepted = model.generate(request, {"type": "object"}, validate)
    assert len(calls) == 2
    assert "Concrete non-placeholder" in calls[1]["messages"][1]["content"]
    monkeypatch.delenv("COMPASS_SEED_MODEL_API_KEY")
    monkeypatch.setattr(
        "urllib.request.urlopen", lambda *args, **kwargs: pytest.fail("Offline replay called model")
    )
    assert model.generate(request, {"type": "object"}, validate) == accepted
    assert json.loads((tmp_path / "budget.json").read_text())["requests"] == 2
    assert "test-only-key" not in "".join(p.read_text() for p in tmp_path.glob("*.json"))


def test_timeouts_do_not_refund_reserved_budget(tmp_path, monkeypatch):
    monkeypatch.setenv("COMPASS_SEED_MODEL_API_KEY", "test-only-key")
    calls = []

    def timeout(*args, **kwargs):
        calls.append(1)
        raise urllib.error.URLError("timeout")

    monkeypatch.setattr("urllib.request.urlopen", timeout)
    config = ModelConfig("https://example.invalid/v1", "test-model", max_requests=2)
    model = SemanticGenerator(config, tmp_path)
    with pytest.raises(ValueError, match="budget exhausted"):
        model.generate({"task_kind": "products"}, {"type": "object"}, validate)
    budget = json.loads((tmp_path / "budget.json").read_text())
    assert budget["requests"] == len(calls) == 2
    assert budget["reserved_tokens"] > config.max_output_tokens * 2
    assert not list(tmp_path.glob("*.accepted.json"))


@pytest.mark.parametrize(
    "finish,refusal,error", [("length", None, "repair limit"), ("stop", "refused", "refused")]
)
def test_truncation_and_refusal_never_publish(tmp_path, monkeypatch, finish, refusal, error):
    monkeypatch.setenv("COMPASS_SEED_MODEL_API_KEY", "test-only-key")
    monkeypatch.setattr(
        "urllib.request.urlopen",
        lambda *a, **kw: response({"name": "山野·岚行软壳夹克"}, finish=finish, refusal=refusal),
    )
    model = SemanticGenerator(ModelConfig("https://example.invalid/v1", "test-model"), tmp_path)
    with pytest.raises(ValueError, match=error):
        model.generate({}, {"type": "object"}, validate)
    assert not list(tmp_path.glob("*.accepted.json"))


def test_missing_material_request_is_bounded_and_repeatable(tmp_path):
    path = record_missing_semantic(tmp_path, "products", ["30L hiking pack"], {"tenant": 101})
    assert (
        record_missing_semantic(tmp_path, "products", ["30L hiking pack"], {"tenant": 101}) == path
    )
    with pytest.raises(ValueError, match="1–20"):
        record_missing_semantic(tmp_path, "products", list(range(21)), {})


def test_sql_mapping_preserves_data_and_maps_function_body():
    query = "SELECT * FROM core.sku WHERE sku_code='core.sku'; -- core.sku\n"
    result = remap(query, "retail_test")
    assert result == "SELECT * FROM \"retail_test\".sku WHERE sku_code='core.sku'; -- core.sku\n"
    assert (
        remap('SELECT * FROM "ops"."generation_run"', "retail_test")
        == 'SELECT * FROM "retail_test"."generation_run"'
    )
    body = (
        "CREATE FUNCTION sec.allowed() RETURNS bool LANGUAGE sql AS $$ "
        "SELECT EXISTS(SELECT 1 FROM sec.principal) $$"
    )
    assert remap(body, "retail_test").count('"retail_test".') == 2
    for invalid in ["core", "public", "retail_x;DROP SCHEMA core", "retail_" + "x" * 50]:
        with pytest.raises(ValueError):
            physical_schema(invalid)


def test_effective_price_boundaries_and_customer_identity_times():
    class Sink:
        def emit(self, *args, **kwargs):
            return 0

    profile = Profile.read("dev")
    master = Master(Sink(), profile, profile.tenants[0])
    master.build("test")
    for (sku, channel), periods in master.prices.items():
        for begin, end, key, amount in periods:
            assert master.price_at(sku, channel, begin) == (key, amount)
            assert master.price_at(sku, channel, end - 1) == (key, amount)
        with pytest.raises(ValueError):
            master.price_at(sku, channel, periods[-1][1])
    assert any(c["joined"] < START for c in master.customers.values())
    assert any(c["joined"] > START + 2 * 365 * DAY for c in master.customers.values())
    assert all(i["linked"] is None or i["first"] <= i["linked"] for i in master.identities.values())


def test_entity_random_stream_is_independent_of_generation_order():
    before = entity_rng(42, 101, "101-p001", "product").random()
    entity_rng(42, 101, "101-p999", "product").random()
    assert entity_rng(42, 101, "101-p001", "product").random() == before
    assert entity_rng(43, 101, "101-p001", "product").random() != before


def test_offline_revision_is_new_frozen_version_and_has_two_round_limit(tmp_path, monkeypatch):
    from compass_data_seed.semantic_workflow import revise_products

    monkeypatch.setattr(
        "urllib.request.urlopen", lambda *a, **kw: pytest.fail("Offline revision called API")
    )
    parent = Catalog.read()
    original = parent.manifest["content_hash"]
    product = dict(parent.data["products"][0], name="山野·雾岚防风软壳夹克")
    response_file = tmp_path / "response.json"
    response_file.write_text(json.dumps({"candidates": [product]}, ensure_ascii=False))
    first = tmp_path / "revision-one"
    revise_products(parent.root, [product["key"]], first, response_path=response_file)
    assert Catalog.read().manifest["content_hash"] == original
    assert Catalog.read(first).manifest["content_hash"] != original
    assert Catalog.read(first).manifest["provenance"]["expansion_round"] == 1
    second = tmp_path / "revision-two"
    revise_products(first, [product["key"]], second, response_path=response_file)
    with pytest.raises(ValueError, match="Two semantic expansion rounds"):
        revise_products(second, [product["key"]], tmp_path / "third", response_path=response_file)


def test_missing_semantics_leaves_request_without_publishing_package(tmp_path, monkeypatch):
    from compass_data_seed.demand import Demand
    from compass_data_seed.generator import generate
    from compass_data_seed.semantic import MissingSemantic

    def uncovered(*args, **kwargs):
        raise MissingSemantic("product_coverage", ["winter-cycling"], {"tenant": 101})

    monkeypatch.setattr(Demand, "basket", uncovered)
    with pytest.raises(MissingSemantic):
        generate("fixture", tmp_path / "business", "missing-semantic-test")
    state = json.loads((tmp_path / "business-private/run-state.json").read_text())
    assert state["state"] == "NEEDS_EXPANSION"
    assert not (tmp_path / "business/manifest.json").exists()
    assert list((tmp_path / "business-private/expansion-requests").glob("*.request.json"))
