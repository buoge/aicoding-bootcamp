# 百万订单数据资产目录

本目录从最终 `schema_contract.json` 生成 **63 张规范表**的 grain、主键及引用关系，并直接复用 `contoso_patch_contract.json` 的 **10 份中间资产**原字段契约。目录是实现依据；百万级事实尚待生成，固定配额和容量参考均不代表已有数据。

## 1. 使用边界

- owner 为本合成企业的责任系统设计；source_systems 为接入来源，构建实现仍属待开发。Contoso 只生产权重/候选，不提供真实企业订单/成本/库存。
- CORE_* 为 core schema 内的逻辑分类；OPS_CONTROL/SEC_ACCESS/EVAL_HIDDEN 对应既有 schema；STAGING_INTERNAL 仅文件，不新增 10 张数据库表。
- 分区字段是 Parquet 导出元数据。business_month 和 release_id 可能通过 manifest/父事实取得，不新增到原表字段。01_schema.sql 当前不采用 PostgreSQL 原生分区。
- fixed 是冻结 profile 预期配额，不是已生成行数；dynamic 不填写精确值，实际记录数以完成 manifest 为准。库存约 29412800 是每张快照表的容量参考，两张分别计入。
- 63 表目录与中间资产目录均属设计/管理员资料。Agent 不持数据库凭据、原始路径或文件；业务通过可信工具 API。PG RLS 已有可执行契约；DuckDB 文件层须由可信 broker 另行实施等价 tenant/region/cost/column 过滤，不能声称自动继承 PG RLS。
- RLS 与 AsOf 独立。历史 broker 须固定 business/knowledge/reference 并截断所有依赖，仅提供授权可见 schema；当前参数化指标函数不是完整 AsOf broker。全时期 final_restated 库存不能通过简单过滤 available_at 冒充历史知识库存。
- 结构约束、已编写 H/B SQL、patch 中待实现生成器验收分别列出；SQL 引用到某表不等于该表所有业务语义已检查。本文不声明百万数据已生产。

权威来源：`config/schema_contract.json`、`config/profile_1m.yaml`、`docs/generation_mapping.md`、`sql/01_schema.sql`、`sql/02_security.sql`、`validation/acceptance.sql` / `validation/assertions.json`。全部来源文件的 SHA-256 保存在 JSON 目录；字段级契约仍以 schema 为准。

## 2. 固定配额和存储规则

| 固定目标 | 当前百万 profile |
|---|---|
| `core.tenant` | 3 行；冻结 profile 中每个独立经营企业一行。 |
| `core.order_header` | 1,000,000 行；冻结 config/profile_1m.yaml 的逐租户 orders 配额；行数表示目标，不表示已经生成。 |
| `core.brand` | 7 行；冻结 config/profile_1m.yaml 的逐租户 brands 配额；行数表示目标，不表示已经生成。 |
| `core.spu` | 800 行；冻结 config/profile_1m.yaml 的逐租户 spu 配额；行数表示目标，不表示已经生成。 |
| `core.sku` | 6,400 行；冻结 config/profile_1m.yaml 的逐租户 sku 配额；行数表示目标，不表示已经生成。 |
| `core.site` | 37 行；门店总数已包含 OUTLET，再加仓库；不重复计算奥莱。 |
| `core.customer` | 230,000 行；冻结 config/profile_1m.yaml 的逐租户 members 配额；行数表示目标，不表示已经生成。 |
| `core.customer_identity` | 460,000 行；冻结 config/profile_1m.yaml 的逐租户 identities 配额；行数表示目标，不表示已经生成。 |
| `core.channel` | 21 行；每个租户实例化冻结渠道字典；当前每租户 7 个。 |
| `core.category` | 96 行；每个租户实例化 8 个一级与 24 个二级品类节点。 |
| `core.calendar` | 1,186 行；全局共享日历：订单期 1096 天 + 生命周期尾窗 90 天；不按租户复制。 |

主要事实分区为 `release_id / tenant_id / business_month`，时间戳先按北京时间取月份，源报告以 report_date、金融以 recognized_at、现金以 attempted_at 分区。缺日期子表按租户复合键回连明确父事实；分区元数据不冒充新的字段。小主表可单文件。目标文件 128—256 MiB、row group 约 10 万行是初始配置，不承诺实际压缩比或吞吐。

库存数量与估值分别输出一套全时期 final_restated；域为有效 assortment 或任一库存桶非零的地点×SKU。两张快照表各约 29,412,800 行只是容量参考，不做全部 SKU×全部地点×全部日期的无条件笛卡尔积。

## 3. 63 张规范表

下列“SQL 检查”按实际断言文本引用匹配。它表示该表参与检查；没有专用 H/B 编号的主表仍受 PK/FK/UNIQUE/CHECK 与冻结配置约束。编号对应文末索引。源系统责任方不等同于表访问者。

### 01. `ops.dataset_release`

| 项目 | 契约 |
|---|---|
| 层 / owner | OPS_CONTROL / DATA_PLATFORM；业务域：治理 |
| 粒度 | 一行一个发布版本 |
| 主键 | `release_id` |
| 来源 | 接入系统：无业务源接入；内部控制/授权/评测；source-lock / publish |
| 引用链 | 无外键；按本表主键和配置约束。 |
| 产生阶段 | source-lock / publish；固定版本、上游与 fork commit、配置摘要、seed 和时间边界；只有通过验收才进入 PUBLISHED |
| 权限 | INTERNAL_ONLY：业务登录及 Agent 不可读明细；管理员、流水线或独立评测器使用独立受控凭据。 |
| 分区 | PostgreSQL 17 控制/权限/隐藏评测表；Parquet 键：无强制文件分区；月份依据：不强制按月 |
| 行数策略 | 固定 1 行目标。 本规范数据库每次装载一个不可变 release；跨版本控制目录可以在外部管理面维护，不运行本发布库的 H02 门禁。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H02；patch 生成器验收：SOURCE-01, RNG-02, RECOVERY-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 02. `core.tenant`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_MASTER / ERP；业务域：组织 |
| 粒度 | 一个独立经营企业 |
| 主键 | `tenant_id` |
| 来源 | 接入系统：ERP；compile |
| 引用链 | `ops.dataset_release` |
| 产生阶段 | compile；创建 101/102/103 三套独立经营主体及精确配额；不把品牌或地区当租户 |
| 权限 | TENANT：本租户只读；地点/商品/组织等维度不按区域裁掉。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 固定 3 行目标。 冻结 profile 中每个独立经营企业一行。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：当前无直接引用本表的 H/B gate；patch 生成器验收：QUOTA-01, CONTEXT-01, OMS-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 03. `ops.ingestion_batch`

