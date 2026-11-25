# 数据访问与 AsOf 安全契约

## 1. 本次已经实现什么

`sql/02_security.sql` 是 PostgreSQL 17 的可执行授权脚本，依赖 `01_schema.sql`。它覆盖当前模型全部 53 个 `core` 表，使用真实数据库登录身份 `session_user` 在 `sec.principal` 中查询租户、区域和成本权限；所有 core 表启用 `ENABLE ROW LEVEL SECURITY` 和 `FORCE ROW LEVEL SECURITY`。业务角色只取得白名单读取权限，身份不存在或范围不匹配时拒绝读取。

脚本还提供区域客户裁剪视图与运维水位白名单视图，并拒绝将未分类的新 core 表直接加入可见范围。它不创建业务登录账号、密码或授权记录，不更改核心业务表的所有权，不向业务角色授予函数/视图所有者身份。

**本次实现的是租户、区域、成本与源表权限隔离。AsOf 查询 broker、快照物化、逐请求独立 schema、缓存授权重验和 Agent 工具 API 尚需后续实现。** 直接读取 core 只受当前授权约束，不会自动应用历史时间截断；参数化指标函数也不等于完整 AsOf 服务。

## 2. 身份与角色

| 数据库角色 | 登录能力 | 职责 | 不具备的权限 |
|---|---|---|---|
| `contoso_business_ro` | NOLOGIN 组 | 继承给受管业务登录；读取获授权的主数据和事实、白名单 API 视图 | 写业务表、读原始 ops/eval/sec、读客户三表、承担表所有者身份 |
| `contoso_customer_full_ro` | NOLOGIN 组 | 继承业务组，并增加客户三表 SELECT；RLS 仍要求该 principal 的 `all_regions=true` | 不会覆盖 tenant、区域或成本检查 |
| `contoso_security_owner` | NOLOGIN，NOINHERIT | 只拥有受控授权函数和元数据白名单视图；读取所需授权表及 source_watermark | 不授给任何业务登录，不是业务源表 owner，不含 BYPASSRLS |
| `contoso_customer_view_owner` | NOLOGIN，NOINHERIT | 拥有客户裁剪视图；读取经 RLS 过滤的订单和关联客户 | 不读取客户身份 token/绑定表，不授给任何业务登录，不含 BYPASSRLS |

业务登录在 `sec.principal` 中只有一个 tenant。`persona` 是岗位标记，实际权限来自 `tenant_id`、`all_regions`、`can_view_cost`、`sec.principal_region` 和获授角色。未授权区域没有隐式通配规则：当 `all_regions=false` 且没有区域授权行时，区域事实不可见，但仍可见本租户公开主数据。

推荐的初始岗位配置如下；最终授权记录由受信任管理员维护。

| 岗位 | all_regions | 区域表 | can_view_cost | 客户源表组 |
|---|---:|---|---:|---|
| EXEC | true | 可空 | true | 按企业授权授予 |
| ANALYST | true 或 false | false 时必配 | 按职责 | 只有全区且获明确授权时授予 |
| REGION | false | 指定大区 | 按职责，区域毛利任务可为 true | 不授予；使用客户裁剪视图 |
| MARKETING | true 或 false | false 时必配 | 默认 false | 默认不授予；使用粗粒度客群 |

Data Admin 使用独立运维身份/API，本脚本没有将该岗位混入业务 reader。业务侧默认只有公开水位状态；运维批次诊断、质量修复和授权管理接口应单独实现，不能通过授予 helper owner 或表 owner 来替代。

### 2.1 为什么使用 session_user

连接必须使用与授权配置对应的真实数据库登录。`SET ROLE` 改变执行角色，但不改变认证会话身份；本方案特意不从可由 SQL 自行修改的 `app.tenant_id`、`app.region_id` 等 GUC 读取可信授权。PostgreSQL 对 `session_user/current_user` 的区别有明确说明。[S1]

查询 broker 必须从已经认证的产品用户映射到允许使用的数据库登录/权限集合，不能接受模型提供的数据库用户名、tenant_id 或角色名称来挑选连接。连接池按认证登录隔离；使用一个超级用户连接再 `SET ROLE` 冒充不同业务用户不符合本契约。

## 3. 表级安全分类

分类是显式白名单，未按“表有 region_id 就一律按地区限制”的方式自动推断。特别是 `site` 虽有地点 region_id，作为引用维度仍在本租户公开；其库存和业务流水继续按地点区域控制。

