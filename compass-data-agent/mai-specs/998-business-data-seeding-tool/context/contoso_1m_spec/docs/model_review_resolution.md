# 模型审查问题与解决边界

本记录对应独立审查提出的 10 项问题，区分已经落入 `schema_contract.json` / `01_schema.sql` 的结构约束、`02_security.sql` 的访问控制，以及生成和装载时必须执行的硬验收。**“已增加字段/FK”不等于相关业务语义已经验收通过。** 下面的验收要求由 `validation/acceptance.sql` 与生成器状态机承担；最终编号以该文件为准。

当前模型为 63 张表。审查后新增了身份绑定表、库存分配尝试事实和库存估值快照；库存、费用及来源字段继续补强。生成器与校验器必须基于发布时实际 schema 指纹，不能依赖本记录中的历史字段总数。

| # | 审查问题 | 已落入模型/权限的变化 | 仍须通过的装载硬验收 |
|---|---|---|---|
| 1 | 收入/成本引用了事件，却未证明属于同一单件的正确事件 | 保留单件复合键、shipment-item/订单链、分录类型与符号 CHECK；每个单件每种分录唯一 | DELIVERY 必须经原 shipment_item 指向同包裹的 DELIVERED；退货分录指向同单件 ACCEPTED/RESTOCKED；recognized_at 与对应源事件一致；收入为 ±单件 net，成本为 ±原出库 lot 成本；每条允许分录完整且不重复 |
| 2 | 退货/调拨批次的 SKU、地点与成本可能断链 | `inventory_lot.parent_lot_id + sku_id` 采用同 SKU 复合 FK；RESTOCKED 需要 lot，实物退货事件要求 site；新增 DAMAGED 桶语义与库存估值事实 | RESTOCKED 的新 lot 必须与退货 SKU、实际接收 site、原 shipment_item/父 lot 一致；TRANSFER/RETURN 子 lot 成本等于原批次；按父 lot 拆批，不能把多个 FIFO 成本混成平均成本；cost_entry.lot_id 始终是原出库批次 |
| 3 | 库存来源与幂等缺少固定键 | movement 增加 business_txn_id、source_kind、source_event_id、source_leg_no；来源腿复合 UNIQUE；租户 event_seq UNIQUE；增加 RTO_RECEIPT、DAMAGE 与 damaged_delta | 按 source_kind 解析真实源表，并证明业务单件、SKU、site、lot、业务时间对应；各类型使用确定桶模板；同一 business_txn 原子提交；所有变动在每次原子提交后余额合法；快照与流水重放一致；调拨在手/在途守恒 |
| 4 | AsOf 的主数据可知时间及未来身份绑定缺失 | listing、assortment、price、cost、campaign、promotion 增加 available_at/load_batch_id；身份从 immutable customer_identity 拆到 customer_identity_link，绑定有 linked_at/available_at | 派生事实不早于必要来源可知时间；每个时点使用正确有效版本；订单不被未来会员绑定回填；日报先截断再去重；snapshot 的业务日与知识 as_of 区分；完整 broker/快照层仍是后续实施项 |
| 5 | 未交付 RTO 可能错误套用正常退货财务链 | 保留 RETURNED_TO_ORIGIN 物流事件，增加库存 RTO_RECEIPT；单件最多一个 shipment_item | 未交付 RTO 回库依据原物流事件恢复库存；不产生 DELIVERY 或 RETURN_ACCEPTED 收入，也不产生 COGS 冲回；已付款部分按取消退款；禁止同一逻辑单件第二次发货，重下单是新订单 |
| 6 | 销售区域与地点区域 RLS 混用；区域用户可读全租户身份 | `02_security.sql` 显式分类：site 是租户级公开维度；销售事实按销售区域，库存按地点区域；客户三表限全区且额外获授角色；区域用户只读关联订单的粗粒度视图 | 实际 session_user 正负例验证；跨仓收入/COGS 汇总不因库存 lot 隐藏而漏算；成本无权时 NULL；任何接收门店作业视图单独设计，不扩大为完整原订单/客户访问；AsOf 客户裁剪不能使用未来订单 |
| 7 | listing/price/identity 可能指向另一个 SKU 或渠道 | order_line 增加 channel_id 并与 header 复合关联；listing/price FK 带 SKU 与 channel；header identity FK 带 channel | 价格/listing 有效区间覆盖 ordered_at 且 available_at 满足查询知识截止；同自然键区间不重叠；web_session 与其 identity 的渠道一致；非法商品变体、头行单件数量及整分分摊均阻断发布 |
| 8 | 退款可指向失败支付，缺少取消/接受退货依据 | refund 与 payment、allocation 与 refund/unit 的同订单/tenant/region 键链已存在；v1 支付与退款 attempted_at 明确为即时完成的业务时刻 | 成功退款只引用成功支付；累计退款同时受原 payment 与单件 net 上限约束；每次分配和等于该 refund 金额；CANCEL 对应有效取消，RETURN 对应已接受退货；对应 H08–H11。每次尝试即时完成、未来结果不回填，是 v1 时间契约，不单独占用 H35 编号 |
| 9 | 平台当日支付订单数未必小于当日创建订单数 | 现模型保留 paid_orders <= submitted_orders，因此本版选定“创建日 cohort”语义 | report_date 是订单创建日；submitted_orders 为当日创建且含该 SKU 的订单数；paid_orders/paid_amount 为这批订单截至该报告版本的已支付累计；跨日支付只修订原创建日报；不能另用支付事件日口径与此 CHECK 混算 |
| 10 | 平台聚合日报不能支持每单 campaign 归因 | order_attribution 已排除 PLATFORM_REPORTED，仅允许 OWNED_TOUCH/ORGANIC/UNATTRIBUTABLE；OWNED_TOUCH 必須带 campaign/session/touch_at，其他两类必须为空 | 自有触点必须在归因窗口内、属于同一可观测身份链且当时可知；平台仅有聚合来源时 UNATTRIBUTABLE；不能让生成器隐藏人物图替代企业证据；固定模型每单一条、credit=1，并保留未归因类别 |