| 项目 | 契约 |
|---|---|
| 层 / owner | OPS_CONTROL / DATA_PLATFORM；业务域：治理 |
| 粒度 | 一个租户一个源的一次采集批次 |
| 主键 | `tenant_id`, `batch_id` |
| 来源 | 接入系统：无业务源接入；内部控制/授权/评测；源采集计划与到达过程 |
| 引用链 | `core.tenant` |
| 产生阶段 | 源采集计划与到达过程；PIM/OMS/POS/WMS/CRM/ADS/WEB/ERP 批次窗口及接收时刻；每条带审核字段的事实/版本引用本租户批次 |
| 权限 | INTERNAL_ONLY：业务登录及 Agent 不可读明细；管理员、流水线或独立评测器使用独立受控凭据。 |
| 分区 | PostgreSQL 17 控制/权限/隐藏评测表；Parquet 键：无强制文件分区；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 按租户×源计划窗口产生采集批次，包含按变更触发与失败/延迟批次；以实际批次清单计数。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：B01, B02, B03, B04, B05, B06, B07, B08, B09, B10, B11, B12, B13, B14, B15, B16, B17, B18, B19, B20, B21, B22, B23, B24, B25, B26, B27, B28, B29, B30, B31, B32, B33, B34, B35, B36, B37, B38, B39, B40, B41；patch 生成器验收：VISIBLE-01, RECOVERY-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 04. `core.geo_area`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_MASTER / ERP；业务域：组织 |
| 粒度 | 一个地理节点 |
| 主键 | `tenant_id`, `geo_id` |
| 来源 | 接入系统：ERP；compile，中国地区配置 |
| 引用链 | `core.geo_area`, `core.tenant` |
| 产生阶段 | compile，中国地区配置；为每个租户生成大区/省/市层级；保持城市到大区归属可核验 |
| 权限 | TENANT：本租户只读；地点/商品/组织等维度不按区域裁掉。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 按冻结的租户内区域/省/市字典产生树节点；只固定配置中的字典覆盖，不随机增加地理层级。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：当前无直接引用本表的 H/B gate；patch 生成器验收：CONTEXT-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 05. `core.org_unit`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_MASTER / ERP；业务域：组织 |
| 粒度 | 一个经营组织 |
| 主键 | `tenant_id`, `org_unit_id` |
| 来源 | 接入系统：ERP；compile，经营组织配置 |
| 引用链 | `core.org_unit`, `core.tenant` |
| 产生阶段 | compile，经营组织配置；集团、区域、门店、电商组织独立于地理层级 |
| 权限 | TENANT：本租户只读；地点/商品/组织等维度不按区域裁掉。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 按冻结组织树产生集团、区域、门店、电商组织；数量来自实际组织配置。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：当前无直接引用本表的 H/B gate；patch 生成器验收：CONTEXT-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 06. `core.site`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_MASTER / ERP；业务域：组织 |
| 粒度 | 一个实体门店或仓库 |
| 主键 | `tenant_id`, `site_id` |
| 来源 | 接入系统：ERP；compile，地点配置 |
| 引用链 | `core.geo_area`, `core.org_unit`, `core.tenant` |
| 产生阶段 | compile，地点配置；STORE/OUTLET/WAREHOUSE 有各自开闭店日期、组织与物理区域 |
| 权限 | TENANT：本租户只读；地点/商品/组织等维度不按区域裁掉。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 固定 37 行目标。 门店总数已包含 OUTLET，再加仓库；不重复计算奥莱。 租户配额：101=27, 102=5, 103=5。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H31；patch 生成器验收：CONTEXT-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 07. `core.channel`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_MASTER / ERP；业务域：组织 |
| 粒度 | 一个销售渠道 |
| 主键 | `tenant_id`, `channel_id` |
| 来源 | 接入系统：ERP；compile，渠道配置 |
| 引用链 | `core.tenant` |
| 产生阶段 | compile，渠道配置；固定销售渠道、类型、身份范围与逐用户事件可见能力 |
| 权限 | TENANT：本租户只读；地点/商品/组织等维度不按区域裁掉。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 固定 21 行目标。 每个租户实例化冻结渠道字典；当前每租户 7 个。 租户配额：101=7, 102=7, 103=7。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H28, H30, H31；patch 生成器验收：CONTEXT-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 08. `core.brand`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_MASTER / PIM；业务域：商品 |
| 粒度 | 一个自有品牌 |
| 主键 | `tenant_id`, `brand_id` |
| 来源 | 接入系统：PIM；compile，品牌配置 |
| 引用链 | `core.tenant` |
| 产生阶段 | compile，品牌配置；企业内品牌及定位；相似品牌名不构成跨租户共享主键 |
| 权限 | TENANT：本租户只读；地点/商品/组织等维度不按区域裁掉。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 固定 7 行目标。 冻结 config/profile_1m.yaml 的逐租户 brands 配额；行数表示目标，不表示已经生成。 租户配额：101=3, 102=2, 103=2。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：当前无直接引用本表的 H/B gate；patch 生成器验收：按上列产生规则及冻结配置验证；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 09. `core.category`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_MASTER / PIM；业务域：商品 |
| 粒度 | 一个商品分类节点 |
| 主键 | `tenant_id`, `category_id` |
| 来源 | 接入系统：PIM；compile，运动户外分类 |
| 引用链 | `core.category`, `core.tenant` |
| 产生阶段 | compile，运动户外分类；两级树，SPU 只挂叶子；投影到 Contoso 的 category/subcategory 映射留在资产中 |
| 权限 | TENANT：本租户只读；地点/商品/组织等维度不按区域裁掉。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 固定 96 行目标。 每个租户实例化 8 个一级与 24 个二级品类节点。 租户配额：101=32, 102=32, 103=32。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：当前无直接引用本表的 H/B gate；patch 生成器验收：ASSORTMENT-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 10. `core.sport`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_MASTER / PIM；业务域：商品 |
| 粒度 | 一个运动标签 |
| 主键 | `tenant_id`, `sport_id` |
| 来源 | 接入系统：PIM；compile，运动标签 |
| 引用链 | `core.tenant` |
| 产生阶段 | compile，运动标签；跑步、徒步等多标签字典，不作为可直接加总的财务层级 |
| 权限 | TENANT：本租户只读；地点/商品/组织等维度不按区域裁掉。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 按冻结运动标签字典产生；标签数独立于商品财务品类。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：当前无直接引用本表的 H/B gate；patch 生成器验收：按上列产生规则及冻结配置验证；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 11. `core.spu`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_MASTER / PIM；业务域：商品 |
| 粒度 | 一款标准商品 |
| 主键 | `tenant_id`, `spu_id` |
| 来源 | 接入系统：PIM；compile，商品款式 |
| 引用链 | `core.brand`, `core.category`, `core.tenant` |
| 产生阶段 | compile，商品款式；款式、主品类、品牌、客群、季节和生命周期 |
| 权限 | TENANT：本租户只读；地点/商品/组织等维度不按区域裁掉。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 固定 800 行目标。 冻结 config/profile_1m.yaml 的逐租户 spu 配额；行数表示目标，不表示已经生成。 租户配额：101=600, 102=100, 103=100。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：当前无直接引用本表的 H/B gate；patch 生成器验收：ASSORTMENT-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 12. `core.spu_sport`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_MASTER / PIM；业务域：商品 |
| 粒度 | 一个 SPU 与运动标签的关系 |
| 主键 | `tenant_id`, `spu_id`, `sport_id` |
| 来源 | 接入系统：PIM；compile，商品标签配置 |
| 引用链 | `core.sport`, `core.spu`, `core.tenant` |
| 产生阶段 | compile，商品标签配置；多对多关系；聚合销售时采用筛选或去重 |
| 权限 | TENANT：本租户只读；地点/商品/组织等维度不按区域裁掉。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 按合法 SPU×运动标签关系产生；每个关系一行，禁止把标签关系扩成重复销售事实。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：当前无直接引用本表的 H/B gate；patch 生成器验收：按上列产生规则及冻结配置验证；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 13. `core.sku`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_MASTER / PIM；业务域：商品 |
| 粒度 | 一个可售商品规格 |
| 主键 | `tenant_id`, `sku_id` |
| 来源 | 接入系统：PIM；compile，规格规则 |
| 引用链 | `core.spu`, `core.tenant` |
| 产生阶段 | compile，规格规则；合法颜色/尺码/容量等组合；不机械做全部规格笛卡尔积 |
| 权限 | TENANT：本租户只读；地点/商品/组织等维度不按区域裁掉。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 固定 6,400 行目标。 冻结 config/profile_1m.yaml 的逐租户 sku 配额；行数表示目标，不表示已经生成。 租户配额：101=4,800, 102=800, 103=800。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：当前无直接引用本表的 H/B gate；patch 生成器验收：ASSORTMENT-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 14. `core.channel_listing`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_VERSIONED_REFERENCE / PIM；业务域：商品 |
| 粒度 | 某渠道商品编码的一个有效版本 |
| 主键 | `tenant_id`, `listing_id` |
| 来源 | 接入系统：PIM；compile，渠道映射版本 |
| 引用链 | `core.channel`, `core.sku`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | compile，渠道映射版本；平台编码到统一 SKU 的有效期，保留 available_at/load_batch_id |
| 权限 | TENANT：本租户只读；地点/商品/组织等维度不按区域裁掉。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 对实际售卖的渠道×SKU 生成非重叠编码有效版本；数量由上架范围及换码计划决定。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H25, B01；patch 生成器验收：ASSORTMENT-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 15. `core.assortment`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_VERSIONED_REFERENCE / WMS；业务域：商品 |
| 粒度 | 一个地点 SKU 的经营有效区间 |
| 主键 | `tenant_id`, `assortment_id` |
| 来源 | 接入系统：PIM, WMS；compile，地点经营配置 |
| 引用链 | `core.site`, `core.sku`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | compile，地点经营配置；SKU/节点的经营区间与补货点；缺货不删除 assortment，停售残余库存仍保留 |
| 权限 | SITE_REGION：本租户 + 实际地点/库存作业归属 region；不能借库存权限扩大为另一销售区域的订单权限。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 对实际经营的地点×SKU 生成有效区间；约 24800 个基础组合仅为容量参考，不是 SKU×所有地点全积，也不是区间行数硬配额。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：B02；patch 生成器验收：ASSORTMENT-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 16. `core.price_period`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_VERSIONED_REFERENCE / PIM；业务域：商品 |
| 粒度 | 一个 SKU 渠道价格的有效区间 |
| 主键 | `tenant_id`, `price_id` |
| 来源 | 接入系统：PIM；compile，价格计划 |
| 引用链 | `core.channel`, `core.sku`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | compile，价格计划；唯一有效价格区间；创建时快照引用 price_id，不回改历史订单 |
| 权限 | TENANT：本租户只读；地点/商品/组织等维度不按区域裁掉。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 实际 SKU×渠道价格计划的有效区间数；每次计划变价增加版本，不按每天复制不变价格。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H25, H26, B03；patch 生成器验收：MONEY-01, MERGE-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 17. `core.cost_period`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_VERSIONED_REFERENCE / ERP；业务域：商品 |
| 粒度 | 一个 SKU 标准采购成本的有效区间 |
| 主键 | `tenant_id`, `cost_id` |
| 来源 | 接入系统：ERP；compile，采购成本计划 |
| 引用链 | `core.sku`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | compile，采购成本计划；只为新采购批次定价，不重估已有批次 |
| 权限 | TENANT + COST：本租户只读；地点/商品/组织等维度不按区域裁掉。 另需 can_view_cost；无权限的指标金额应为 NULL，而非伪造 0。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 SKU 采购成本计划的有效区间数；新采购批次引用计划，旧批次成本不重抽。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：B04；patch 生成器验收：FIFO-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 18. `core.customer`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_MASTER / CRM；业务域：客户 |
| 粒度 | 一个企业会员 |
| 主键 | `tenant_id`, `customer_id` |
| 来源 | 接入系统：CRM；compile + CRM 事件 |
| 引用链 | `core.geo_area`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | compile + CRM 事件；合成会员，按 joined_at 存在；无真实个人资料 |
| 权限 | CUSTOMER_FULL：仅 all_regions=true 且获授 contoso_customer_full_ro 的身份可直读客户/渠道身份三表；区域身份仅经 api.customer_profile_for_orders 取授权订单关联的粗粒度画像。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 固定 230,000 行目标。 冻结 config/profile_1m.yaml 的逐租户 members 配额；行数表示目标，不表示已经生成。 租户配额：101=200,000, 102=15,000, 103=15,000。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H27, B05；patch 生成器验收：IDENTITY-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 19. `core.customer_identity`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_MASTER / CRM；业务域：客户 |
| 粒度 | 一个渠道内的购买身份 |
| 主键 | `tenant_id`, `identity_id` |
| 来源 | 接入系统：CRM；compile + 渠道身份事件 |
| 引用链 | `core.channel`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | compile + 渠道身份事件；渠道内唯一身份，不含未来 member 绑定字段 |
| 权限 | CUSTOMER_FULL：仅 all_regions=true 且获授 contoso_customer_full_ro 的身份可直读客户/渠道身份三表；区域身份仅经 api.customer_profile_for_orders 取授权订单关联的粗粒度画像。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 固定 460,000 行目标。 冻结 config/profile_1m.yaml 的逐租户 identities 配额；行数表示目标，不表示已经生成。 租户配额：101=400,000, 102=30,000, 103=30,000。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：B06；patch 生成器验收：IDENTITY-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 20. `core.calendar`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_MASTER / ERP；业务域：组织 |
| 粒度 | 一个本地自然日 |
| 主键 | `calendar_date` |
| 来源 | 接入系统：ERP；compile，固定课程日历 |
| 引用链 | 无外键；按本表主键和配置约束。 |
| 产生阶段 | compile，固定课程日历；包含订单期与尾窗日期；权重数值留在中间资产，不伪装成官方假期统计 |
| 权限 | PUBLIC_DATE：已认证登录可读共享日历；全局表无 tenant_id。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id；月份依据：不强制按月 |
| 行数策略 | 固定 1,186 行目标。 全局共享日历：订单期 1096 天 + 生命周期尾窗 90 天；不按租户复制。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：当前无直接引用本表的 H/B gate；patch 生成器验收：REUSE-01, QUOTA-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 21. `core.campaign`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_MASTER / ADS；业务域：营销 |
| 粒度 | 一个营销活动 |
| 主键 | `tenant_id`, `campaign_id` |
| 来源 | 接入系统：ADS；compile，活动计划 |
| 引用链 | `core.channel`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | compile，活动计划；v1 每条活动恰有一个非空 target_channel_id；跨承接渠道拆活动；计划可提前可见，按有效时间实际生效 |
| 权限 | TENANT：本租户只读；地点/商品/组织等维度不按区域裁掉。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 按冻结投放计划建立活动；数量来自活动日历及承接渠道配置。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：B07；patch 生成器验收：CONTEXT-01, VISIBLE-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 22. `core.promotion`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_MASTER / OMS；业务域：营销 |
| 粒度 | 一个价格优惠规则 |
| 主键 | `tenant_id`, `promotion_id` |
| 来源 | 接入系统：OMS, POS；compile，价格优惠计划 |
| 引用链 | `core.campaign`, `core.channel`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | compile，价格优惠计划；v1 百分比与满额减免；Python 按已定优先级适用与分摊 |
| 权限 | TENANT：本租户只读；地点/商品/组织等维度不按区域裁掉。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 按冻结优惠计划建立规则与时段；未参与优惠的订单不强制分配规则。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：B08；patch 生成器验收：MONEY-01, MERGE-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 23. `core.order_header`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / OMS；业务域：交易 |
| 粒度 | 一个成功创建的订单头 |
| 主键 | `tenant_id`, `order_id` |
| 来源 | 接入系统：OMS, POS；context + proposal → ORDER_CREATED |
| 引用链 | `core.channel`, `core.customer`, `core.customer_identity`, `core.geo_area`, `core.org_unit`, `core.site`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | context + proposal → ORDER_CREATED；每槽位一张头；contoso_proposal_id 必须能回溯；线上 selling_site_id 为空 |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：order_date |
| 行数策略 | 固定 1,000,000 行目标。 冻结 config/profile_1m.yaml 的逐租户 orders 配额；行数表示目标，不表示已经生成。 租户配额：101=900,000, 102=50,000, 103=50,000。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H01, H02, H03, H06, H07, H25, H27, H29, H30, H31, B09；patch 生成器验收：QUOTA-01, CONTEXT-01, OMS-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 24. `core.order_line`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / OMS；业务域：交易 |
| 粒度 | 一张订单的一个 SKU 行 |
| 主键 | `tenant_id`, `order_line_id` |
| 来源 | 接入系统：OMS, POS；canonicalize + pricing |
| 引用链 | `core.channel_listing`, `core.order_header`, `core.price_period`, `core.sku`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | canonicalize + pricing；合并相同 SKU 原始候选行；写 price_id、listing_id 和创建时金额 |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：order_header.order_date (按 tenant_id/order_id 回连) |
| 行数策略 | 动态；不设精确行数。 每单原始 proposal 相同 SKU 在同价/同 listing/同优惠上下文下合并后的行数之和；不锁死为百万行。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H03, H04, H25, B10；patch 生成器验收：MERGE-01, MONEY-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 25. `core.order_unit`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / OMS；业务域：交易 |
| 粒度 | 订单行中的一个逻辑计量单件 |
| 主键 | `tenant_id`, `order_unit_id` |
| 来源 | 接入系统：OMS, POS；canonicalize + pricing |
| 引用链 | `core.order_line`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | canonicalize + pricing；将 quantity 展成逻辑计量单件；不是实物序列号；整数分优惠完整分摊 |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：order_header.order_date (按 tenant_id/order_id 回连) |
| 行数策略 | 动态；不设精确行数。 等于所有规范订单行 quantity 之和；一个逻辑计量单件一行，不是商品序列号。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H04, H05, H10, H13, H14, H32, B11；patch 生成器验收：MERGE-01, MONEY-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 26. `core.order_status_event`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / OMS；业务域：交易 |
| 粒度 | 一个订单的一次状态变化 |
| 主键 | `tenant_id`, `status_event_id` |
| 来源 | 接入系统：OMS, POS；OMS 状态机 |
| 引用链 | `core.order_header`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | OMS 状态机；CREATED/RESERVED/PAID/PART_SHIPPED/SHIPPED/COMPLETED/CANCELLED；退款不伪造额外状态枚举 |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：event_at |
| 行数策略 | 动态；不设精确行数。 每个订单实际经过的合法状态事件数之和；保留 CREATED 与取消等终止路径，不补齐未发生状态。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H32, B12；patch 生成器验收：OMS-01, ATOMIC-01, STOCK-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 27. `core.discount_allocation`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / OMS；业务域：交易 |
| 粒度 | 一个优惠对一个订单单件的分摊 |
| 主键 | `tenant_id`, `allocation_id` |
| 来源 | 接入系统：OMS, POS；pricing |
| 引用链 | `core.order_unit`, `core.promotion`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | pricing；每条优惠对单件的一次分摊；多个优惠的次序和累计上限确定 |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：order_header.order_date (经 order_unit 回连原订单) |
| 行数策略 | 动态；不设精确行数。 每个实际适用优惠×订单单件的分摊记录；无优惠单件不强制造行，多次优惠按固定次序分摊。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H05, B13；patch 生成器验收：MONEY-01, MERGE-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 28. `core.payment`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / OMS；业务域：交易 |
| 粒度 | 一次支付尝试 |
| 主键 | `tenant_id`, `payment_id` |
| 来源 | 接入系统：OMS, POS；支付过程 |
| 引用链 | `core.order_header`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 支付过程；每次即时完成尝试一行；SUCCEEDED 在 attempted_at 即现金成功，成功累计等于应付才进入 PAID |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：attempted_at |
| 行数策略 | 动态；不设精确行数。 实际支付尝试数，包含失败、拆分支付与合法重试；attempted_at 即时完成，不固定一单一笔。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H06, H07, H08, H36, B14；patch 生成器验收：PREPAY-01, FIFO-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 29. `core.refund`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / OMS；业务域：交易 |
| 粒度 | 一次现金退款尝试 |
| 主键 | `tenant_id`, `refund_id` |
| 来源 | 接入系统：OMS, POS；取消/接受售后的退款尝试 |
| 引用链 | `core.payment`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 取消/接受售后的退款尝试；每笔引用一笔成功支付；CANCEL 或 RETURN；即时尝试成功发生在 attempted_at，现金与销售冲减时点分开 |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：attempted_at |
| 行数策略 | 动态；不设精确行数。 取消/接受退货后实际发生的退款尝试数；退款成功与失败均保留，不固定等于售后件数。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H08, H09, H10, H11, H36, B15；patch 生成器验收：按上列产生规则及冻结配置验证；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 30. `core.refund_allocation`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / OMS；业务域：交易 |
| 粒度 | 一次退款分配到一个订单单件 |
| 主键 | `tenant_id`, `refund_allocation_id` |
| 来源 | 接入系统：OMS, POS；退款分摊 |
| 引用链 | `core.order_unit`, `core.refund`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 退款分摊；每笔退款分到原逻辑单件；按退款状态计算成功累计，不能超单件净额或原支付额 |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：refund.attempted_at (按 tenant_id/refund_id 回连) |
| 行数策略 | 动态；不设精确行数。 退款尝试实际分配的逻辑单件数之和；每笔分配和等于退款金额，成功累计不超原额。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H09, H10, H11, B16；patch 生成器验收：按上列产生规则及冻结配置验证；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 31. `core.inventory_lot`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / WMS；业务域：库存 |
| 粒度 | 一批相同 SKU 成本的某地点库存 |
| 主键 | `tenant_id`, `lot_id` |
| 来源 | 接入系统：WMS；开账/收货/调入/退货接收 |
| 引用链 | `core.cost_period`, `core.inventory_lot`, `core.site`, `core.sku`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 开账/收货/调入/退货接收；每批冻结成本与来源；parent_lot_id 保留跨地点或退货来源 |
| 权限 | SITE_REGION + COST：本租户 + 实际地点/库存作业归属 region；不能借库存权限扩大为另一销售区域的订单权限。 另需 can_view_cost；无权限的指标金额应为 NULL，而非伪造 0。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：received_at |
| 行数策略 | 动态；不设精确行数。 开账/采购/调入/退货收货形成的实际地点 SKU 成本批次数；按原批成本拆批，不按每件采购固定一批。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H16, H19, H20, B17；patch 生成器验收：FIFO-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 32. `core.shipment`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / WMS；业务域：履约 |
| 粒度 | 一张订单从一个地点发出的包裹或 POS 交付单 |
| 主键 | `tenant_id`, `shipment_id` |
| 来源 | 接入系统：WMS, POS；全额支付后的履约计划 |
| 引用链 | `core.order_header`, `core.site`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 全额支付后的履约计划；订单×发货地点的一张包裹/POS 交付单；允许多个包裹 |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：created_at |
| 行数策略 | 动态；不设精确行数。 全额支付后实际创建的分仓包裹/POS 交付单数；可以一单多包，取消未发货不造包裹。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：B18；patch 生成器验收：PREPAY-01, FIFO-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 33. `core.shipment_item`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / WMS；业务域：履约 |
| 粒度 | 一个包裹中的一个订单逻辑单件 |
| 主键 | `tenant_id`, `shipment_item_id` |
| 来源 | 接入系统：WMS, POS；实际 SHIP |
| 引用链 | `core.inventory_lot`, `core.order_unit`, `core.shipment`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 实际 SHIP；一个逻辑单件最多一次出库；保存实际 site 和 FIFO lot |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：shipped_at |
| 行数策略 | 动态；不设精确行数。 实际出库逻辑单件数；v1 每个 order_unit 至多一次，故不超过 order_unit 总行数。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H07, H13, H15, H16, H17, H19, H23, H24, H33, B19；patch 生成器验收：PREPAY-01, FIFO-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 34. `core.shipment_event`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / WMS；业务域：履约 |
| 粒度 | 一张履约单的一次物流状态事件 |
| 主键 | `tenant_id`, `shipment_event_id` |
| 来源 | 接入系统：WMS, POS；履约/物流过程 |
| 引用链 | `core.shipment`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 履约/物流过程；SHIPPED/DELIVERED/DELIVERY_FAILED/RETURNED_TO_ORIGIN；失败未交付不认收入 |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：event_at |
| 行数策略 | 动态；不设精确行数。 实际履约单经过的物流事件数之和，含失败/RTO；不为未交付包裹造 DELIVERED。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H12, H13, H15, H16, H17, H23, H33, H36, B20；patch 生成器验收：FIFO-01, BUCKET-01, VISIBLE-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 35. `core.return_header`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / OMS；业务域：售后 |
| 粒度 | 一张售后申请 |
| 主键 | `tenant_id`, `return_id` |
| 来源 | 接入系统：OMS, POS；已交付商品的售后申请 |
| 引用链 | `core.channel`, `core.order_header`, `core.site`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 已交付商品的售后申请；归原订单销售区域；接收门店可以在其他区域 |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：requested_at |
| 行数策略 | 动态；不设精确行数。 实际售后申请单数；一张申请可包含多个已交付单件。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：B21；patch 生成器验收：FIFO-01, BUCKET-01, VISIBLE-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 36. `core.return_item`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / OMS；业务域：售后 |
| 粒度 | 一次售后对应一个已出库单件 |
| 主键 | `tenant_id`, `return_item_id` |
| 来源 | 接入系统：OMS, POS；合法可退单件选择 |
| 引用链 | `core.order_unit`, `core.return_header`, `core.shipment_item`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 合法可退单件选择；引用原 shipment_item；v1 一个逻辑单件最多一条售后申请 |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：return_header.requested_at (按 tenant_id/return_id 回连) |
| 行数策略 | 动态；不设精确行数。 实际售后单件数；v1 同一逻辑单件最多一个申请，不超过合法已出库/交付候选集合。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H36, B22；patch 生成器验收：FIFO-01, BUCKET-01, VISIBLE-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 37. `core.return_event`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / WMS；业务域：售后 |
| 粒度 | 一个售后单件的一次状态事件 |
| 主键 | `tenant_id`, `return_event_id` |
| 来源 | 接入系统：WMS, POS；售后状态机 |
| 引用链 | `core.inventory_lot`, `core.return_item`, `core.site`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 售后状态机；REJECTED 仅在寄回前，且没有 RECEIVED 或库存接收；收到实物后 ACCEPTED，再 RESTOCKED 或 DAMAGED/SCRAPPED；回库的 restocked_lot_id 指向接收时已创建的 RETURN 批次 |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：event_at |
| 行数策略 | 动态；不设精确行数。 每个售后单件实际发生的申请/收货/验收/回库或损坏处置事件数之和。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H11, H14, H16, H17, H18, H19, H23, H36, B23；patch 生成器验收：FIFO-01, BUCKET-01, VISIBLE-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 38. `core.inventory_document`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / WMS；业务域：库存 |
| 粒度 | 一笔采购 调拨 开账或处置业务单据 |
| 主键 | `tenant_id`, `inventory_doc_id` |
| 来源 | 接入系统：WMS；期初、计划供应、反应式补货/调拨 |
| 引用链 | `core.site`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 期初、计划供应、反应式补货/调拨；OPENING/PURCHASE/TRANSFER/DISPOSAL 保留计划时点，实际完成靠流水 |
| 权限 | SITE_REGION：本租户 + 实际地点/库存作业归属 region；不能借库存权限扩大为另一销售区域的订单权限。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：created_at |
| 行数策略 | 动态；不设精确行数。 期初、采购、调拨、处置计划实际创建的业务单据数；补货由库存过程反应式触发。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：B24；patch 生成器验收：BUCKET-01, RECOVERY-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 39. `core.inventory_document_line`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / WMS；业务域：库存 |
| 粒度 | 库存业务单据中的一个 SKU |
| 主键 | `tenant_id`, `inventory_doc_line_id` |
| 来源 | 接入系统：WMS；上述单据明细 |
| 引用链 | `core.inventory_document`, `core.sku`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 上述单据明细；按 SKU 记录计划数量，不能用未来到货时间覆盖历史计划 |
| 权限 | SITE_REGION：本租户 + 实际地点/库存作业归属 region；不能借库存权限扩大为另一销售区域的订单权限。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：inventory_document.created_at (按 tenant_id/inventory_doc_id 回连) |
| 行数策略 | 动态；不设精确行数。 实际库存业务单据内的 SKU 行数之和；计划数量与库存事件分开保存。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H23, B25；patch 生成器验收：BUCKET-01, RECOVERY-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 40. `core.inventory_movement`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / WMS；业务域：库存 |
| 粒度 | 一个地点 SKU 批次的一次库存桶变化 |
| 主键 | `tenant_id`, `movement_id` |
| 来源 | 接入系统：WMS；库存状态机 |
| 引用链 | `core.inventory_document_line`, `core.inventory_lot`, `core.order_unit`, `core.return_item`, `core.site`, `core.sku`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 库存状态机；五桶变动、原子业务组、唯一源事件腿；数量唯一真值 |
| 权限 | SITE_REGION：本租户 + 实际地点/库存作业归属 region；不能借库存权限扩大为另一销售区域的订单权限。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：event_at |
| 行数策略 | 动态；不设精确行数。 实际库存原子事务的来源事件腿数之和；包括预留/释放/出库/收货/调拨/待检/损坏/报废。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H21, H22, H23, H24, H32, B26；patch 生成器验收：ATOMIC-01, FIFO-01, BUCKET-01, VISIBLE-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 41. `core.inventory_snapshot`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_SNAPSHOT / WMS；业务域：库存 |
| 粒度 | 一个本地日末 地点 SKU 的有效库存快照 |
| 主键 | `tenant_id`, `snapshot_date`, `site_id`, `sku_id`, `as_of` |
| 来源 | 接入系统：WMS；日末物化 |
| 引用链 | `core.site`, `core.sku`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 日末物化；百万版仅一套 final_restated 全时期日末五桶快照；零库存仍输出；历史知识时点从流水重放并按评测 cutoff 缓存 |
| 权限 | SITE_REGION：本租户 + 实际地点/库存作业归属 region；不能借库存权限扩大为另一销售区域的订单权限。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：snapshot_date |
| 行数策略 | 动态；不设精确行数。 对每个业务日的 active_assortment 或任一库存桶非零的地点×SKU 域输出一行；保留零库存经营组合和停售残余库存。全时期仅 final_restated 一套，历史知识时点按需重放缓存；每张表约 29412800 行仅为容量参考。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H34, B27；patch 生成器验收：VISIBLE-01, FIFO-01, BUCKET-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 42. `core.revenue_entry`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / ERP；业务域：财务 |
| 粒度 | 一次单件收入确认或冲减 |
| 主键 | `tenant_id`, `revenue_entry_id` |
| 来源 | 接入系统：ERP；DELIVERED / ACCEPTED |
| 引用链 | `core.order_unit`, `core.return_event`, `core.shipment_event`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | DELIVERED / ACCEPTED；单件交付 +net_cent；售后接受 -net_cent；引用直接业务事件 |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：recognized_at |
| 行数策略 | 动态；不设精确行数。 等于已交付单件正向收入分录数 + 已接受售后单件收入冲减数；源事件未发生不预生成收入。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H13, H14, H15, H18, H33, B28；patch 生成器验收：FIFO-01, BUCKET-01, VISIBLE-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 43. `core.cost_entry`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / ERP；业务域：财务 |
| 粒度 | 一次单件销售成本确认或冲回 |
| 主键 | `tenant_id`, `cost_entry_id` |
| 来源 | 接入系统：ERP；DELIVERED / RESTOCKED |
| 引用链 | `core.inventory_lot`, `core.order_unit`, `core.return_event`, `core.shipment_event`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | DELIVERED / RESTOCKED；交付 +原批成本；可售回库 -原批成本；原出库 lot_id 不改变 |
| 权限 | SALES_REGION + COST：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 另需 can_view_cost；无权限的指标金额应为 NULL，而非伪造 0。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：recognized_at |
| 行数策略 | 动态；不设精确行数。 等于已交付单件原批 COGS 分录数 + 可售回库单件原 COGS 冲回数；损坏/RTO 不产生虚假冲回。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H15, H16, H18, H33, B29；patch 生成器验收：FIFO-01, BUCKET-01, VISIBLE-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 44. `core.order_fee`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / ERP；业务域：财务 |
| 粒度 | 订单对应的一笔经营变动费用 |
| 主键 | `tenant_id`, `fee_id` |
| 来源 | 接入系统：ERP；佣金、物流、支付手续费发生 |
| 引用链 | `core.order_fee`, `core.order_header`, `core.order_unit`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 佣金、物流、支付手续费发生；source_system/source_fee_no 唯一标识来源；负费用必须引用同订单原费用；直接业务事件可追踪；投放费不重复写入此表 |
| 权限 | SALES_REGION + COST：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 另需 can_view_cost；无权限的指标金额应为 NULL，而非伪造 0。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：recognized_at |
| 行数策略 | 动态；不设精确行数。 实际产生的佣金、物流、支付手续费及有原费用引用的冲回数；来源幂等；投放费用仅在 campaign_daily。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H35, H36, B30；patch 生成器验收：FEE-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 45. `core.order_unit_event`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / OMS；业务域：交易 |
| 粒度 | 一个逻辑单件的一次状态变化 |
| 主键 | `tenant_id`, `unit_event_id` |
| 来源 | 接入系统：OMS, POS；单件状态机 |
| 引用链 | `core.order_unit`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 单件状态机；记录每个单件的创建、预留、释放、支付、出库、交付或取消 |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：event_at |
| 行数策略 | 动态；不设精确行数。 每个逻辑单件实际发生的状态事件数之和；用于部分履约/取消，不读取未来当前态。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H11, H23, B31；patch 生成器验收：OMS-01, ATOMIC-01, STOCK-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 46. `core.web_session`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / WEB；业务域：行为 |
| 粒度 | 自有线上渠道的一次会话 |
| 主键 | `tenant_id`, `session_id` |
| 来源 | 接入系统：WEB；自有渠道流量计划 |
| 引用链 | `core.campaign`, `core.channel`, `core.customer_identity`, `core.geo_area`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 自有渠道流量计划；仅 has_user_events=true 渠道；成功创建订单的会话在 started_at 已有同渠道 identity；匿名会话仅浏览或未成功创建订单，会员仍可未知 |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：started_at |
| 行数策略 | 动态；不设精确行数。 自有渠道已提交及未提交订单会话数；按同源流量过程生成，平台与线下不造 session。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H28, H29, H30, B32；patch 生成器验收：PLATFORM-01, CONTEXT-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 47. `core.behavior_event`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / WEB；业务域：行为 |
| 粒度 | 一个可观察的会话行为事件 |
| 主键 | `tenant_id`, `behavior_event_id` |
| 来源 | 接入系统：WEB；自有会话过程 + 同源下单 |
| 引用链 | `core.order_header`, `core.sku`, `core.tenant`, `core.web_session`, `ops.ingestion_batch` |
| 产生阶段 | 自有会话过程 + 同源下单；购物篮相关轨迹引用同一 proposal/SKU；只有 CHECKOUT_SUBMITTED 引用已创建 order_id |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：event_at |
| 行数策略 | 动态；不设精确行数。 自有会话实际事件数之和；包括未转化/拒绝行为，不能按每个订单填一套固定轨迹。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H29, B33；patch 生成器验收：PLATFORM-01, CONTEXT-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 48. `core.campaign_daily`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_SOURCE_REPORT / ADS；业务域：营销 |
| 粒度 | 一个日 活动 承接渠道 经营区域 |
| 主键 | `tenant_id`, `report_date`, `campaign_id`, `channel_id`, `region_id`, `report_version` |
| 来源 | 接入系统：ADS；广告源过程 |
| 引用链 | `core.campaign`, `core.channel`, `core.geo_area`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 广告源过程；活跃活动本地日×全部租户 REGION 大区，固定活动 target_channel_id；未投放地区输出零报告；迟到修订追加版本，不直接连接订单行后加总 |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：report_date |
| 行数策略 | 动态；不设精确行数。 有效活动日×目标渠道×全部该租户区域×实际报告版本；无投放区域仍显式 0 报告，源缺报保持未知。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：B34；patch 生成器验收：VISIBLE-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 49. `core.channel_product_daily`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_SOURCE_REPORT / ADS；业务域：营销 |
| 粒度 | 一个平台 日 渠道 SKU 区域的经营报表版本 |
| 主键 | `tenant_id`, `report_date`, `channel_id`, `sku_id`, `region_id`, `report_version` |
| 来源 | 接入系统：ADS；平台订单 cohort + 平台可见统计 |
| 引用链 | `core.channel`, `core.geo_area`, `core.sku`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 平台订单 cohort + 平台可见统计；report_date 为下单日期 cohort，后续支付通过 report_version 修订；SKU 内订单去重，跨 SKU 不可直接加总成独立订单数 |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：report_date |
| 行数策略 | 动态；不设精确行数。 实际平台可见的日×渠道×SKU×区域报告域及其修订版本；订单指标按创建日 cohort 计算，不从聚合报告倒造用户触点。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：B35；patch 生成器验收：PLATFORM-01, CONTEXT-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 50. `core.store_traffic_daily`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_SOURCE_REPORT / POS；业务域：营销 |
| 粒度 | 一家门店一天的客流报表版本 |
| 主键 | `tenant_id`, `report_date`, `site_id`, `report_version` |
| 来源 | 接入系统：POS；门店客流计划与报表过程 |
| 引用链 | `core.site`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 门店客流计划与报表过程；输出进店人次；与 POS 购买过程同源约束，但不是企业去重访客 |
| 权限 | SITE_REGION：本租户 + 实际地点/库存作业归属 region；不能借库存权限扩大为另一销售区域的订单权限。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：report_date |
| 行数策略 | 动态；不设精确行数。 实际开业门店×报告日×源报告版本；暂停营业与采集缺失按源过程表达，不以 0 替代未知。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：B36；patch 生成器验收：VISIBLE-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 51. `core.order_attribution`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / ADS；业务域：营销 |
| 粒度 | 某归因模型版本对一张订单的一条触点归因 |
| 主键 | `tenant_id`, `attribution_id` |
| 来源 | 接入系统：WEB, OMS, ADS；已可观察证据的归因计算 |
| 引用链 | `core.campaign`, `core.order_header`, `core.tenant`, `core.web_session`, `ops.ingestion_batch` |
| 产生阶段 | 已可观察证据的归因计算；自有渠道采用 7 天末次非直接触点；无可观察证据为 ORGANIC 或 UNATTRIBUTABLE；百万版平台固定 UNATTRIBUTABLE |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：order_header.order_date (按 tenant_id/order_id 回连) |
| 行数策略 | 动态；不设精确行数。 每个纳入已完成归因计算的订单×固定模型一行，credit=1；全量最终计算覆盖所有订单时与订单头 1:1；平台为 UNATTRIBUTABLE，不能增加虚假触点。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H30, B37；patch 生成器验收：PLATFORM-01, CONTEXT-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 52. `core.target_monthly`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_PLAN / ERP；业务域：计划 |
| 粒度 | 某月 渠道 大区的一项指标目标 |
| 主键 | `tenant_id`, `target_month`, `channel_id`, `region_id`, `metric_code`, `plan_version` |
| 来源 | 接入系统：ERP；compile，预先批准目标 |
| 引用链 | `core.channel`, `core.geo_area`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | compile，预先批准目标；月×渠道×区域×指标×计划版本；不能看完实际结果后倒推“恰好达成”的目标 |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：target_month |
| 行数策略 | 动态；不设精确行数。 冻结预算域的月×渠道×区域×指标×批准版本；无明确品类预算分摊表时不生成品类目标。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：B38；patch 生成器验收：VISIBLE-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 53. `ops.generation_run`

