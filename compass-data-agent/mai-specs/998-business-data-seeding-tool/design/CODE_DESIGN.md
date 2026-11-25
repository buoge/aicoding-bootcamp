# 业务语义与条件生成：代码设计

返回[主方案 §10](TECH_DESIGN.md#10-业务多样性与-ai-辅助生成修订提案)。Feature 998，Profile `standard`，2026-10-22，状态 `review`。

本文是供评审的类型与 Python 伪代码，未写入生产源码、未执行为实现测试。具体 SDK、序列化样板和文件 I/O 省略；业务决策、失败分支与不变量在这里说明。主方案维护需求、阈值和实施顺序，本文只维护关键代码设计。

## 1. 模块职责与已有依赖

| 模块 | 当前情况 | 提议责任与调用关系 |
|---|---|---|
| `catalog_schema.py`（新增） | 无业务素材契约 | Pydantic 类型、单位/枚举、候选与冻结包版本；不依赖 DB/模型 SDK |
| `semantic.py`（新增） | 无模型接入 | 一种结构化输出适配器、请求预算/缓存、候选审阅与冻结；只生成素材 |
| `master.py`（修改） | 大量硬编码名称、同一时间、编号取模 | 读取冻结素材，编译真实目录、客户和时间线，建立稳定键映射 |
| `demand.py`（新增） | 订单候选与购物篮嵌在 Simulation | 有条件购买机会、会话路径与购物篮、订单总量约束，输出待执行需求 |
| `simulation.py`（修改） | 状态流转完整，输入/时延/原因过度固定 | 接受需求意图、查当时有效价格、执行锁库支付履约售后；拒绝越界 |
| `inventory.py`（修改） | FIFO/守恒；静态成本和需求权重 | 复用守恒；按时点解析采购成本，按已知历史/计划预测，保留成本版本 |
| `reports.py`（修改） | 金额可追溯，流量有固定倍数 | 从机会/触点/事件/交易派生报表；平台只输出其可观测聚合 |
| `quality.py`（新增） | 现有检查缺少业务多样性 | 单列退化、交叉关系、课程问题覆盖；独立读取输出，不调用生成逻辑作为真值 |
| `generator.py/contracts.py`（修改） | 现有包与代码/DDL/profile hash | 增加语义包/过程参数指纹与依赖版本，禁止一次运行中修改输入 |

`access.py/importer.py/environment.py` 保留现有职责，随 schema 升级调整新字段与表的列投影、权限、装载和版本拒绝分支。不新增后台服务或通用插件管理层。

## 2. 类型边界：具体属性与潜在参数分开

下列为主要字段形状，实际字段验证由 `catalog_schema.py` 实现。模型只能返回合法候选，ID 与执行结果由程序产生。

```python
@dataclass(frozen=True)
class ProductRecipe:
    key: str                    # 语义包内稳定键，不用名称作身份
    tenant_key: str
    brand_key: str
    leaf_category_key: str
    name: str                   # 例如 山野·岚行轻量软壳夹克
    sport_keys: tuple[str, ...]
    attributes: dict            # 已验证的材质/功能/适用季节
    variants: tuple[dict, ...]  # 明确可售组合；含单位与重量
    price_policy_key: str
    lifecycle_policy_key: str

@dataclass(frozen=True)
class CustomerRecipe:
    key: str
    declared_attributes: dict   # 初始申报偏好；生效与可知时间明确
    latent_parameters: dict     # 价格敏感、复购倾向等，只进私有工件
    address_pattern_keys: tuple[str, ...]

@dataclass(frozen=True)
class SemanticRequest:
    task_kind: str
    requested_slots: tuple[str, ...]
    constraints: dict
    accepted_digest: str
    facts: tuple[dict, ...]     # 只用于事实后文本，附 observed_at

@dataclass(frozen=True)
class FrozenWorld:
    content_hash: str
    schema_version: str
    product_recipes: tuple[ProductRecipe, ...]
    customer_recipes: tuple[CustomerRecipe, ...]
    geography: dict
    process_policies: dict
    model_provenance: tuple[dict, ...]
```

`variants` 不以 `V0/V1` 代替业务属性：例如 `{color: MOSS_GREEN, size_system: ALPHA, size_value: M, fit: REGULAR, weight_grams: 430}`。商品类型、可用属性键、单位与合法枚举来自外部约束，模型不能自创未经接收的新标签。

模型可建议价格带和条件关系，但其概率参数仍需审核并标为仿真假设。模型写下的“高复购”只表示生成倾向；公开 RFM/留存结果必须由历史订单算出。

## 3. 模型工具：有界请求、校验、缓存和失败

```python
def expand_semantics(request, catalog, provider, cache, budget, config):
    # config 只含非敏感配置。凭据不参与日志与内容摘要。
    cache_key = digest({
        "request": request,
        "catalog_hash": catalog.content_hash,
        "model_config": config.model_config,
        "prompt_sha256": config.prompt_sha256,
        "schema_sha256": config.schema_sha256,
    })
    cached = cache.accepted(cache_key)
    if cached is not None:
        verify_bytes_hash(cached.raw_bytes, cached.response_hash)
        candidates = parse_candidates(cached.raw_bytes)
        require_valid(candidates, request, catalog)
        return candidates

    errors = []
    for attempt in range(3):
        # reserve 同时检查总请求/输入/输出 token 上限；超限直接失败。
        # 超时的用量无法确认时保留预留上限，不把未知费用当作零。
        ticket = budget.reserve(config.max_input_tokens, config.max_output_tokens)
        payload = render_request(request, catalog, errors, config)
        try:
            result = provider.generate_structured(payload, config.response_schema)
        except TransportError as exc:
            cache.record_failure(cache_key, attempt, "TRANSPORT", safe_error(exc))
            errors = [{"code": "TRANSPORT", "retry": True}]
            continue

        budget.settle(ticket, result.usage_or_reserved_upper_bound)
        cache.record_response(cache_key, attempt, result)
        if result.refused:
            raise SemanticGenerationFailed("MODEL_REFUSED", cache_key)
        if not result.complete:
            errors = [{"code": "INCOMPLETE", "required_slots": request.requested_slots}]
            continue

        try:
            candidates = parse_candidates(result.bytes)
        except CandidateParseError as exc:
            errors = [{"code": "SCHEMA_INVALID", "detail": safe_error(exc)}]
            continue
        errors = validate_candidates(candidates, request, catalog)
        if errors:
            continue
        cache.accept(cache_key, result.bytes, digest_bytes(result.bytes))
        return candidates

    raise SemanticGenerationFailed("REPAIR_LIMIT", cache_key, errors)
```

`validate_candidates` 必须包含：槽位覆盖、引用存在且同租户、商品类型与属性一致、合法单位和规格组合、规范化规格唯一、已接受名称/核心规格重复检查、品牌/运动兼容、数值范围、时间先后。它只返回错误，不替模型随机补值。用户可读语义小样另行审阅；结构校验通过不自动批准正式发布。

请求缓存只对同一输入内容复用，不把新提示词或新模型的输出伪装成旧版本。模型响应、错误和用量是私有生产记录；生成器只读取通过校验并冻结的内容。

## 4. 缺口补充与冻结状态

```python
def prepare_world(draft, provider, cache, budget, config):
    # 第 0 次是初始覆盖检查，后续最多两轮内容扩充。
    for expansion_round in range(3):
        gaps = check_coverage_and_constraints(draft)
        if not gaps:
            review_result = semantic_review(draft)
            if review_result.blocking_findings:
                raise WorldRejected(review_result)
            return freeze_canonical_world(draft, review_result)
        if expansion_round == 2:
            raise WorldCoverageError(gaps)
        for request in stable_batches(gaps, max_items=20):
            batch = expand_semantics(request, draft, provider, cache, budget, config)
            draft = merge_new_slots_without_overwriting_accepted(draft, batch)

def build_candidate(world, profile, output):
    verify_frozen_world(world)
    before = world.content_hash
    try:
        master = compile_world(world, profile)
        demand = compile_demand(master, world.process_policies, profile)
        facts = simulate(master, demand, profile)
        require_hash(world, before)
        reports = derive_reports(facts)
        return validate_and_seal_candidate(facts, reports, world, profile, output)
    except MissingSemantic as gap:
        record_incomplete_candidate(output, "NEEDS_EXPANSION", gap, before)
        # 调用者以新版本 draft 请求扩充，再从头建立新候选。
        # 不返回可发布 manifest，也不续写旧输出目录。
        raise
```

`semantic_review` 在 R0 中包含人工可读样本的审阅结论与程序语义检查；模型审阅可提供发现，但不能自行抹掉阻塞项。公开文字在业务事实完成后生成，输入只能含指定截止前可见事实；数字/日期/实体回查失败时整项文字留在候选区，不发布。

首轮主张从头重跑候选，复用所有已接受模型输出缓存。这样无需实现事件队列 checkpoint。只有实测重跑耗时成为瓶颈时，才另行设计 checkpoint；不能让当前实现暗含恢复能力。

## 5. 随机流与时点版本

```python
def rng_for(seed, tenant_key, entity_key, purpose):
    material = canonical_json([seed, tenant_key, entity_key, purpose])
    value = int.from_bytes(sha256(material).digest()[:16], "big")
    return random.Random(value)

def resolve_period(periods, entity_key, at):
    active = [p for p in periods[entity_key] if p.valid_from <= at < p.valid_to]
    if len(active) != 1:
        raise InvalidPeriodCoverage(entity_key, at, len(active))
    return active[0]

def price_order_line(master, sku_key, channel_key, at, quantity):
    require_sellable_lifecycle(master.sku[sku_key], at)
    listing = resolve_period(master.listings, (sku_key, channel_key), at)
    price = resolve_period(master.prices, (sku_key, channel_key), at)
    if quantity <= 0:
        raise InvalidQuantity(quantity)
    return {
        "listing_id": listing.id,
        "price_id": price.id,
        "list_unit_cent": price.list_price_cent,
        "gross_cent": price.list_price_cent * quantity,
    }
```

生命周期日期按 Asia/Shanghai 转为 UTC 半开区间，版本时间使用同一时区规范。价格/上架/经营区间交集需在编译阶段检查，再在执行时防御。采购成本沿已冻结的业务时点规则取版本，转入/退回批次保留原批次成本；退款仍按原成功支付分摊。

客户偏好、商品权重、订单支付和售后分别使用不同 purpose；实体 key 不依赖批次完成顺序。锁定 Python/依赖版本、排序和整数分舍入规则。稳定重放针对相同完整输入；改变商品语义包后不承诺旧订单结果全部不变。

## 6. 机会流量与精确订单配额

```python
def generate_cell(cell, world, quota, streams, sink):
    submitted = 0
    for attempt in range(cell.max_opportunities):
        if submitted == quota:
            return
        opportunity = draw_opportunity(cell, world, streams, attempt)
        # 检查该时刻身份、营业时间、商品/上架/价格可用性；缺货允许留作需求。
        require_valid_opportunity(opportunity, world)
        basket = draw_compatible_basket(opportunity, world, streams)
        path = draw_path(opportunity, basket, world, streams)
        sink.record_observable_touchpoints(opportunity, path)
        if not path.submits_order:
            continue
        sink.enqueue_order_intent(opportunity, basket, path)
        submitted += 1
    raise QuotaConflict(cell.key, expected=quota, actual=submitted)
```

先分配课程定向订单额度，再分配背景 cell；所有时间戳排序进入统一事件队列，已生成的触点和订单以稳定业务键关联。达到额度的停止规则会影响流量分布，主方案已明确“条件于固定订单总量”的解释边界。记录最大尝试失败，不能跳过该 cell 或偷偷增加付款率。

`draw_compatible_basket` 使用主商品、互补/替代规则和独立需求的混合，按客户预算与可售规格采样。`draw_path` 使用渠道×意图×设备×活动概率，产生未点击、浏览、搜索、加购后放弃、提交等合法路径；平台的内部路径只参与合成过程，不暴露伪造的逐人平台轨迹。

所有提交订单经过同一 `Simulation`：锁库失败产生明确证据；付款、履约、退货、现金、收入、成本仍走既有守恒逻辑。报表仅消费过程事实；不再使用 `submitted_orders * 12` 等公式制造漏斗。

## 7. 供独立复核的检查入口

以下只读 SQL 可复查本次最突出的退化点。应在当前活动业务库运行，不需要模型权限。

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';

SELECT count(*) AS members,
       count(DISTINCT joined_at) AS join_instants,
       count(DISTINCT segment_code) AS segments,
       count(DISTINCT age_band) AS age_bands
FROM core.customer;

SELECT reason_code, count(*) FROM core.return_item GROUP BY reason_code;

SELECT amount_cent, count(*) FROM core.order_fee
WHERE fee_type = 'OUTBOUND_LOGISTICS' GROUP BY amount_cent;

SELECT count(*) AS rows,
       count(*) FILTER (WHERE product_views = submitted_orders * 12
                         AND product_visitors = submitted_orders * 8
                         AND add_cart_users = submitted_orders * 3) AS fixed_multiple_rows
FROM core.channel_product_daily;

ROLLBACK;
```

后续 `quality.py` 的分布验收用这些查询的替代版本读取输出；期望来源为事先冻结的覆盖要求、独立参考 SQL 与业务小样，不能再用同一个生成函数自证。新增负例至少包含：羽绒名称配错误材质、骑行商品错误标签、款式与规格矛盾、未上市先销售、未来价格引用、跨城市错配地址、已停售仍建订单、固定漏斗、模型无效引用和离线重放意外调用网络。

## 8. 诊断情节的数据过程修订

对应[主文 §11](TECH_DESIGN.md#11-诊断情节可复现的数据调整)，以下均为未实施的伪代码。保留现有单进程事件队列、稳定实体随机流和 CSV sink；不新增服务或通用事件框架。诊断 profile 的规模浮动、监控 fixture 分离为待评审取舍。

### 8.1 采购计划、业务观察与实际事件

现有 `Inventory.supply` 把同一 due 用于计划和实际。改为生成器持有实际事件时刻，公开表只在事件发生/通知可知后记录：

```python
# inventory.py — design pseudocode
def supply(at, site, sku, qty, event_plan, rng):
    planned = at + draw_planned_lead_time(rng)
    actual = planned + draw_receipt_deviation(event_plan, rng)
    if qty <= 0 or actual < at or actual >= END:
        raise InvalidSupplyPlan(site, sku, qty, planned, actual)
    # event_plan is a frozen private input; actual is not a public forecast.
    line = document(at, planned, site, sku, qty, "PURCHASE")
    reserve_in_transit(at, site, sku, qty, line)  # existing accounting semantics
    if event_plan.notice is not None:
        notice = event_plan.notice
        if not at <= notice.published_at < actual:
            raise InvalidNoticeTime(line)
        schedule(notice.published_at, 0, emit_supplier_notice,
                 (line, notice.revised_eta, notice.observable_reason))
    schedule(actual, 0, receive, (site, sku, qty, line))
```

`receive` 继续使用原 FIFO/库存守恒路径，记录实际业务时间与采集可知时间。多次预计到货修订追加版本；原 `planned_at` 不覆盖。调拨沿同一逻辑区分计划与实际，调出之前检查 sellable−reserved−safety_floor，数量不够即留下无法执行的结果，不透支库存。

### 8.2 公共售后过程

当前退货分支依赖 story 名称，导致 experiment/intervention/monitor 被排除。普通过程改为对所有已交付订单生效；确定性边界 fixture 使用独立且明确的覆盖规则：

```python
# simulation.py — design pseudocode
def after_delivery(order, unit, delivered_at, policy, rng):
    if delivered_at >= END:
        raise InvalidDeliveryWindow(unit.key)
    override = boundary_fixture_override(order, unit)
    if override is not None:
        apply_explicit_boundary_fixture(override, order, unit, delivered_at)
        return
    probability = policy.return_probability(
        product=unit.product,
        delivered_offer=unit.offer_snapshot,
        customer=order.customer,
        registered_treatment=order.treatment,
    )
    if not 0 <= probability <= 1:
        raise InvalidReturnProbability(unit.key, probability)
    if rng.random() < probability:
        requested = delivered_at + policy.draw_request_delay(rng)
        if not delivered_at <= requested < END:
            raise TailWindowTooShort(unit.key)
        schedule(requested, 6, return_request, (order, unit))
```

取消、返仓、拒绝、部分退款和现金/成本冲回沿既有状态机。处理组只修改已登记的机制参数；不会因为归属某一故事而绕过共同业务生命周期。观察尾窗不足时拒绝当前配置，不将未来售后记成零。

### 8.3 业务期完整度

```python
# reports.py / storage.py — design pseudocode
def readiness_at(asset, period, cutoff, source_statuses, reports):
    visible_reports = reports.visible_at_or_before(cutoff)
    known_sources = source_statuses.visible_at_or_before(cutoff)
    if not visible_reports.has_period(asset, period):
        return "PENDING", "REPORT_NOT_VISIBLE"
    required = asset.required_source_periods(period)
    if not known_sources.covers_all(required):
        return "PARTIAL", "SOURCE_COVERAGE_INCOMPLETE"
    if not visible_reports.has_source_close_declaration(asset, period):
        return "PARTIAL", "PERIOD_NOT_CLOSED"
    if not reconcile_visible_period(asset, period, cutoff):
        return "PARTIAL", "RECONCILIATION_PENDING"
    return "COMPLETE", "COVERAGE_AND_RECONCILIATION_CONFIRMED"
```

这些辅助接口代表当前资产的固定规则，首版只实现本次日报所需规则。`reconcile_visible_period` 仅查询已知原事实与可见日报版本，不读最终数据库快照或私有预计结果。返回状态追加写入拟新增的 `asset_period_status`；采集水位不被用来替代资产业务期完整度。

### 8.4 固定机会量的诊断 profile

```python
# demand.py / simulation.py — design pseudocode
def process_opportunity(opportunity):
    # Stable opportunity key keeps random streams independent of earlier outcomes.
    state = world.state_at(opportunity.at)
    offer = quote_visible_offer(opportunity, state)
    record_observed_exposure(opportunity, offer)
    rng = entity_rng(seed, tenant, opportunity.key, "decision")
    decision = choose_purchase_or_abandon(opportunity, offer, state, rng)
    record_observable_path(opportunity, decision)
    if decision.submits:
        simulation.enqueue_order_intent(opportunity, decision)

for opportunity in frozen_opportunity_schedule:
    schedule(opportunity.at, 2, process_opportunity, opportunity)
```

注册循环的结束由事前机会清单决定，不通过成功订单数量终止或追加购买者。每次机会在统一事件队列到达其时刻后读取 state；同一时刻的供应、状态变更、访问和下单沿明确优先级处理。活动、门店客流、价格和库存按事件时间更新，已经发生的公开触点保留。运营的补货决策只能读取当时可知历史和计划，不能读取全部未来机会清单。平台只输出其合法可观测聚合；私有平台路径不伪装为公开用户轨迹。

### 8.5 复验重点

- 库存事件、履约、退款及价格版本保持原守恒/时序约束；失败不能靠改口径消除。
- 完整度：同一业务期在不同时点返回 PENDING/PARTIAL/COMPLETE；源采集 COMPLETE 且日报 PARTIAL 的情形有用例。
- 人群：干预前资格冻结，未转化者保留，价格暴露不反向改变入组；参考估计只使用相应知识截止可见的协变量。
- 场景：同区域门店集、采购延误单据、实验退款、平台归因覆盖和 S11 基线分别有独立查询，正负例齐全。
- 期望：生成器可私下按同一机会清单、相同稳定随机流运行事件开/关配对作为机制自检；配对结果只作合成机制证据，不能替代业务侧可识别性或泄漏给分析 Agent。
- 每个 seed 的结果保留，失败触发新配置版本或样本不足状态；不给定一份漂亮结果后回写事实凑答案。

### 8.6 授权后的实际模块落点

§11.10 授权新增 7 张类型化表，统一走现有 DDL、依赖排序、批次、权限和命名空间映射。`Diagnostic.schedule()` 事前登记访问机会；`opportunity()` 以机会键分离决策、浏览与履约随机流，成交失败不会补齐订单。订单之后复用公共支付、库存、履约与售后过程。诊断实验也复用普通购物篮的行数和件数分布，保留多件订单，才能由单件售后自然产生部分退款；独立门禁同时检查部分退款与拒绝售后。

`reports.py` 以 `source_updated_at` 截断原事实，追加修订与业务期状态；声明版本按当时各明细键最新可见版本求集合，混合版本留空，COMPLETE 必须带源覆盖终点和对账时刻。平台报告按日固定 7 日获客窗口，后续版本只成熟退款；最早平台投放期保留 UNKNOWN 负例。

价格案例保留全部 2,000 人，周比较采用前 12 周/后 8 周，两组机会流共同延续到第 9 周以覆盖固定 60 日无复购观察窗。部分处理组客户改买对照规格、延后访问或保持原行为；已有第二自有渠道身份且在干预前可知的少量客户可以迁移购买，原渠道真实访问仍保留。对照承接替代需求，因此结果需报告污染与识别限制。

`export_sql.py` 输出单事务普通 SQL，依外键顺序分批 INSERT；`course_asset` 内嵌公开材料及实际内容摘要。现有目标 schema 拒绝覆盖，SQL 不携带账号或私有答案。发布记录的 `catalog_sha256` 引用冻结语义目录摘要，物理 DDL 摘要继续独立保存在 manifest。空库导入、逐表对账、重复导入拒绝与三 seed 证据由实施记录维护。
