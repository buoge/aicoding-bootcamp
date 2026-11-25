# 数据生产阶段与最终表的映射

> 本附件以 `config/schema_contract.json` 的 PostgreSQL 17、schema 1.0.0 为准，覆盖当前 **63 张表、643 个字段和 219 条外键**。模型明确包含历史身份绑定、锁库尝试证据与独立库存估值，分别由 `core.customer_identity_link`、`core.stock_allocation_attempt`、`core.inventory_valuation_snapshot` 承载。本文及 `config/contoso_patch_contract.json` 都是待实现设计，出现的阶段名、接口名和命令样式均不表示已有可运行生成器。

## 1. 校对结论与统一口径

Python 先定精确槽位及业务上下文 → Contoso 生成候选 → Python 推进领域过程的路线可以落到当前模型。必须按以下已确定的细节实施：

| 项目 | 当前模型的明确约定 |
|---|---|
| 订单配额 | `core.order_header` 恰好 1,000,000 行；tenant 101/102/103 分别 900,000/50,000/50,000 |
| 下单与尾窗 | 本地新单区间 `[2023-01-01, 2026-01-01)`；事件区间到 `2026-04-01` 不含，仅后 90 天无新单 |
| 创建后缺货 | 保留头、行、逻辑单件及 CREATED 事件；锁库失败写可观察尝试，后写 CANCELLED / STOCK_LOCK_FAILED |
| 规范行 | 同一订单相同 SKU 合并；本 v1 保证同 SKU 同 price_id、listing_id 与优惠适用性；否则报配置错误 |
| 原始行血缘 | 原 proposals 不变；用 `source_to_order_line.parquet` 表达原始行到规范行的多对一关系，最终行数不是精确配额 |
| 金额 | CNY、不含税、整数分；v1 无向客户收取的运费且不生产零元订单；物流成本只写经营费用 |
| 支付 | 全额预付后出库；失败支付尝试不计实收，POS 也不得先交付后支付 |
| 库存预留 | 整张订单为原子边界，允许跨多个节点形成计划；全部验证成功才提交，失败无部分预留 |
| FIFO | 对节点内当前未被占用的可售批次按 received_at、lot_id 分配；锁定批次后出库引用该 lot_id |
| 业务状态 | 订单头不写可变 current_status；订单状态、单件状态、物流、售后都写各自事件表 |
| 会员绑定 | 渠道身份不可变；绑定写独立 `customer_identity_link`；订单 customer_id 只保留下单时已知快照 |
| 损坏库存 | RECEIVED 先入 quarantine；DAMAGED 对应 DAMAGE，转为 damaged；SCRAPPED 才物理移除 |
| 收入与成本 | DELIVERED 确认单件收入和原批次 COGS；ACCEPTED 冲收入，RESTOCKED 才冲原成本；损坏/报废不二次扣已计 COGS |
| 平台数据边界 | 平台不造逐用户 session/behavior；百万版平台订单归因固定 UNATTRIBUTABLE，不从日汇总倒造触点 |

## 2. 63 张表的主要生产者

“主要阶段”表示首次产生该资产的责任方；事件和版本记录可能持续写入。读取已有主数据不是重新生产一份主数据。数据库导入按外键拓扑处理，不要求业务发生顺序与物理 COPY 顺序一致。

这里的表名也是规范逻辑资产名。按当前 profile，控制信息使用 PostgreSQL 17，规模较大的事实以不可变 Parquet 提供给受信任的 DuckDB 查询层；全量 PostgreSQL 装载并不是默认要求。DDL 提供结构与一致性参照，文件事实仍要经过同样的逻辑约束验收。

### 2.1 发布与运行基础：4 表

| 真实表名 | 主要阶段与输入 | 生产规则 |
|---|---|---|
| `ops.dataset_release` | source-lock / publish | 固定版本、上游与 fork commit、配置摘要、seed 和时间边界；只有通过验收才进入 PUBLISHED |
| `core.tenant` | compile | 创建 101/102/103 三套独立经营主体及精确配额；不把品牌或地区当租户 |
| `ops.generation_run` | 每个阶段的包装器 | 记录 ACQUIRE/WEIGHTS/CONTEXT/PROPOSAL/SIMULATE/VALIDATE/PUBLISH 的运行和恢复信息 |
| `ops.file_manifest` | 每次完整文件提交 | 记录源配置、中间文件、规范事实及检查点的路径、分区、行数和物理/逻辑哈希 |