| 项目 | 契约 |
|---|---|
| 层 / owner | OPS_CONTROL / DATA_PLATFORM；业务域：治理 |
| 粒度 | 一次生成或恢复运行 |
| 主键 | `run_id` |
| 来源 | 接入系统：无业务源接入；内部控制/授权/评测；每个阶段的包装器 |
| 引用链 | `ops.dataset_release` |
| 产生阶段 | 每个阶段的包装器；记录 ACQUIRE/WEIGHTS/CONTEXT/PROPOSAL/SIMULATE/VALIDATE/PUBLISH 的运行和恢复信息 |
| 权限 | INTERNAL_ONLY：业务登录及 Agent 不可读明细；管理员、流水线或独立评测器使用独立受控凭据。 |
| 分区 | PostgreSQL 17 控制/权限/隐藏评测表；Parquet 键：无强制文件分区；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 实际阶段调用与恢复运行数；失败重试保留新运行记录，不改变业务实体身份。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：当前无直接引用本表的 H/B gate；patch 生成器验收：SOURCE-01, RNG-01, RNG-02, RECOVERY-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 54. `ops.file_manifest`

| 项目 | 契约 |
|---|---|
| 层 / owner | OPS_CONTROL / DATA_PLATFORM；业务域：治理 |
| 粒度 | 一份已提交的数据或配置文件 |
| 主键 | `file_id` |
| 来源 | 接入系统：无业务源接入；内部控制/授权/评测；每次完整文件提交 |
| 引用链 | `core.tenant`, `ops.dataset_release`, `ops.generation_run` |
| 产生阶段 | 每次完整文件提交；记录源配置、中间文件、规范事实及检查点的路径、分区、行数和物理/逻辑哈希 |
| 权限 | INTERNAL_ONLY：业务登录及 Agent 不可读明细；管理员、流水线或独立评测器使用独立受控凭据。 |
| 分区 | PostgreSQL 17 控制/权限/隐藏评测表；Parquet 键：无强制文件分区；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 实际完整提交的配置、中间资产、事实分区和检查点文件数；物理文件数量随体积与冻结分区规划变化。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：当前无直接引用本表的 H/B gate；patch 生成器验收：SOURCE-01, RNG-02, RECOVERY-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 55. `ops.source_watermark`