| 分类 | 表 | RLS 条件 |
|---|---|---|
| 本租户公开主数据 | tenant、geo_area、org_unit、site、channel、brand、category、sport、spu、spu_sport、sku、channel_listing、price_period、campaign、promotion | 认证 principal 的 tenant 与该行一致 |
| 公开日历 | calendar | 已存在有效 principal；日历不携带租户业务数据 |
| 商品采购成本 | cost_period | tenant 一致且 can_view_cost |
| 销售区域事实 | order_header、order_line、order_unit、order_status_event、discount_allocation、payment、refund、refund_allocation、shipment、shipment_item、shipment_event、return_header、return_item、return_event、revenue_entry、order_unit_event、stock_allocation_attempt、web_session、behavior_event、campaign_daily、channel_product_daily、order_attribution、target_monthly | tenant 一致，且 all_regions 或具有该销售 region_id |
| 地点区域事实 | assortment、inventory_document、inventory_document_line、inventory_movement、inventory_snapshot、store_traffic_daily | tenant 一致，且 all_regions 或具有该地点 region_id |
| 地点库存成本 | inventory_lot、inventory_valuation_snapshot | 地点区域条件，再加 can_view_cost |
| 销售成本及经营费用 | cost_entry、order_fee | 原订单销售区域条件，再加 can_view_cost |
| 客户源表 | customer、customer_identity、customer_identity_link | 获授 customer_full_ro，tenant 一致且 all_regions |
| 私有控制/评测源 | 所有 ops、eval、sec 表 | 业务角色没有源 schema/table 权限；只发布下面列出的视图 |

广告花费属于营销业务指标，`campaign_daily.spend_cent` 对获授权的市场用户可见。`can_view_cost` 在本版本控制采购成本、库存成本、COGS 和经营费用，不把“所有含金额的字段”都作为成本秘密。

### 3.1 跨区域履约不改变销售归属

华东订单由华南仓库发货时，华东用户可以读取该订单的收入及其获授权的 COGS 台账，而华南仓库的完整 lot/库存仍受地点区域限制。收入、COGS 和订单费用应先按相同销售维度各自聚合，再连接汇总结果；不能为了计算成本而 inner join 一个被地点 RLS 隐去的 lot。

`site` 的租户级公开属性允许显示来源仓库名称和城市，不等于授权其全量库存。`stock_allocation_attempt` 按订单销售区域可见，因此允许用户解释自己订单曾在其他仓库的一次分配尝试；这不授予任意其他仓库当前库存查询能力。

跨区退货默认仍按原订单销售区域读取售后事实。接收区域需要的现场作业视图尚未实现：后续应单独暴露本地点接收/待检数量及必要引用，不可简单将所有售后策略改为“原区域或接收区域”而同时开放原订单客户和全部财务详情。

### 3.2 成本不可见不能当作零成本

没有 can_view_cost 时，成本源表查询可能返回零行。指标服务必须据 `sec.allowed_cost(tenant_id)` 返回 `cost_visible=false`，将 COGS、毛利、经营费用与贡献相关结果设为 NULL/不可用，不能用 `COALESCE(成本, 0)` 输出“毛利等于收入”。当 can_view_cost=true 时，来源是否已经完整属于另一项数据水位判断。

## 4. 已提供的安全视图

| 视图 | 输出 | 安全保证 | 时间边界 |
|---|---|---|---|
| `api.customer_profile_for_orders` | tenant_id、customer_id、segment_code、age_band | 仅该登录通过订单 RLS 可以关联到的客户；无会员编号、身份 token、登记地、电话、地址；区域登录无客户三表直接 SELECT | 目前按已装载且获授权订单裁剪；AsOf broker 必须基于冻结后的订单重建，不能直接把此当前视图当历史客群 |
| `api.source_status` | tenant、source_system、observed_at、complete_through、expected_batches、arrived_batches、status | 仅本 tenant；没有缺失批次清单、文件路径、随机种子、源报错正文或评测信息 | 保留状态历史；broker 应选知识截止前的记录 |
| `api.access_context` | 当前登录的 tenant、persona、all_regions、can_view_cost、授权 region 数组 | 只显示 session_user 对应记录；无任意 principal 参数 | 显示当前授权，不能替代历史快照的数据时间 |

三个视图使用独立 NOLOGIN owner 和 `security_barrier=true`。客户视图 owner 自身也遵守专用的 RLS 策略，只能读取经订单授权关联到的客户；它不是绕过 RLS 的超级账号。视图的执行身份与 `security_invoker` 会影响底层权限，因此后续增加视图必须显式检查 owner 和策略，不能默认视图天然继承预期隔离。[S2]