### 2.2 主数据、版本配置与经营目标：21 表

| 真实表名 | 主要阶段与输入 | 生产规则 |
|---|---|---|
| `core.geo_area` | compile，中国地区配置 | 为每个租户生成大区/省/市层级；保持城市到大区归属可核验 |
| `core.org_unit` | compile，经营组织配置 | 集团、区域、门店、电商组织独立于地理层级 |
| `core.site` | compile，地点配置 | STORE/OUTLET/WAREHOUSE 有各自开闭店日期、组织与物理区域 |
| `core.channel` | compile，渠道配置 | 固定销售渠道、类型、身份范围与逐用户事件可见能力 |
| `core.brand` | compile，品牌配置 | 企业内品牌及定位；相似品牌名不构成跨租户共享主键 |
| `core.category` | compile，运动户外分类 | 两级树，SPU 只挂叶子；投影到 Contoso 的 category/subcategory 映射留在资产中 |
| `core.sport` | compile，运动标签 | 跑步、徒步等多标签字典，不作为可直接加总的财务层级 |
| `core.spu` | compile，商品款式 | 款式、主品类、品牌、客群、季节和生命周期 |
| `core.spu_sport` | compile，商品标签配置 | 多对多关系；聚合销售时采用筛选或去重 |
| `core.sku` | compile，规格规则 | 合法颜色/尺码/容量等组合；不机械做全部规格笛卡尔积 |
| `core.channel_listing` | compile，渠道映射版本 | 平台编码到统一 SKU 的有效期，保留 available_at/load_batch_id |
| `core.assortment` | compile，地点经营配置 | SKU/节点的经营区间与补货点；缺货不删除 assortment，停售残余库存仍保留 |
| `core.price_period` | compile，价格计划 | 唯一有效价格区间；创建时快照引用 price_id，不回改历史订单 |
| `core.cost_period` | compile，采购成本计划 | 只为新采购批次定价，不重估已有批次 |
| `core.customer` | compile + CRM 事件 | 合成会员，按 joined_at 存在；无真实个人资料 |
| `core.customer_identity` | compile + 渠道身份事件 | 渠道内唯一身份，不含未来 member 绑定字段 |
| `core.customer_identity_link` | CRM 绑定事件 | 仅明确绑定时新增；identity_id 与 customer_id 通过 linked_at 和 available_at 区分业务与知识时间 |
| `core.calendar` | compile，固定课程日历 | 包含订单期与尾窗日期；权重数值留在中间资产，不伪装成官方假期统计 |
| `core.campaign` | compile，活动计划 | v1 每条活动恰有一个非空 target_channel_id；跨承接渠道拆活动；计划可提前可见，按有效时间实际生效 |
| `core.promotion` | compile，价格优惠计划 | v1 百分比与满额减免；Python 按已定优先级适用与分摊 |
| `core.target_monthly` | compile，预先批准目标 | 月×渠道×区域×指标×计划版本；不能看完实际结果后倒推“恰好达成”的目标 |

### 2.3 订单、优惠、支付与锁库证据：8 表

| 真实表名 | 主要阶段与输入 | 生产规则 |
|---|---|---|
| `core.order_header` | context + proposal → ORDER_CREATED | 每槽位一张头；contoso_proposal_id 必须能回溯；线上 selling_site_id 为空 |
| `core.order_line` | canonicalize + pricing | 合并相同 SKU 原始候选行；写 price_id、listing_id 和创建时金额 |
| `core.order_unit` | canonicalize + pricing | 将 quantity 展成逻辑计量单件；不是实物序列号；整数分优惠完整分摊 |
| `core.discount_allocation` | pricing | 每条优惠对单件的一次分摊；多个优惠的次序和累计上限确定 |
| `core.order_status_event` | OMS 状态机 | CREATED/RESERVED/PAID/PART_SHIPPED/SHIPPED/COMPLETED/CANCELLED；退款不伪造额外状态枚举 |
| `core.order_unit_event` | 单件状态机 | 记录每个单件的创建、预留、释放、支付、出库、交付或取消 |
| `core.stock_allocation_attempt` | 异步锁库 | 每个 allocation_group_id 的地点×SKU 尝试；写 requested_qty、available_before_qty 与最终 outcome |
| `core.payment` | 支付过程 | 每次即时完成尝试一行；SUCCEEDED 在 attempted_at 即现金成功，成功累计等于应付才进入 PAID |

