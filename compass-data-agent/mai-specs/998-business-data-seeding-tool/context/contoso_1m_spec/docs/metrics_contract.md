# 参考指标函数契约

`sql/03_metrics.sql` 提供三个 PostgreSQL 17 函数：`mart.sales_daily`、`mart.cash_daily`、`mart.order_state_at`。三个函数均为 `STABLE SECURITY INVOKER`，采用调用登录本身的权限与 RLS；不读取 ops/eval，不使用 NOW 默认值，不提升为管理员身份。函数属性的 PostgreSQL 定义见官方 [CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html)。

本文件解释参数、输出、金额和缺失值语义。函数是参考指标实现，**不代表完整 AsOf broker 已经完成**。业务 Agent 只通过工具 API 调用；三个时间及数据版本由受信任 broker/调度任务绑定。直接把函数参数开放给模型自行选择未来时间，不符合安全契约。

## 1. 公共时间规则

| 项目 | 规则 |
|---|---|
| 数据库时间参数 | 显式 timestamptz，拒绝 NULL/infinity |
| 日汇总业务范围 | `[business_start, business_end)` |
| 日边界 | 必须是 Asia/Shanghai 的 00:00；不能用小时窗口读取整天广告费 |
| 日汇总知识截止 | `knowledge_cutoff >= business_end`；允许较晚知识截止重述较早业务期间 |
| 知识可见规则 | 统一排他：`available_at < knowledge_cutoff`；日报另要求 `source_updated_at < knowledge_cutoff` |
| 订单维回连 | `order_header.ordered_at < business_end`，且所有回连的 order_header/order_unit 均在知识截止前可见 |
| 自然语言时钟 | reference_time 由 broker 固定；函数不解析“今天/昨天/本月” |
| 货币 | CNY、不含税、整数分；金额输出全部 bigint |

`order_state_at` 是时点查询，允许任意有限时间点，不要求上海午夜，也不强制 knowledge_cutoff 与 business_cutoff 的先后关系；两个时钟分别过滤。未知或未经授权的登录不能调用获得数据；没有匹配 principal 时函数报权限错误。

示例：查询上海 2025-12-01 一整天、截至 12 月 3 日零点前已经可知的信息，需要显式传入：

```sql
SELECT * FROM mart.sales_daily(
  '2025-12-01 00:00:00+08'::timestamptz,
  '2025-12-02 00:00:00+08'::timestamptz,
  '2025-12-03 00:00:00+08'::timestamptz
);
```

这是接口示例，不是已生成数据的分析结果。恰好在知识截止时刻发布的记录不在本次结果中；如需纳入该批次，应由 broker 明确选择较后的固定 cutoff，而非临时混用 <=。

## 2. sales_daily

```text
mart.sales_daily(
  business_start timestamptz,
  business_end timestamptz,
  knowledge_cutoff timestamptz
)
```

输出 grain 为 **上海业务日 × tenant × 下单 channel × 原订单销售 region**。收入、COGS、经营费用和广告日报各自聚合到该 grain 后才连接，避免一个单件的多次财务分录与广告明细相乘。计算成本不依赖跨区域库存 lot 的 inner join。

| 输出列 | 类型 | 定义 |
|---|---|---|
| business_date | date | recognized_at/广告 report_date 对应的上海日期 |
| tenant_id | smallint | 当前登录获授权租户 |
| channel_id | bigint | 订单下单渠道；广告为报告承接渠道 |
| region_id | bigint | 原订单销售区域；广告为报告经营区域 |
| delivery_revenue_cent | bigint | 本日交付确认的正向收入 |
| return_revenue_cent | bigint | 本日退货验收接受产生的有符号收入冲减，通常为负 |
| net_sales_cent | bigint | 上述两类收入之和 |
| cogs_cent | bigint，可 NULL | 交付 COGS 与可售回库成本冲回的有符号净额 |
| gross_profit_cent | bigint，可 NULL | net_sales - COGS |
| operating_fees_cent | bigint，可 NULL | 当日确认的订单经营变动费用净额，含合法负费用冲回 |
| observed_ad_spend_cent | bigint | 本次实际可见的最新版本广告报告金额之和；不声称缺失部分为 0 |
| ad_spend_cent | bigint，可 NULL | 报告完整时的广告费；缺失或非预期粒度报告时为 NULL |
| contribution_cent | bigint，可 NULL | net_sales - COGS - 经营费用 - 广告费；成本无权或广告不完整时 NULL |
| cost_visible | boolean | sec.allowed_cost(tenant_id) 的授权结果 |
| ads_complete | boolean | 该 grain 下预期广告日报全部可见，且没有非预期报告 |
| expected_ad_reports | bigint | 该日/渠道/区域预期的活动报告数量 |
| visible_ad_reports | bigint | 本次知识截止前实际可见的最新报告数量 |

