# 业务数据包、场景补充与加工契约

> Feature：[998](../BRIEF.md) · Profile：`standard` · 状态：`review` · 更新：2026-10-21。
>
> 本文是[业务生产主方案](TECH_DESIGN.md)的文件/附件细则，业务域、完整SQL及数量分布以主方案为准，沿用[标准模板](../../_templates/TECH_DESIGN.tmpl.md)，只定义业务库数据的生产、加工和交付。环境验收引用[交付附录](data-delivery.md)保留的业务侧 `AC-ENV` 条款；场景验收引用 [999 PRD](../../999-compass-product-course-landing-app/spec/PRD.md) 的 `AC-S01–12`、`AC-DATA-01–10`，不复制一份产品规格。

## 1. 业务包与装载边界

本方案仅处理 `package_kind=business`：同一 release 的规范经营事实、公开业务场景附件、源投影清单和数据字典。`data_seed` 只装载登记的候选业务库/附件目录，沿用 AC-ENV-07 的目标白名单；其他包类型直接拒绝。提供校验、预览、幂等装载入口，具体命令在实施时接入根任务脚本，保留旧 pnpm db:seed 三天链路。

平台配置和模拟演示内容已整体迁到 [999 数据方案 §5](../../999-compass-product-course-landing-app/design/data-model.md#5-平台初始化与业务源接入)，此处不再定义其字段、生成器、导入器或任务。

私有参考结果属于受限构建和数据验收工件，与业务包通过 release/hash 关联，不随可查询的 business 文件分发。原材料中的 eval.* 不自动部署为业务读账号可见表。真实生成/装载操作产生自己的批次、日志与校验报告，使用既有 ops 元数据或工具记录，不依赖产品运行表。

## 2. 最小机器契约

以下为待实现类型约束；示例字段不代表文件已经生成。金额、业务时间、可知时间和身份键继续沿用原技术包契约。

| 对象 | 必需字段 | 校验与失败行为 |
|---|---|---|
| PackageManifest | `schema_version, package_kind, package_id, release_id, content_hash, generator_version, seed, data_profile, reference_time, files[]` | 必须可复现；content_hash 对规范化清单及文件哈希计算，排除自身 hash 字段；不允许隐式“今天”改变事实 |
| FileEntry | `relative_path, sha256, format, schema_ref, row_count, visibility, logical_asset_id` | 文件路径不得越出包目录；hash/类型/粒度不符拒绝；public/metadata/private 分流 |
| ScenarioBinding | `product_scenario_id, data_story_ids, input_refs, reference_time, prerequisites, expected_outcome_class, private_oracle_ref` | 只接受产品 S01–S12；data_story 使用 D01–D08，与原始 Sxx 记录来源映射；评测题继续 Qxx |
| SourceProjection | `layout, source_id, mapping_version, assets, local_constraints, cross_source_checks, source_hash` | 所有输出资产有明确来源/权限分类；不支持任意拓扑；跨库 FK 改为显式校验 |

业务 tenant 表示经营数据归属，客户/会员表示业务对象；业务关联保留 `(tenant_id, business_id)` 和 release，禁止使用客户姓名或显示名称猜匹配。数据生产不创建系统用户。

release 以原包 ops.dataset_release 记录，业务环境清单负责已发布投影位置；不同源保留相同业务键、release、时间与源包哈希。数据字典说明主外键、金额口径、来源和水位，随业务包版本发布。

## 3. 十二场景的补充范围

“复用”指原材料已有定义，尚不代表数据已生成。当前表结构统一见 [business-schema.sql](business-schema.sql)，字段见[完整字典](business-data-dictionary.md)；主文 §3–§4 给出按域表清单和生产规模，原始 context 保持不变。

| 产品场景 / AC | 已有可复用事实 | 需补的表、字段或附件 | 归属 / 生产门槛 |
|---|---|---|---|
| S01 / AC-S01 | order_header/line、payment/refund、revenue_entry、渠道/区域 | 指标口径与参考查询、真实零/空/迟到/无权四类样例 | 事实在交易库；口径说明与参考 SQL 随包交付，私有预期独立计算 |
| S02 / AC-S02 | 订单、客户、商品/渠道、库存 | 可多轮继承的固定筛选样例、未知身份/重复 Join 反例 | 固定筛选与分母说明随样例交付；不新增“探索结果”事实表 |
| S03 / AC-S03 | customer_identity_link、订单/活动 | 带缺失/重复/错误类型的 CSV，原始行号与来源、清洗预期差异 | 附件以路径/hash/schema 登记；脏文件不先塞入规范客户表 |
| S04 / AC-S04 | revenue_entry、cost_entry、退款及费用 | 固定财务/经营两份快照、口径/时点差异与桥接预期 | 版本化附件；复用既有事实，不为对齐数字改源；已解释+未解释=总差 |
| S05 / AC-S05 | 行为、投放、库存、支付与水位 | 同期业务事件材料、反证、延迟/补齐切片 | 营销/交易/库存按源归属；材料有发布时间，反证可推翻候选解释 |
| S06 / AC-S06 | 跨域事实 | SOP、活动方案、价格/系统变更、带时效/可信分类的文档 | 版本化文件及材料索引；每份材料标明来源、时效与可知时间 |
| S07 / AC-S07 | 日历、销售、价格、目标、库存 | 训练可知截止、多个 12 周回测窗、公开未来计划、私有未来标签、断供解释 | 以窗口配置/附件交付，未来标签私有；未成熟或缺历史标注样本不足 |
| S08 / AC-S08 | 活动、客户/身份、web_session、订单/退款 | **experiment_definition、experiment_assignment、experiment_exposure**；结果用订单/退款关联 | 默认零售库；多源归营销，仅用受控稳定单元键；含未转化对象、分流异常反例 |
| S09 / AC-S09 | price_period、订单、客户与时间 | **intervention_definition、intervention_cohort** 小型固定场景；前趋势、可观测混杂、成熟窗口 | 按来源放营销场景投影/附件；首版使用 CSV 固定场景 |
| S10 / AC-S10 | 经营事实、水位 | 不同周期已齐/迟到/补齐的 release/可知时间切片与固定统计窗 | 输出各期业务事实、水位与对照结果；生成数据不需要调度系统 |
| S11 / AC-S11 | payment 已为一次支付尝试、order_header、渠道 | 分钟级足量成功/失败尝试、故障/恢复资料；只按消费需求扩展错误/耗时字段 | 支付在交易库；故障材料为文件，保留异常/恢复时间与参考窗口统计 |
| S12 / AC-S12 | customer/identity_link、订单/退款 | cohort 定义、成熟窗口、未知身份/退款规则、区域/渠道筛选样例 | cohort 由参考 SQL 复算，首版无需长期 cohort_result 表 |

所有启用场景须声明粒度、行数/样本密度、业务截止/可知截止/参考时间、源侧访问范围、正例与至少一个关键负例、独立参考结果、样本不足说明和源权限拒绝预期。实际统计样本量由实验/监控 profile 指定并验证，不从“总计百万行”推导样本充足。

### 3.1 实验表与干预附件的维护位置

实验的完整字段和约束统一维护于 [business-schema.sql](business-schema.sql) 的 DOMAIN 08；本版限定自有渠道、会员级双组随机，包含 experiment_definition、experiment_assignment、experiment_exposure，结果从订单/退款关联，不另造 outcome 事实。私有效应参数不进公开表。

S09 先用两个版本化 CSV 附件：intervention_definition 保存干预 ID、处理定义/时点、结果窗和识别说明；intervention_cohort 保存 intervention/unit、treated、前期协变量引用和资格。单位在干预前确定，观察窗/前趋势与处理后结果按主文场景验收，后续有持续维护需求才落关系表。

已核对原始 DDL：`core.payment` 注释明确为“一次支付尝试”，已有 `payment_id/order_id/method/status/attempted_at/available_at`，允许同订单多笔支付；本方案不再新增 `payment_attempt`。S11 以支付尝试为分母，渠道从订单受控关联；若错误归因/耗时分析确实启用，再增加 `error_code/latency_ms` 等列及约束。系统服务故障附件带开始/结束/获知时间。成功率指标必须明确尝试口径，不能直接解释为订单最终支付成功率。

## 4. 生成与加工顺序

1. 固定 profile：seed、日期、规模、业务情节、产品场景映射、样本密度与知识截止显式登记。
2. 生成规范业务事实：维度→订单/支付/履约/售后→收入/成本/库存流水等依赖，金额/数量/时间由统一规则推导，不分别随机生成关联总额。
3. 生成场景输入与加工对照：脏文件、两侧快照、业务材料、实验/干预样例与分钟级异常分别产出；保留原件和每一步行数/金额差异。
4. 验证规范包：源内键/约束、跨域关联、金额与库存守恒、时间可知性、场景密度与独立参考结果；任一必需门禁失败则不发布。
5. 编译单源/多源投影：按登记映射选表列、复制最小公共维度、建立本地约束，跨源关系以独立校验替代跨库 FK。
6. 装载候选业务库并复验：核对行数/hash、受限账号正负例、等价参考查询，全部必需源完成后发布不可变环境清单。

不提供任意 SQL 导入、通用业务修复平台或自动覆盖冲突数据。业务事实变更产生新 release；失败候选可以重建/重试，不能盲目向活动库追加。

## 5. 供评审的业务包校验逻辑

拟新增 data_seed/contracts.py、validation.py；以下为设计伪代码，尚未执行。实际生成算法按 profile 和已选业务模型实施，环境发布逻辑只在[交付附录 §4](data-delivery.md#4-供评审的关键逻辑)维护。

```text
validate_business_package(manifest, controlled_root):
    要求 package_kind == business，schema/profile/映射版本已支持
    若 release、seed、日期/参考时间或必需源缺失：拒绝
    对每个文件：
        解析真实路径并要求仍在 controlled_root 内；拒绝越界和路径重复
        核对文件 hash、格式、schema、粒度、行数及资产白名单
        若业务可读文件集合含私有金标/生成参数，或含非业务配置：拒绝
    校验规范清单 hash；同 release/layout/映射已登记但内容异 hash：冲突
    校验源内主外键与约束、跨源业务键、金额/数量守恒及三个时钟
    按已启用场景检查输入附件、样本密度、窗口成熟度和独立参考结果
    对单源与多源同范围参考查询对账；缺源/错版本/重复键须命中预期失败
    任一必需检查失败：输出失败报告，不将候选标记为可发布
    全部通过：写不可变校验报告，返回业务包及各源校验 hash
```

## 6. 可进入生产的门槛与任务

| 任务 | 拟新增/修改位置 | 必需证据 |
|---|---|---|
| PK-01 包契约及 profile | `apps/agent-api/src/compass_api/data_seed/contracts.py`、`profiles/` | 固定 seed/日期/规模/场景、仅 business 类型、哈希与私有工件隔离；同配置可复现 |
| PK-02 场景扩展 | `data_seed/scenarios/`、目标迁移、生成器执行规格 | S01–S12 依赖登记；先 S08 三实体、S03/S04/S06/S07/S09 附件及 S11 分钟级密度验证 |
| PK-04 分布与权限 | 交付附录 T2–T6 | 每资产唯一源/副本投影、源内外约束、受限连接；同数据布局结果一致 |
| PK-05 贯通小样 | `tests/integration/test_seed_packages.py` 及私有 Eval 工件 | 实际业务生成→加工→候选装载→源侧受限查询→独立参考对账；不能仅验空表 SQL |

设计覆盖已包含全部十二场景，但“可以批量生产”的门槛仍包括：确定 Contoso 复用方式、实际 profile 规模/日期/首批场景；完成逐表/列源映射、场景密度及独立参考结果；实现并通过小样贯通与权限测试。首批场景的必要事实、加工规则与业务交付契约闭合后即可独立生产。PK-03 已迁至 999，本方案不要求平台初始化或产品贯通完成。