### 2.4 供应、履约与库存：9 表

| 真实表名 | 主要阶段与输入 | 生产规则 |
|---|---|---|
| `core.inventory_document` | 期初、计划供应、反应式补货/调拨 | OPENING/PURCHASE/TRANSFER/DISPOSAL 保留计划时点，实际完成靠流水 |
| `core.inventory_document_line` | 上述单据明细 | 按 SKU 记录计划数量，不能用未来到货时间覆盖历史计划 |
| `core.inventory_lot` | 开账/收货/调入/退货接收 | 每批冻结成本与来源；parent_lot_id 保留跨地点或退货来源 |
| `core.inventory_movement` | 库存状态机 | 五桶变动、原子业务组、唯一源事件腿；数量唯一真值 |
| `core.shipment` | 全额支付后的履约计划 | 订单×发货地点的一张包裹/POS 交付单；允许多个包裹 |
| `core.shipment_item` | 实际 SHIP | 一个逻辑单件最多一次出库；保存实际 site 和 FIFO lot |
| `core.shipment_event` | 履约/物流过程 | SHIPPED/DELIVERED/DELIVERY_FAILED/RETURNED_TO_ORIGIN；失败未交付不认收入 |
| `core.inventory_snapshot` | 日末物化 | 百万版仅一套 final_restated 全时期日末五桶快照；零库存仍输出；历史知识时点从流水重放并按评测 cutoff 缓存 |
| `core.inventory_valuation_snapshot` | 日末物化 | 同域单版本的逐批可售余额×原批单位成本；预留已含其中，排除 quarantine/damaged；历史时点估值也须重放原批次余额 |

### 2.5 售后与现金退款：5 表

| 真实表名 | 主要阶段与输入 | 生产规则 |
|---|---|---|
| `core.return_header` | 已交付商品的售后申请 | 归原订单销售区域；接收门店可以在其他区域 |
| `core.return_item` | 合法可退单件选择 | 引用原 shipment_item；v1 一个逻辑单件最多一条售后申请 |
| `core.return_event` | 售后状态机 | REJECTED 仅在寄回前，且没有 RECEIVED 或库存接收；收到实物后 ACCEPTED，再 RESTOCKED 或 DAMAGED/SCRAPPED；回库的 restocked_lot_id 指向接收时已创建的 RETURN 批次 |
| `core.refund` | 取消/接受售后的退款尝试 | 每笔引用一笔成功支付；CANCEL 或 RETURN；即时尝试成功发生在 attempted_at，现金与销售冲减时点分开 |
| `core.refund_allocation` | 退款分摊 | 每笔退款分到原逻辑单件；按退款状态计算成功累计，不能超单件净额或原支付额 |

v1 的拒绝路径为 REQUESTED → REJECTED，发生在客户寄回之前，不新增 RETURN lot、RETURN_RECEIVE 流水或 quarantine。实际寄回后为 REQUESTED → RECEIVED → ACCEPTED，再判定恢复可售或损坏；收到实物后拒收并寄回客户留待 v2。接收时在真实 receiving site 新建 RETURN lot，parent_lot_id 为原发货 lot、unit_cost_cent 为原成本，初始只增加该退货 lot 的 quarantine。RESTOCKED 从同一个退货 lot 的 quarantine 转入 sellable，不另建第二个回库批次；成本冲回仍引用原发货 lot。

### 2.6 收入、成本与经营费用：3 表

| 真实表名 | 主要阶段与输入 | 生产规则 |
|---|---|---|
| `core.revenue_entry` | DELIVERED / ACCEPTED | 单件交付 +net_cent；售后接受 -net_cent；引用直接业务事件 |
| `core.cost_entry` | DELIVERED / RESTOCKED | 交付 +原批成本；可售回库 -原批成本；原出库 lot_id 不改变 |
| `core.order_fee` | 佣金、物流、支付手续费发生 | source_system/source_fee_no 唯一标识来源；负费用必须引用同订单原费用；直接业务事件可追踪；投放费不重复写入此表 |