| 项目 | 契约 |
|---|---|
| 层 / owner | OPS_CONTROL / DATA_PLATFORM；业务域：治理 |
| 粒度 | 某源在一个已观察时点的完整性水位 |
| 主键 | `tenant_id`, `source_system`, `observed_at` |
| 来源 | 接入系统：无业务源接入；内部控制/授权/评测；已到批次的连续覆盖计算 |
| 引用链 | `core.tenant` |
| 产生阶段 | 已到批次的连续覆盖计算；complete_through 由完整批次覆盖决定，不能用 MAX(event_at) 或最新一条记录充当完整性证明 |
| 权限 | INTERNAL_ONLY：业务登录及 Agent 不可读明细；管理员、流水线或独立评测器使用独立受控凭据。 仅 api.source_status 白名单列可向本人租户公开，历史水位选择仍需 broker。 |
| 分区 | PostgreSQL 17 控制/权限/隐藏评测表；Parquet 键：无强制文件分区；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 租户×源×实际观察时点的水位版本数；按连续已到完整批次计算，不以最大事件时间替代完整性。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：当前无直接引用本表的 H/B gate；patch 生成器验收：VISIBLE-01, RECOVERY-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 56. `sec.principal`

| 项目 | 契约 |
|---|---|
| 层 / owner | SEC_ACCESS / IAM；业务域：权限 |
| 粒度 | 一个真实数据库登录身份 |
| 主键 | `db_role` |
| 来源 | 接入系统：无业务源接入；内部控制/授权/评测；管理员配置的角色映射 |
| 引用链 | `core.tenant` |
| 产生阶段 | 管理员配置的角色映射；明确实际登录角色、租户、persona、区域范围及成本权限 |
| 权限 | INTERNAL_ONLY：业务登录及 Agent 不可读明细；管理员、流水线或独立评测器使用独立受控凭据。 api.access_context 仅返回当前 session_user 自身授权摘要。 |
| 分区 | PostgreSQL 17 控制/权限/隐藏评测表；Parquet 键：无强制文件分区；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 管理员批准的实际数据库登录身份数；不因 Agent 自报 persona 创建授权。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：当前无直接引用本表的 H/B gate；patch 生成器验收：按上列产生规则及冻结配置验证；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 57. `sec.principal_region`