### 2.1 确认口径与成本权限

收入来自 revenue_entry：交付确认，退货接受时冲减。COGS 来自 cost_entry：交付按原出库 lot 成本计入，可售回库时冲回；损坏不冲回。经营费用来自 order_fee，现金退款不直接替代收入冲减。

`cost_visible=false` 时，COGS、毛利、经营费用和贡献均为 NULL，收入与获授权广告花费仍可见。函数不会将被 RLS 隐藏的成本当作零。

`cost_visible=true` 仅表示允许读取成本，**不表示所有成本来源已完整送达**。财务数字是给定知识版本中已知记录的聚合，最终性仍需外层依赖数据水位判断；源尚未完整时，不应向用户称其为最终关账结果。

### 2.2 广告日报完整性契约

v1 选择一个可以显式枚举的来源契约：每个已经可知且在某日有效的 campaign，具有唯一非空 `target_channel_id`，并为本租户每个 REGION 发布一条日广告报告；没有向某区域投放时也发出曝光、点击和花费均为 0 的报告。活动主数据须在投放前可知。需要不同承接渠道的活动在 v1 拆成不同 campaign。

函数按调用者的区域权限缩小“应到报告”集合，绝不因公开 geo_area 维度而返回其他授权区域的指标。广告报告先按 available/source_updated 截断，再在 tenant/date/campaign/channel/region 内选择最大可见 report_version。

| 情况 | ads_complete | ad_spend_cent | contribution_cent |
|---|---|---|---|
| 有活跃活动，所有应到报告可见且包含明确 0 行 | true | 可见最新报告金额之和 | 有成本权限时计算 |
| 存在应到报告但缺失 | false | NULL | NULL |
| 可见报告不属于已知活动日/承接渠道/区域的预期集合 | false | NULL | NULL |
| 该日/渠道/区域明确没有活跃活动，且没有任何广告报告 | true | 0 | 有成本权限时计算 |
| 活跃活动缺 target_channel_id | 不返回结果，报参数/契约错误 | — | — |

`observed_ad_spend_cent` 在缺报时仍显示已观察到的金额，便于诊断；不能将其标签写成“总广告费”。`ads_complete` 依赖已知活动主数据的完整性，不证明未知活动不存在，活动源和 ADS 源水位应由 broker 另外核对。函数没有从 ops 推断“最终状态”。

函数会为存在广告应到报告但尚无销售的 grain 返回一行，用于显示缺报或只有投放的经营情况。既无业务事实、也无广告活动/报告的日期和组合不自动构造全积；看板补零必须先确认来源完整。

## 3. cash_daily

```text
mart.cash_daily(
  business_start timestamptz,
  business_end timestamptz,
  knowledge_cutoff timestamptz
)
```

输出 grain 为上海现金事件日 × tenant × 订单渠道 × 原订单销售区域。支付和退款各自聚合后连接，既不连接商品行放大金额，也不以订单创建日代替现金发生日。