## 5. 脚本的防护及幂等行为

脚本在一个事务中完成角色属性规范化、schema/table/column/function 授权收敛、函数替换、策略重建及视图替换。再次执行不新增重复角色、策略或视图，也不修改 `sec.principal` 和区域授权记录。若新增 core 表尚未安全分类，部署会报错并回滚，必须先更新白名单。

RLS 同时设置 permissive 读取入口和 restrictive tenant/scope/cost 门禁，避免其他旧 permissive 策略通过 OR 扩大读取范围。业务角色还设置拒绝 INSERT/UPDATE/DELETE 的 restrictive 策略作为误授写权限时的补充保护。PostgreSQL 的 permissive/restrictive 组合规则支持这种做法。[S3]

脚本不依赖 FORCE RLS 限制超级用户；PostgreSQL 的 superuser 与 BYPASSRLS 会绕过行安全，FORCE RLS 主要使普通 owner 也受策略约束。[S4] 因此脚本检查已有业务角色及其成员的管理属性、helper owner/源表 owner 身份和不允许的源表权限。TRUNCATE、所有权以及直接读取对象存储也不能靠行策略保护。新增登录或修改角色继承后，管理员应重复安全验证。

授权函数均为只读的 `STABLE SECURITY DEFINER`，锁定 `search_path = pg_catalog, sec`，且内部对象全部带 schema；只授予需要的 EXECUTE，PUBLIC 没有默认调用权限。此类函数的安全重点包括执行身份、可信 search_path 和默认 EXECUTE 收敛。[S5]

## 6. 管理员配置业务登录的顺序

先加载 tenant、区域及相关主数据，再由受信任管理员创建真实业务登录、填写 principal/region 授权并授予组角色。下面只是管理操作的结构示例；数据库认证凭证由部署环境安全配置，不进入课程文件或 Agent 提示词。

```sql
-- 在专用测试数据库由管理员执行；示例区域 ID 必须取自实际主数据。
CREATE ROLE course_t101_region_a LOGIN INHERIT
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

INSERT INTO sec.principal
    (db_role, tenant_id, persona, all_regions, can_view_cost)
VALUES
    ('course_t101_region_a', 101, 'REGION', false, true);

-- 用实际 REGION 节点替换此处的绑定参数。
-- INSERT INTO sec.principal_region (db_role, tenant_id, region_id)
-- VALUES ('course_t101_region_a', 101, :authorized_region_id);

GRANT contoso_business_ro TO course_t101_region_a;
ALTER ROLE course_t101_region_a SET default_transaction_read_only = on;
```

全区且需要客户源表的登录另授 `contoso_customer_full_ro`，但仍必须在 principal 中设置 all_regions=true。不要把 helper owner、建表角色、导入角色或拥有服务端文件读取能力的角色授给业务登录。NOLOGIN 组的配置项不能替代每个真实登录的连接配置。

验证时使用真正以该用户名建立的连接。管理员测试环境可切换 session authorization 模拟，但普通 `SET ROLE` 不会改变本方案绑定的 `session_user`。正负例应覆盖跨租户、跨区域、成本不可见、客户裁剪、GUC 篡改、直接 ops/eval/sec 读取以及写入/截断。

## 7. 查询 broker 与 AsOf：后续实现契约

### 7.1 源查询权限与 Agent 能力分开

本版允许**平台 query broker 使用真实业务登录读取 core**，数据库负责租户、区域和成本门禁。Agent 只获得工具 API，不能持有数据库密码、任意数据库连接能力、完整 Parquet 路径、对象存储枚举权限或管理员工具。

broker 从已认证请求与预先批准的任务配置固定以下上下文：

- tenant、区域集合、成本能力、主体与授权版本；
- release_id 与 metric/semantic_version；
- business_as_of、knowledge_as_of、reference_time；
- 允许查询的数据资产、列、函数及结果规模。

三个时间都是明确值，不能由模型通过“现在”“最新状态”、任意 GUC 或追加 SQL 重新定义。自然语言中的“昨天”“本月”“最近 30 天”依据固定 reference_time 解析。事实采用业务窗口 `[start, end)`；本项目知识 cutoff 也统一使用排他条件 `available_at < knowledge_cutoff`，避免事实与日报在边界上采用不同规则。

### 7.2 推荐的独立 AsOf schema

