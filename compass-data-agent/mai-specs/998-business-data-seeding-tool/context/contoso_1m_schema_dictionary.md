# 完整数据字典

模型版本 1.0.0。本文与 DDL 和 ER 图由同一模型生成。金额均为 CNY 不含税整数分，UTC 时刻使用 timestamptz。

共 63 张表，643 个字段。数据库每次装载一个不可变数据版本。

字段中的 available_at 是该记录的来源可见时间；load_batch_id 关联模拟采集批次。租户主键和外键必须整体传递。

## ops.dataset_release

一库仅激活一个版本；文件以 release_id 隔离

**粒度：**一行一个发布版本

**主键：**`release_id`

**权限分类：**`PRIVATE_CONTROL`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `release_id` | `text` | 否 | 无 | 不可变发布 ID |
| `schema_version` | `text` | 否 | 无 | 模型版本 |
| `generator_commit` | `text` | 否 | 无 | 定制生成器代码 commit |
| `contoso_commit` | `text` | 否 | 无 | 上游固定 commit |
| `config_sha256` | `char(64)` | 否 | 无 | 规范化配置摘要 |
| `catalog_sha256` | `char(64)` | 否 | 无 | 商品目录摘要 |
| `master_seed` | `bigint` | 否 | 无 | 全局随机种子 |
| `order_start` | `date` | 否 | 无 | 下单起始本地日期 |
| `order_end_exclusive` | `date` | 否 | 无 | 下单结束本地日期 不含 |
| `simulation_end_exclusive` | `date` | 否 | 无 | 事件推进截止本地日期 不含 |
| `published_as_of` | `timestamptz` | 否 | 无 | 此数据库允许的最大数据可见时刻 UTC |
| `status` | `text` | 否 | 无 | BUILDING VALIDATED PUBLISHED |
| `created_at` | `timestamptz` | 否 | 无 | 版本创建时刻 UTC |

**行内约束：**

- `status IN ('BUILDING','VALIDATED','PUBLISHED')`
- `order_start < order_end_exclusive`
- `order_end_exclusive < simulation_end_exclusive`

## core.tenant

SaaS 隔离边界；品牌与地区不是租户

**粒度：**一个独立经营企业

**主键：**`tenant_id`

**权限分类：**`TENANT_DIMENSION`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `tenant_code` | `text` | 否 | 无 | 稳定企业代码 |
| `tenant_name` | `text` | 否 | 无 | 虚构企业名称 |
| `timezone` | `text` | 否 | 无 | v1 固定 Asia/Shanghai |
| `currency` | `char(3)` | 否 | 无 | v1 固定 CNY |
| `order_quota` | `bigint` | 否 | 无 | 本版本精确订单头配额 |
| `release_id` | `text` | 否 | 无 | 数据版本 |

**外键：**

- `(release_id)` → `ops.dataset_release(release_id)`

**唯一约束：**

- `tenant_code`

**行内约束：**

- `timezone = 'Asia/Shanghai'`
- `currency = 'CNY'`
- `order_quota > 0`

## ops.ingestion_batch

独立区分业务发生与采集到达

**粒度：**一个租户一个源的一次采集批次

**主键：**`tenant_id, batch_id`

**权限分类：**`PRIVATE_CONTROL`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `batch_id` | `bigint` | 否 | 无 | 批次 ID |
| `source_system` | `text` | 否 | 无 | PIM OMS POS WMS CRM ADS WEB ERP |
| `source_from` | `timestamptz` | 否 | 无 | 本批业务窗口起点 包含 |
| `source_to` | `timestamptz` | 否 | 无 | 本批业务窗口终点 不含 |
| `received_at` | `timestamptz` | 否 | 无 | 采集批次到达时刻 |
| `status` | `text` | 否 | 无 | READY DELAYED FAILED |
| `row_count` | `bigint` | 否 | 无 | 批次行数 |

**外键：**

- `(tenant_id)` → `core.tenant(tenant_id)`

**行内约束：**

- `source_from < source_to`
- `row_count >= 0`
- `status IN ('READY','DELAYED','FAILED')`

## core.geo_area

经营大区 省份 城市的稳定层级；不模拟行政区划变化

**粒度：**一个地理节点

**主键：**`tenant_id, geo_id`

**权限分类：**`TENANT_DIMENSION`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `geo_id` | `bigint` | 否 | 无 | 地理节点 |
| `parent_geo_id` | `bigint` | 是 | 无 | 父地理节点 |
| `geo_level` | `text` | 否 | 无 | REGION PROVINCE CITY |
| `geo_code` | `text` | 否 | 无 | 内部稳定代码 |
| `geo_name` | `text` | 否 | 无 | 地理名称 |
| `region_id` | `bigint` | 否 | 无 | 所属大区的 geo_id；大区自身引用自身 |

**外键：**

- `(tenant_id, parent_geo_id)` → `core.geo_area(tenant_id, geo_id)`
- `(tenant_id, region_id)` → `core.geo_area(tenant_id, geo_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, geo_code`

**行内约束：**

- `geo_level IN ('REGION','PROVINCE','CITY')`

## core.org_unit

组织与区域分别建模；v1 组织归属不随历史变动

**粒度：**一个经营组织

**主键：**`tenant_id, org_unit_id`

**权限分类：**`TENANT_DIMENSION`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `org_unit_id` | `bigint` | 否 | 无 | 组织 ID |
| `parent_org_unit_id` | `bigint` | 是 | 无 | 上级组织 |
| `org_code` | `text` | 否 | 无 | 组织代码 |
| `org_name` | `text` | 否 | 无 | 组织名称 |
| `org_type` | `text` | 否 | 无 | GROUP REGION STORE ECOM |

**外键：**

- `(tenant_id, parent_org_unit_id)` → `core.org_unit(tenant_id, org_unit_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, org_code`

**行内约束：**

- `org_type IN ('GROUP','REGION','STORE','ECOM')`

## core.site

统一地点模型；下单渠道和履约地点分离；地点地址与名称是租户内共享维度，地点经营事实另按实际区域授权

**粒度：**一个实体门店或仓库

**主键：**`tenant_id, site_id`

**权限分类：**`TENANT_DIMENSION`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `site_id` | `bigint` | 否 | 无 | 地点 ID |
| `site_code` | `text` | 否 | 无 | 门店或仓库代码 |
| `site_name` | `text` | 否 | 无 | 地点名称 |
| `site_type` | `text` | 否 | 无 | STORE OUTLET WAREHOUSE |
| `org_unit_id` | `bigint` | 否 | 无 | 经营组织 |
| `geo_id` | `bigint` | 否 | 无 | 所在城市 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `opened_on` | `date` | 否 | 无 | 开业日 包含 |
| `closed_on` | `date` | 是 | 无 | 关闭日 不含 |
| `area_sqm` | `integer` | 否 | 无 | 门店或仓库面积 平方米 |

**外键：**

- `(tenant_id, org_unit_id)` → `core.org_unit(tenant_id, org_unit_id)`
- `(tenant_id, geo_id)` → `core.geo_area(tenant_id, geo_id)`
- `(tenant_id, region_id)` → `core.geo_area(tenant_id, geo_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, site_code`
- `tenant_id, site_id, region_id`

**行内约束：**

- `site_type IN ('STORE','OUTLET','WAREHOUSE')`
- `area_sqm > 0`
- `closed_on IS NULL OR opened_on < closed_on`

## core.channel

营销活动来源单独在 campaign 中定义

**粒度：**一个销售渠道

**主键：**`tenant_id, channel_id`

**权限分类：**`TENANT_DIMENSION`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `channel_id` | `bigint` | 否 | 无 | 渠道 ID |
| `channel_code` | `text` | 否 | 无 | TMALL JD DOUYIN MINIAPP APP POS OUTLET |
| `channel_name` | `text` | 否 | 无 | 渠道名称 |
| `channel_type` | `text` | 否 | 无 | PLATFORM OWNED OFFLINE |
| `has_user_events` | `boolean` | 否 | 无 | 是否提供逐用户事件 |
| `identity_scope` | `text` | 否 | 无 | CHANNEL MEMBER MIXED |

**外键：**

- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, channel_code`

**行内约束：**

- `channel_type IN ('PLATFORM','OWNED','OFFLINE')`
- `identity_scope IN ('CHANNEL','MEMBER','MIXED')`
- `NOT has_user_events OR channel_type = 'OWNED'`

## core.brand

品牌归属唯一租户

**粒度：**一个自有品牌

**主键：**`tenant_id, brand_id`

**权限分类：**`TENANT_DIMENSION`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `brand_id` | `bigint` | 否 | 无 | 品牌 ID |
| `brand_code` | `text` | 否 | 无 | 品牌代码 |
| `brand_name` | `text` | 否 | 无 | 品牌名称 |
| `positioning` | `text` | 否 | 无 | 大众 专业跑步 户外等定位 |

**外键：**

- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, brand_code`

## core.category

每个 SPU 仅属于一个叶子分类

**粒度：**一个商品分类节点

**主键：**`tenant_id, category_id`

**权限分类：**`TENANT_DIMENSION`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `category_id` | `bigint` | 否 | 无 | 分类 ID |
| `parent_category_id` | `bigint` | 是 | 无 | 父分类 |
| `category_code` | `text` | 否 | 无 | 分类代码 |
| `category_name` | `text` | 否 | 无 | 分类名称 |
| `level_no` | `smallint` | 否 | 无 | 一级或二级 |
| `is_leaf` | `boolean` | 否 | 无 | 是否允许挂接 SPU |

**外键：**

- `(tenant_id, parent_category_id)` → `core.category(tenant_id, category_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, category_code`

**行内约束：**

- `level_no IN (1,2)`

## core.sport

多标签统计必须去重；非财务加总层级

**粒度：**一个运动标签

**主键：**`tenant_id, sport_id`

**权限分类：**`TENANT_DIMENSION`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `sport_id` | `bigint` | 否 | 无 | 标签 ID |
| `sport_code` | `text` | 否 | 无 | 运动代码 |
| `sport_name` | `text` | 否 | 无 | 跑步 露营 游泳等 |

**外键：**

- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, sport_code`

## core.spu

品牌与主品类为独立属性

**粒度：**一款标准商品

**主键：**`tenant_id, spu_id`

**权限分类：**`TENANT_DIMENSION`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `spu_id` | `bigint` | 否 | 无 | SPU ID |
| `brand_id` | `bigint` | 否 | 无 | 自有品牌 |
| `category_id` | `bigint` | 否 | 无 | 唯一叶子分类 |
| `spu_code` | `text` | 否 | 无 | 款式代码 |
| `spu_name` | `text` | 否 | 无 | 规范化商品名称 |
| `audience` | `text` | 否 | 无 | UNISEX MEN WOMEN CHILDREN |
| `season_code` | `text` | 否 | 无 | ALL SPRING_SUMMER AUTUMN_WINTER |
| `launch_on` | `date` | 否 | 无 | 上新日期 |
| `discontinue_on` | `date` | 是 | 无 | 停止新销售日期 不含 |
| `attributes` | `jsonb` | 否 | '{}'::jsonb | 长尾非分析主轴属性 |

**外键：**

- `(tenant_id, brand_id)` → `core.brand(tenant_id, brand_id)`
- `(tenant_id, category_id)` → `core.category(tenant_id, category_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, spu_code`

**行内约束：**

- `audience IN ('UNISEX','MEN','WOMEN','CHILDREN')`
- `season_code IN ('ALL','SPRING_SUMMER','AUTUMN_WINTER')`
- `discontinue_on IS NULL OR discontinue_on > launch_on`

## core.spu_sport

只能作为筛选或去重后的标签分析

**粒度：**一个 SPU 与运动标签的关系

**主键：**`tenant_id, spu_id, sport_id`

**权限分类：**`TENANT_DIMENSION`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `spu_id` | `bigint` | 否 | 无 | SPU |
| `sport_id` | `bigint` | 否 | 无 | 运动标签 |

**外键：**

- `(tenant_id, spu_id)` → `core.spu(tenant_id, spu_id)`
- `(tenant_id, sport_id)` → `core.sport(tenant_id, sport_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

## core.sku

并非所有品类均按颜色乘尺码做笛卡尔积

**粒度：**一个可售商品规格

**主键：**`tenant_id, sku_id`

**权限分类：**`TENANT_DIMENSION`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `sku_id` | `bigint` | 否 | 无 | SKU ID |
| `spu_id` | `bigint` | 否 | 无 | 所属 SPU |
| `sku_code` | `text` | 否 | 无 | 企业统一 SKU 编码 |
| `color_code` | `text` | 否 | 无 | 颜色 不适用时 NA |
| `size_system` | `text` | 否 | 无 | CN_SHOE ALPHA CAPACITY WEIGHT MODEL NA |
| `size_value` | `text` | 否 | 无 | 例如 42 XL 30L 5KG |
| `spec_key` | `text` | 否 | 无 | 规范化规格组合键 |
| `weight_grams` | `integer` | 否 | 无 | 单件克重 |
| `launch_on` | `date` | 否 | 无 | 可售开始 |
| `discontinue_on` | `date` | 是 | 无 | 可售结束 不含 |

**外键：**

- `(tenant_id, spu_id)` → `core.spu(tenant_id, spu_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, sku_code`
- `tenant_id, spu_id, spec_key`

**行内约束：**

- `weight_grams > 0`
- `discontinue_on IS NULL OR discontinue_on > launch_on`

## core.channel_listing

保留平台编码与统一 SKU 的多对一映射

**粒度：**某渠道商品编码的一个有效版本

**主键：**`tenant_id, listing_id`

**权限分类：**`TENANT_DIMENSION`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `listing_id` | `bigint` | 否 | 无 | 映射版本 ID |
| `channel_id` | `bigint` | 否 | 无 | 销售渠道 |
| `external_sku_code` | `text` | 否 | 无 | 平台编码 |
| `sku_id` | `bigint` | 否 | 无 | 统一 SKU |
| `valid_from` | `timestamptz` | 否 | 无 | 有效开始 包含 |
| `valid_to` | `timestamptz` | 否 | 无 | 有效结束 不含 |
| `available_at` | `timestamptz` | 否 | 无 | 此计划或版本在源中首次发布可见时刻 |
| `load_batch_id` | `bigint` | 否 | 无 | 来源采集批次 |

**外键：**

- `(tenant_id, channel_id)` → `core.channel(tenant_id, channel_id)`
- `(tenant_id, sku_id)` → `core.sku(tenant_id, sku_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`

**唯一约束：**

- `tenant_id, channel_id, external_sku_code, valid_from`
- `tenant_id, listing_id, sku_id, channel_id`

**行内约束：**

- `valid_from < valid_to`

## core.assortment

停售但有残余库存时仍需保留库存快照

**粒度：**一个地点 SKU 的经营有效区间

**主键：**`tenant_id, assortment_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `assortment_id` | `bigint` | 否 | 无 | 经营区间 ID |
| `site_id` | `bigint` | 否 | 无 | 仓或店 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `sku_id` | `bigint` | 否 | 无 | SKU |
| `valid_from` | `date` | 否 | 无 | 经营起点 包含 |
| `valid_to` | `date` | 否 | 无 | 经营终点 不含 |
| `can_sell` | `boolean` | 否 | 无 | 允许销售出库 |
| `min_stock` | `integer` | 否 | 无 | 补货点 单件 |
| `target_stock` | `integer` | 否 | 无 | 目标库存 单件 |
| `available_at` | `timestamptz` | 否 | 无 | 此计划或版本在源中首次发布可见时刻 |
| `load_batch_id` | `bigint` | 否 | 无 | 来源采集批次 |

**外键：**

- `(tenant_id, site_id, region_id)` → `core.site(tenant_id, site_id, region_id)`
- `(tenant_id, sku_id)` → `core.sku(tenant_id, sku_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`

**唯一约束：**

- `tenant_id, site_id, sku_id, valid_from`

**行内约束：**

- `valid_from < valid_to`
- `min_stock >= 0`
- `target_stock >= min_stock`

## core.price_period

时间区间不得交叠；价格在下单时固化

**粒度：**一个 SKU 渠道价格的有效区间

**主键：**`tenant_id, price_id`

**权限分类：**`TENANT_DIMENSION`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `price_id` | `bigint` | 否 | 无 | 价格版本 |
| `sku_id` | `bigint` | 否 | 无 | SKU |
| `channel_id` | `bigint` | 否 | 无 | 渠道 |
| `valid_from` | `timestamptz` | 否 | 无 | 生效开始 |
| `valid_to` | `timestamptz` | 否 | 无 | 生效结束 不含 |
| `list_price_cent` | `bigint` | 否 | 无 | 单件标价；CNY 不含税整数分 |
| `available_at` | `timestamptz` | 否 | 无 | 此计划或版本在源中首次发布可见时刻 |
| `load_batch_id` | `bigint` | 否 | 无 | 来源采集批次 |

**外键：**

- `(tenant_id, sku_id)` → `core.sku(tenant_id, sku_id)`
- `(tenant_id, channel_id)` → `core.channel(tenant_id, channel_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`

**唯一约束：**

- `tenant_id, sku_id, channel_id, valid_from`
- `tenant_id, price_id, sku_id, channel_id`

**行内约束：**

- `valid_from < valid_to`
- `list_price_cent >= 0`

## core.cost_period

仅决定新采购批次成本；旧库存不追溯改价

**粒度：**一个 SKU 标准采购成本的有效区间

**主键：**`tenant_id, cost_id`

**权限分类：**`TENANT_COST`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `cost_id` | `bigint` | 否 | 无 | 采购成本版本 |
| `sku_id` | `bigint` | 否 | 无 | SKU |
| `valid_from` | `timestamptz` | 否 | 无 | 生效开始 |
| `valid_to` | `timestamptz` | 否 | 无 | 生效结束 不含 |
| `unit_cost_cent` | `bigint` | 否 | 无 | 单位采购成本；CNY 不含税整数分 |
| `available_at` | `timestamptz` | 否 | 无 | 此计划或版本在源中首次发布可见时刻 |
| `load_batch_id` | `bigint` | 否 | 无 | 来源采集批次 |

**外键：**

- `(tenant_id, sku_id)` → `core.sku(tenant_id, sku_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`

**唯一约束：**

- `tenant_id, sku_id, valid_from`

**行内约束：**

- `valid_from < valid_to`
- `unit_cost_cent >= 0`

## core.customer

仅保存合成分群属性；无真实姓名电话地址

**粒度：**一个企业会员

**主键：**`tenant_id, customer_id`

**权限分类：**`CUSTOMER_RESTRICTED`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `customer_id` | `bigint` | 否 | 无 | 企业会员 ID |
| `member_code` | `text` | 否 | 无 | 合成会员编号 |
| `joined_at` | `timestamptz` | 否 | 无 | 入会时刻 |
| `segment_code` | `text` | 否 | 无 | 新客 高频 低频等固定初始分群 |
| `home_geo_id` | `bigint` | 是 | 无 | 登记城市 允许未知 |
| `age_band` | `text` | 是 | 无 | 合成年龄段 允许未知 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, home_geo_id)` → `core.geo_area(tenant_id, geo_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, member_code`

## core.customer_identity

不可变渠道内身份；会员绑定见 customer_identity_link，未识别用户不可合并成同一个客户

**粒度：**一个渠道内的购买身份

**主键：**`tenant_id, identity_id`

**权限分类：**`CUSTOMER_RESTRICTED`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `identity_id` | `bigint` | 否 | 无 | 渠道身份 ID |
| `channel_id` | `bigint` | 否 | 无 | 来源渠道 |
| `external_user_token` | `text` | 否 | 无 | 不可逆合成令牌 |
| `first_seen_at` | `timestamptz` | 否 | 无 | 首次可见时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, channel_id)` → `core.channel(tenant_id, channel_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, channel_id, external_user_token`
- `tenant_id, identity_id, channel_id`

**行内约束：**

- `available_at >= first_seen_at`

## core.calendar

共享公开日期维；假日标签按课程自定义日历配置

**粒度：**一个本地自然日

**主键：**`calendar_date`

**权限分类：**`PUBLIC_CALENDAR`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `calendar_date` | `date` | 否 | 无 | Asia/Shanghai 自然日 |
| `year_no` | `smallint` | 否 | 无 | 年 |
| `month_no` | `smallint` | 否 | 无 | 月 |
| `day_of_week` | `smallint` | 否 | 无 | ISO 周一为 1 |
| `iso_year` | `smallint` | 否 | 无 | ISO 周所属年 |
| `iso_week` | `smallint` | 否 | 无 | ISO 周 |
| `is_weekend` | `boolean` | 否 | 无 | 是否周末 |
| `festival_code` | `text` | 否 | 无 | 课程事件标签 无则 NONE |

**行内约束：**

- `month_no BETWEEN 1 AND 12`
- `day_of_week BETWEEN 1 AND 7`
- `iso_week BETWEEN 1 AND 53`

## core.campaign

广告触达与订单下单渠道分离

**粒度：**一个营销活动

**主键：**`tenant_id, campaign_id`

**权限分类：**`TENANT_DIMENSION`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `campaign_id` | `bigint` | 否 | 无 | 活动 ID |
| `campaign_code` | `text` | 否 | 无 | 活动代码 |
| `campaign_name` | `text` | 否 | 无 | 活动名称 |
| `acquisition_source` | `text` | 否 | 无 | 搜索 信息流 直播 私域等 |
| `target_channel_id` | `bigint` | 是 | 无 | 主要承接渠道 |
| `starts_at` | `timestamptz` | 否 | 无 | 活动起点 |
| `ends_at` | `timestamptz` | 否 | 无 | 活动终点 不含 |
| `objective` | `text` | 否 | 无 | ACQUISITION RETENTION CLEARANCE |
| `available_at` | `timestamptz` | 否 | 无 | 此计划或版本在源中首次发布可见时刻 |
| `load_batch_id` | `bigint` | 否 | 无 | 来源采集批次 |

**外键：**

- `(tenant_id, target_channel_id)` → `core.channel(tenant_id, channel_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`

**唯一约束：**

- `tenant_id, campaign_code`

**行内约束：**

- `starts_at < ends_at`
- `objective IN ('ACQUISITION','RETENTION','CLEARANCE')`

## core.promotion

v1 只支持百分比优惠和满额减免；不含平台补贴和赠品

**粒度：**一个价格优惠规则

**主键：**`tenant_id, promotion_id`

**权限分类：**`TENANT_DIMENSION`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `promotion_id` | `bigint` | 否 | 无 | 优惠 ID |
| `promotion_code` | `text` | 否 | 无 | 优惠代码 |
| `channel_id` | `bigint` | 否 | 无 | 适用渠道 |
| `campaign_id` | `bigint` | 是 | 无 | 所属营销活动 允许无 |
| `promotion_type` | `text` | 否 | 无 | PERCENT THRESHOLD |
| `discount_bps` | `integer` | 否 | 无 | 折扣比例基点 0 至 10000 |
| `threshold_cent` | `bigint` | 否 | 无 | 门槛金额；CNY 不含税整数分 |
| `discount_cent` | `bigint` | 否 | 无 | 固定减免额；CNY 不含税整数分 |
| `starts_at` | `timestamptz` | 否 | 无 | 生效开始 |
| `ends_at` | `timestamptz` | 否 | 无 | 生效结束 不含 |
| `priority_no` | `integer` | 否 | 无 | 叠加排序 |
| `available_at` | `timestamptz` | 否 | 无 | 此计划或版本在源中首次发布可见时刻 |
| `load_batch_id` | `bigint` | 否 | 无 | 来源采集批次 |

**外键：**

- `(tenant_id, channel_id)` → `core.channel(tenant_id, channel_id)`
- `(tenant_id, campaign_id)` → `core.campaign(tenant_id, campaign_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`

**唯一约束：**

- `tenant_id, promotion_code`

**行内约束：**

- `promotion_type IN ('PERCENT','THRESHOLD')`
- `discount_bps BETWEEN 0 AND 10000`
- `threshold_cent >= 0`
- `discount_cent >= 0`
- `starts_at < ends_at`

## core.order_header

精确百万配额包含支付失败和取消；无 mutable 当前状态

**粒度：**一个成功创建的订单头

**主键：**`tenant_id, order_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `order_id` | `bigint` | 否 | 无 | 订单 ID |
| `order_no` | `text` | 否 | 无 | 企业业务订单号 |
| `contoso_proposal_id` | `text` | 否 | 无 | 候选订单追踪 ID |
| `channel_id` | `bigint` | 否 | 无 | 下单渠道 |
| `org_unit_id` | `bigint` | 否 | 无 | 销售归属组织 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `demand_geo_id` | `bigint` | 否 | 无 | 需求城市 |
| `selling_site_id` | `bigint` | 是 | 无 | 线下下单门店 线上为 NULL |
| `identity_id` | `bigint` | 否 | 无 | 渠道购买身份 |
| `customer_id` | `bigint` | 是 | 无 | 下单时已知会员；不事后回填 |
| `ordered_at` | `timestamptz` | 否 | 无 | 订单创建时刻 |
| `order_date` | `date` | 否 | 无 | ordered_at 转 Asia/Shanghai 的自然日 |
| `currency` | `char(3)` | 否 | 无 | 固定 CNY |
| `gross_cent` | `bigint` | 否 | 无 | 商品原价总额；CNY 不含税整数分 |
| `discount_cent` | `bigint` | 否 | 无 | 商品优惠总额；CNY 不含税整数分 |
| `payable_cent` | `bigint` | 否 | 无 | 应付商品额；v1 无向客户收取的运费；CNY 不含税整数分 |
| `payment_deadline` | `timestamptz` | 否 | 无 | 支付截止时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, channel_id)` → `core.channel(tenant_id, channel_id)`
- `(tenant_id, org_unit_id)` → `core.org_unit(tenant_id, org_unit_id)`
- `(tenant_id, region_id)` → `core.geo_area(tenant_id, geo_id)`
- `(tenant_id, demand_geo_id)` → `core.geo_area(tenant_id, geo_id)`
- `(tenant_id, selling_site_id)` → `core.site(tenant_id, site_id)`
- `(tenant_id, customer_id)` → `core.customer(tenant_id, customer_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`
- `(tenant_id, identity_id, channel_id)` → `core.customer_identity(tenant_id, identity_id, channel_id)`

**唯一约束：**

- `tenant_id, order_no`
- `tenant_id, contoso_proposal_id`
- `tenant_id, order_id, region_id`
- `tenant_id, order_id, region_id, channel_id`

**行内约束：**

- `currency = 'CNY'`
- `gross_cent >= 0`
- `discount_cent BETWEEN 0 AND gross_cent`
- `payable_cent = gross_cent - discount_cent`
- `payment_deadline >= ordered_at`
- `order_date = (ordered_at AT TIME ZONE 'Asia/Shanghai')::date`
- `available_at >= ordered_at`
- `payable_cent > 0`

**查询索引：**

- `tenant_id, order_date, channel_id`
- `tenant_id, customer_id, ordered_at`

## core.order_line

重复 SKU 合并成一行；商品价与优惠在下单时固化

**粒度：**一张订单的一个 SKU 行

**主键：**`tenant_id, order_line_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `order_line_id` | `bigint` | 否 | 无 | 订单行 ID |
| `order_id` | `bigint` | 否 | 无 | 订单头 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `channel_id` | `bigint` | 否 | 无 | 继承订单销售渠道；锁定有效映射和价格 |
| `line_no` | `integer` | 否 | 无 | 订单内行号 |
| `sku_id` | `bigint` | 否 | 无 | SKU |
| `listing_id` | `bigint` | 是 | 无 | 渠道商品版本 自建线下可无 |
| `price_id` | `bigint` | 否 | 无 | 采用价格版本 |
| `quantity` | `integer` | 否 | 无 | 订购单件数 |
| `list_unit_cent` | `bigint` | 否 | 无 | 原价单价；CNY 不含税整数分 |
| `gross_cent` | `bigint` | 否 | 无 | 行原价金额；CNY 不含税整数分 |
| `discount_cent` | `bigint` | 否 | 无 | 行优惠；CNY 不含税整数分 |
| `net_cent` | `bigint` | 否 | 无 | 行应付额；CNY 不含税整数分 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, sku_id)` → `core.sku(tenant_id, sku_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`
- `(tenant_id, order_id, region_id, channel_id)` → `core.order_header(tenant_id, order_id, region_id, channel_id)`
- `(tenant_id, listing_id, sku_id, channel_id)` → `core.channel_listing(tenant_id, listing_id, sku_id, channel_id)`
- `(tenant_id, price_id, sku_id, channel_id)` → `core.price_period(tenant_id, price_id, sku_id, channel_id)`

**唯一约束：**

- `tenant_id, order_id, line_no`
- `tenant_id, order_id, sku_id`
- `tenant_id, order_line_id, order_id, region_id, sku_id`

**行内约束：**

- `line_no > 0`
- `quantity > 0`
- `list_unit_cent >= 0`
- `gross_cent = list_unit_cent * quantity`
- `discount_cent BETWEEN 0 AND gross_cent`
- `net_cent = gross_cent - discount_cent`

**查询索引：**

- `tenant_id, sku_id, order_id`

## core.order_unit

用于部分履约 退货 成本与整分分摊；不代表实物序列号

**粒度：**订单行中的一个逻辑计量单件

**主键：**`tenant_id, order_unit_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `order_unit_id` | `bigint` | 否 | 无 | 逻辑单件 ID |
| `order_line_id` | `bigint` | 否 | 无 | 订单行 |
| `order_id` | `bigint` | 否 | 无 | 订单 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `sku_id` | `bigint` | 否 | 无 | SKU |
| `unit_no` | `integer` | 否 | 无 | 行内单件序号 |
| `gross_cent` | `bigint` | 否 | 无 | 该单件原价；CNY 不含税整数分 |
| `discount_cent` | `bigint` | 否 | 无 | 分配到该单件的优惠；CNY 不含税整数分 |
| `net_cent` | `bigint` | 否 | 无 | 该单件应付额；CNY 不含税整数分 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, order_line_id, order_id, region_id, sku_id)` → `core.order_line(tenant_id, order_line_id, order_id, region_id, sku_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, order_line_id, unit_no`
- `tenant_id, order_unit_id, order_id, region_id, sku_id`
- `tenant_id, order_unit_id, region_id`
- `tenant_id, order_unit_id, order_id, region_id`

**行内约束：**

- `unit_no > 0`
- `gross_cent >= 0`
- `discount_cent BETWEEN 0 AND gross_cent`
- `net_cent = gross_cent - discount_cent`

## core.order_status_event

只能按 event_at 与 available_at 双条件重建状态

**粒度：**一个订单的一次状态变化

**主键：**`tenant_id, status_event_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `status_event_id` | `bigint` | 否 | 无 | 状态事件 |
| `order_id` | `bigint` | 否 | 无 | 订单 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `event_seq` | `integer` | 否 | 无 | 同一订单事件序号 |
| `status` | `text` | 否 | 无 | CREATED RESERVED PAID PART_SHIPPED SHIPPED COMPLETED CANCELLED |
| `reason_code` | `text` | 否 | 无 | NONE STOCK_LOCK_FAILED PAY_TIMEOUT CUSTOMER_CANCEL DELIVERY_FAILED |
| `event_at` | `timestamptz` | 否 | 无 | 业务状态变化时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, order_id, region_id)` → `core.order_header(tenant_id, order_id, region_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, order_id, event_seq`

**行内约束：**

- `status IN ('CREATED','RESERVED','PAID','PART_SHIPPED','SHIPPED','COMPLETED','CANCELLED')`
- `event_seq > 0`
- `available_at >= event_at`

**查询索引：**

- `tenant_id, order_id, event_at`

## core.discount_allocation

按优先级逐次分摊；相同单件可命中多个优惠

**粒度：**一个优惠对一个订单单件的分摊

**主键：**`tenant_id, allocation_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `allocation_id` | `bigint` | 否 | 无 | 优惠分摊记录 |
| `order_unit_id` | `bigint` | 否 | 无 | 单件 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `promotion_id` | `bigint` | 否 | 无 | 优惠规则 |
| `apply_seq` | `integer` | 否 | 无 | 应用次序 |
| `discount_cent` | `bigint` | 否 | 无 | 本次分摊优惠；CNY 不含税整数分 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, order_unit_id, region_id)` → `core.order_unit(tenant_id, order_unit_id, region_id)`
- `(tenant_id, promotion_id)` → `core.promotion(tenant_id, promotion_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, order_unit_id, promotion_id, apply_seq`

**行内约束：**

- `apply_seq > 0`
- `discount_cent >= 0`

## core.payment

成功支付累计满足应付才产生 PAID；允许一次订单多笔支付

**粒度：**一次支付尝试

**主键：**`tenant_id, payment_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `payment_id` | `bigint` | 否 | 无 | 支付尝试 ID |
| `order_id` | `bigint` | 否 | 无 | 订单 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `payment_no` | `text` | 否 | 无 | 来源支付单号 |
| `method` | `text` | 否 | 无 | ALIPAY WECHAT BANK POS |
| `status` | `text` | 否 | 无 | SUCCEEDED FAILED |
| `amount_cent` | `bigint` | 否 | 无 | 本次尝试金额；CNY 不含税整数分 |
| `attempted_at` | `timestamptz` | 否 | 无 | 支付尝试时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, order_id, region_id)` → `core.order_header(tenant_id, order_id, region_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, payment_no`
- `tenant_id, payment_id, order_id, region_id`

**行内约束：**

- `status IN ('SUCCEEDED','FAILED')`
- `amount_cent > 0`
- `available_at >= attempted_at`

**查询索引：**

- `tenant_id, order_id`

## core.refund

与销售冲减和实物入库分离；一笔退款引用一笔成功支付

**粒度：**一次现金退款尝试

**主键：**`tenant_id, refund_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `refund_id` | `bigint` | 否 | 无 | 退款 ID |
| `payment_id` | `bigint` | 否 | 无 | 原支付 |
| `order_id` | `bigint` | 否 | 无 | 订单 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `refund_no` | `text` | 否 | 无 | 退款单号 |
| `status` | `text` | 否 | 无 | SUCCEEDED FAILED |
| `refund_type` | `text` | 否 | 无 | CANCEL RETURN |
| `amount_cent` | `bigint` | 否 | 无 | 退款尝试金额；CNY 不含税整数分 |
| `attempted_at` | `timestamptz` | 否 | 无 | 现金退款尝试时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, payment_id, order_id, region_id)` → `core.payment(tenant_id, payment_id, order_id, region_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, refund_no`
- `tenant_id, refund_id, order_id, region_id`

**行内约束：**

- `status IN ('SUCCEEDED','FAILED')`
- `refund_type IN ('CANCEL','RETURN')`
- `amount_cent > 0`
- `available_at >= attempted_at`

## core.refund_allocation

可跨多笔原支付分拆退款；单件成功退款累计不得超过 net_cent

**粒度：**一次退款分配到一个订单单件

**主键：**`tenant_id, refund_allocation_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `refund_allocation_id` | `bigint` | 否 | 无 | 分摊 ID |
| `refund_id` | `bigint` | 否 | 无 | 退款 |
| `order_id` | `bigint` | 否 | 无 | 订单 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `order_unit_id` | `bigint` | 否 | 无 | 单件 |
| `amount_cent` | `bigint` | 否 | 无 | 本次分摊退款；CNY 不含税整数分 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, refund_id, order_id, region_id)` → `core.refund(tenant_id, refund_id, order_id, region_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`
- `(tenant_id, order_unit_id, order_id, region_id)` → `core.order_unit(tenant_id, order_unit_id, order_id, region_id)`

**唯一约束：**

- `tenant_id, refund_id, order_unit_id`

**行内约束：**

- `amount_cent > 0`

## core.inventory_lot

采购 转入 可售退货可新建批次；FIFO 出库并固化原成本

**粒度：**一批相同 SKU 成本的某地点库存

**主键：**`tenant_id, lot_id`

**权限分类：**`REGION_COST`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `lot_id` | `bigint` | 否 | 无 | 库存批次 |
| `site_id` | `bigint` | 否 | 无 | 地点 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `sku_id` | `bigint` | 否 | 无 | SKU |
| `parent_lot_id` | `bigint` | 是 | 无 | 转移或退货来源批次 |
| `cost_id` | `bigint` | 是 | 无 | 新采购成本版本 退货转入可无 |
| `received_at` | `timestamptz` | 否 | 无 | 批次到达时刻 |
| `unit_cost_cent` | `bigint` | 否 | 无 | 本批单件成本；CNY 不含税整数分 |
| `origin_type` | `text` | 否 | 无 | OPENING PURCHASE TRANSFER RETURN |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, site_id, region_id)` → `core.site(tenant_id, site_id, region_id)`
- `(tenant_id, sku_id)` → `core.sku(tenant_id, sku_id)`
- `(tenant_id, cost_id)` → `core.cost_period(tenant_id, cost_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`
- `(tenant_id, parent_lot_id, sku_id)` → `core.inventory_lot(tenant_id, lot_id, sku_id)`

**唯一约束：**

- `tenant_id, lot_id, site_id, sku_id`
- `tenant_id, lot_id, sku_id`

**行内约束：**

- `unit_cost_cent >= 0`
- `origin_type IN ('OPENING','PURCHASE','TRANSFER','RETURN')`

## core.shipment

一次订单允许多个包裹；v1 每逻辑单件最多一次出库

**粒度：**一张订单从一个地点发出的包裹或 POS 交付单

**主键：**`tenant_id, shipment_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `shipment_id` | `bigint` | 否 | 无 | 履约单 |
| `order_id` | `bigint` | 否 | 无 | 订单 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `from_site_id` | `bigint` | 否 | 无 | 履约仓或店 |
| `shipment_no` | `text` | 否 | 无 | 履约单号 |
| `fulfillment_type` | `text` | 否 | 无 | DELIVERY PICKUP POS |
| `created_at` | `timestamptz` | 否 | 无 | 创建时刻 |
| `promised_at` | `timestamptz` | 否 | 无 | 承诺交付时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, order_id, region_id)` → `core.order_header(tenant_id, order_id, region_id)`
- `(tenant_id, from_site_id)` → `core.site(tenant_id, site_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, shipment_no`
- `tenant_id, shipment_id, order_id, region_id, from_site_id`

**行内约束：**

- `fulfillment_type IN ('DELIVERY','PICKUP','POS')`
- `promised_at >= created_at`
- `available_at >= created_at`

## core.shipment_item

固化从哪个库存批次出库；成本由成本台账确认

**粒度：**一个包裹中的一个订单逻辑单件

**主键：**`tenant_id, shipment_item_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `shipment_item_id` | `bigint` | 否 | 无 | 履约单件 ID |
| `shipment_id` | `bigint` | 否 | 无 | 履约单 |
| `order_unit_id` | `bigint` | 否 | 无 | 订单单件 |
| `order_id` | `bigint` | 否 | 无 | 订单 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `sku_id` | `bigint` | 否 | 无 | SKU |
| `from_site_id` | `bigint` | 否 | 无 | 出库地点 |
| `lot_id` | `bigint` | 否 | 无 | 出库批次 |
| `shipped_at` | `timestamptz` | 否 | 无 | 出库时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, shipment_id, order_id, region_id, from_site_id)` → `core.shipment(tenant_id, shipment_id, order_id, region_id, from_site_id)`
- `(tenant_id, order_unit_id, order_id, region_id, sku_id)` → `core.order_unit(tenant_id, order_unit_id, order_id, region_id, sku_id)`
- `(tenant_id, lot_id, from_site_id, sku_id)` → `core.inventory_lot(tenant_id, lot_id, site_id, sku_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, order_unit_id`
- `tenant_id, shipment_item_id, order_unit_id, region_id`

**行内约束：**

- `available_at >= shipped_at`

## core.shipment_event

交付事件是收入确认依据；物流失败未交付不得认收入

**粒度：**一张履约单的一次物流状态事件

**主键：**`tenant_id, shipment_event_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `shipment_event_id` | `bigint` | 否 | 无 | 物流事件 |
| `shipment_id` | `bigint` | 否 | 无 | 履约单 |
| `order_id` | `bigint` | 否 | 无 | 订单 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `from_site_id` | `bigint` | 否 | 无 | 出库地点 |
| `event_seq` | `integer` | 否 | 无 | 事件序号 |
| `event_type` | `text` | 否 | 无 | SHIPPED DELIVERED DELIVERY_FAILED RETURNED_TO_ORIGIN |
| `event_at` | `timestamptz` | 否 | 无 | 物流事件时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, shipment_id, order_id, region_id, from_site_id)` → `core.shipment(tenant_id, shipment_id, order_id, region_id, from_site_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, shipment_id, event_seq`

**行内约束：**

- `event_type IN ('SHIPPED','DELIVERED','DELIVERY_FAILED','RETURNED_TO_ORIGIN')`
- `event_seq > 0`
- `available_at >= event_at`

## core.return_header

可从跨区门店退货；销售归属保持原订单区域

**粒度：**一张售后申请

**主键：**`tenant_id, return_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `return_id` | `bigint` | 否 | 无 | 售后申请 ID |
| `order_id` | `bigint` | 否 | 无 | 原订单 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `return_no` | `text` | 否 | 无 | 售后单号 |
| `request_channel_id` | `bigint` | 否 | 无 | 申请渠道 |
| `receiving_site_id` | `bigint` | 是 | 无 | 预计接收地点 |
| `requested_at` | `timestamptz` | 否 | 无 | 申请时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, order_id, region_id)` → `core.order_header(tenant_id, order_id, region_id)`
- `(tenant_id, request_channel_id)` → `core.channel(tenant_id, channel_id)`
- `(tenant_id, receiving_site_id)` → `core.site(tenant_id, site_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, return_no`
- `tenant_id, return_id, order_id, region_id`

**行内约束：**

- `available_at >= requested_at`

## core.return_item

v1 一个逻辑单件最多一条售后申请；换码拆退货与新订单且可不模拟

**粒度：**一次售后对应一个已出库单件

**主键：**`tenant_id, return_item_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `return_item_id` | `bigint` | 否 | 无 | 售后单件 ID |
| `return_id` | `bigint` | 否 | 无 | 售后申请 |
| `order_id` | `bigint` | 否 | 无 | 原订单 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `order_unit_id` | `bigint` | 否 | 无 | 原单件 |
| `shipment_item_id` | `bigint` | 否 | 无 | 原履约单件 |
| `reason_code` | `text` | 否 | 无 | SIZE QUALITY NOT_NEEDED DESCRIPTION OTHER |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, return_id, order_id, region_id)` → `core.return_header(tenant_id, return_id, order_id, region_id)`
- `(tenant_id, shipment_item_id, order_unit_id, region_id)` → `core.shipment_item(tenant_id, shipment_item_id, order_unit_id, region_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`
- `(tenant_id, order_unit_id, order_id, region_id)` → `core.order_unit(tenant_id, order_unit_id, order_id, region_id)`

**唯一约束：**

- `tenant_id, order_unit_id`
- `tenant_id, return_item_id, order_unit_id, region_id`

**行内约束：**

- `reason_code IN ('SIZE','QUALITY','NOT_NEEDED','DESCRIPTION','OTHER')`

## core.return_event

ACCEPTED 冲收入 RESTOCKED 冲原成本；现金退款另记

**粒度：**一个售后单件的一次状态事件

**主键：**`tenant_id, return_event_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `return_event_id` | `bigint` | 否 | 无 | 售后事件 |
| `return_item_id` | `bigint` | 否 | 无 | 售后单件 |
| `order_unit_id` | `bigint` | 否 | 无 | 订单单件 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `event_seq` | `integer` | 否 | 无 | 事件序号 |
| `event_type` | `text` | 否 | 无 | REQUESTED RECEIVED ACCEPTED REJECTED RESTOCKED DAMAGED SCRAPPED |
| `site_id` | `bigint` | 是 | 无 | 事件发生地点 无则 NULL |
| `restocked_lot_id` | `bigint` | 是 | 无 | 重新入库批次 非回库事件为 NULL |
| `event_at` | `timestamptz` | 否 | 无 | 业务事件时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, return_item_id, order_unit_id, region_id)` → `core.return_item(tenant_id, return_item_id, order_unit_id, region_id)`
- `(tenant_id, site_id)` → `core.site(tenant_id, site_id)`
- `(tenant_id, restocked_lot_id)` → `core.inventory_lot(tenant_id, lot_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, return_item_id, event_seq`

**行内约束：**

- `event_type IN ('REQUESTED','RECEIVED','ACCEPTED','REJECTED','RESTOCKED','DAMAGED','SCRAPPED')`
- `event_seq > 0`
- `available_at >= event_at`
- `(event_type = 'RESTOCKED') = (restocked_lot_id IS NOT NULL)`
- `event_type NOT IN ('RECEIVED','RESTOCKED','DAMAGED','SCRAPPED') OR site_id IS NOT NULL`

## core.inventory_document

采购与补货有可观测的计划和实际时间，不只隐藏场景原因

**粒度：**一笔采购 调拨 开账或处置业务单据

**主键：**`tenant_id, inventory_doc_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `inventory_doc_id` | `bigint` | 否 | 无 | 库存业务单据 |
| `document_no` | `text` | 否 | 无 | 业务单号 |
| `doc_type` | `text` | 否 | 无 | OPENING PURCHASE TRANSFER DISPOSAL |
| `from_site_id` | `bigint` | 是 | 无 | 来源地点 采购开账可无 |
| `to_site_id` | `bigint` | 否 | 无 | 归属或目的地点 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `created_at` | `timestamptz` | 否 | 无 | 单据创建时刻 |
| `planned_at` | `timestamptz` | 否 | 无 | 计划到达或处理时刻 |
| `reason_code` | `text` | 否 | 无 | NORMAL REPLENISHMENT DELAY CLEARANCE |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, from_site_id)` → `core.site(tenant_id, site_id)`
- `(tenant_id, to_site_id, region_id)` → `core.site(tenant_id, site_id, region_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, document_no`
- `tenant_id, inventory_doc_id, region_id`

**行内约束：**

- `doc_type IN ('OPENING','PURCHASE','TRANSFER','DISPOSAL')`
- `planned_at >= created_at`
- `available_at >= created_at`

## core.inventory_document_line

实际完成由库存流水决定，避免未来 actual_at 覆盖历史状态

**粒度：**库存业务单据中的一个 SKU

**主键：**`tenant_id, inventory_doc_line_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `inventory_doc_line_id` | `bigint` | 否 | 无 | 单据行 |
| `inventory_doc_id` | `bigint` | 否 | 无 | 单据 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `sku_id` | `bigint` | 否 | 无 | SKU |
| `quantity` | `integer` | 否 | 无 | 计划数量 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, sku_id)` → `core.sku(tenant_id, sku_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`
- `(tenant_id, inventory_doc_id, region_id)` → `core.inventory_document(tenant_id, inventory_doc_id, region_id)`

**唯一约束：**

- `tenant_id, inventory_doc_id, sku_id`

**行内约束：**

- `quantity > 0`

## core.inventory_movement

可售 待检 损坏 预留 在途分开；同一 business_txn_id 原子提交，流水是库存真值

**粒度：**一个地点 SKU 批次的一次库存桶变化

**主键：**`tenant_id, movement_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `movement_id` | `bigint` | 否 | 无 | 库存事件 ID |
| `site_id` | `bigint` | 否 | 无 | 地点 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `sku_id` | `bigint` | 否 | 无 | SKU |
| `lot_id` | `bigint` | 是 | 无 | 物理批次 预留事件可无 |
| `inventory_doc_line_id` | `bigint` | 是 | 无 | 补货调拨等单据行 |
| `order_unit_id` | `bigint` | 是 | 无 | 订单单件引用 |
| `return_item_id` | `bigint` | 是 | 无 | 售后单件引用 |
| `movement_type` | `text` | 否 | 无 | OPENING RECEIPT RESERVE RELEASE SHIP RETURN_RECEIVE RESTOCK SCRAP TRANSFER_OUT TRANSIT_IN TRANSIT_OUT TRANSFER_IN DAMAGE RTO_RECEIPT |
| `sellable_delta` | `integer` | 否 | 无 | 可售物理库存变动 |
| `quarantine_delta` | `integer` | 否 | 无 | 隔离实物变动；包含待检与已接受退货后待恢复可售 |
| `reserved_delta` | `integer` | 否 | 无 | 预留量变动 |
| `in_transit_delta` | `integer` | 否 | 无 | 归目的地点的在途量变动 |
| `event_at` | `timestamptz` | 否 | 无 | 库存变动时刻 |
| `event_seq` | `bigint` | 否 | 无 | 租户内同时间排序号 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |
| `damaged_delta` | `integer` | 否 | 无 | 已判损坏尚未移出实物的数量变化 |
| `business_txn_id` | `bigint` | 否 | 无 | 原子业务提交 ID |
| `source_kind` | `text` | 否 | 无 | UNIT_EVENT SHIPMENT_EVENT RETURN_EVENT DOCUMENT_LINE |
| `source_event_id` | `bigint` | 否 | 无 | 对应源业务事件或单据行 ID |
| `source_leg_no` | `integer` | 否 | 无 | 同一来源拆出的稳定库存腿号 |

**外键：**

- `(tenant_id, site_id, region_id)` → `core.site(tenant_id, site_id, region_id)`
- `(tenant_id, sku_id)` → `core.sku(tenant_id, sku_id)`
- `(tenant_id, lot_id, site_id, sku_id)` → `core.inventory_lot(tenant_id, lot_id, site_id, sku_id)`
- `(tenant_id, inventory_doc_line_id)` → `core.inventory_document_line(tenant_id, inventory_doc_line_id)`
- `(tenant_id, order_unit_id)` → `core.order_unit(tenant_id, order_unit_id)`
- `(tenant_id, return_item_id)` → `core.return_item(tenant_id, return_item_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, source_kind, source_event_id, source_leg_no`
- `tenant_id, event_seq`

**行内约束：**

- `movement_type IN ('OPENING','RECEIPT','RESERVE','RELEASE','SHIP','RETURN_RECEIVE','RESTOCK','DAMAGE','SCRAP','RTO_RECEIPT','TRANSFER_OUT','TRANSIT_IN','TRANSIT_OUT','TRANSFER_IN')`
- `sellable_delta <> 0 OR quarantine_delta <> 0 OR reserved_delta <> 0 OR in_transit_delta <> 0 OR damaged_delta <> 0`
- `available_at >= event_at`
- `source_kind IN ('UNIT_EVENT','SHIPMENT_EVENT','RETURN_EVENT','DOCUMENT_LINE')`
- `source_leg_no > 0`
- `event_seq > 0`

**查询索引：**

- `tenant_id, site_id, sku_id, event_at, event_seq`

## core.inventory_snapshot

零库存仍保留；快照由当时已可见流水生成并带 cutoff；不跨日加总

**粒度：**一个本地日末 地点 SKU 的有效库存快照

**主键：**`tenant_id, snapshot_date, site_id, sku_id, as_of`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `snapshot_date` | `date` | 否 | 无 | 当地自然日 |
| `site_id` | `bigint` | 否 | 无 | 地点 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `sku_id` | `bigint` | 否 | 无 | SKU |
| `sellable_qty` | `integer` | 否 | 无 | 可售物理数 |
| `quarantine_qty` | `integer` | 否 | 无 | 隔离实物数；包含待检与已接受退货后待恢复可售 |
| `damaged_qty` | `integer` | 否 | 无 | 已判损坏尚未物理处置数量，不再计可售库存资产 |
| `reserved_qty` | `integer` | 否 | 无 | 预留数 |
| `in_transit_qty` | `integer` | 否 | 无 | 在途数 |
| `available_qty` | `integer` | 否 | 无 | 可售减预留 |
| `as_of` | `timestamptz` | 否 | 无 | 快照计算的信息截止时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, site_id, region_id)` → `core.site(tenant_id, site_id, region_id)`
- `(tenant_id, sku_id)` → `core.sku(tenant_id, sku_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**行内约束：**

- `sellable_qty >= 0`
- `quarantine_qty >= 0`
- `reserved_qty BETWEEN 0 AND sellable_qty`
- `in_transit_qty >= 0`
- `available_qty = sellable_qty - reserved_qty`
- `available_at >= as_of`
- `damaged_qty >= 0`

**查询索引：**

- `tenant_id, site_id, snapshot_date`

## core.revenue_entry

采用交付确认和退货接受口径；不替代法定总账

**粒度：**一次单件收入确认或冲减

**主键：**`tenant_id, revenue_entry_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `revenue_entry_id` | `bigint` | 否 | 无 | 收入分录 |
| `order_unit_id` | `bigint` | 否 | 无 | 订单单件 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `entry_type` | `text` | 否 | 无 | DELIVERY RETURN_ACCEPTED |
| `shipment_event_id` | `bigint` | 是 | 无 | 交付事件引用 |
| `return_event_id` | `bigint` | 是 | 无 | 退货接受事件引用 |
| `quantity_delta` | `smallint` | 否 | 无 | 销售 +1 退货 -1 |
| `amount_cent` | `bigint` | 否 | 无 | 有符号收入变动；CNY 不含税整数分 |
| `recognized_at` | `timestamptz` | 否 | 无 | 收入确认时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, order_unit_id, region_id)` → `core.order_unit(tenant_id, order_unit_id, region_id)`
- `(tenant_id, shipment_event_id)` → `core.shipment_event(tenant_id, shipment_event_id)`
- `(tenant_id, return_event_id)` → `core.return_event(tenant_id, return_event_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, order_unit_id, entry_type`

**行内约束：**

- `(entry_type = 'DELIVERY' AND quantity_delta = 1 AND amount_cent >= 0 AND shipment_event_id IS NOT NULL AND return_event_id IS NULL) OR (entry_type = 'RETURN_ACCEPTED' AND quantity_delta = -1 AND amount_cent <= 0 AND return_event_id IS NOT NULL AND shipment_event_id IS NULL)`
- `available_at >= recognized_at`

**查询索引：**

- `tenant_id, recognized_at`

## core.cost_entry

交付计原批次成本；可售回库冲回原成本；损坏不冲回不二次扣损

**粒度：**一次单件销售成本确认或冲回

**主键：**`tenant_id, cost_entry_id`

**权限分类：**`REGION_COST`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `cost_entry_id` | `bigint` | 否 | 无 | 成本分录 |
| `order_unit_id` | `bigint` | 否 | 无 | 订单单件 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `entry_type` | `text` | 否 | 无 | DELIVERY RESTOCK |
| `lot_id` | `bigint` | 否 | 无 | 原出库批次 |
| `shipment_event_id` | `bigint` | 是 | 无 | 交付事件 |
| `return_event_id` | `bigint` | 是 | 无 | 可售回库事件 |
| `amount_cent` | `bigint` | 否 | 无 | 有符号销售成本变动；增加成本为正；CNY 不含税整数分 |
| `recognized_at` | `timestamptz` | 否 | 无 | 成本确认或冲回时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, order_unit_id, region_id)` → `core.order_unit(tenant_id, order_unit_id, region_id)`
- `(tenant_id, lot_id)` → `core.inventory_lot(tenant_id, lot_id)`
- `(tenant_id, shipment_event_id)` → `core.shipment_event(tenant_id, shipment_event_id)`
- `(tenant_id, return_event_id)` → `core.return_event(tenant_id, return_event_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, order_unit_id, entry_type`

**行内约束：**

- `(entry_type = 'DELIVERY' AND amount_cent >= 0 AND shipment_event_id IS NOT NULL AND return_event_id IS NULL) OR (entry_type = 'RESTOCK' AND amount_cent <= 0 AND return_event_id IS NOT NULL AND shipment_event_id IS NULL)`
- `available_at >= recognized_at`

## core.order_fee

不含固定租金人力；费用冲回用负数；投放费在 campaign_daily 独立计

**粒度：**订单对应的一笔经营变动费用

**主键：**`tenant_id, fee_id`

**权限分类：**`REGION_COST`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `fee_id` | `bigint` | 否 | 无 | 费用 ID |
| `order_id` | `bigint` | 否 | 无 | 订单 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `order_unit_id` | `bigint` | 是 | 无 | 可以分配到单件；订单级费用为 NULL |
| `fee_type` | `text` | 否 | 无 | COMMISSION OUTBOUND_LOGISTICS RETURN_LOGISTICS PAYMENT_SERVICE |
| `amount_cent` | `bigint` | 否 | 无 | 有符号费用发生额；CNY 不含税整数分 |
| `recognized_at` | `timestamptz` | 否 | 无 | 费用确认时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |
| `source_system` | `text` | 否 | 无 | 费用来源系统 |
| `source_fee_no` | `text` | 否 | 无 | 来源费用唯一号；回调重试不得变号 |
| `reversal_of_fee_id` | `bigint` | 是 | 无 | 负费用冲回的原费用 ID，正费用为空 |
| `source_event_kind` | `text` | 否 | 无 | PAYMENT SHIPMENT RETURN REFUND |
| `source_event_id` | `bigint` | 否 | 无 | 费用发生依据的业务事件 ID |

**外键：**

- `(tenant_id, order_id, region_id)` → `core.order_header(tenant_id, order_id, region_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`
- `(tenant_id, order_unit_id, order_id, region_id)` → `core.order_unit(tenant_id, order_unit_id, order_id, region_id)`
- `(tenant_id, reversal_of_fee_id, order_id, region_id)` → `core.order_fee(tenant_id, fee_id, order_id, region_id)`

**唯一约束：**

- `tenant_id, source_system, source_fee_no`
- `tenant_id, fee_id, order_id, region_id`

**行内约束：**

- `fee_type IN ('COMMISSION','OUTBOUND_LOGISTICS','RETURN_LOGISTICS','PAYMENT_SERVICE')`
- `available_at >= recognized_at`
- `(amount_cent >= 0 AND reversal_of_fee_id IS NULL) OR (amount_cent < 0 AND reversal_of_fee_id IS NOT NULL)`
- `source_event_kind IN ('PAYMENT','SHIPMENT','RETURN','REFUND')`

## core.order_unit_event

支持部分履约 取消 超时与原子预留释放；订单当前态只能汇总推导

**粒度：**一个逻辑单件的一次状态变化

**主键：**`tenant_id, unit_event_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `unit_event_id` | `bigint` | 否 | 无 | 单件状态事件 |
| `order_unit_id` | `bigint` | 否 | 无 | 订单单件 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `event_seq` | `integer` | 否 | 无 | 同一单件顺序 |
| `event_type` | `text` | 否 | 无 | CREATED RESERVED RELEASED PAID SHIPPED DELIVERED CANCELLED |
| `reason_code` | `text` | 否 | 无 | NONE STOCK_LOCK_FAILED PAY_TIMEOUT CUSTOMER_CANCEL DELIVERY_FAILED |
| `event_at` | `timestamptz` | 否 | 无 | 业务时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, order_unit_id, region_id)` → `core.order_unit(tenant_id, order_unit_id, region_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, order_unit_id, event_seq`

**行内约束：**

- `event_type IN ('CREATED','RESERVED','RELEASED','PAID','SHIPPED','DELIVERED','CANCELLED')`
- `event_seq > 0`
- `available_at >= event_at`

## core.web_session

匿名访客与已绑定会员分别表达；平台渠道不生成此表

**粒度：**自有线上渠道的一次会话

**主键：**`tenant_id, session_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `session_id` | `bigint` | 否 | 无 | 会话 ID |
| `channel_id` | `bigint` | 否 | 无 | 自有渠道 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `identity_id` | `bigint` | 是 | 无 | 识别出的渠道身份 |
| `anonymous_token` | `text` | 否 | 无 | 匿名设备会话令牌 |
| `campaign_id` | `bigint` | 是 | 无 | 可观察的活动来源 |
| `started_at` | `timestamptz` | 否 | 无 | 会话起点 |
| `device_type` | `text` | 否 | 无 | MOBILE DESKTOP TABLET |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, channel_id)` → `core.channel(tenant_id, channel_id)`
- `(tenant_id, region_id)` → `core.geo_area(tenant_id, geo_id)`
- `(tenant_id, campaign_id)` → `core.campaign(tenant_id, campaign_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`
- `(tenant_id, identity_id, channel_id)` → `core.customer_identity(tenant_id, identity_id, channel_id)`

**唯一约束：**

- `tenant_id, session_id, region_id`

**行内约束：**

- `device_type IN ('MOBILE','DESKTOP','TABLET')`
- `available_at >= started_at`

## core.behavior_event

自有渠道完整同源轨迹；不可与订单独立随机生成

**粒度：**一个可观察的会话行为事件

**主键：**`tenant_id, behavior_event_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `behavior_event_id` | `bigint` | 否 | 无 | 事件 ID |
| `session_id` | `bigint` | 否 | 无 | 会话 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `event_seq` | `integer` | 否 | 无 | 会话内递增序号 |
| `event_type` | `text` | 否 | 无 | PAGE_VIEW SEARCH PRODUCT_VIEW ADD_CART CHECKOUT_SUBMITTED CHECKOUT_REJECTED |
| `sku_id` | `bigint` | 是 | 无 | 涉及 SKU 允许无 |
| `order_id` | `bigint` | 是 | 无 | 已创建的订单 允许无 |
| `reason_code` | `text` | 否 | 无 | NONE SOLD_OUT INVALID_CART |
| `event_at` | `timestamptz` | 否 | 无 | 行为发生时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, session_id, region_id)` → `core.web_session(tenant_id, session_id, region_id)`
- `(tenant_id, sku_id)` → `core.sku(tenant_id, sku_id)`
- `(tenant_id, order_id, region_id)` → `core.order_header(tenant_id, order_id, region_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, session_id, event_seq`

**行内约束：**

- `event_type IN ('PAGE_VIEW','SEARCH','PRODUCT_VIEW','ADD_CART','CHECKOUT_SUBMITTED','CHECKOUT_REJECTED')`
- `event_seq > 0`
- `available_at >= event_at`
- `(event_type = 'CHECKOUT_SUBMITTED') = (order_id IS NOT NULL)`

**查询索引：**

- `tenant_id, session_id, event_at`
- `tenant_id, event_at`

## core.campaign_daily

广告花费属于此粒度；不得直接连接订单明细后 SUM

**粒度：**一个日 活动 承接渠道 经营区域

**主键：**`tenant_id, report_date, campaign_id, channel_id, region_id, report_version`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `report_date` | `date` | 否 | 无 | 当地日期 |
| `campaign_id` | `bigint` | 否 | 无 | 活动 |
| `channel_id` | `bigint` | 否 | 无 | 承接渠道 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `impressions` | `bigint` | 否 | 无 | 曝光数 |
| `clicks` | `bigint` | 否 | 无 | 点击数 |
| `spend_cent` | `bigint` | 否 | 无 | 当天广告花费；CNY 不含税整数分 |
| `report_version` | `integer` | 否 | 无 | 源报表版本 从1开始 |
| `source_updated_at` | `timestamptz` | 否 | 无 | 源报表更新时间 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, campaign_id)` → `core.campaign(tenant_id, campaign_id)`
- `(tenant_id, channel_id)` → `core.channel(tenant_id, channel_id)`
- `(tenant_id, region_id)` → `core.geo_area(tenant_id, geo_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**行内约束：**

- `impressions >= 0`
- `clicks BETWEEN 0 AND impressions`
- `spend_cent >= 0`
- `report_version > 0`
- `available_at >= source_updated_at`

## core.channel_product_daily

只提供平台可见汇总；商品购买订单数不可跨 SKU 相加当独立订单数

**粒度：**一个平台 日 渠道 SKU 区域的经营报表版本

**主键：**`tenant_id, report_date, channel_id, sku_id, region_id, report_version`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `report_date` | `date` | 否 | 无 | 下单 cohort 的本地日期；支付随后到达则修订此日期版本 |
| `channel_id` | `bigint` | 否 | 无 | 平台渠道 |
| `sku_id` | `bigint` | 否 | 无 | SKU |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `product_views` | `bigint` | 否 | 无 | 商品页访问事件数 PV |
| `product_visitors` | `bigint` | 否 | 无 | 商品页独立访客 UV |
| `add_cart_users` | `bigint` | 否 | 无 | 加购人数 |
| `submitted_orders` | `bigint` | 否 | 无 | 含本 SKU 的创建订单数 |
| `paid_orders` | `bigint` | 否 | 无 | 该创建日期 cohort 含本 SKU 的订单，截至版本可见时累计已足额支付单数 |
| `paid_amount_cent` | `bigint` | 否 | 无 | 该创建日期 cohort 已足额支付订单分配到本 SKU 的净额 CNY整数分；不是当日现金流 |
| `report_version` | `integer` | 否 | 无 | 源报表修订版本 |
| `source_updated_at` | `timestamptz` | 否 | 无 | 来源修订时间 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, channel_id)` → `core.channel(tenant_id, channel_id)`
- `(tenant_id, sku_id)` → `core.sku(tenant_id, sku_id)`
- `(tenant_id, region_id)` → `core.geo_area(tenant_id, geo_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**行内约束：**

- `product_views >= product_visitors`
- `product_visitors >= 0`
- `add_cart_users BETWEEN 0 AND product_visitors`
- `submitted_orders >= 0`
- `paid_orders BETWEEN 0 AND submitted_orders`
- `paid_amount_cent >= 0`
- `report_version > 0`
- `available_at >= source_updated_at`

## core.store_traffic_daily

客流是进店人次而非企业独立用户

**粒度：**一家门店一天的客流报表版本

**主键：**`tenant_id, report_date, site_id, report_version`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `report_date` | `date` | 否 | 无 | 当地日期 |
| `site_id` | `bigint` | 否 | 无 | 门店 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `visits` | `bigint` | 否 | 无 | 进店人次 |
| `report_version` | `integer` | 否 | 无 | 修订版本 |
| `source_updated_at` | `timestamptz` | 否 | 无 | 源更新时间 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, site_id, region_id)` → `core.site(tenant_id, site_id, region_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**行内约束：**

- `visits >= 0`
- `report_version > 0`
- `available_at >= source_updated_at`

## core.order_attribution

v1 LAST_NON_DIRECT_7D 最多一条每单；多触点扩展必须权重归一

**粒度：**某归因模型版本对一张订单的一条触点归因

**主键：**`tenant_id, attribution_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `attribution_id` | `bigint` | 否 | 无 | 归因记录 ID |
| `order_id` | `bigint` | 否 | 无 | 订单 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `campaign_id` | `bigint` | 是 | 无 | 归因活动 无则自然或不可归因 |
| `session_id` | `bigint` | 是 | 无 | 可观察自有会话 平台可无 |
| `touch_at` | `timestamptz` | 是 | 无 | 触点时间 不可观测可空 |
| `model_version` | `text` | 否 | 无 | 固定 LAST_NON_DIRECT_7D_V1 |
| `credit` | `numeric(9,8)` | 否 | 无 | 归因权重 v1 固定1 |
| `evidence_type` | `text` | 否 | 无 | OWNED_TOUCH ORGANIC UNATTRIBUTABLE；平台仅有日聚合报表时必须 UNATTRIBUTABLE |
| `computed_at` | `timestamptz` | 否 | 无 | 归因计算时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, order_id, region_id)` → `core.order_header(tenant_id, order_id, region_id)`
- `(tenant_id, campaign_id)` → `core.campaign(tenant_id, campaign_id)`
- `(tenant_id, session_id)` → `core.web_session(tenant_id, session_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, order_id, model_version`

**行内约束：**

- `credit = 1`
- `model_version = 'LAST_NON_DIRECT_7D_V1'`
- `evidence_type IN ('OWNED_TOUCH','ORGANIC','UNATTRIBUTABLE')`
- `available_at >= computed_at`
- `(evidence_type = 'OWNED_TOUCH' AND campaign_id IS NOT NULL AND session_id IS NOT NULL AND touch_at IS NOT NULL) OR (evidence_type IN ('ORGANIC','UNATTRIBUTABLE') AND campaign_id IS NULL AND session_id IS NULL AND touch_at IS NULL)`

## core.target_monthly

v1 不同时混入集团总目标或品类目标；先聚合实际再关联

**粒度：**某月 渠道 大区的一项指标目标

**主键：**`tenant_id, target_month, channel_id, region_id, metric_code, plan_version`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `target_month` | `date` | 否 | 无 | 月份第一天 |
| `channel_id` | `bigint` | 否 | 无 | 渠道 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `metric_code` | `text` | 否 | 无 | NET_SALES CONTRIBUTION |
| `target_cent` | `bigint` | 否 | 无 | 目标金额 CNY整数分 |
| `plan_version` | `integer` | 否 | 无 | 目标版本 |
| `approved_at` | `timestamptz` | 否 | 无 | 批准时间 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, channel_id)` → `core.channel(tenant_id, channel_id)`
- `(tenant_id, region_id)` → `core.geo_area(tenant_id, geo_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**行内约束：**

- `extract(day FROM target_month) = 1`
- `metric_code IN ('NET_SALES','CONTRIBUTION')`
- `plan_version > 0`
- `available_at >= approved_at`

## ops.generation_run

代码 配置 输入指纹及检查点必须匹配才允许恢复

**粒度：**一次生成或恢复运行

**主键：**`run_id`

**权限分类：**`PRIVATE_CONTROL`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `run_id` | `text` | 否 | 无 | 运行 ID |
| `release_id` | `text` | 否 | 无 | 发布版本 |
| `stage` | `text` | 否 | 无 | ACQUIRE WEIGHTS CONTEXT PROPOSAL SIMULATE PUBLISH VALIDATE |
| `status` | `text` | 否 | 无 | RUNNING SUCCEEDED FAILED |
| `started_at` | `timestamptz` | 否 | 无 | 运行起点 |
| `finished_at` | `timestamptz` | 是 | 无 | 结束时间 |
| `checkpoint_uri` | `text` | 是 | 无 | 最新已提交检查点 |
| `input_sha256` | `char(64)` | 否 | 无 | 输入规范化摘要 |

**外键：**

- `(release_id)` → `ops.dataset_release(release_id)`

**行内约束：**

- `status IN ('RUNNING','SUCCEEDED','FAILED')`

## ops.file_manifest

幂等提交与发布依据；不暴露给业务 Agent

**粒度：**一份已提交的数据或配置文件

**主键：**`file_id`

**权限分类：**`PRIVATE_CONTROL`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `file_id` | `text` | 否 | 无 | 内容地址文件 ID |
| `release_id` | `text` | 否 | 无 | 发布版本 |
| `run_id` | `text` | 否 | 无 | 运行 |
| `tenant_id` | `smallint` | 是 | 无 | 业务租户 无则公共元数据 |
| `asset_name` | `text` | 否 | 无 | 逻辑表或资产名 |
| `partition_key` | `text` | 否 | 无 | 规范化分区键 |
| `relative_path` | `text` | 否 | 无 | 相对版本根的文件路径 |
| `row_count` | `bigint` | 否 | 无 | 逻辑行数 |
| `byte_size` | `bigint` | 否 | 无 | 字节数 |
| `sha256` | `char(64)` | 否 | 无 | 物理文件摘要 |
| `logical_sha256` | `char(64)` | 否 | 无 | 按规定排序的逻辑内容摘要 |
| `schema_sha256` | `char(64)` | 否 | 无 | schema摘要 |
| `committed_at` | `timestamptz` | 否 | 无 | 提交时间 |

**外键：**

- `(release_id)` → `ops.dataset_release(release_id)`
- `(run_id)` → `ops.generation_run(run_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `release_id, relative_path`

**行内约束：**

- `row_count >= 0`
- `byte_size >= 0`

## ops.source_watermark

complete_through 由批次连续覆盖得到，不能使用 MAX(event_at)

**粒度：**某源在一个已观察时点的完整性水位

**主键：**`tenant_id, source_system, observed_at`

**权限分类：**`PRIVATE_CONTROL`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `source_system` | `text` | 否 | 无 | 源系统 |
| `observed_at` | `timestamptz` | 否 | 无 | 检查时间 |
| `complete_through` | `timestamptz` | 否 | 无 | 确认完整的业务时间截止 不含 |
| `expected_batches` | `integer` | 否 | 无 | 应到批次数 |
| `arrived_batches` | `integer` | 否 | 无 | 已到批次数 |
| `status` | `text` | 否 | 无 | COMPLETE DELAYED FAILED |
| `missing_batch_ids` | `jsonb` | 否 | '[]'::jsonb | 缺失批次 ID数组 |

**外键：**

- `(tenant_id)` → `core.tenant(tenant_id)`

**行内约束：**

- `arrived_batches BETWEEN 0 AND expected_batches`
- `status IN ('COMPLETE','DELAYED','FAILED')`
- `complete_through <= observed_at`

## sec.principal

认证使用 session_user，禁止依赖任意 SQL 可改的 tenant GUC

**粒度：**一个真实数据库登录身份

**主键：**`db_role`

**权限分类：**`PRIVATE_CONTROL`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `db_role` | `name` | 否 | 无 | 实际数据库登录角色名 |
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `persona` | `text` | 否 | 无 | EXEC ANALYST REGION MARKETING |
| `all_regions` | `boolean` | 否 | 无 | 允许本租户全部区域 |
| `can_view_cost` | `boolean` | 否 | 无 | 允许采购成本 成本台账 与费用 |

**外键：**

- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `db_role, tenant_id`

**行内约束：**

- `persona IN ('EXEC','ANALYST','REGION','MARKETING')`

## sec.principal_region

仅受信任管理员可写

**粒度：**登录角色的一条区域授权

**主键：**`db_role, tenant_id, region_id`

**权限分类：**`PRIVATE_CONTROL`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `db_role` | `name` | 否 | 无 | 登录角色 |
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `region_id` | `bigint` | 否 | 无 | 授权大区 |

**外键：**

- `(tenant_id, region_id)` → `core.geo_area(tenant_id, geo_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`
- `(db_role, tenant_id)` → `sec.principal(db_role, tenant_id)`

## eval.scenario

对业务 Agent 和普通查询角色完全隔离

**粒度：**一个业务或数据链路情节

**主键：**`scenario_id`

**权限分类：**`PRIVATE_CONTROL`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `scenario_id` | `text` | 否 | 无 | 场景代码 |
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `scenario_type` | `text` | 否 | 无 | BUSINESS DATA_PIPELINE ACCESS |
| `title` | `text` | 否 | 无 | 场景标题 |
| `parameters` | `jsonb` | 否 | 无 | 确定性注入参数 |
| `observable_evidence` | `jsonb` | 否 | 无 | 可见证据资产及范围 |
| `truth_definition` | `jsonb` | 否 | 无 | 预期变化算法与反事实定义 |

**外键：**

- `(tenant_id)` → `core.tenant(tenant_id)`

## eval.question

每题固定权限 时间口径 数据版本和结果形式

**粒度：**一条自然语言评测题的版本

**主键：**`question_id`

**权限分类：**`PRIVATE_CONTROL`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `question_id` | `text` | 否 | 无 | 题号 |
| `scenario_id` | `text` | 是 | 无 | 所属情节 普通指标题可无 |
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `persona` | `text` | 否 | 无 | 测试角色 |
| `question_text` | `text` | 否 | 无 | 中文题目 |
| `business_as_of` | `timestamptz` | 否 | 无 | 业务事件截止 |
| `knowledge_as_of` | `timestamptz` | 否 | 无 | 数据可见截止 |
| `reference_time` | `timestamptz` | 否 | 无 | 解释昨天 本月 最近30天的固定语义时钟；独立于真实运行日期 |
| `metric_version` | `text` | 否 | 无 | 指标版本 |
| `gold_sql_path` | `text` | 否 | 无 | 独立金标SQL相对路径 |
| `expected_shape` | `jsonb` | 否 | 无 | 列名 类型 排序 单位 图表维度 |
| `tolerance` | `jsonb` | 否 | 无 | 金额0 容差 比率容差等 |

**外键：**

- `(scenario_id)` → `eval.scenario(scenario_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

## eval.expected_result

不把 Agent 自己生成的 SQL 当金标

**粒度：**一条题目在一个版本上的金标结果

**主键：**`question_id, release_id`

**权限分类：**`PRIVATE_CONTROL`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `question_id` | `text` | 否 | 无 | 题号 |
| `release_id` | `text` | 否 | 无 | 版本 |
| `result_sha256` | `char(64)` | 否 | 无 | 规范化结果摘要 |
| `result_rows` | `jsonb` | 否 | 无 | 小规模金标结果 或存放摘要与文件路径 |
| `verifier_version` | `text` | 否 | 无 | 独立验证器版本 |
| `computed_at` | `timestamptz` | 否 | 无 | 金标生成时刻 |

**外键：**

- `(question_id)` → `eval.question(question_id)`
- `(release_id)` → `ops.dataset_release(release_id)`

## core.customer_identity_link

身份本身保持不可变；绑定独立记录，禁止把未来会员关联回填到历史订单

**粒度：**一条渠道身份到会员的已验证绑定

**主键：**`tenant_id, identity_link_id`

**权限分类：**`CUSTOMER_RESTRICTED`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `identity_link_id` | `bigint` | 否 | 无 | 绑定记录 |
| `identity_id` | `bigint` | 否 | 无 | 渠道身份 |
| `customer_id` | `bigint` | 否 | 无 | 企业会员 |
| `linked_at` | `timestamptz` | 否 | 无 | 绑定确认时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, identity_id)` → `core.customer_identity(tenant_id, identity_id)`
- `(tenant_id, customer_id)` → `core.customer(tenant_id, customer_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, identity_id`

**行内约束：**

- `available_at >= linked_at`

## core.stock_allocation_attempt

包含失败尝试的可观察库存证据；整单验证后原子提交，失败不产生部分预留

**粒度：**一次订单锁库事务中一个候选地点 SKU 的尝试

**主键：**`tenant_id, allocation_attempt_id`

**权限分类：**`REGION_BUSINESS`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `allocation_attempt_id` | `bigint` | 否 | 无 | 尝试行 ID |
| `allocation_group_id` | `bigint` | 否 | 无 | 全订单原子尝试组 |
| `order_id` | `bigint` | 否 | 无 | 已创建订单 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `site_id` | `bigint` | 否 | 无 | 候选履约地点 |
| `sku_id` | `bigint` | 否 | 无 | 待预留 SKU |
| `requested_qty` | `integer` | 否 | 无 | 本地点拟承担数量 |
| `available_before_qty` | `integer` | 否 | 无 | 尝试前可承诺量 |
| `outcome` | `text` | 否 | 无 | COMMITTED INSUFFICIENT ROLLED_BACK |
| `attempted_at` | `timestamptz` | 否 | 无 | 锁库尝试时刻 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, order_id, region_id)` → `core.order_header(tenant_id, order_id, region_id)`
- `(tenant_id, site_id)` → `core.site(tenant_id, site_id)`
- `(tenant_id, sku_id)` → `core.sku(tenant_id, sku_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**唯一约束：**

- `tenant_id, allocation_group_id, site_id, sku_id`

**行内约束：**

- `requested_qty > 0`
- `available_before_qty >= 0`
- `outcome IN ('COMMITTED','INSUFFICIENT','ROLLED_BACK')`
- `outcome <> 'COMMITTED' OR requested_qty <= available_before_qty`
- `available_at >= attempted_at`

## core.inventory_valuation_snapshot

由批次余额乘原批次成本汇总；只计可售物理库存，预留包含其中；待检和损坏不重复确认为存货资产

**粒度：**一个日末 地点 SKU 和观察截止的库存金额

**主键：**`tenant_id, snapshot_date, site_id, sku_id, as_of`

**权限分类：**`REGION_COST`；实际策略见 02_security.sql。

| 字段 | 类型 | 可空 | 默认值 | 语义 |
|---|---|---|---|---|
| `tenant_id` | `smallint` | 否 | 无 | 企业租户；101 主租户，102 和 103 隔离租户 |
| `snapshot_date` | `date` | 否 | 无 | 本地日末日期 |
| `site_id` | `bigint` | 否 | 无 | 地点 |
| `region_id` | `bigint` | 否 | 无 | 经营归属大区；与所属订单或地点一致 |
| `sku_id` | `bigint` | 否 | 无 | SKU |
| `as_of` | `timestamptz` | 否 | 无 | 信息截止 |
| `sellable_value_cent` | `bigint` | 否 | 无 | 可售物理库存原批次成本合计；CNY 不含税整数分 |
| `available_at` | `timestamptz` | 否 | 无 | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| `load_batch_id` | `bigint` | 否 | 无 | 模拟采集批次；引用本租户采集批次 |

**外键：**

- `(tenant_id, site_id, region_id)` → `core.site(tenant_id, site_id, region_id)`
- `(tenant_id, sku_id)` → `core.sku(tenant_id, sku_id)`
- `(tenant_id, load_batch_id)` → `ops.ingestion_batch(tenant_id, batch_id)`
- `(tenant_id)` → `core.tenant(tenant_id)`

**行内约束：**

- `sellable_value_cent >= 0`
- `available_at >= as_of`