| 项目 | 契约 |
|---|---|
| 层 / owner | SEC_ACCESS / IAM；业务域：权限 |
| 粒度 | 登录角色的一条区域授权 |
| 主键 | `db_role`, `tenant_id`, `region_id` |
| 来源 | 接入系统：无业务源接入；内部控制/授权/评测；管理员授权配置 |
| 引用链 | `core.geo_area`, `core.tenant`, `sec.principal` |
| 产生阶段 | 管理员授权配置；部分区域角色的精确授权集；不由普通 Agent 写入 |
| 权限 | INTERNAL_ONLY：业务登录及 Agent 不可读明细；管理员、流水线或独立评测器使用独立受控凭据。 |
| 分区 | PostgreSQL 17 控制/权限/隐藏评测表；Parquet 键：无强制文件分区；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 部分区域登录身份的明确授权集合大小；all_regions 身份不靠复制所有区域记录表示。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：当前无直接引用本表的 H/B gate；patch 生成器验收：按上列产生规则及冻结配置验证；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 58. `eval.scenario`

| 项目 | 契约 |
|---|---|
| 层 / owner | EVAL_HIDDEN / EVALUATION；业务域：评测 |
| 粒度 | 一个业务或数据链路情节 |
| 主键 | `scenario_id` |
| 来源 | 接入系统：无业务源接入；内部控制/授权/评测；冻结场景参数 |
| 引用链 | `core.tenant` |
| 产生阶段 | 冻结场景参数；保存注入机制、范围、证据及反事实定义，对业务 Agent 隔离 |
| 权限 | INTERNAL_ONLY：业务登录及 Agent 不可读明细；管理员、流水线或独立评测器使用独立受控凭据。 |
| 分区 | PostgreSQL 17 控制/权限/隐藏评测表；Parquet 键：无强制文件分区；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 冻结场景目录中的注入机制/数据故障/反事实情节数；版本变化由评测配置决定。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：当前无直接引用本表的 H/B gate；patch 生成器验收：按上列产生规则及冻结配置验证；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 59. `eval.question`