1. **受信任控制层验证上下文。** 将身份、权限范围、数据版本与三个时间绑定为不可变 snapshot manifest。查询时重新检查当前授权，不因旧快照保留而继续提供已撤销的数据。
2. **使用业务登录读取授权源。** 所有源数据由对应业务登录读取，保持 RLS 生效。未来快照 writer 只负责写新快照，不给业务源 reader 增加 DDL 权限；可以通过分开的读取连接和快照写入连接完成。
3. **执行表级时间契约。** 事件同时受业务时间与知识时间限制；订单维回连也受 ordered_at/available_at 限制。身份绑定、价格、listing、活动与优惠按其可知时间与有效区间处理。日报先过滤可知时间再选最新 report_version；库存先限定业务日再选正确知识版本。不能对所有表机械地套一个同名日期字段。
4. **物化不可变快照。** 将本次获授权数据写入受控、唯一命名的 asof schema，或授权范围内的 Parquet 对象集合。客户视图基于此次已冻结的订单和当时已知身份重建。私有 eval、seed、scenario 与标准 SQL 不进入快照。
5. **使用单独的快照消费者身份。** 消费者只对该 asof schema 获得 USAGE/SELECT，不加入能访问 core 的 `contoso_business_ro`。仅在同一个继承业务组的登录上撤销 core 的直接权限是不够的，因为继承权限仍存在。
6. **受控执行与缓存。** broker 只执行经过语法树和资产/函数白名单检查的只读查询，并在只读事务中运行，固定 schema、超时与返回行数。缓存键包含授权范围/版本、release、三个时间和语义版本；禁用任意文件访问与写入型函数。正则添加 WHERE 不能替代可靠的查询编译或隔离快照。

以上步骤是后续开发工作；本次 SQL 没有创建一个空 asof schema 来暗示已经实现。参数化 `mart` 指标函数将提供可复用的参考查询，但函数参数必须由 broker 从可信上下文绑定，不能直接开放给模型自行挑选未来 cutoff。

### 7.3 Parquet 路径不是权限

`tenant_id=101/` 是分区组织方式，不是授权边界。Agent 若可以列举和读取整个 release 目录，数据库 RLS 不再起保护作用。快照导出、看板、告警附件和定时任务均应通过同一个授权上下文，输出只包含本次允许的 tenant/scope/成本字段，不直接共享完整数据根目录。

## 8. 必须验证的安全结果

| 检查 | 期望 |
|---|---|
| 未映射的真实业务登录 | 公开日历以外也不例外：所有 core 行均不可见；calendar 也要求有效 principal |
| 101 用户请求 102 数据 | 0 行或接口拒绝，无跨租户结果 |
| 区域用户请求其他销售区域事实 | 不可见；本租户 site 名称作为公开维度仍可见 |
| 区域用户查询其他地点库存 | 不可见；允许读取自己订单的一次跨区 allocation evidence |
| can_view_cost=false | 五类成本源不可见，利润指标 NULL，不能变成零成本 |
| 区域用户直接查询客户三表 | permission denied；裁剪视图只返回授权订单关联的粗粒度客群 |
| 直接查询 ops/eval/sec | permission denied；只允许指定 API 视图 |
| 修改 app.tenant_id 等 GUC | 不改变租户或区域结果 |
| 尝试 SET ROLE helper owner / 修改授权表 / 业务写入 / TRUNCATE | 被拒绝 |
| 重复执行 02_security.sql | 角色、函数、视图和策略数量稳定；授权记录不被覆盖 |
| 历史快照查询 | 需等 broker 与快照验证实现后才可宣称通过；RLS 测试通过不代表 AsOf 已完成 |

## 9. 一手参考

- [S1] PostgreSQL 17，System Information Functions：<https://www.postgresql.org/docs/17/functions-info.html>
- [S2] PostgreSQL 17，CREATE VIEW：<https://www.postgresql.org/docs/17/sql-createview.html>
- [S3] PostgreSQL 17，CREATE POLICY：<https://www.postgresql.org/docs/17/sql-createpolicy.html>
- [S4] PostgreSQL 17，Row Security Policies：<https://www.postgresql.org/docs/17/ddl-rowsecurity.html>
- [S5] PostgreSQL 17，CREATE FUNCTION：<https://www.postgresql.org/docs/17/sql-createfunction.html>

本文件描述具体项目实现与后续接口契约；部署中的角色创建、认证连接与负例验证结果应以实际验证日志为准。