### 2.7 行为、平台报表与归因：6 表

| 真实表名 | 主要阶段与输入 | 生产规则 |
|---|---|---|
| `core.web_session` | 自有渠道流量计划 | 仅 has_user_events=true 渠道；成功创建订单的会话在 started_at 已有同渠道 identity；匿名会话仅浏览或未成功创建订单，会员仍可未知 |
| `core.behavior_event` | 自有会话过程 + 同源下单 | 购物篮相关轨迹引用同一 proposal/SKU；只有 CHECKOUT_SUBMITTED 引用已创建 order_id |
| `core.campaign_daily` | 广告源过程 | 活跃活动本地日×全部租户 REGION 大区，固定活动 target_channel_id；未投放地区输出零报告；迟到修订追加版本，不直接连接订单行后加总 |
| `core.channel_product_daily` | 平台订单 cohort + 平台可见统计 | report_date 为下单日期 cohort，后续支付通过 report_version 修订；SKU 内订单去重，跨 SKU 不可直接加总成独立订单数 |
| `core.store_traffic_daily` | 门店客流计划与报表过程 | 输出进店人次；与 POS 购买过程同源约束，但不是企业去重访客 |
| `core.order_attribution` | 已可观察证据的归因计算 | 自有渠道采用 7 天末次非直接触点；无可观察证据为 ORGANIC 或 UNATTRIBUTABLE；百万版平台固定 UNATTRIBUTABLE |

`PLATFORM_REPORTED` 只保留在 schema 枚举中供将来扩展，当前生产配置不输出这种证据。日汇总的活动点击数或平台商品 UV 无法确定某一张订单的触点，不能为了演示归因把它们随机分到订单。

自有订单的会话和归因证据限定为同租户、同渠道、同 identity_id，且身份在 session.started_at 已存在，触点在下单时已可见；customer_id 仍可以未知。v1 匿名会话不生成成功创建订单；中途登录另开已识别会话，不用未来身份或会员绑定回填旧匿名会话。

广告应到粒度必须可枚举：活动有效区间与中国本地日采用 `starts_at < day_end AND ends_at > day_start` 判断相交，再乘该租户所有 `geo_area.geo_level='REGION'` 大区。活动的唯一 target_channel_id 决定日报 channel_id。未投放地区也有明确零报告；按知识截止选择最新可见 report_version 后，应到与已到不一致则 `ads_complete=false`，完整广告费与经营贡献为 NULL，但保留 observed spend。不能把缺报当零花费，也不能用广告日表伪造订单触点。此契约与 `sql/03_metrics.sql` 一致。

### 2.8 采集与完整性：2 表

| 真实表名 | 主要阶段与输入 | 生产规则 |
|---|---|---|
| `ops.ingestion_batch` | 源采集计划与到达过程 | PIM/OMS/POS/WMS/CRM/ADS/WEB/ERP 批次窗口及接收时刻；每条带审核字段的事实/版本引用本租户批次 |
| `ops.source_watermark` | 已到批次的连续覆盖计算 | complete_through 由完整批次覆盖决定，不能用 MAX(event_at) 或最新一条记录充当完整性证明 |

### 2.9 权限与独立评测：5 表

| 真实表名 | 主要阶段与输入 | 生产规则 |
|---|---|---|
| `sec.principal` | 管理员配置的角色映射 | 明确实际登录角色、租户、persona、区域范围及成本权限 |
| `sec.principal_region` | 管理员授权配置 | 部分区域角色的精确授权集；不由普通 Agent 写入 |
| `eval.scenario` | 冻结场景参数 | 保存注入机制、范围、证据及反事实定义，对业务 Agent 隔离 |
| `eval.question` | 独立题库设计 | 固定租户/角色、业务时点、知识时点、指标版本、金标 SQL 与输出形式 |
| `eval.expected_result` | 独立 SQL 验证器 | 在指定 release 上计算结果和哈希；不把 Agent 自己生成的 SQL 当金标 |

以上各组总计：4 + 21 + 8 + 9 + 5 + 3 + 6 + 2 + 5 = **63 表**。Contoso 的 calendar_weights、context、proposals、商品映射和血缘映射都是外部中间资产，由 file_manifest 管理，不额外冒充业务表。

## 3. 结构化 proposal 到真实字段