## A. 订单单件与金融台账必须同时通过的守恒

单件模型解决部分取消、部分履约、部分退货和整数分分摊，但仅有 FK 不足以保证数量、金额和状态合法。硬验收至少包括：

- 每个 order_line 的单件数等于 quantity，unit_no 连续且不重复；单件 gross/discount/net 精确汇总为行，行精确汇总为订单。
- 成功支付累计达到该订单应付额才进入 PAID；失败支付不产生成功收款。v1 每次 attempted_at 即完成，不模拟异步成功回调与事后改 status。
- 已取消单件不能交付，已交付单件不能按未履约取消处理；退货接受必须建立在原单件已交付的事实之上。
- 交付确认与接受退货冲减分别有且只有一次相应收入分录；可售回库才冲回 COGS；待检和损坏不会被误算为可售回库。
- 现金、确认收入、COGS 与费用按各自业务时点记录；对账在同一明确定义的业务窗口和知识版本进行。

## B. FIFO、损坏与库存估值

库存状态拆为可售实物、待检、损坏、预留、在途；预留属于可售实物的占用，available = sellable - reserved。不能在原子事务的中间腿检查造成误报，也不能跳过事务后的负库存检查。

库存估值快照按原 lot 成本计算可售物理余额；预留仍包含在可售物理内。待检和已判损坏的售后货物在本项目简化口径下不重复确认为可售存货资产。退货损坏不冲原 COGS，后续处置不再次扣同一份损失。所有解释应以本项目口径表述，不声称替代法定会计总账。

## C. 费用来源与冲回门禁

审查后 order_fee 继续补充来源事件和负费用原费用引用。当前 `validation/acceptance.sql` 与 `validation/assertions.json` 使用以下固定编号：

- **H35：费用冲回引用正费用且累计不得超过原金额。** 表中的同订单复合 FK 先约束原费用所属租户和订单；H35 再验证被冲费用为正、费用类型一致、累计负费用绝对额不超过原费用。不能用一笔无来源的负费用“把报表调平”。
- **H36：费用发生来源属于本单且不晚于确认时点。** 按 PAYMENT / SHIPMENT / RETURN / REFUND 解析实际源事件，验证来源属于同一租户和订单，源业务时间不晚于 recognized_at，源 available_at 不晚于费用 available_at；支付和退款来源还须成功。采集批次的到达一致另由 B30 验证。

表结构能够保存费用源，并不自动证明费用业务规则正确。H35/H36 负责上述已实现门禁；各费用类型具体应由何种事件触发、何时允许冲回，仍须遵循生成契约并由状态机验收补全，不能把“来源存在”当成全部计费规则已获验证。金融汇总先各自聚合收入、COGS、费用和广告，不能将四类明细一次连接后 SUM。

## D. 权限与 AsOf 不能互相替代

当前 RLS SQL 已提供真正的 tenant/region/cost 门禁；它不依赖可自由改写的 tenant GUC。AsOf 则需要受信任 broker 固定 business、knowledge、reference 三个时间，并正确截断和物化全部依赖资产。资金/销售/状态的参数化 SQL 函数仅作为参考指标实现，调用参数必须由 broker 绑定。

同一历史报告必须使用冻结的数据 release、指标版本、数据来源版本和授权范围；最后状态不能覆盖过去。评测器的 scenario、gold SQL、expected result 与 master_seed 不向 Agent 发布。题目要求识别的根因必须在授权可见数据中有证据，否则正确结果应允许“证据不足”。

## E. 发布状态的表述

本记录确认结构修订和明确的实施责任，不提前宣布全量数据已经生成或验收通过。发布门槛是：`01_schema.sql` 与 `02_security.sql` 可执行，数据装载后所有阻断级验收为 0 个违规，真实登录安全负例通过，且用于评测的 AsOf/指标函数通过固定样例数值验证。验收编号、执行行数、通过时间和日志路径以实际 validation 输出为准。