| 项目 | 契约 |
|---|---|
| 层 / owner | EVAL_HIDDEN / EVALUATION；业务域：评测 |
| 粒度 | 一条自然语言评测题的版本 |
| 主键 | `question_id` |
| 来源 | 接入系统：无业务源接入；内部控制/授权/评测；独立题库设计 |
| 引用链 | `core.tenant`, `eval.scenario` |
| 产生阶段 | 独立题库设计；固定租户/角色、业务时点、知识时点、指标版本、金标 SQL 与输出形式 |
| 权限 | INTERNAL_ONLY：业务登录及 Agent 不可读明细；管理员、流水线或独立评测器使用独立受控凭据。 |
| 分区 | PostgreSQL 17 控制/权限/隐藏评测表；Parquet 键：无强制文件分区；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 冻结 validation/question_catalog.json 中的题目版本数；保留 business/knowledge/reference 三时钟与角色。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：当前无直接引用本表的 H/B gate；patch 生成器验收：按上列产生规则及冻结配置验证；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 60. `eval.expected_result`

| 项目 | 契约 |
|---|---|
| 层 / owner | EVAL_HIDDEN / EVALUATION；业务域：评测 |
| 粒度 | 一条题目在一个版本上的金标结果 |
| 主键 | `question_id`, `release_id` |
| 来源 | 接入系统：无业务源接入；内部控制/授权/评测；独立 SQL 验证器 |
| 引用链 | `eval.question`, `ops.dataset_release` |
| 产生阶段 | 独立 SQL 验证器；在指定 release 上计算结果和哈希；不把 Agent 自己生成的 SQL 当金标 |
| 权限 | INTERNAL_ONLY：业务登录及 Agent 不可读明细；管理员、流水线或独立评测器使用独立受控凭据。 |
| 分区 | PostgreSQL 17 控制/权限/隐藏评测表；Parquet 键：无强制文件分区；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 实际通过独立验证的 question×release 组合数；未运行的金标不造已计算结果。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：当前无直接引用本表的 H/B gate；patch 生成器验收：按上列产生规则及冻结配置验证；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 61. `core.customer_identity_link`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_VERSIONED_REFERENCE / CRM；业务域：客户 |
| 粒度 | 一条渠道身份到会员的已验证绑定 |
| 主键 | `tenant_id`, `identity_link_id` |
| 来源 | 接入系统：CRM；CRM 绑定事件 |
| 引用链 | `core.customer`, `core.customer_identity`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | CRM 绑定事件；仅明确绑定时新增；identity_id 与 customer_id 通过 linked_at 和 available_at 区分业务与知识时间 |
| 权限 | CUSTOMER_FULL：仅 all_regions=true 且获授 contoso_customer_full_ro 的身份可直读客户/渠道身份三表；区域身份仅经 api.customer_profile_for_orders 取授权订单关联的粗粒度画像。 |
| 分区 | 规范主数据/版本表；小表可单文件，PG 装载可选；Parquet 键：release_id, tenant_id；月份依据：不强制按月 |
| 行数策略 | 动态；不设精确行数。 每个确实发生且有证据的渠道身份绑定一行；v1 每个 identity 最多一条，未绑定身份不造映射。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H27, B39；patch 生成器验收：IDENTITY-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 62. `core.stock_allocation_attempt`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_FACT / OMS；业务域：库存 |
| 粒度 | 一次订单锁库事务中一个候选地点 SKU 的尝试 |
| 主键 | `tenant_id`, `allocation_attempt_id` |
| 来源 | 接入系统：OMS, WMS；异步锁库 |
| 引用链 | `core.order_header`, `core.site`, `core.sku`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 异步锁库；每个 allocation_group_id 的地点×SKU 尝试；写 requested_qty、available_before_qty 与最终 outcome |
| 权限 | SALES_REGION：本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：attempted_at |
| 行数策略 | 动态；不设精确行数。 每个整单 allocation_group 的实际候选地点×SKU 尝试数；包含不足和回滚证据，不按所有仓库全积。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：H32, B40；patch 生成器验收：OMS-01, ATOMIC-01, STOCK-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

### 63. `core.inventory_valuation_snapshot`

| 项目 | 契约 |
|---|---|
| 层 / owner | CORE_SNAPSHOT / WMS；业务域：库存 |
| 粒度 | 一个日末 地点 SKU 和观察截止的库存金额 |
| 主键 | `tenant_id`, `snapshot_date`, `site_id`, `sku_id`, `as_of` |
| 来源 | 接入系统：WMS；日末物化 |
| 引用链 | `core.site`, `core.sku`, `core.tenant`, `ops.ingestion_batch` |
| 产生阶段 | 日末物化；同域单版本的逐批可售余额×原批单位成本；预留已含其中，排除 quarantine/damaged；历史时点估值也须重放原批次余额 |
| 权限 | SITE_REGION + COST：本租户 + 实际地点/库存作业归属 region；不能借库存权限扩大为另一销售区域的订单权限。 另需 can_view_cost；无权限的指标金额应为 NULL，而非伪造 0。 |
| 分区 | 不可变 Parquet；全量 PG 装载可选；Parquet 键：release_id, tenant_id, business_month；月份依据：snapshot_date |
| 行数策略 | 动态；不设精确行数。 对每个业务日的 active_assortment 或任一库存桶非零的地点×SKU 域输出一行；保留零库存经营组合和停售残余库存。全时期仅 final_restated 一套，历史知识时点按需重放缓存；每张表约 29412800 行仅为容量参考。 |
| 验收来源 | `01_schema.sql` 结构约束；SQL 检查：B41；patch 生成器验收：VISIBLE-01, FIFO-01, BUCKET-01；权限按 `02_security.sql` / `docs/security_contract.md` 验证。 |

## 4. 10 份中间资产

JSON 目录保留 patch 资产原有的 format、producer、consumers、fields、primary_key、assertions，逐字段不改写；这里只增加目录元数据。它们是受控生成资产，由 `ops.file_manifest` 管理，不另建业务表，也不供 Agent 直接读取。

### I01. `category_projection.csv`

| 项目 | 契约 |
|---|---|
| 层 / owner | STAGING_INTERNAL / PIM |
| 粒度 | 每租户一个 Contoso 一级分类代理映射 |
| 主键 | `tenant_id`, `contoso_category_id` |
| 来源 | core.category 一级节点及冻结曲线配置 |
| 产生阶段 | COMPILE；producer=Python compile；consumers=C# WEIGHTS, C# PROPOSAL |
| 权限 | 仅受控构建、生成、验收和血缘审计可读；路径、候选、隐藏上下文及 RNG 不向业务 Agent 暴露。 |
| 分区 | release_id, tenant_id；复用 patch wire_format.partition_rule；日期或槽位分区边界须冻结、与 worker 数无关。小投影/权重按租户单文件；文件内按原 primary_key 排序。 |
| 行数策略 | 固定 24 行目标。 每租户一个一级分类一行。 |
| 验收来源 | config/contoso_patch_contract.json#/assets/0；SOURCE-01, REUSE-01, ASSORTMENT-01；一级分类必须能映射到本租户 core.category；本文件不定义售价或库存 |
| 字段契约 | JSON 目录保留 patch 原定义共 5 个字段、类型和 nullable；不复用 Contoso 旧 Sales/Orders 作为财务真值。 |

### I02. `subcategory_projection.csv`