| 中间契约 | 规范目标 | 转换与校验 |
|---|---|---|
| context.tenant_id/order_id | order_header.tenant_id/order_id | 101/102/103；不通过数据库随机 sequence 决定可复现身份 |
| proposal.proposal_id | order_header.contoso_proposal_id | 同租户唯一；必须可回到原候选文件与固定源码版本 |
| context.created_at_utc/business_date | order_header.ordered_at/order_date | UTC 与 Asia/Shanghai 日期一致 |
| context.identity_id | order_header.identity_id | 渠道身份必须属于同一 channel_id；不等价于企业会员 |
| context.customer_id | order_header.customer_id | 可空；仅在创建时业务已确认绑定时写快照；未来 link 不回填 |
| context.channel_id/org_unit_id/region_id/demand_geo_id/selling_site_id | order_header 同名字段 | 销售归属、需求城市和物理下单门店分别验证；线上无 selling_site_id |
| proposal_line.contoso_product_id | product_id_map → order_line.sku_id | 与 tenant 联合映射；上市、渠道 listing、经营区间有效 |
| proposal_line.quantity | 合并后的 order_line.quantity | 只合并 v1 保证同价/同优惠适用性/同 listing 的 SKU；写原始行到规范行的数量血缘 |
| Python 定价 | order_line.price_id/list_unit_cent/gross_cent/discount_cent/net_cent | C# 不产生权威金额；与 price_period 及 promotion 版本一致 |
| canonical line 的 quantity 与金额 | order_unit 及 discount_allocation | unit_no 连续；单位金额合计等于规范行，规范行合计等于订单头 |
| context.source_session_id | web_session、CHECKOUT_SUBMITTED、order_attribution | 仅自有渠道允许；平台为空；不在 order_header 虚构一个不存在的 session_id 列 |
| context.campaign_context_id | 创建前的营销上下文 | 可观察触点才进入归因；优惠实际应用进入 discount_allocation，不直接随机写归因 |
| context.assortment/pricing/fulfillment profile | manifest 管理的中间规则资产 | 不是不存在的数据库外键；最终事实保留 sku/listing/price/site 等真实引用 |

## 4. 原子锁库和 FIFO 的可落地算法

1. ORDER_CREATED 一次性生成头、规范行、逻辑单件及相应 CREATED 事件。其后锁库失败不删除这些事实。
2. 从固定履约策略得到每个 SKU 在各候选节点承担的数量；只按允许路由规划，不重新抽商品。对需要的批次按 `(site_id, sku_id, received_at, lot_id)` 稳定排序。
3. 在临时状态中，按单件分配当时可售且未预留的批次数量；整个订单形成一个 `allocation_group_id`。每个地点×SKU 保存 requested_qty 与同一尝试视图下的 available_before_qty。
4. 若全部满足，尝试行全部 COMMITTED；为每个单件写 RESERVED 事件以及对应 RESERVE 流水。全订单所有分仓流水共享一个 `business_txn_id`，本次预留的 business_txn_id 与 allocation_group_id 使用同一稳定 ID，在同一逻辑事务提交，源事件腿号稳定且唯一。
5. 若任一项不足，该项为 INSUFFICIENT；其他本来可以满足、但因整单失败未提交的项为 ROLLED_BACK。此组没有 COMMITTED、没有 RESERVE 流水、没有 RESERVED 单件事件；订单和所有单件取消，原因 STOCK_LOCK_FAILED。尝试行保留真实缺口证据。
6. 支付超时或出库前取消，按原预留的 site/lot/unit 释放，写 RELEASE 流水及 RELEASED 事件；幂等重放不能再次释放。
7. 成功实收累计达到 payable_cent 后才允许 SHIP。shipment_item 固化被预留的原 lot；SHIP 同一腿的 sellable_delta=-1、reserved_delta=-1，不能先扣两次实物数量。

DDL 的 UNIQUE/FK/CHECK 可确保引用和部分静态约束，**并不自动证明 FIFO、整单原子或全额支付门槛**。这些是仿真器的提交前约束，并由独立验收从 attempt、unit_event、movement、shipment 和 payment 重建验证。

## 5. 五桶库存事件与直接来源

以下用一件商品表示，批量单据可用数量 q。列顺序为 `sellable, quarantine, damaged, reserved, in_transit`。