| 输出列 | 类型 | 定义 |
|---|---|---|
| business_date | date | attempted_at 的上海日期 |
| tenant_id | smallint | 授权租户 |
| channel_id | bigint | 订单渠道 |
| region_id | bigint | 原订单销售区域 |
| paid_cash_cent | bigint | 本日 SUCCEEDED payment 金额 |
| refunded_cash_cent | bigint | 本日 SUCCEEDED refund 金额，退款流出以正数呈现 |
| net_cash_cent | bigint | paid_cash - refunded_cash，可为负 |
| successful_payment_attempts | bigint | 本日成功支付尝试数 |
| failed_payment_attempts | bigint | 本日失败支付尝试数 |
| successful_refund_attempts | bigint | 本日成功退款尝试数 |
| failed_refund_attempts | bigint | 本日失败退款尝试数 |

v1 的每次 attempted_at 代表该次尝试即时完成，status 为该时点结果；后续采集延迟由 available_at 表示。失败尝试只增加尝试数，不增加成功现金金额。退款连接同订单、同区域的原成功 payment，并要求其当时已经可知；异常链必须在装载时被拒绝。

尝试数不是订单数：同一订单可以有多次失败重试或多笔成功支付。现金净额不是确认收入，现金日汇总不拿来替代交付/退货口径。

## 4. order_state_at

```text
mart.order_state_at(
  business_cutoff timestamptz,
  knowledge_cutoff timestamptz
)
```

一行一个可见订单，两个 cutoff 均不含边界。先筛选已经创建且已经可知的订单头，再在该订单可见事件中按业务事件时间、event_seq、事件 ID 倒序选择一条。若订单头可见，但没有同时满足两个时钟的状态事件，返回 UNKNOWN，不能读取未来事件、最终状态或凭头表猜测 CREATED。

| 输出列 | 类型 | 定义 |
|---|---|---|
| tenant_id | smallint | 授权租户 |
| order_id | bigint | 订单 |
| channel_id | bigint | 下单渠道 |
| region_id | bigint | 销售区域 |
| ordered_at | timestamptz | 下单业务时间 |
| payable_cent | bigint | 下单固化的商品应付金额 |
| state_code | text | 最近可见状态，或 UNKNOWN |
| state_event_id | bigint，可 NULL | 被选中的 order_status_event |
| state_event_at | timestamptz，可 NULL | 被选中事件的业务时间 |
| state_available_at | timestamptz，可 NULL | 事件可知时间 |
| state_event_seq | integer，可 NULL | 订单事件序号 |

该函数不替代单件状态机验收。order_status_event 必须由合法单件、付款与履约状态派生；函数只负责在给定双时钟下正确选取已经持久化的事件。

## 5. 授权与后续 broker 边界

`03_metrics.sql` 只向 `contoso_business_ro` 授予 mart schema 的 USAGE 和这三个函数的 EXECUTE；`contoso_customer_full_ro` 通过组继承获得相同指标调用能力。PUBLIC 不获得 EXECUTE，业务角色没有 mart CREATE、函数所有权或写源表权限。

三个函数使用 SECURITY INVOKER，因此调用者必须具有源表权限，所有读取继续执行 RLS。一个只被授予独立 asof schema 的未来快照消费者，不应再获授这三个直接查询 core 的函数；它应查询冻结后的指标/视图，或由可信 broker 在源阶段执行这些函数。

调用 API 必须冻结 release、授权版本、business/knowledge/reference 三个时钟和语义版本。函数内部没有对任意外部 SQL 建立沙箱，没有实现客户/身份全链路历史快照，也没有完成自动告警、并发调度和缓存授权重验。

## 6. 数值验证最小集合

执行验证应包含：一个订单多个单件与多次分录不放大收入；跨区域出库不丢销售区域成本；交付后退货收入为负、可售回库成本为负；成本无权限全部利润相关列为 NULL；同一广告 grain 多个版本只取知识截止前最新；缺一条应到报告时贡献 NULL；无活动有明确零花费时贡献可计算；支付失败不增加现金金额；现金跨日与销售确认日期分开；状态事件晚到时先 UNKNOWN 后恢复正确状态；非整日 sales/cash 范围报错。

是否执行并通过，以项目实际验证日志为准；本文件没有将函数定义完成当作一百万订单数据已生成或全部场景已验证。