| 项目 | 契约 |
|---|---|
| 层 / owner | STAGING_INTERNAL / PIM |
| 粒度 | 每租户一个 Contoso 二级分类代理映射 |
| 主键 | `tenant_id`, `contoso_subcategory_id` |
| 来源 | core.category 叶子节点、category_projection.csv |
| 产生阶段 | COMPILE；producer=Python compile；consumers=C# WEIGHTS, C# PROPOSAL |
| 权限 | 仅受控构建、生成、验收和血缘审计可读；路径、候选、隐藏上下文及 RNG 不向业务 Agent 暴露。 |
| 分区 | release_id, tenant_id；复用 patch wire_format.partition_rule；日期或槽位分区边界须冻结、与 worker 数无关。小投影/权重按租户单文件；文件内按原 primary_key 排序。 |
| 行数策略 | 固定 72 行目标。 每租户一个二级分类一行。 |
| 验收来源 | config/contoso_patch_contract.json#/assets/1；SOURCE-01, REUSE-01, ASSORTMENT-01；父类在 category_projection 中存在；叶子分类与上层分类关系正确 |
| 字段契约 | JSON 目录保留 patch 原定义共 6 个字段、类型和 nullable；不复用 Contoso 旧 Sales/Orders 作为财务真值。 |

### I03. `product_projection.csv`

| 项目 | 契约 |
|---|---|
| 层 / owner | STAGING_INTERNAL / PIM |
| 粒度 | 每租户一个可抽样 SKU 的 Contoso 商品投影 |
| 主键 | `tenant_id`, `contoso_product_id` |
| 来源 | core.sku、core.spu、分类投影与冻结商品权重 |
| 产生阶段 | COMPILE；producer=Python compile；consumers=C# WEIGHTS, C# PROPOSAL |
| 权限 | 仅受控构建、生成、验收和血缘审计可读；路径、候选、隐藏上下文及 RNG 不向业务 Agent 暴露。 |
| 分区 | release_id, tenant_id；复用 patch wire_format.partition_rule；日期或槽位分区边界须冻结、与 worker 数无关。小投影/权重按租户单文件；文件内按原 primary_key 排序。 |
| 行数策略 | 固定 6,400 行目标。 冻结百万 profile 每个合法 SKU 一个投影；不输出权威成交成本或售价。 |
| 验收来源 | config/contoso_patch_contract.json#/assets/2；SOURCE-01, REUSE-01, ASSORTMENT-01, MONEY-01；tenant_id + sku_id 也唯一；投影只携带抽样必要属性；完整 SPU/SKU 模型仍归 Python；若复用旧 Product 对象必须给其 Price/Cost 占位零值且禁止从该值写生产金额 |
| 字段契约 | JSON 目录保留 patch 原定义共 10 个字段、类型和 nullable；不复用 Contoso 旧 Sales/Orders 作为财务真值。 |

### I04. `product_id_map.parquet`

| 项目 | 契约 |
|---|---|
| 层 / owner | STAGING_INTERNAL / PIM |
| 粒度 | 每租户一个 Contoso 商品代理 ID 到统一 SKU 的映射 |
| 主键 | `tenant_id`, `contoso_product_id` |
| 来源 | core.sku、product_projection.csv |
| 产生阶段 | COMPILE；producer=Python compile；consumers=C# PROPOSAL, Python canonicalize |
| 权限 | 仅受控构建、生成、验收和血缘审计可读；路径、候选、隐藏上下文及 RNG 不向业务 Agent 暴露。 |
| 分区 | release_id, tenant_id；复用 patch wire_format.partition_rule；日期或槽位分区边界须冻结、与 worker 数无关。小投影/权重按租户单文件；文件内按原 primary_key 排序。 |
| 行数策略 | 固定 6,400 行目标。 与 product_projection 双向 1:1。 |
| 验收来源 | config/contoso_patch_contract.json#/assets/3；SOURCE-01, ASSORTMENT-01, MERGE-01；映射双向唯一；与 product_projection.csv 一致；同一整数代理 ID 可以在不同租户复用，但全部查询必须带 tenant_id |
| 字段契约 | JSON 目录保留 patch 原定义共 3 个字段、类型和 nullable；不复用 Contoso 旧 Sales/Orders 作为财务真值。 |

### I05. `calendar_weights.parquet`

| 项目 | 契约 |
|---|---|
| 层 / owner | STAGING_INTERNAL / DATA_PLATFORM |
| 粒度 | 一个租户一个新建订单业务日的日期权重 |
| 主键 | `tenant_id`, `business_date` |
| 来源 | 固定 Contoso 权重内核、课程日期和输入投影 |
| 产生阶段 | WEIGHTS；producer=C# WEIGHTS；consumers=Python CONTEXT |
| 权限 | 仅受控构建、生成、验收和血缘审计可读；路径、候选、隐藏上下文及 RNG 不向业务 Agent 暴露。 |
| 分区 | release_id, tenant_id；复用 patch wire_format.partition_rule；日期或槽位分区边界须冻结、与 worker 数无关。小投影/权重按租户单文件；文件内按原 primary_key 排序。 |
| 行数策略 | 固定 3,288 行目标。 3 个租户×1096 个新单日期；无尾窗订单权重。 |
| 验收来源 | config/contoso_patch_contract.json#/assets/4；REUSE-01, QUOTA-01, RNG-01, RNG-02；覆盖 2023-01-01 至 2025-12-31 共 1096 天；每租户总权重大于零；日扰动若启用，只作为归一化前的权重；不得在生成订单后改变配额 |
| 字段契约 | JSON 目录保留 patch 原定义共 4 个字段、类型和 nullable；不复用 Contoso 旧 Sales/Orders 作为财务真值。 |

### I06. `assortment_profiles.parquet`

| 项目 | 契约 |
|---|---|
| 层 / owner | STAGING_INTERNAL / PIM |
| 粒度 | 一个 profile 的一个合法候选商品有效区间 |
| 主键 | `tenant_id`, `profile_id`, `contoso_product_id`, `valid_from` |
| 来源 | 上市、channel_listing、assortment、渠道/区域/客群与规格配置 |
| 产生阶段 | COMPILE/CONTEXT；producer=Python compile；consumers=C# PROPOSAL |
| 权限 | 仅受控构建、生成、验收和血缘审计可读；路径、候选、隐藏上下文及 RNG 不向业务 Agent 暴露。 |
| 分区 | release_id, tenant_id；复用 patch wire_format.partition_rule；日期或槽位分区边界须冻结、与 worker 数无关。小投影/权重按租户单文件；文件内按原 primary_key 排序。 |
| 行数策略 | 动态；不设精确行数。 实际 profile×候选商品×有效区间数；不以实时库存删选候选。 |
| 验收来源 | config/contoso_patch_contract.json#/assets/5；ASSORTMENT-01, STOCK-01；按上市、渠道 listing、地区服务范围、地点经营区间及客群/规格条件编译；不使用实时库存过滤；零权重先移除；无有效候选时报配置错误，不能跳过订单；同一 profile 的类别与子类别乘数在规则配置中单独冻结，原层级时间权重仍由 Contoso 计算 |
| 字段契约 | JSON 目录保留 patch 原定义共 8 个字段、类型和 nullable；不复用 Contoso 旧 Sales/Orders 作为财务真值。 |

### I07. `context_plan.parquet`

| 项目 | 契约 |
|---|---|
| 层 / owner | STAGING_INTERNAL / OMS |
| 粒度 | 一个已经固定创建上下文的订单槽位 |
| 主键 | `tenant_id`, `order_slot_id` |
| 来源 | calendar_weights、冻结租户配额、身份/绑定、渠道/地区及场景配置 |
| 产生阶段 | CONTEXT；producer=Python CONTEXT；consumers=C# PROPOSAL, Python SIMULATE |
| 权限 | 仅受控构建、生成、验收和血缘审计可读；路径、候选、隐藏上下文及 RNG 不向业务 Agent 暴露。 |
| 分区 | release_id, tenant_id, business_month_or_frozen_slot_range；复用 patch wire_format.partition_rule；日期或槽位分区边界须冻结、与 worker 数无关。小投影/权重按租户单文件；文件内按原 primary_key 排序。 |
| 行数策略 | 固定 1,000,000 行目标。 与逐租户订单头目标一一对应；101/102/103 为 900000/50000/50000。 |
| 验收来源 | config/contoso_patch_contract.json#/assets/6；QUOTA-01, CONTEXT-01, IDENTITY-01, STOCK-01；tenant_id + order_id 唯一；总行数 1000000；租户 101/102/103 分别 900000/50000/50000；identity 的渠道必须匹配 context.channel_id；customer_id 来自创建时已确认的 customer_identity_link；未来绑定不回填；PLATFORM 与 OFFLINE 不提供伪造 source_session_id；不读取实时库存决定商品或槽位是否存在 |
| 字段契约 | JSON 目录保留 patch 原定义共 18 个字段、类型和 nullable；不复用 Contoso 旧 Sales/Orders 作为财务真值。 |

### I08. `order_proposals.parquet`

| 项目 | 契约 |
|---|---|
| 层 / owner | STAGING_INTERNAL / OMS |
| 粒度 | 一个 context 槽位的原始购物篮候选头 |
| 主键 | `tenant_id`, `proposal_id` |
| 来源 | context_plan、assortment_profiles、商品投影和 Contoso 抽样内核 |
| 产生阶段 | PROPOSAL；producer=C# PROPOSAL；consumers=Python canonicalize |
| 权限 | 仅受控构建、生成、验收和血缘审计可读；路径、候选、隐藏上下文及 RNG 不向业务 Agent 暴露。 |
| 分区 | release_id, tenant_id, business_month_or_frozen_slot_range；复用 patch wire_format.partition_rule；日期或槽位分区边界须冻结、与 worker 数无关。小投影/权重按租户单文件；文件内按原 primary_key 排序。 |
| 行数策略 | 固定 1,000,000 行目标。 与 context_plan 逐槽位 1:1，不能按成功支付/库存过滤。 |
| 验收来源 | config/contoso_patch_contract.json#/assets/7；QUOTA-01, CONTEXT-01, REUSE-01, MONEY-01；与 context_plan 逐槽位一一对应；不含金额、支付、库存、出库或退款状态；不能沿用上游 OrdersCount 的近似计数来代替上下文精确计数 |
| 字段契约 | JSON 目录保留 patch 原定义共 5 个字段、类型和 nullable；不复用 Contoso 旧 Sales/Orders 作为财务真值。 |