quarantine 是隔离实物桶，包含待检及已接受退货后尚未恢复可售的实物；“待检”简称不意味着 ACCEPTED 时立刻离开该桶。

| 业务事件 | inventory_movement.movement_type | 五桶变化 | 直接来源与说明 |
|---|---|---|---|
| 开账 | OPENING | `(+q,0,0,0,0)` | DOCUMENT_LINE；新开账 lot |
| 采购到货 | RECEIPT | `(+q,0,0,0,0)` | DOCUMENT_LINE；新采购 lot 固定成本 |
| 单件预留 | RESERVE | `(0,0,0,+1,0)` | UNIT_EVENT / RESERVED；记录被分配 lot |
| 预留释放 | RELEASE | `(0,0,0,-1,0)` | UNIT_EVENT / RELEASED；原 lot |
| 单件出库 | SHIP | `(-1,0,0,-1,0)` | UNIT_EVENT / SHIPPED；与 shipment_item 相同 lot |
| 实物退货接收 | RETURN_RECEIVE | `(0,+1,0,0,0)` | RETURN_EVENT / RECEIVED；真实接收地点新 RETURN lot，parent 与成本沿袭原出库 lot；只入该退货 lot 的 quarantine |
| 质检可售回库 | RESTOCK | `(+1,-1,0,0,0)` | RETURN_EVENT / RESTOCKED；同一退货 lot 内 quarantine 转 sellable，restocked_lot_id 引用该 lot；成本冲回引用原出库 lot |
| 判定损坏 | DAMAGE | `(0,-1,+1,0,0)` | RETURN_EVENT / DAMAGED；物品仍在库，无成本二次扣减 |
| 损坏品报废移出 | SCRAP | `(0,0,-1,0,0)` | RETURN_EVENT / SCRAPPED；或正式 DISPOSAL 单据；不能在判损时就减物理总数 |
| 调拨离开来源仓 | TRANSFER_OUT | `(-q,0,0,0,0)` | DOCUMENT_LINE；来源节点及原 lot |
| 调拨进入目的地在途 | TRANSIT_IN | `(0,0,0,0,+q)` | 同单据行另一稳定腿；目的节点；与 TRANSFER_OUT 同一业务提交 |
| 调拨结束在途 | TRANSIT_OUT | `(0,0,0,0,-q)` | DOCUMENT_LINE；目的节点 |
| 调入目的仓 | TRANSFER_IN | `(+q,0,0,0,0)` | 新 TRANSFER lot 保留 parent 和原成本；与 TRANSIT_OUT 原子提交 |
| 未交付包裹退回原仓 | RTO_RECEIPT | `(+1,0,0,0,0)` | SHIPMENT_EVENT / RETURNED_TO_ORIGIN；新 RETURN lot 保留原出库成本、parent_lot_id 与单件引用；v1 只处理完好退回 |

`source_kind + source_event_id + source_leg_no` 在租户内唯一。源为 UNIT_EVENT、SHIPMENT_EVENT、RETURN_EVENT 或 DOCUMENT_LINE 时，验证器必须查到相应真实源并核验类型与时间；这是类型化校验，不是 SQL 多态 FK 自动提供的保证。

RTO 是未交付异常链，不伪装成普通消费者售后：没有 DELIVERED，没有交付收入或 COGS，因而也不生成收入/COGS 冲回；现金按 CANCEL 退款返还。v1 不对 RTO 加损坏分支，以免引入未定义的未交付损失核算。

库存查询必须区分：

- 可承诺数量 = sellable − reserved。
- 现场实物数量 = sellable + quarantine + damaged；reserved 已含在 sellable，不能重复计数。
- 在途数量独立列出，按目的节点归属。
- 可售存货金额 = 对每个 lot 的 sellable 余额乘该 lot 原始 unit_cost_cent 后求和；不额外加一次预留、不用最新 cost_period 重估。

## 6. 业务时间、可见时间与采集批次

支付和退款在本 v1 都是即时完成尝试：status=SUCCEEDED 与 attempted_at 同时发生，不模拟异步悬而未决结果。available_at 只描述分析数据晚到。以后若增加异步成功，需增加 completed_at 或结果事件；不能仅覆盖 status 而把未来现金归到旧 attempted_at。

