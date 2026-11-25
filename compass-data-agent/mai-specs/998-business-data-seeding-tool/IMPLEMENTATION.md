# 998 实施与验收记录

> 2026-10-26 工具目录迁移已实现；本次代码与离线验证通过，真实 PostgreSQL 与容器验收待补，详见文末“独立数据准备工具迁移”。此前数据库交付记录保留原结论，不作为本次回归证据。

> 当前诊断增量已发布到 `retail_v3`，学员单文件 SQL 已通过空库实导。旧 `retail_v2` 与 core/ops/sec 保留；最新结果见文末“诊断增量正式交付”，此前记录为历史。

2026-10-22，已完成首批单源合成零售数据生产、实库装载与发布。用户通过 `/goal` 授权按现有设计执行；Profile 为 `standard`，本记录按执行证据组织，不另建 PRD。有效需求与验收来自 [技术方案](design/TECH_DESIGN.md)、[包契约](design/data-package-contract.md)和[业务侧 AC-ENV](design/data-delivery.md#需求依据与验收)。设计中的生产前状态描述保留为基线，本记录维护实施结果。

## 配置与范围

采用推荐配置 PURE_SYNTHETIC、single-source、seed `20261019`。订单窗口为 2023-01-01 至 2026-01-01（右开），尾窗截止 2026-04-01；参考时间为 2025-12-15 09:00 Asia/Shanghai，包知识截止为 2026-04-02 00:00 Asia/Shanghai。时间和配额由 [profiles](../../tools/data-seed/src/compass_data_seed/profiles/) 固定。

本次完成 P0–P5。P6 三源物理投影、百万配置与 Contoso 派生未启用；AC-ENV-02 及 AC-ENV-03/09 的跨源对等部分留在 P6，不记为通过。Feature 999 的平台接入、Agent 页面与统计模型效果不属于此次数据生产。

| 阶段 | 结果 | 实际证据 |
|---|---|---|
| P0 冻结配置 | 通过 | fixture/dev/demo、时钟、主数据配额、12 场景、配置/DDL/源码摘要 |
| P1 规范小样 | 通过 | 17 单完整 63 表装载；主租户 13 个独立金额金标，含部分支付超时、跨期退货、判损、RTO、缺货与迟到 |
| P2 核心过程 | 通过 | 10,000 单开发库；两次生成的 1,290 个文件摘要一致；49 项数据与 47 项权限检查通过 |
| P3 场景 | 通过 | S01–S12 逐项结果、独立 SQL、私有对账与预测标签；正式包验证全部通过 |
| P4 demo 试产 | 通过 | 100,000 单，三租户 90,000/5,000/5,000；53 项数据检查和 47 项真实权限检查全部通过 |
| P5 稳定交付 | 通过 | 幂等、坏文件、错配置、同 ID 异内容、未知目标、并发锁、中断重建、回切与越权连接均有实库证据 |

## 已发布交付物

- 工具入口：`pnpm data:seed generate / validate / publish / retry / rollback`，见[操作说明](../../docs/data-seeding.md)。
- [正式业务包](../../work/data-seed/production/demo/manifest.json)：`retail-demo-20261022b`，包含 CSV、字典、参考 SQL 和场景附件。
- [活动环境清单](../../work/data-seed/local-state/active.json)：本机 PostgreSQL 17、端口 55432、独立库 `compass_retail_local_e0b65e1ddb84`。
- [开发包](../../work/data-seed/production/dev/manifest.json)与[复现证明](../../work/data-seed/production/dev-private/reproduction.json)。
- [业务校验报告](../../work/data-seed/local-state/reports/compass_retail_local_e0b65e1ddb84-business.json)、[权限报告](../../work/data-seed/local-state/reports/compass_retail_local_e0b65e1ddb84-access.json)、[受限连接参考查询验收](../../work/data-seed/production/demo-private/delivery-acceptance.json)。
- [代码自审](review/code_review.md)。完整源码快照在 `work/data-seed/production/demo-private/source/`，私有预期与运行报告也在该私有目录。

正式内容 SHA-256：`e0b65e1ddb84f2cf1da2a35a7b74da77d6d8e2f476a5473eba464879bd70ad66`。生成器源码 SHA-256：`c89e7487ea8790c5a5606540920f925bee3c77c9a83b8dda9ecdfef1cb8b7e4e`。开发包两次内容 SHA-256：`7ae26405a71589c98ca8379bec1e1ec1ff77e16232ff2e1bf26b6d4501b8183e`。

数据、私有金标、凭据和运行日志均保存在 Git 忽略的 `work/`；源码与文档为可提交改动。本次未提交或推送。活动清单只有凭据引用，实际随机账号信息在权限 0600 的部署记录中；业务包没有连接密码。

## 实测资源与覆盖

| 项目 | dev | demo |
|---|---:|---:|
| 订单 | 10,000 | 100,000 |
| 业务包表记录 | 3,040,522 | 10,427,937 |
| 生成耗时 | 69.508 秒 | 311.624 秒 |
| 生成峰值 RSS | 64,684,032 字节 | 375,078,912 字节 |
| 文件包大小 | 312,259,035 字节 | 1,095,298,570 字节 |

正式装载耗时 562.455 秒，独立数据库校验耗时 114.686 秒；数据库实际大小 2,651,035,315 字节。测试为本机共享 Docker PostgreSQL 实例的单次实测，不作为生产吞吐承诺。

demo 的 1,280 SKU、36,000 会员、72,000 渠道身份和 2,700 经营组合达到固定配额。426,141 会话与 2,604,195 行为事件处于设计估算范围。渠道商品日报 144,732 行低于原估算，实际非零经营组合全部覆盖，并有明确零值与版本修订；42 条优惠规则按渠道/活动复用。估算行数不作为硬配额，未为补足估算添加无依据事实。两类库存日快照各 491,400 行，覆盖 2025-10-01 至 2026-03-31；更早余额从流水重放。

## 十二场景的实际结果

| 场景 | 输入与独立对照 | 关键边界 |
|---|---|---|
| S01 问数 | 受限账号计算 9 月净收入，与财务快照逐分一致；真实零、空窗口和迟到水位均存在 | 权限拒绝、源不可用、零值与空集分别验证 |
| S02 探索 | 订单/单件/会员/渠道/区域稳定键；48,069 个未知会员订单 | 先固定订单分母，明细连接不能重复计数；不回填未来身份 |
| S03 清洗 | 2,000 原始行，1,700 唯一合法、100 重复、100 缺键、100 格式错误；50 未知会员键 | 原始行号与 hash 保留，脏行不写规范客户表 |
| S04 对账 | 财务 152,667,216 分，经营 202,719,648 分；5 类桥接项总和等于差额 | 经营观察时点 9 月 29 日；业务截止与源迟到分列，未解释差额 0 |
| S05 归因输入 | 11,998 次库存不足证据、13,289 个退货单件；活动/支付/迟到材料 | 提供可见机制及反证，不保证因果结论 |
| S06 材料分析 | 8 份合成运营材料，有来源、发布时间、有效范围与可信分类 | 运营材料须与事实复核 |
| S07 预测 | 1,096 日历史，3 个滚动起点，每个 84 日标签；SQL 复算逐日特征与标签一致 | 特征使用当时 available_at；未来标签私有保管；模型效果未评测 |
| S08 实验 | 正常分组 3,000/3,000；异常分组 3,200/800；全部分配者纳入 7 日结果及 30 日退款护栏 | 异常分流阻断默认效果判断，曝光次数不作分母 |
| S09 观察性分析 | 2,000 会员、处理/对照各 1,000，40,000 个周观察；逐项等于实际订单与支付 | 含按前趋势筛组的无效反例；效应参数私有，不预设显著性 |
| S10 周期报表 | 8 个连续周窗，逐期与真实 OMS 水位一致，第 4 周迟到后补齐 | 不借下一期事实冒充上一期 |
| S11 监控 | 90 个分钟，每分钟 100 次支付尝试，合计 9,000 / 成功 8,580 | 正常/异常/恢复为 98%/90%/98%；全库成功率另算 |
| S12 留存 | 1,404 个队列月龄单元，状态统计 `{"MATURE": 377, "IMMATURE": 273, "INSUFFICIENT_SAMPLE": 754}` | 零活跃为 0；未成熟为 NULL；小分母不足；退款保留交付购买事件 |

`bindings.json` 的 D01–D08 保留原业务情节编号来源，产品 S01–S12 独立编号。迟到情节 D07 在此次采用 OMS 批次实现，原材料为 POS 示例；当前证据和公告均明确标识 OMS。

## 检查与故障恢复证据

- `COMPASS_RETAIL_TEST_ADMIN_URL=… uv run --locked pytest apps/agent-api/tests/test_data_seed.py apps/agent-api/tests/integration/test_data_environment.py -xq`：**18 passed**，日志 `work/data-seed/tests-production.log`。9 个集成测试使用真实 PostgreSQL，13 个固定业务金标逐项比较，不使用生成器计算预期。
- `pnpm check`：**10/10 tasks successful**；默认测试 14 passed、9 skipped（未带实库变量）；上述独立实库命令已覆盖 9 个跳过项。既有 Starlette/httpx 弃用提示保留。日志 `work/data-seed/workspace-production-check.log`。
- 课程仓库根目录 `npm test`：通过，日志 `work/compass-998-root-delivery-tests.log`。本地链接、manifest 路径及 `git diff --check` 通过。
- 正式包采用全部 63 表/655 字段/225 外键的规范 SQL，通过独立迁移创建空候选库。所有约束在 COPY 期间启用，按已校验分块提交；账号验证成功后才切换活动清单。
- 早期全量尝试曾发生 PostgreSQL 后端异常退出；活动清单未切换。采用分块提交后完整装载成功。日志未确定异常退出的根因，不归因为已证实的 OOM 或延迟外键。
- 对账、源时钟和留存检查在自审中补强后，正式包重新生成。历史试产和失败候选留作证据，未自动清理；发布也保留旧版可回切。

## 逐表记录数

CSV 中五类部署元数据为空模板；真实发布/导入时间、文件登记与源登录在装载时产生。因此表文件摘要可复现，数据库的部署记录如实反映本次操作。数据库总行数为 10,429,244。

| 表 | CSV 行数 | 发布库行数 |
|---|---:|---:|
| `core.assortment` | 2,700 | 2,700 |
| `core.behavior_event` | 2,604,195 | 2,604,195 |
| `core.brand` | 7 | 7 |
| `core.calendar` | 1,186 | 1,186 |
| `core.campaign` | 72 | 72 |
| `core.campaign_daily` | 7,056 | 7,056 |
| `core.category` | 96 | 96 |
| `core.channel` | 21 | 21 |
| `core.channel_listing` | 8,960 | 8,960 |
| `core.channel_product_daily` | 144,732 | 144,732 |
| `core.cost_entry` | 145,854 | 145,854 |
| `core.cost_period` | 1,280 | 1,280 |
| `core.customer` | 36,000 | 36,000 |
| `core.customer_identity` | 72,000 | 72,000 |
| `core.customer_identity_link` | 57,600 | 57,600 |
| `core.discount_allocation` | 172,746 | 172,746 |
| `core.experiment_assignment` | 10,000 | 10,000 |
| `core.experiment_definition` | 2 | 2 |
| `core.experiment_exposure` | 21,181 | 21,181 |
| `core.geo_area` | 63 | 63 |
| `core.inventory_document` | 21,892 | 21,892 |
| `core.inventory_document_line` | 21,892 | 21,892 |
| `core.inventory_lot` | 33,239 | 33,239 |
| `core.inventory_movement` | 359,755 | 359,755 |
| `core.inventory_snapshot` | 491,400 | 491,400 |
| `core.inventory_valuation_snapshot` | 491,400 | 491,400 |
| `core.order_attribution` | 100,000 | 100,000 |
| `core.order_fee` | 328,585 | 328,585 |
| `core.order_header` | 100,000 | 100,000 |
| `core.order_line` | 152,073 | 152,073 |
| `core.order_status_event` | 456,314 | 456,314 |
| `core.order_unit` | 172,746 | 172,746 |
| `core.order_unit_event` | 773,059 | 773,059 |
| `core.org_unit` | 27 | 27 |
| `core.payment` | 91,036 | 91,036 |
| `core.price_period` | 8,960 | 8,960 |
| `core.promotion` | 42 | 42 |
| `core.refund` | 15,142 | 15,142 |
| `core.refund_allocation` | 16,445 | 16,445 |
| `core.return_event` | 54,334 | 54,334 |
| `core.return_header` | 13,289 | 13,289 |
| `core.return_item` | 13,289 | 13,289 |
| `core.revenue_entry` | 147,414 | 147,414 |
| `core.shipment` | 95,479 | 95,479 |
| `core.shipment_event` | 191,711 | 191,711 |
| `core.shipment_item` | 135,613 | 135,613 |
| `core.site` | 14 | 14 |
| `core.sku` | 1,280 | 1,280 |
| `core.sport` | 24 | 24 |
| `core.spu` | 160 | 160 |
| `core.spu_sport` | 320 | 320 |
| `core.stock_allocation_attempt` | 152,073 | 152,073 |
| `core.store_traffic_daily` | 10,595 | 10,595 |
| `core.target_monthly` | 10,596 | 10,596 |
| `core.tenant` | 3 | 3 |
| `core.web_session` | 426,141 | 426,141 |
| `ops.dataset_release` | 0 | 1 |
| `ops.file_manifest` | 0 | 1,298 |
| `ops.generation_run` | 0 | 1 |
| `ops.ingestion_batch` | 2,227,356 | 2,227,356 |
| `ops.source_watermark` | 28,488 | 28,488 |
| `sec.principal` | 0 | 5 |
| `sec.principal_region` | 0 | 2 |


## 语义版本实施进展（2026-10-22）

用户已接受 §10 的重建目标，并要求同库新增 `retail_v2`、保留原数据。旧源码、DDL、活动清单与 63 张表的逐表行数及双重内容指纹已保存在 `work/data-seed/semantic-upgrade/`；旧数据基线为 10,429,244 行。

- R0/R1：冻结 160 个具体 SPU、70 个品种、16 类客户原型、22 城市/44 区县及商业素材。来源记录为当前会话模型，未冒充 API 调用。模型适配器已覆盖缓存、超时预算、拒绝、截断和修复分支；自动调用可配置服务，离线修订最多两轮。
- R2/R3：结构升级为 64 表 / 670 字段 / 228 外键，新增规格属性、客户姓名与声明属性、搜索词、售后描述、订单收件快照。客户、价格成本、上架与停售采用独立时间线；购物篮读取兴趣、预算、规格、季节和互补关系；浏览与广告由机会产生，费用读取重量和线路。
- R4：首次 10,000 单试产已通过工程与多样性 SQL；主租户 60 个入会月份、5 类退货原因、120 种运费、529 种首付时延，最大单一时延占比约 1.05%。这是早期试产数据，最终发布数据另行登记。原 9 项 PostgreSQL 集成测试通过；新 schema 57 项真实权限检查通过。
- R5：三个预登记 seed 与 100,000 单试产正在验证。尚未发布 `retail_v2`，尚未完成最终双次离线重放与旧库前后指纹核对。

实现细节调整：开发 profile 按具体商品的合法规格保留 40 SPU / 215 SKU；正式 demo 继续精确保持 160 / 1,280。模型适配器使用标准库 HTTP，无需新增 SDK。实际商品替代示例使用晨露与晨跑二代训练短袖；跑鞋专题保留晨跑 R100 黑色 EU42 缺货。所有数值参数为课程仿真假设，未宣称已按真实企业数据校准。


## 语义版本正式交付（2026-10-22）

R0–R5 已完成。新版发布到原数据库 `compass_retail_local_e0b65e1ddb84` 的 **`retail_v2`**，共 **64 表、8,392,537 行、100,000 单、160 SPU、1,280 SKU**。旧 `core/ops/sec` 的 63 表共 10,429,244 行，逐表行数和两组内容指纹全部一致；旧 `local-state/active.json` 字节不变。没有替换或删除旧版。

正式 release 为 `retail-semantic-20261022`；业务包摘要 `bf73a34af15ebd473ed88a31d6e4e746028aaea683fca55407b429e1e7539edf`；字典摘要 `18e2b120e4e65a342851bbe07ae8c283179c327eed475a29a52a42c9e41a817d`；生成源码摘要 `6a945473fc47c89da8c45fb33e493123e7f523a8a5af77c00dbdc842a431f024`。冻结输入两次完整离线生成摘要相同，两个进程都拦截所有 urllib 网络请求，额外模型 API 调用为 0。

| 阶段 | 验收结果 |
|---|---|
| R0 业务小样 | 160 个具体商品的全量审阅册、16 类客户原型、六个实际生成地址样例；具体规格与领域错误经过人工式语义复核和代码门禁修正 |
| R1 模型素材与冻结 | 当前会话模型编写七类素材，保留父字典；1–20 个既有商品槽位修订、缓存、预算、最多三次修复和两轮版本扩充均有回归证据；外部付费 API 的真实接入/费用未实测 |
| R2 结构与主数据 | 64 表 / 670 字段 / 228 外键；新 schema 装载、客户与商品时间线、价格成本版本、地址字段和权限均通过 |
| R3 条件经营过程 | 兴趣、预算、规格、地区季节、搭配、履约、退货与流量进入同一过程；保留金额、FIFO 和可见时点检查 |
| R4 分析验收 | 86 项数据门禁、S01–S12、14 个课程分析结果集与六类联合关系证据；三个预登记 seed 的 10,000 单版本全部通过 |
| R5 发布与保护 | 双次 100,000 单离线重放；57 项真实账号检查；同库新 schema 发布；旧表双重指纹与旧清单一致 |

### 实际多样性与分析证据

主租户有 60 个入会月份、209 种公开兴趣组合、118 个上市日期和 27 个停售商品；5 类售后原因、5 种支付方法、164 种出库运费、796 种首付时延，排除固定 S11 窗口后单一时延最大占比约 0.878%。约 59.90% 的 SKU×渠道有价格版本变化，41.04% 的 SKU 有成本版本变化；稳定价格/成本样本也保留。自有渠道有 156,276 个未提交订单会话。

六类预登记关系保留分母与反例，下面是可独立回查的例子：

- 北方冬季服装订单行中，秋羽羽绒服为 52 / 2,705；北方其他季节为 17 / 7,824。其他区域分别为 54 / 7,401 与 34 / 21,258。这里排除了 S11 定向窗口，说明仿真机制在事实中可见，不据此作气候因果推断。
- 排除 S11 后，含帐篷订单 1,208 单，其中 66 单也有睡袋；不含帐篷订单中 487 / 79,792 有睡袋，独立购买反例保留。
- 晨跑 R100 黑色 42 码首次缺货时，同地点另有 4 个同款规格可售；后续该规格有 76 个交付单件。
- 重件跨区配送 2,418 笔，平均内部运费 49.20 元；轻件同区 25,056 笔，平均 5.36 元。完整四组分母与结果见分析报告。
- 公开兴趣匹配为 49,998 / 76,843 个已识别会员订单行。ID 尾数的十个桶都覆盖 22 城市、六个年龄段和 200 种以上兴趣组合，未出现按尾数固定绑定属性的退化。

| seed | 结果 | 运费取值数 | 首付时延取值数 | 最大单值占比 |
|---|---|---:|---:|---:|
| 20261019 | passed | 113 | 518 | 1.059% |
| 20261117 | passed | 142 | 527 | 1.067% |
| 20261213 | passed | 134 | 521 | 1.047% |

三个 seed 全部报告，未按效果选择。dev 的商品覆盖较小，秋羽等不在开发子集中的专题返回样本不足；正式 demo 的 14 个分析均有实际结果。活动固定配额与定向案例单独披露，真实企业分布校准、市场预测和因果模型效果仍不属于此次验收。

### 执行证据与使用入口

- [新版活动清单](../../work/data-seed/semantic-state/active.json)、[业务门禁](../../work/data-seed/semantic-state/business-report.json)、[真实权限检查](../../work/data-seed/semantic-state/access-report.json)。
- [正式包](../../work/data-seed/semantic-upgrade/demo-final-e/manifest.json)、[离线重放证明](../../work/data-seed/semantic-upgrade/offline-replay.json)、[三个 seed 报告](../../work/data-seed/semantic-upgrade/seed-validation-release/summary.json)。
- [商品与地址审阅册](../../work/data-seed/semantic-upgrade/catalog-preview.md)、[14 题可读分析及分母](../../work/data-seed/semantic-upgrade/course-analysis.md)、[DBeaver 新旧对照 SQL](../../work/data-seed/semantic-upgrade/compare-in-dbeaver.sql)、[新版课程 SQL](../../work/data-seed/semantic-upgrade/course-questions-retail-v2.sql)。
- [旧数据保护证明](../../work/data-seed/semantic-upgrade/preservation-report.json)、[新版逐表实测行数](../../work/data-seed/semantic-upgrade/retail-v2-row-counts.json)、[交付证据](../../work/data-seed/semantic-upgrade/delivery-evidence.json)。

最终代码通过 39 项单元/实库测试（`current-tests-release.log`）；`pnpm check` 为 10/10 任务成功，其中默认测试 34 passed / 10 skipped，跳过的十个实库测试已由显式数据库命令执行；根 `npm test` 通过。字段字典、受影响内部链接、Feature 路径检查与 `git diff --check` 均核对。

两次正式生成耗时 584.129 / 585.167 秒，分别约 557 / 558 MB 峰值 RSS，业务文件包约 890 MB；这是同机并行运行的实测，不能作为独占 CPU 的吞吐指标。新 schema 创建至发布约 641.6 秒，含装载、独立 SQL 和账号验收；公开 CSV 8,390,921 行，部署时新增真实发布/导入/文件/角色记录后为上述数据库行数。

完整的早期试产和中断候选保留供审计，未自动清理；最终交付只引用上述 release 与摘要。DBeaver 使用 `127.0.0.1:55432`，连接同一数据库后刷新并选择 `retail_v2`。原库未来删除由用户自行决定。

## 2026-10-22 诊断增量与单文件 SQL（实施中）

授权与契约见 [TECH_DESIGN §11.10](design/TECH_DESIGN.md#1110-已授权实施与学员交付契约)。当前已接入 71 表结构、固定机会诊断过程、共同支付售后流程、采购延期/调拨、历史完整度、价格队列及平台归因；单文件 SQL 导出使用事务、启用约束和内嵌公开附件。候选生成与真实数据库验收正在进行，旧版本仍保留。

基线源码、DDL 与 127 张旧表指纹保存于 `work/data-seed/diagnostic-v3/baseline/`。开发期间中止的候选只作调试记录，不作为交付版本。最终运行、指纹、种子与验收结果在完成后补录。

### 交付前补充需求检查（2026-10-23）

首轮诊断候选虽通过原 90 项数据门禁和三个 seed 各 26 条查询，补读 §11.5 后发现实验购物篮固定一行一件，四个实验组均缺部分退款；本轮将其判为阻断。拒绝售后路径实际存在。相关候选与已导出的 SQL 均撤回，未作为正式交付；原始独立结果、manifest、源码快照保留于工作目录。

修复使 diagnostic 实验购物篮复用普通订单的行数/数量分布，售后仍逐件推进；新增部分退款/拒绝售后门禁，不通过追加退款凑样例。以新 release `diagnostic-v3-<seed>` 对三个登记 seed 与主包重放重新生成和验收。旧版 retail_v2/core/ops/sec 保持保留。

第二轮公开 CSV 全量回归确认，部分退款缺口已修复，但日报声明在混合明细版本时仍填单一版本；同时源码核对发现价格机会流仅覆盖 56 日，短于公开的 60 日结果窗。两项均在交付前修复：版本按声明时刻各明细键最新可见集合计算，集合不唯一时留空；两组价格机会共同延续到第 9 周。新增对应数据门禁及历史版本单元测试，重新冻结源码后生产。两轮撤回候选及中断生成不作为验收证据；原表 127 张在恢复数据库服务后指纹与基线一致。

## 诊断增量正式交付（2026-10-23）

TECH_DESIGN §11.10 已完成。正式 release `diagnostic-v3-20261019` 发布于原库的 **retail_v3**，71 张关系表、748 字段、247 外键；业务包含 **111,055 单、160 SPU、1,280 SKU、7,538,707 行**。旧 core/ops/sec/retail_v2 共 127 张表、18,821,781 行的行数与内容指纹均保持一致。

生成源码摘要 `50a07fdfbb7fe91bb7bf7cd7f40a43bd1f4d8ddc3552198a1c6acca0dd1e7f21`；业务包摘要 `84c208fb7c246eac482f831f647378b1f16d290714bed673a34d84cc3b5ff8cf`；冻结商品目录摘要 `18e2b120e4e65a342851bbe07ae8c283179c327eed475a29a52a42c9e41a817d`。三个预登记 seed 全部保留，主包同配置重放的 1,789 个文件逐一通过摘要校验，清单相同。主包生成 260.447 秒，峰值 RSS 929,988,608 bytes；这是同机并行生产实测。

| 已实现能力 | 当前可验证结果 |
|---|---|
| 同区门店 | 老店净收入 556,908.05→293,529.30 元；新店贡献 927,403.05 元；区域总收入上升，集合差额可对回 |
| 供应与调拨 | 采购原计划 9/6、事前通知延期、9/16 实到；缺货前/中/后失败为 0/33、98/106、0/58；包含可执行调拨与全网无货反例 |
| 历史完整度 | 按明细可知时间生成日报修订；9/28 在 9/29、9/30、10/2 分别 PENDING/PARTIAL/COMPLETE；混合明细版本留空 |
| 实验退款 | 全分配会员进入 ITT，共用多行多件购物篮及支付售后；正常实验主包转化 +3.67pp，退款金额率差 +7.89pp、95% CI [2.75,13.03]pp，暂缓采纳 |
| 价格研究 | 2,000 人干预前登记；两组机会覆盖固定 60 日，主包处理/对照无支付 190/59 人；替代、迁移和平台混杂反例可查 |
| 平台与流量 | 同一归因支付群的成熟退款、KNOWN 零及 UNKNOWN 可区别；固定三窗、固定 SKU 集合，稀疏覆盖明确披露 |
| 单文件 SQL | 71 张关系表加 course_asset；表结构、数据及 27 份公开材料全部内嵌，普通 PostgreSQL 账号可独立导入 |

| seed | 订单 | 数据校验 | 退款率差 95% CI，pp | 决策 |
|---|---:|---:|---|---|
| 20261019 | 111,055 | 94/94 | [2.75,13.03] | hold |
| 20261117 | 111,082 | 94/94 | [3.72,13.52] | hold |
| 20261213 | 110,747 | 94/94 | [-6.10,5.36] | hold：仍无法排除超过 3pp 的风险 |

第三 seed 的区间跨零，不能描述为已证实退款伤害。S05 三窗商品访客单元为 1,992/2,361/1,076，支付单元为 361/344/214；固定 952 SKU 的观测覆盖为 606/700/520，其余保留缺报。该分母不能冒充去重渠道 UV，缺失不能补零；同期投放与调价并存，保留因果识别限制。普通诊断 S11 的固定 90 分钟仅 3 次支付尝试，应判样本不足，密集 fixture 仍单独使用 demo。

### 学员交付与真实导入

2026-10-25 存储位置更新：下述已验收数据的正式入口为 [data/retail/](../../data/retail/README.md)，压缩包通过 Git LFS 分发；SQL 使用 `pnpm data:prepare` 生成，文件摘要与以下历史实测保持一致。原 work 路径记录保留为验收时的来源。

- [直接导入 SQL](../../work/data-seed/delivery/compass-retail.sql)（1,020,420,581 bytes，约 973 MiB）；[压缩分发版](../../work/data-seed/delivery/compass-retail.sql.gz)（122,910,571 bytes，约 117 MiB）。
- [导入说明](../../work/data-seed/delivery/README.md)、[SQL 校验文件](../../work/data-seed/delivery/compass-retail.sha256)、[压缩文件校验](../../work/data-seed/delivery/compass-retail.sql.gz.sha256)。SQL SHA-256：`8e346ada16611941df2bc5d6e96dd57121d1f0cf70e9df10bf21505fca6b11c9`。
- PostgreSQL 17.10 空数据库实导，执行角色无 superuser/createdb/createrole/bypassrls 权限，目标为 retail_course。首导返回 0，耗时 345.021 秒；66 张业务/来源表的内容指纹与发布库一致，5 张部署表差异单列。27 份内嵌材料逐个摘要核对，外键无跨 schema 引用，约束全部有效。
- 重复导入返回 3，全部 71 张关系表指纹不变；脚本不会覆盖既有 schema。全部 15 条内嵌参考查询与 README 样例已实际执行；实验金额区间与三窗 SKU 明细由独立验收再对账。

三个种子及学员库各 28 条独立诊断 SQL 全部通过，SQL 与公开 CSV 对账一致；学员库 28 个结果集与发布库一致。正式库 94 项业务门禁、74 项真实账号正反例通过。`pnpm check` 为 10/10 任务成功，默认测试 37 passed/11 skipped；显式实库 11 项全部通过，合计 48 项实际执行测试。工作区无自动提交或合并。

### 证据与边界

[完整交付证据](../../work/data-seed/diagnostic-v3/delivery-evidence.json)、[发布清单](../../work/data-seed/diagnostic-v3/release-state/active.json)、[业务门禁](../../work/data-seed/diagnostic-v3/release-state/business-report.json)、[权限检查](../../work/data-seed/diagnostic-v3/release-state/access-report.json)、[独立业务验收](../../work/data-seed/diagnostic-v3/acceptance/release-review.md)、[SQL/CSV 对账](../../work/data-seed/diagnostic-v3/acceptance/delivery-sql-csv-reconciliation.json)、[学员库等价性](../../work/data-seed/diagnostic-v3/acceptance/delivery-student-equivalence.json)、[空库导入](../../work/data-seed/diagnostic-v3/portable-import-report.json)、[旧表保护](../../work/data-seed/diagnostic-v3/preservation-report.json)、[重放](../../work/data-seed/diagnostic-v3/delivery-replay-verification.json)。

金额、库存和可见性结论均限于合成世界；价格队列为观察性比较，平台净回款/投放不代表新客专属回报或利润增量。80 件目标调拨以 80 张单件单据表达，教学展示按动作窗口聚合。预测模型、Agent/UI 端到端及真实付费模型服务测试不在本轮数据交付范围。生成 SQL 与工作证据留在忽略 Git 的 work/；撤回候选只保留历史证据，不用于当前结论。参考SQL别名修订前的导入报告另存 pre-reference-fix-material；新旧公开文件比较见 [材料修订审计](../../work/data-seed/diagnostic-v3/material-correction-comparison.json)，全部业务CSV相同，仅reference.sql及包/源码摘要变化。


## 独立数据准备工具迁移（2026-10-26）

依据用户在本次会话确认的 `tools/data-seed/` 方案实施，同步 home 脚手架页。此切片状态为 `review`，数据库和容器验证待补；既有诊断数据交付记录保持原状态。

- 生成器、profiles、冻结素材、零售迁移和四个测试模块移入 [独立工具](../../tools/data-seed/README.md)。Python 包为 `compass-data-seed`，导入入口为 `compass_data_seed`；根 `pnpm data:seed` 与 `pnpm data:prepare` 保持兼容。
- pnpm / uv workspace、两份锁文件、Pyright / pytest 范围、Turbo 检查与构建同步登记。无常驻 `dev` 任务；真实 PostgreSQL 测试使用独立且不缓存的 `test:integration`。工具构建及测试的缓存输入覆盖规范 DDL。
- Agent 保留自身应用迁移和三天样本。三个 Python 镜像仅补充工具的 workspace 元数据，安装目标仍为所属 app；wheel 检查确认 agent / memory / worker 均无数据工具源码，工具 wheel 包含 CLI、profiles、冻结素材和校验 SQL。
- owner 改为 `data-seed/retail`。迁移保留 `retail_0001` revision、独立版本表、既有 DDL 唯一源及候选发布策略。本次未改业务结构、权限语义或数据库内容，无数据库版本升级；既有数据库、活动清单和正式学员数据包不变。恢复源码通过版本回退，数据恢复仍按旧清单回切。
- home `/scaffold` 的 Monorepo 目录图、工程规范、研发流程和数据准备说明已同步。浏览器检查新路径、独立安装命令、生成 / 校验 / 导出步骤和零售迁移说明；保留五 App 的边界。

### 本次验证

- `pnpm check` 通过：工具入口测试 57 项；数据工具离线测试 34 项，涵盖原有业务契约、复现、语义、导出与新增快照入口 / 迁移路径回归；Agent 5 项、Memory 1 项、Worker 2 项、Web 19 项、home 19 项。类型检查、lint、格式、契约漂移及依赖边界通过。
- `pnpm build` 通过：五个 App、独立工具及契约任务共 7 项；Python wheel / sdist 与两个 Next.js 生产构建完成。
- 实际 `pnpm data:seed` fixture 生成、validate、export-sql 均成功；通过新私有源码快照重放，同 release / profile / seed 得到一致 `content_hash`。本地证据在 `work/data-seed-refactor/`，不提交。
- 冻结素材由既有 manifest 和测试校验；迁移仅修正 catalogs 父目录 README 的相对链接，不修改冻结素材内容。
- `pnpm test:integration -F data-seed` 收集 11 项，因缺少显式 `COMPASS_RETAIL_TEST_ADMIN_URL` 全部跳过，不计通过。尝试创建本机临时 PostgreSQL 容器时，Docker 报镜像存储 I/O 错误；后续镜像构建返回 EOF，daemon 报无法启动。未重置 Docker 或删除已有卷。
- 待补：Docker 恢复后构建并运行受影响 profiles、执行 `pnpm smoke --memory`，提供专用零售测试连接后重跑 11 项 PostgreSQL 权限、发布、恢复与 SQL 实导用例；当前不宣称容器运行及实库回归通过。