### I09. `order_proposal_lines.parquet`

| 项目 | 契约 |
|---|---|
| 层 / owner | STAGING_INTERNAL / OMS |
| 粒度 | 一个原始候选头内的一条未合并商品行 |
| 主键 | `tenant_id`, `proposal_id`, `proposal_line_no` |
| 来源 | order_proposals、条件可售集合与命名行数/商品/数量抽样 |
| 产生阶段 | PROPOSAL；producer=C# PROPOSAL；consumers=Python canonicalize |
| 权限 | 仅受控构建、生成、验收和血缘审计可读；路径、候选、隐藏上下文及 RNG 不向业务 Agent 暴露。 |
| 分区 | release_id, tenant_id, business_month_or_frozen_slot_range；复用 patch wire_format.partition_rule；日期或槽位分区边界须冻结、与 worker 数无关。小投影/权重按租户单文件；文件内按原 primary_key 排序。 |
| 行数策略 | 动态；不设精确行数。 等于候选头 line_count 之和；保留重复 SKU 原始行。 |
| 验收来源 | config/contoso_patch_contract.json#/assets/8；REUSE-01, ASSORTMENT-01, MERGE-01, RNG-02；原始行号连续且与头 line_count 相等；数量大于零；商品在槽位有效区间与条件集合内；重复 SKU 原始行不丢弃；之后由 Python 做规范化合并 |
| 字段契约 | JSON 目录保留 patch 原定义共 6 个字段、类型和 nullable；不复用 Contoso 旧 Sales/Orders 作为财务真值。 |

### I10. `source_to_order_line.parquet`

| 项目 | 契约 |
|---|---|
| 层 / owner | STAGING_INTERNAL / DATA_PLATFORM |
| 粒度 | 一条原始候选行到规范订单行及单件区间的映射 |
| 主键 | `tenant_id`, `proposal_id`, `proposal_line_no` |
| 来源 | order_proposal_lines、规范 order_line/order_unit 和整数分定价上下文 |
| 产生阶段 | SIMULATE/canonicalize；producer=Python canonicalize；consumers=Python VALIDATE, 血缘审计 |
| 权限 | 仅受控构建、生成、验收和血缘审计可读；路径、候选、隐藏上下文及 RNG 不向业务 Agent 暴露。 |
| 分区 | release_id, tenant_id, business_month_or_frozen_slot_range；复用 patch wire_format.partition_rule；日期或槽位分区边界须冻结、与 worker 数无关。小投影/权重按租户单文件；文件内按原 primary_key 排序。 |
| 行数策略 | 动态；不设精确行数。 与原始候选行 1:1；多个原始行可以映到同一规范行，不等于规范订单行数。 |
| 验收来源 | config/contoso_patch_contract.json#/assets/9；MERGE-01, MONEY-01, SOURCE-01；每原始行恰好一条映射；区间长度等于 source_quantity；同规范行的区间连续不重叠、覆盖 order_line.quantity；只有同 SKU、同 price_id、同 listing_id、同优惠适用性才合并；v1 保证该一致性，否则报错 |
| 字段契约 | JSON 目录保留 patch 原定义共 8 个字段、类型和 nullable；不复用 Contoso 旧 Sales/Orders 作为财务真值。 |

## 5. 已编写 SQL 验收编号

以下名称直接来自 `validation/assertions.json`，对应同包 `validation/acceptance.sql`。H35 是费用冲回上限；H36 是费用来源。支付/退款 attempted_at 即时完成属于 v1 时间契约，不另占 H35。此索引只标识已编写断言，不声称全量数据已经运行通过。

| ID | 断言名称 |
|---|---|
| H01 | 精确订单配额 |
| H02 | 订单日期与唯一活动发布版本 |
| H03 | 订单头与订单行数量金额守恒 |
| H04 | 逻辑单件与行金额数量守恒 |
| H05 | 优惠核销分摊与单件优惠一致 |
| H06 | 成功扣款不超过应付额 |
| H07 | 每个出库单件必须预先足额收款 |
| H08 | 退款只能引用成功支付且不能超额 |
| H09 | 每次退款分配和等于退款额 |
| H10 | 单件累计成功退款不超原净额 |
| H11 | 退款具备同单件有效业务原因 |
| H12 | 每包裹物流关键事件幂等 |
| H13 | 收入交付来源及金额时间一致 |
| H14 | 收入冲减来源及原单位净额一致 |
| H15 | 每个已交付单件恰有正向收入和成本 |
| H16 | 成本必须沿袭同单件原出库批次与事件 |
| H17 | 接受退货前必须已经交付 |
| H18 | 退货接受与可售回库都有且仅有相应分录 |
| H19 | 退货回库沿袭原SKU原成本实际地点 |
| H20 | 调拨或退货新批次成本不重抽 |
| H21 | 库存每次原子提交后全部桶非负 |
| H22 | 库存桶模板与业务动作一致 |
| H23 | 库存多态来源键存在且使用正确来源域 |
| H24 | 出库库存与履约单件原批次完全一致 |
| H25 | 价格有效期与下单价格快照一致 |
| H26 | 价格区间不得重叠 |
| H27 | 会员下单快照没有未来绑定 |
| H28 | 平台渠道不伪造用户级行为 |
| H29 | 同源结算行为只能链接同渠道同身份订单 |
| H30 | 单触点归因满足身份渠道窗口和可知证据 |
| H31 | 营业渠道与下单地点一致 |
| H32 | 失败锁库不能残留成功预留 |
| H33 | 未交付退回原仓不生成售后收入或成本冲回 |
| H34 | 快照的业务日末与知识截止边界正确 |
| H35 | 费用冲回引用正费用且累计不得超过原金额 |
| H36 | 费用发生来源属于本单且不晚于确认时点 |
| B01 | core.channel_listing 采集到达一致 |
| B02 | core.assortment 采集到达一致 |
| B03 | core.price_period 采集到达一致 |
| B04 | core.cost_period 采集到达一致 |
| B05 | core.customer 采集到达一致 |
| B06 | core.customer_identity 采集到达一致 |
| B07 | core.campaign 采集到达一致 |
| B08 | core.promotion 采集到达一致 |
| B09 | core.order_header 采集到达一致 |
| B10 | core.order_line 采集到达一致 |
| B11 | core.order_unit 采集到达一致 |
| B12 | core.order_status_event 采集到达一致 |
| B13 | core.discount_allocation 采集到达一致 |
| B14 | core.payment 采集到达一致 |
| B15 | core.refund 采集到达一致 |
| B16 | core.refund_allocation 采集到达一致 |
| B17 | core.inventory_lot 采集到达一致 |
| B18 | core.shipment 采集到达一致 |
| B19 | core.shipment_item 采集到达一致 |
| B20 | core.shipment_event 采集到达一致 |
| B21 | core.return_header 采集到达一致 |
| B22 | core.return_item 采集到达一致 |
| B23 | core.return_event 采集到达一致 |
| B24 | core.inventory_document 采集到达一致 |
| B25 | core.inventory_document_line 采集到达一致 |
| B26 | core.inventory_movement 采集到达一致 |
| B27 | core.inventory_snapshot 采集到达一致 |
| B28 | core.revenue_entry 采集到达一致 |
| B29 | core.cost_entry 采集到达一致 |
| B30 | core.order_fee 采集到达一致 |
| B31 | core.order_unit_event 采集到达一致 |
| B32 | core.web_session 采集到达一致 |
| B33 | core.behavior_event 采集到达一致 |
| B34 | core.campaign_daily 采集到达一致 |
| B35 | core.channel_product_daily 采集到达一致 |
| B36 | core.store_traffic_daily 采集到达一致 |
| B37 | core.order_attribution 采集到达一致 |
| B38 | core.target_monthly 采集到达一致 |
| B39 | core.customer_identity_link 采集到达一致 |
| B40 | core.stock_allocation_attempt 采集到达一致 |
| B41 | core.inventory_valuation_snapshot 采集到达一致 |

## 6. 生成器合同验收编号

这些项目来自补丁契约，需在实现、构建或生成数据后实际执行；与上述可执行 SQL 断言分开管理。

| ID | 要求 |
|---|---|
| SOURCE-01 | 固定上游提交、fork 提交、许可证与输入哈希完整 |
| BUILD-01 | 在冻结 .NET 8 工具链上实际构建成功 |
| API-01 | 新版接口独立可识别，结构化失败且无静默 legacy 回退 |
| OFFLINE-01 | 运行 WEIGHTS 与 PROPOSAL 时无隐式联网下载 |
| REUSE-01 | 确实复用 Contoso 权重、行数、数量与加权采样逻辑 |
| QUOTA-01 | context/proposal/header 逐槽位 1:1 且租户配额精确 |
| CONTEXT-01 | 租户、身份、渠道、销售门店、地区先于商品选择确定 |
| ASSORTMENT-01 | 每条候选商品在对应有效可售集合中 |
| STOCK-01 | 商品候选与实时库存解耦 |
| MONEY-01 | C# proposal 不输出权威经营金额 |
| RNG-01 | 命名随机值符合协议与跨语言已知答案向量 |
| RNG-02 | 变更 worker 数及恢复方式保持规范逻辑行相同 |
| MERGE-01 | 原始行→规范行→逻辑单件数量与金额守恒 |
| OMS-01 | 创建成功后锁库，失败取消可观察 |
| ATOMIC-01 | 全订单所有分仓预留原子提交 |
| FIFO-01 | 按可用批次 received_at/lot_id 预留与履约 |
| PREPAY-01 | 所有 SHIP 前累计成功支付达到应付 |
| BUCKET-01 | 五桶和来源腿守恒 |
| VISIBLE-01 | 业务与知识时间分离，库存事务原子可见 |
| IDENTITY-01 | 会员绑定独立且不泄漏未来关联 |
| PLATFORM-01 | 平台可见边界与 cohort 一致 |
| RECOVERY-01 | 检查点恢复与完整运行一致 |
| FEE-01 | 经营费用来源幂等且冲回可追踪 |