经营费用以 `(tenant_id, source_system, source_fee_no)` 幂等，重复回调保留同一源费用号。`source_event_kind` 的目标固定为 PAYMENT → core.payment.payment_id、SHIPMENT → core.shipment_event.shipment_event_id、RETURN → core.return_event.return_event_id、REFUND → core.refund.refund_id；`source_event_id` 不能只填一个无法追踪的随机数。负金额使用 reversal_of_fee_id 回指同一订单及区域的原正费用，累计冲回绝对值不能超过原费用，不能让退款重试重复冲回手续费。该多态来源需要独立验证器核验，DDL 的枚举和同订单 FK 不能代替来源事件检查。

对于已发生的事实，available_at 不得早于其直接业务事件；对于提前发布的价格或活动计划，available_at 可以早于生效时刻，查询需要同时满足版本有效期与知识时点条件。不得对全部表盲目使用 `available_at >= valid_from`。

订单、支付、物流和库存的业务状态机按 event time 推进；采集延迟另由源批次决定，不能让分析系统晚到数据改变真实业务事件顺序。每条带 load_batch_id 的事实或版本必须引用同租户的 ingestion_batch，且源系统归属与该资产一致。

同一个库存 business_txn_id 的全部腿必须原子可见，不能让跨仓调拨的出库腿先被报表看到、在途腿后到。库存源还应维持可重建的因果闭合：不能让 RELEASE、SHIP 或 RESTOCK 的可见时间早于必要的 RESERVE、初始库存或 RETURN_RECEIVE，导致知识时点快照出现虚假的负数。故库存采集批次要维持分区顺序，或对可见时刻取相应依赖到达时刻的上界。

库存重算同时限定业务日截止与 knowledge_as_of，且只读取完整提交的库存事务。百万版只发布一套 final_restated 全时期日末数量快照和同域估值快照；不会再悄悄生成一套全量 daily_operational 快照。历史知识时点须对当时可见的事件流水重放，并按评测需要的 cutoff 生成缓存；**过滤最终重述快照的 available_at 不能恢复过去已知库存**。schema 中 as_of 能区分缓存版本，但容量计划不把每个可能 cutoff 都物化。source_watermark 根据批次窗口的连续完整覆盖重算；业务最新时间不是完整水位。

平台日商品表采用下单日期 cohort：submitted_orders 是含该 SKU 的创建订单去重数，paid_orders 是同一 cohort 截至版本时点已全额支付的订单数；paid_amount_cent 是该 cohort 分配给该 SKU 的支付成交额。跨日支付通过后续 report_version 修订，不把支付发生日与下单日两个独立集合混进同一分母。现金日统计仍从 payment.attempted_at 计算。

## 7. 对齐验收清单

本附件的落地验收至少要求：

1. 真实表名覆盖恰好 63 表；中间文件不虚构为数据库表。
2. raw proposal 头数与三个租户订单头精确一一对应；原始行数量和 canonical line/unit 血缘数量守恒。
3. 订单头无未来会员回填；身份、绑定、订单快照分别满足自身时点语义。
4. 库存尝试组全部成功或全部未提交；失败组仍有明确 INSUFFICIENT 证据；没有部分库存占用残留。
5. 对每个单件可追到被分配的 FIFO lot、预留、释放或出库，任一阶段不超卖、不重复出库。
6. 同一库存源事件腿唯一，原子组完整，五桶前缀余额合法；快照及估值可由符合两种时间条件的流水重算。
7. 每个 SHIP 前成功支付累计已覆盖原订单应付；支付失败、预付款与收入确认分别统计。
8. DAMAGED 保留物理数量，SCRAPPED 才移除；两者都不额外重复扣已确认 COGS。
9. 平台不生成 session/behavior 和虚构触点；channel_product_daily 的支付订单数来自同一下单 cohort。
10. 相同输入与 seed 重跑及检查点恢复，规范逻辑行哈希一致；所有中间与最终文件进入 manifest。
11. 活动具有唯一非空 target_channel_id；每个活跃日×租户全部大区有一条应到日报，未投放地区零报告与缺报可区分；自有订单不借未来身份回填会话。

本附件只修订生产文档与补丁接口要求；未修改 `tools/build_contract.py`、DDL 或任何运行期生成器，也没有生成百万数据。
