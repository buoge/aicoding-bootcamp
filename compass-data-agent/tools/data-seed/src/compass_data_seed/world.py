"""Compile frozen, meaningful business recipes into relational master data and timelines."""

import hashlib
import json
import math
import random
from collections import defaultdict

from .catalog_schema import Catalog, product_family
from .storage import DAY, END, START, day_start, local_date, stamp

REGIONS = ["华东", "华南", "华北", "华中", "东北", "西南", "西北"]
CHANNEL_CODES = ["TMALL", "JD", "DOUYIN", "MINIAPP", "APP", "POS", "OUTLET"]
CHANNEL_NAMES = [
    "天猫旗舰店",
    "京东旗舰店",
    "抖音店铺",
    "微信小程序",
    "自有商城",
    "标准门店",
    "奥莱门店",
]


def entity_rng(seed, tenant, entity, purpose):
    material = json.dumps([seed, tenant, entity, purpose], ensure_ascii=False).encode()
    return random.Random(int.from_bytes(hashlib.sha256(material).digest()[:16], "big"))


def variants(product, family, rng):
    """Expand only meaningful axes, retaining named capacities and physical weights."""
    count, axis = product["variant_count"], family["axis"]
    colors = ["BLACK", "BLUE", "MOSS_GREEN", "STONE", "NAVY", "RUST", "WHITE", "SAND"]
    if product["audience"] == "FEMALE":
        colors += ["LILAC"]
    palette = ["BLACK"] + rng.sample(colors[1:], 3)
    if axis == "ALPHA":
        if count >= 8:
            sizes = ["S", "M", "L", "XL"] if count != 12 else ["XS", "S", "M", "L", "XL", "XXL"]
            combinations = [(c, s) for c in palette[: count // len(sizes)] for s in sizes]
        else:
            sizes = ["S", "M", "L", "XL", "XXL", "XS"][:count]
            combinations = [(palette[0], s) for s in sizes]
    elif axis == "EU":
        size_count = count // 2
        start = 36 if product["audience"] == "FEMALE" else {4: 40, 6: 39, 8: 38}[size_count]
        combinations = [(c, str(s)) for c in palette[:2] for s in range(start, start + size_count)]
    else:
        values = {
            "MODEL": ["标准款", "轻量款", "加强款", "舒适款", "便携款", "长续航款"],
            "TEMPERATURE": [
                "舒适温标10℃",
                "舒适温标5℃",
                "舒适温标0℃",
                "舒适温标-5℃",
                "舒适温标15℃",
                "舒适温标-10℃",
            ],
            "THICKNESS": ["6MM", "8MM", "10MM", "12MM", "15MM", "20MM"],
            "CAPACITY": ["20L", "30L", "40L", "50L", "60L", "70L"],
            "CAPACITY_ML": ["350ML", "500ML", "650ML", "750ML", "1000ML", "1200ML"],
            "LENGTH": ["90CM", "100CM", "110CM", "120CM", "130CM", "140CM"],
            "DIMENSION": ["30×60CM", "40×80CM", "50×90CM", "60×120CM", "80×160CM", "100×180CM"],
            "BRIGHTNESS": ["100LM", "150LM", "200LM", "300LM", "400LM", "600LM"],
            "FRAME": ["44CM", "46CM", "48CM", "50CM", "52CM", "54CM"],
            "HEAD": ["52-54CM", "54-56CM", "56-58CM", "58-60CM", "60-62CM", "62-64CM"],
            "WEIGHT": ["2.5KG", "5KG", "7.5KG", "10KG", "12.5KG", "15KG"],
            "RESISTANCE": ["5LB", "10LB", "20LB", "30LB", "40LB", "50LB"],
            "RACKET_WEIGHT": ["3U", "4U", "5U", "2U"],
            "PACK": ["1只装", "3只装", "6只装", "12只装", "24只装", "36只装"],
            "GRIP": ["G1", "G2", "G3", "G4"],
            "BALL": ["4号", "5号", "6号", "7号"],
            "LENS": ["透明镜片", "浅烟镜片", "深烟镜片", "琥珀镜片"],
            "FOOT": ["35-38码", "39-42码", "43-46码", "47-49码"],
        }[axis]
        overrides = {
            "sleeping_mat": ["20MM", "30MM", "40MM", "50MM", "60MM", "80MM"],
            "camp_cookware": ["0.8L", "1L", "1.2L", "1.5L", "1.8L", "2L"],
            "bike_bag": ["0.8L", "1L", "1.5L", "2L", "3L", "5L"],
            "dry_bag": ["5L", "10L", "15L", "20L", "25L", "30L"],
            "foam_roller": ["30CM", "45CM", "60CM", "90CM"],
            "jump_rope": ["240CM", "260CM", "280CM", "300CM"],
            "skis": ["150CM", "160CM", "170CM", "180CM"],
            "paddleboard": ["305CM", "320CM", "335CM", "350CM"],
            "kickboard": ["25×35CM", "28×38CM", "30×40CM", "32×45CM"],
            "camp_table": ["50×50CM", "60×60CM", "70×50CM", "80×60CM", "100×60CM", "120×70CM"],
        }
        values = overrides.get(product["family"], values)
        if product["family"] == "bike_light" and "尾灯" in product["name"]:
            values = ["5LM", "10LM", "15LM", "20LM", "30LM", "50LM"]
        if product["family"] == "dumbbell" and "套装" in product["name"]:
            values = ["5KG", "10KG", "15KG", "20KG"]
        values = family.get("variant_values", values)
        if count > len(values):
            raise ValueError(f"Missing semantic variants for {product['key']}: {count}")
        combinations = [(palette[i % 2], value) for i, value in enumerate(values[:count])]
    if len(combinations) != count:
        raise ValueError(f"Invalid variant quota for {product['key']}")
    result = []
    for color, value in combinations:
        attrs = {"color": color, "size_system": axis, "size_value": value}
        weight = product["base_weight_grams"]
        factor = 1.0
        if axis == "WEIGHT":
            grams = round(float(value[:-2]) * 1000)
            attrs["unit_weight_grams"] = grams
            factor = (grams / max(2500, weight)) ** 0.65
            weight = grams
            if "套装" in product["name"]:
                attrs["pack_units"] = 2
                weight = grams * 2
        elif axis == "CAPACITY_ML":
            attrs["capacity_ml"] = int(value[:-2])
            weight = round(weight * (attrs["capacity_ml"] / 500) ** 0.65)
            factor = (attrs["capacity_ml"] / 500) ** 0.30
        elif axis == "CAPACITY":
            attrs["capacity_liters"] = float(value[:-1])
            base = family.get(
                "base_capacity_liters",
                1 if product["family"] in {"camp_cookware", "bike_bag"} else 30,
            )
            factor = (attrs["capacity_liters"] / base) ** 0.35
            weight = round(weight * (attrs["capacity_liters"] / base) ** 0.5)
        elif axis == "PACK":
            attrs["pack_units"] = int(value.removesuffix("只装"))
            attrs["unit_weight_grams"] = weight
            factor = attrs["pack_units"] ** 0.83
            weight *= attrs["pack_units"]
        elif axis == "BALL":
            weight = family["weight_by_size_grams"][value]
            factor = (weight / product["base_weight_grams"]) ** 0.45
        elif axis == "RACKET_WEIGHT":
            attrs["racket_weight_class"] = value
            weight = {"2U": 93, "3U": 88, "4U": 83, "5U": 78}[value]
        elif axis == "MODEL":
            factor, multiplier = {
                "标准款": (1, 1),
                "轻量款": (1.18, 0.82),
                "加强款": (1.25, 1.2),
                "舒适款": (1.15, 1.12),
                "便携款": (1.12, 0.9),
                "长续航款": (1.3, 1.25),
            }[value]
            weight = round(weight * multiplier)
        elif axis in {"FRAME", "LENGTH", "THICKNESS", "DIMENSION", "TEMPERATURE"}:
            number = len(result)
            factor = 1 + 0.09 * number
            weight = round(weight * (1 + 0.07 * number))
        attrs["weight_grams"] = weight
        if product["family"] == "tent":
            attrs["capacity_people"] = family.get(
                "capacity_people", 2 if "双人" in product["name"] else 4
            )
        result.append(
            dict(color=color, size=value, attributes=attrs, weight=weight, price_factor=factor)
        )
    return result


def build_organization(m, release):
    emit, data = m.emit, m.catalog.data
    emit(
        "tenant",
        tenant_code=f"T{m.tenant}",
        tenant_name={101: "行野运动集团", 102: "越岭户外", 103: "潮跃运动"}[m.tenant],
        timezone="Asia/Shanghai",
        currency="CNY",
        order_quota=m.q["orders"],
        release_id=release,
    )
    emit(
        "org_unit",
        org_unit_id=1,
        parent_org_unit_id=None,
        org_code="GROUP",
        org_name="集团",
        org_type="GROUP",
    )
    emit(
        "org_unit",
        org_unit_id=2,
        parent_org_unit_id=1,
        org_code="ECOM",
        org_name="电商事业部",
        org_type="ECOM",
    )
    for i, name in enumerate(REGIONS, 1):
        emit(
            "geo_area",
            geo_id=i,
            parent_geo_id=None,
            geo_level="REGION",
            geo_code=f"REGION-{i}",
            geo_name=name,
            region_id=i,
        )
        emit(
            "org_unit",
            org_unit_id=10 + i,
            parent_org_unit_id=1,
            org_code=f"REG{i}",
            org_name=name + "分部",
            org_type="REGION",
        )
    provinces = {}
    m.cities, m.districts, m.region_cities = {}, {}, defaultdict(list)
    m.city_by_name, m.district_by_name = {}, {}
    for index, row in enumerate(data["geography"]["cities"]):
        region = row["region"]
        if row["province"] not in provinces:
            geo = 101 + len(provinces)
            provinces[row["province"]] = geo
            emit(
                "geo_area",
                geo_id=geo,
                parent_geo_id=region,
                geo_level="PROVINCE",
                geo_code=row["province_code"],
                geo_name=row["province"],
                region_id=region,
            )
        city = 201 + index
        # Municipalities retain one explicit operating-city node below the province node.
        emit(
            "geo_area",
            geo_id=city,
            parent_geo_id=provinces[row["province"]],
            geo_level="CITY",
            geo_code="CITY-" + row["city_code"],
            geo_name=row["city"],
            region_id=region,
        )
        m.cities[city] = dict(row, geo_id=city)
        m.city_by_name[row["city"]] = city
        m.region_cities[region].append(city)
        for name in row["districts"]:
            district = 1001 + len(m.districts)
            emit(
                "geo_area",
                geo_id=district,
                parent_geo_id=city,
                geo_level="DISTRICT",
                geo_code=row["district_codes"][name],
                geo_name=name,
                region_id=region,
            )
            m.districts[district] = dict(city=city, region=region, name=name)
            m.district_by_name[row["city"], name] = district
    for channel, (code, name) in enumerate(zip(CHANNEL_CODES, CHANNEL_NAMES, strict=True), 1):
        emit(
            "channel",
            channel_id=channel,
            channel_code=code,
            channel_name=name,
            channel_type="PLATFORM" if channel < 4 else "OWNED" if channel < 6 else "OFFLINE",
            has_user_events=channel in (4, 5),
            identity_scope="MIXED",
        )
    config = list(data["business"]["sites"][str(m.tenant)])
    if m.profile.name == "diagnostic" and m.tenant == 101:
        config[4] = ["行野杭州城西体验店", "杭州市", "余杭区", "2024-01-01", 680]
    all_stores = 6 if m.tenant == 101 else 2
    chosen = config[: m.q["stores"]] + config[all_stores : all_stores + m.q["warehouses"]]
    for site, row in enumerate(chosen, 1):
        warehouse = site > m.q["stores"]
        name, city_name, district_name, opened, area = row
        city = m.city_by_name[city_name]
        region = m.cities[city]["region"]
        kind = "WAREHOUSE" if warehouse else "OUTLET" if site == m.q["stores"] else "STORE"
        if kind == "OUTLET" and "奥莱" not in name:
            name = name.removesuffix("店") + "奥莱店"
        emit(
            "site",
            site_id=site,
            site_code=f"SITE{site}",
            site_name=name,
            site_type=kind,
            org_unit_id=10 + region,
            geo_id=city,
            region_id=region,
            opened_on=opened,
            closed_on=None,
            area_sqm=area,
        )
        m.sites[site] = dict(
            region=region,
            kind=kind,
            opened=day_start(opened),
            city=city,
            district=m.district_by_name[city_name, district_name],
            area=area,
            name=name,
        )


def selected_products(m) -> list[dict]:
    rows = [p for p in m.catalog.data["products"] if p["tenant_id"] == m.tenant]
    if m.profile.name == "fixture":
        clothing = next(p for p in rows if m.catalog.data["families"][p["family"]]["category"] == 0)
        shoe = next(p for p in rows if m.catalog.data["families"][p["family"]]["category"] == 1)
        return [dict(clothing, variant_count=2), dict(shoe, variant_count=8)]
    if m.profile.name == "dev":
        per_category = 3 if m.tenant == 101 else 1
        return [
            p
            for cat in range(8)
            for p in [
                r for r in rows if m.catalog.data["families"][r["family"]]["category"] == cat
            ][:per_category]
        ]
    return rows


def build_products(m):
    data, emit = m.catalog.data, m.emit
    brands = {name: i for i, name in enumerate(data["business"]["brands"][str(m.tenant)], 1)}
    for name, brand in brands.items():
        emit(
            "brand",
            brand_id=brand,
            brand_code=f"BRAND{brand}",
            brand_name=name,
            positioning=data["business"]["brands"][str(m.tenant)][name],
        )
    m.sport_ids = {name: i for i, name in enumerate(data["business"]["sports"], 1)}
    for name, sport in m.sport_ids.items():
        emit("sport", sport_id=sport, sport_code=f"SPORT{sport}", sport_name=name)
    leaves = {}
    for cat, name in enumerate(data["business"]["categories"]):
        emit(
            "category",
            category_id=cat + 1,
            parent_category_id=None,
            category_code=f"CAT{cat + 1}",
            category_name=name,
            level_no=1,
            is_leaf=False,
        )
        leaf_names = list(
            dict.fromkeys(f["leaf"] for f in data["families"].values() if f["category"] == cat)
        )
        for i, leaf in enumerate(leaf_names):
            key = (cat + 1) * 100 + i
            leaves[leaf] = key
            emit(
                "category",
                category_id=key,
                parent_category_id=cat + 1,
                category_code=f"CAT{cat + 1}-{i + 1}",
                category_name=leaf,
                level_no=2,
                is_leaf=True,
            )
    m.product_keys, m.spus = {}, {}
    protected = set(data["business"]["scenario_products"].values())
    if m.profile.name == "diagnostic":
        protected.add("101-p001")
    products = selected_products(m)
    by_cat = defaultdict(int)
    for spu, product in enumerate(products, 1):
        rng = entity_rng(m.profile.seed, m.tenant, product["key"], "product")
        family = product_family(data, product)
        cat = family["category"]
        by_cat[cat] += 1
        early = by_cat[cat] <= 2 or product["key"] in protected or rng.random() < 0.30
        launched = START - rng.randint(30, 600) * DAY if early else START + rng.randrange(880) * DAY
        discontinued = END
        if product["key"] not in protected and rng.random() < 0.20:
            discontinued = (
                max(day_start("2025-07-01"), launched + 240 * DAY) + rng.randrange(120) * DAY
            )
            discontinued = min(discontinued, day_start("2025-12-20"))
        if m.profile.name == "fixture":
            launched, discontinued = START, END
        if product["key"] == data["business"]["scenario_products"]["replacement_new"]:
            launched = day_start("2024-03-18")
        if (
            product["key"] == data["business"]["scenario_products"]["replacement_old"]
            and m.profile.name != "fixture"
        ):
            discontinued = day_start("2025-11-01")
        material = family["material"]
        if "碳纤维登山杖" in product["name"]:
            material = "碳纤维杖身与聚合物握把"
        attributes = dict(
            synthetic=True,
            product_type=family["product_type"],
            material=material,
            features=family["features"],
            family=product["family"],
        )
        if "防水" in product["name"] and "防水" not in attributes["features"]:
            attributes["features"] = [*attributes["features"], "防水"]
        emit(
            "spu",
            spu_id=spu,
            brand_id=brands[product["brand"]],
            category_id=leaves[family["leaf"]],
            spu_code=product["key"].upper(),
            spu_name=product["name"],
            audience=product["audience"],
            season_code=product["season"],
            launch_on=local_date(launched),
            discontinue_on=None if discontinued == END else local_date(discontinued),
            attributes=json.dumps(attributes, ensure_ascii=False),
        )
        m.product_keys[product["key"]] = []
        m.spus[spu] = dict(product, category=cat, launched=launched, discontinued=discontinued)
        for sport in family["sports"]:
            emit("spu_sport", spu_id=spu, sport_id=m.sport_ids[sport])
        concrete = variants(product, family, rng)
        if m.profile.name == "fixture":
            concrete = concrete[:2]
            if cat == 1:
                concrete[1].update(color="BLACK", size="42")
                concrete[1]["attributes"].update(color="BLACK", size_value="42")
        product_cost_ratio = rng.uniform(0.40, 0.60)
        product_popularity = math.exp(rng.gauss(0, 0.65))
        for variant in concrete:
            sku = len(m.skus) + 1
            attrs = dict(
                variant["attributes"], color_name=data["business"]["colors"][variant["color"]]
            )
            spec_key = json.dumps(
                {k: v for k, v in attrs.items() if k not in {"weight_grams", "color_name"}},
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=False,
            )
            emit(
                "sku",
                sku_id=sku,
                spu_id=spu,
                sku_code=f"{product['key'].upper()}-{sku}",
                color_code=variant["color"],
                size_system=family["axis"],
                size_value=variant["size"],
                spec_key=spec_key,
                spec_attributes=json.dumps(attrs, ensure_ascii=False),
                weight_grams=variant["weight"],
                launch_on=local_date(launched),
                discontinue_on=None if discontinued == END else local_date(discontinued),
            )
            price = max(
                900, round(product["base_price_cent"] * variant["price_factor"] / 100) * 100
            )
            cost = round(price * product_cost_ratio * rng.uniform(0.97, 1.03))
            if m.profile.name == "fixture":
                price, cost = 10000, 5000
            m.skus[sku] = dict(
                price=price,
                cost=cost,
                category=cat,
                color=variant["color"],
                size=variant["size"],
                axis=family["axis"],
                weight_grams=variant["weight"],
                weight=product_popularity
                * rng.uniform(0.7, 1.3)
                * data["business"]["tenant_demand_weights"][str(m.tenant)][cat],
                product_key=product["key"],
                spu=spu,
                family=product["family"],
                name=product["name"],
                product_type=family["product_type"],
                sports=family["sports"],
                season=product["season"],
                launched=launched,
                discontinued=discontinued,
                audience=product["audience"],
            )
            m.product_keys[product["key"]].append(sku)
    # Normalize category demand against its assortment size, independent of numeric IDs.
    for item in m.skus.values():
        item["weight"] /= sum(other["category"] == item["category"] for other in m.skus.values())
    baseline = data["business"]["scenario_products"]["baseline"]
    candidates = m.product_keys.get(baseline, list(m.product_keys.values())[0])
    m.baseline_sku = candidates[0]
    m.stockout_sku = next(
        s
        for s, v in m.skus.items()
        if v["category"] == 1 and v["color"] == "BLACK" and v["size"] == "42"
    )
    if len(m.skus) != m.q["skus"] or len(products) != m.q["spus"]:
        raise ValueError(
            f"Catalog/profile quota conflict for {m.tenant}: "
            f"{len(products)} SPU / {len(m.skus)} SKU"
        )


def build_timelines(m):
    m.prices, m.costs, m.listings = {}, {}, {}
    fixture = m.profile.name == "fixture"
    for sku, item in m.skus.items():
        rng = entity_rng(m.profile.seed, m.tenant, item["product_key"], "commercial-history")
        begin, end = max(START, item["launched"]), item["discontinued"]
        changes = []
        if not fixture and end - begin > 450 * DAY and rng.random() < 0.60:
            changes.append(begin + rng.randint(240, 420) * DAY)
        if not fixture and end < END:
            changes.append(end - 60 * DAY)
        boundaries = [begin] + sorted(set(t for t in changes if begin < t < end)) + [end]
        factors = [1] + [rng.choice([0.88, 0.93, 0.96, 1.04]) for _ in boundaries[1:-1]]
        if end < END and len(factors) > 1:
            factors[-1] = 0.72
        for channel, channel_factor in enumerate(
            m.catalog.data["commerce"]["price_channel_factors"], 1
        ):
            m.prices[sku, channel] = []
            price_boundaries, price_factors = boundaries, factors
            from .diagnostic import PRICE_AT, is_diagnostic, price_skus

            study_skus = price_skus(m) if is_diagnostic(m) and m.tenant == 101 else []
            if sku in study_skus and channel in (3, 4):
                price_boundaries = [begin, PRICE_AT, end] if sku == study_skus[0] else [begin, end]
                price_factors = [1, 1.12] if sku == study_skus[0] else [1]
            for lo, hi, factor in zip(
                price_boundaries, price_boundaries[1:], price_factors, strict=False
            ):
                price_id = m.id("price")
                price = (
                    item["price"]
                    if fixture
                    else max(100, round(item["price"] * channel_factor * factor / 100) * 100)
                )
                m.emit(
                    "price_period",
                    lo - 7 * DAY,
                    price_id=price_id,
                    sku_id=sku,
                    channel_id=channel,
                    valid_from=stamp(lo),
                    valid_to=stamp(hi),
                    list_price_cent=price,
                )
                m.prices[sku, channel].append((lo, hi, price_id, price))
            listing = m.id("listing")
            m.listings[sku, channel] = listing
            m.emit(
                "channel_listing",
                begin - 7 * DAY,
                listing_id=listing,
                sku_id=sku,
                channel_id=channel,
                external_sku_code=f"{CHANNEL_CODES[channel - 1]}-{item['product_key']}-{sku}",
                valid_from=stamp(begin),
                valid_to=stamp(end),
            )
        cost_boundaries = [START, END]
        if not fixture and rng.random() < 0.42:
            cost_boundaries = [START, day_start("2024-04-01") + rng.randrange(330) * DAY, END]
        m.costs[sku] = []
        cost = item["cost"]
        for i, (lo, hi) in enumerate(zip(cost_boundaries, cost_boundaries[1:], strict=False)):
            if i:
                cost = round(cost * rng.choice([0.88, 0.92, 0.96, 1.06, 1.09]))
            cost_id = m.id("cost")
            m.emit(
                "cost_period",
                lo - 14 * DAY,
                cost_id=cost_id,
                sku_id=sku,
                valid_from=stamp(lo),
                valid_to=stamp(hi),
                unit_cost_cent=cost,
            )
            m.costs[sku].append((lo, hi, cost_id, cost))
    warehouses = [s for s, v in m.sites.items() if v["kind"] == "WAREHOUSE"]
    # A weighted, deterministic warehouse partition with overlapping safety coverage.
    rng = entity_rng(m.profile.seed, m.tenant, "network", "assortment")
    shuffled = list(m.skus)
    rng.shuffle(shuffled)
    partitions = {s: set(shuffled[i :: len(warehouses)]) for i, s in enumerate(warehouses)}
    for site, info in m.sites.items():
        rng = entity_rng(m.profile.seed, m.tenant, info["name"], "assortment")
        warehouse = info["kind"] == "WAREHOUSE"
        count = min(
            len(m.skus),
            (640 if m.tenant == 101 else 160) if warehouse else (150 if m.tenant == 101 else 50),
        )
        if m.profile.name not in {"demo", "diagnostic"}:
            count = len(m.skus) if warehouse else min(32, len(m.skus))
        chosen = set(partitions.get(site, set())) | {m.baseline_sku, m.stockout_sku}
        if m.profile.name == "diagnostic" and m.tenant == 101 and warehouse:
            from .diagnostic import price_skus

            chosen.update(price_skus(m))
        priorities = sorted(
            m.skus, key=lambda s: rng.random() ** (1 / max(0.01, m.skus[s]["weight"]))
        )
        for sku in reversed(priorities):
            if len(chosen) >= count:
                break
            chosen.add(sku)
        m.assortments[site] = sorted(chosen)
        for sku in m.assortments[site]:
            begin = max(START, info["opened"], m.skus[sku]["launched"])
            m.emit(
                "assortment",
                begin - 7 * DAY,
                assortment_id=m.id("assortment"),
                site_id=site,
                region_id=info["region"],
                sku_id=sku,
                valid_from=local_date(begin),
                valid_to=local_date(END),
                can_sell=True,
                min_stock=2,
                target_stock=10,
            )


def build_customers(m):
    recipes = m.catalog.data["customers"]
    personas = recipes["personas"]
    m.customers = {}
    m.scenario_members = set()
    # Cohorts are sampled independently of IDs and then bound to stable customer keys.
    member_keys = list(range(1, m.q["customers"] + 1))
    cohort_rng = entity_rng(m.profile.seed, m.tenant, "members", "scenario-cohorts")
    cohort_rng.shuffle(member_keys)
    m.scenario_customer_keys = member_keys
    initial = set(member_keys[: max(13, round(len(member_keys) * recipes["initial_member_share"]))])
    for customer in range(1, m.q["customers"] + 1):
        rng = entity_rng(m.profile.seed, m.tenant, customer, "customer")
        persona = rng.choice(personas)
        region = rng.choices(range(1, 8), [29, 23, 17, 11, 6, 9, 5])[0]
        city = rng.choice(m.region_cities[region])
        district = rng.choice([g for g, v in m.districts.items() if v["city"] == city])
        name = rng.choice(recipes["surnames"]) + rng.choice(recipes["given_names"])
        joined = (
            START - rng.randint(1, 800) * DAY + rng.randrange(DAY)
            if customer in initial
            else START + rng.randrange(1000) * DAY + rng.randrange(DAY)
        )
        if m.profile.name == "fixture":
            joined = START - rng.randint(1, 200) * DAY
        gender = rng.choices(["MALE", "FEMALE", "UNSPECIFIED"], [46, 48, 6])[0]
        age = rng.choices(recipes["age_bands"], [18, 35, 24, 12, 5, 6])[0]
        interests = list(persona["sports"])
        if rng.random() < 0.25:
            interests = list(dict.fromkeys(interests + [rng.choice(list(m.sport_ids))]))
        segment = rng.choices(["GENERAL", "STUDENT", "FAMILY", "EMPLOYEE"], [55, 13, 22, 10])[0]
        attributes = dict(synthetic=True, declared_sports=interests, declared_gender=gender)
        known = m.emit(
            "customer",
            joined,
            customer_id=customer,
            member_code=f"M{customer:08}",
            joined_at=stamp(joined),
            segment_code=segment,
            home_geo_id=city,
            age_band=age,
            display_name=name,
            attributes=json.dumps(attributes, ensure_ascii=False),
        )
        low, high = persona["budget_yuan"]
        m.customers[customer] = dict(
            name=name,
            city=city,
            region=region,
            district=district,
            joined=joined,
            known=known,
            persona=persona["key"],
            interests=interests,
            gender=gender,
            budget=round(rng.uniform(low, high) * 100),
            frequency=persona["frequency"] * rng.lognormvariate(0, 0.55),
            sensitivity=persona["price_sensitivity"],
            channel_weights=persona["channel_weights"],
            alpha=rng.choices(["XS", "S", "M", "L", "XL", "XXL"], [3, 15, 29, 28, 19, 6])[0],
            eu=rng.choices(list(range(36, 47)), [4, 7, 11, 13, 14, 16, 15, 10, 6, 3, 1])[0],
            address_seed=rng.randrange(2**32),
            moved=rng.random() < recipes["address_move_probability"],
        )
    # Bound scenario members by their eligibility time, never force ID-derived attributes.
    early = [c for c in member_keys if m.customers[c]["joined"] < START]
    before_study = [
        c
        for c in member_keys
        if m.customers[c]["joined"] < day_start("2025-02-01") and c not in early[:13]
    ]
    study_eligible = set(early[:13] + before_study)
    late = [c for c in member_keys if c not in study_eligible]
    m.scenario_customer_keys = early[:13] + before_study + late
    m.scenario_members = (
        set(m.scenario_customer_keys[:12000])
        if m.profile.name in {"demo", "diagnostic"} and m.tenant == 101
        else set()
    )
    customer_keys = list(m.customers)
    for identity in range(1, m.q["identities"] + 1):
        rng = entity_rng(m.profile.seed, m.tenant, identity, "identity")
        # The primary identity is a structural key mapping, not a business segment rule.
        customer = identity if identity <= m.q["customers"] else rng.choice(customer_keys)
        person = m.customers[customer]
        channel = (
            4
            if identity <= m.q["customers"]
            else rng.choices(range(1, 8), person["channel_weights"])[0]
        )
        first = person["joined"] - rng.randint(1, 90) * DAY - rng.randrange(DAY)
        linked = (
            max(first, person["joined"])
            if identity <= m.q["customers"] or rng.random() < 0.64
            else None
        )
        known = m.emit(
            "customer_identity",
            first,
            identity_id=identity,
            channel_id=channel,
            external_user_token=hashlib.sha256(
                f"synthetic:{m.tenant}:{identity}".encode()
            ).hexdigest(),
            first_seen_at=stamp(first),
        )
        link_known = None
        if linked is not None:
            link_known = m.emit(
                "customer_identity_link",
                linked,
                floor=person["known"],
                identity_link_id=identity,
                identity_id=identity,
                customer_id=customer,
                linked_at=stamp(linked),
            )
        m.identities[identity] = dict(
            customer=customer,
            linked=linked,
            channel=channel,
            first=first,
            known=known,
            link_known=link_known,
        )
        m.identity_by_channel[channel].append(identity)
        if identity <= m.q["customers"]:
            m.member_mini[customer] = identity


def build_plans(m):
    themes = m.catalog.data["commerce"]["campaign_themes"]
    m.campaign_info = {}
    for month in range(36):
        year, number = 2023 + month // 12, month % 12 + 1
        start = day_start(f"{year}-{number:02}-01")
        following = day_start(f"{year + 1}-01-01" if number == 12 else f"{year}-{number + 1:02}-01")
        rng = entity_rng(m.profile.seed, m.tenant, f"{year}-{number}", "campaign")
        if m.tenant == 101 or month % 2 == 0:
            matching = [t for t in themes if number in t["months"]]
            if m.profile.name == "diagnostic":

                def offered(theme, start=start, following=following):
                    return any(
                        v["launched"] <= start
                        and v["discontinued"] >= following
                        and set(v["sports"]) & set(theme["sports"])
                        for v in m.skus.values()
                    )

                eligible_themes = [t for t in matching if offered(t)] or [
                    t for t in themes if offered(t)
                ]
                theme = rng.choice(eligible_themes)
            else:
                theme = rng.choice(matching or themes)
            begin = start + rng.randint(0, 6) * DAY
            end = min(following, begin + rng.randint(7, 23) * DAY)
            campaign_channels = (
                [c for c in theme["channels"] if c < 6]
                if m.profile.name == "diagnostic"
                else theme["channels"]
            )
            channel = rng.choice(campaign_channels)
            if m.profile.name == "diagnostic" and m.tenant == 101 and year == 2025 and number == 6:
                begin, end, channel = day_start("2025-06-01"), day_start("2025-06-21"), 3
            campaign = m.id("campaign")
            m.emit(
                "campaign",
                begin - 7 * DAY,
                campaign_id=campaign,
                campaign_code=f"C{campaign}",
                campaign_name=f"{year}·{theme['name']}",
                acquisition_source=theme["source"],
                target_channel_id=channel,
                starts_at=stamp(begin),
                ends_at=stamp(end),
                objective=theme["objective"],
            )
            m.campaigns.append((campaign, begin, end))
            m.campaign_info[campaign] = dict(
                theme,
                channel=channel,
                begin=begin,
                end=end,
                daily_budget_cent=round(m.q["orders"] * rng.uniform(0.05, 0.2)),
                cpc_cent=rng.randint(55, 210),
                ctr=rng.uniform(0.015, 0.065),
            )
        for channel, cw in enumerate([22, 12, 18, 18, 12, 14, 4], 1):
            for region, rw in enumerate([29, 23, 17, 11, 6, 9, 5], 1):
                seasonal = [0.85, 0.75, 0.95, 1.05, 1.1, 1.35, 1, 1, 1.05, 1.1, 1.55, 1.2][
                    number - 1
                ]
                net = round(
                    m.q["orders"]
                    * 28000
                    / 36
                    * cw
                    / 100
                    * rw
                    / 100
                    * seasonal
                    * rng.uniform(0.85, 1.15)
                )
                for metric, amount in [
                    ("NET_SALES", net),
                    ("CONTRIBUTION", round(net * rng.uniform(0.18, 0.3))),
                ]:
                    m.emit(
                        "target_monthly",
                        start - 10 * DAY,
                        target_month=local_date(start),
                        channel_id=channel,
                        region_id=region,
                        metric_code=metric,
                        target_cent=amount,
                        plan_version=1,
                        approved_at=stamp(start - 10 * DAY),
                    )
                    if (
                        m.tenant == 101
                        and year == 2025
                        and channel == 4
                        and region == 1
                        and metric == "NET_SALES"
                    ):
                        m.emit(
                            "target_monthly",
                            start + 10 * DAY,
                            target_month=local_date(start),
                            channel_id=channel,
                            region_id=region,
                            metric_code=metric,
                            target_cent=round(amount * 1.10),
                            plan_version=2,
                            approved_at=stamp(start + 10 * DAY),
                        )
    for channel in range(1, 8):
        for version, bps in enumerate([0, 500, 1000, 1500, 2000, 2500, 3000], 1):
            promotion = m.id("promotion")
            m.emit(
                "promotion",
                START - 7 * DAY,
                promotion_id=promotion,
                promotion_code=f"PROMO{promotion}",
                channel_id=channel,
                campaign_id=None,
                promotion_type="PERCENT",
                discount_bps=bps,
                threshold_cent=0,
                discount_cent=0,
                starts_at=stamp(START),
                ends_at=stamp(END),
                priority_no=version,
            )
            m.promotions[channel, bps] = (promotion, bps)


def build_master(m, release):
    m.catalog = m.catalog or Catalog.read()
    build_organization(m, release)
    build_products(m)
    build_timelines(m)
    build_customers(m)
    build_plans(m)
    monitor_at = day_start("2025-11-10")
    warehouse = m.q["stores"] + 1
    pool = [
        s
        for s in m.assortments[warehouse]
        if m.skus[s]["launched"] <= monitor_at < m.skus[s]["discontinued"] and s != m.stockout_sku
    ]
    m.monitor_pool = entity_rng(m.profile.seed, m.tenant, "monitor", "products").sample(
        pool, min(36, len(pool))
    )
