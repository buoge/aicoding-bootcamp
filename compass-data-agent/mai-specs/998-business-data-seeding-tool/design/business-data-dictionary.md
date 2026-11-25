# Compass 业务数据字典

本文件由唯一维护源 [business-schema.sql](business-schema.sql) 派生。

当前结构 compass-retail-3：71 张表、748 个字段、247 个外键。
逻辑 core / ops / sec 在独立候选库直接使用；同库发布时全部映射到新 schema（如 retail_v2）。旧 schema 保留。

## core.tenant

一个独立经营企业。SaaS 隔离边界；品牌与地区不是租户

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| tenant_code | `text NOT NULL` | 稳定企业代码 |
| tenant_name | `text NOT NULL` | 虚构企业名称 |
| timezone | `text NOT NULL` | v1 固定 Asia/Shanghai |
| currency | `char(3) NOT NULL` | v1 固定 CNY |
| order_quota | `bigint NOT NULL` | 工程 profile 为精确配额；diagnostic 为预登记规模目标，实际结果允许浮动 |
| release_id | `text NOT NULL` | 数据版本 |

约束与关联：

```sql
PRIMARY KEY (tenant_id)
UNIQUE (tenant_code)
CHECK (timezone = 'Asia/Shanghai')
CHECK (currency = 'CNY')
CHECK (order_quota > 0)
ALTER TABLE core.tenant ADD CONSTRAINT fk_b00_00 FOREIGN KEY (release_id) REFERENCES ops.dataset_release (release_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.geo_area

一个地理节点。经营大区 省份 城市 区县的稳定层级；不模拟行政区划变化

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| geo_id | `bigint NOT NULL` | 地理节点 |
| parent_geo_id | `bigint` | 父地理节点 |
| geo_level | `text NOT NULL` | REGION PROVINCE CITY DISTRICT；行政名称采用核对过的 2023 年冻结快照 |
| geo_code | `text NOT NULL` | 内部稳定代码 |
| geo_name | `text NOT NULL` | 地理名称 |
| region_id | `bigint NOT NULL` | 所属大区的 geo_id；大区自身引用自身 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, geo_id)
UNIQUE (tenant_id, geo_code)
CHECK (geo_level IN ('REGION','PROVINCE','CITY','DISTRICT'))
ALTER TABLE core.geo_area ADD CONSTRAINT fk_b01_00 FOREIGN KEY (tenant_id, parent_geo_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.geo_area ADD CONSTRAINT fk_b01_01 FOREIGN KEY (tenant_id, region_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.geo_area ADD CONSTRAINT fk_b01_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.org_unit

一个经营组织。组织与区域分别建模；v1 组织归属不随历史变动

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| org_unit_id | `bigint NOT NULL` | 组织 ID |
| parent_org_unit_id | `bigint` | 上级组织 |
| org_code | `text NOT NULL` | 组织代码 |
| org_name | `text NOT NULL` | 组织名称 |
| org_type | `text NOT NULL` | GROUP REGION STORE ECOM |

约束与关联：

```sql
PRIMARY KEY (tenant_id, org_unit_id)
UNIQUE (tenant_id, org_code)
CHECK (org_type IN ('GROUP','REGION','STORE','ECOM'))
ALTER TABLE core.org_unit ADD CONSTRAINT fk_b02_00 FOREIGN KEY (tenant_id, parent_org_unit_id) REFERENCES core.org_unit (tenant_id, org_unit_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.org_unit ADD CONSTRAINT fk_b02_01 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.site

一个实体门店或仓库。统一地点模型；下单渠道和履约地点分离；地点地址与名称是租户内共享维度，地点经营事实另按实际区域授权

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| site_id | `bigint NOT NULL` | 地点 ID |
| site_code | `text NOT NULL` | 门店或仓库代码 |
| site_name | `text NOT NULL` | 地点名称 |
| site_type | `text NOT NULL` | STORE OUTLET WAREHOUSE |
| org_unit_id | `bigint NOT NULL` | 经营组织 |
| geo_id | `bigint NOT NULL` | 所在城市 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| opened_on | `date NOT NULL` | 开业日 包含 |
| closed_on | `date` | 关闭日 不含 |
| area_sqm | `integer NOT NULL` | 门店或仓库面积 平方米 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, site_id)
UNIQUE (tenant_id, site_code)
UNIQUE (tenant_id, site_id, region_id)
CHECK (site_type IN ('STORE','OUTLET','WAREHOUSE'))
CHECK (area_sqm > 0)
CHECK (closed_on IS NULL OR opened_on < closed_on)
ALTER TABLE core.site ADD CONSTRAINT fk_b03_00 FOREIGN KEY (tenant_id, org_unit_id) REFERENCES core.org_unit (tenant_id, org_unit_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.site ADD CONSTRAINT fk_b03_01 FOREIGN KEY (tenant_id, geo_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.site ADD CONSTRAINT fk_b03_02 FOREIGN KEY (tenant_id, region_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.site ADD CONSTRAINT fk_b03_03 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.channel

一个销售渠道。营销活动来源单独在 campaign 中定义

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| channel_id | `bigint NOT NULL` | 渠道 ID |
| channel_code | `text NOT NULL` | TMALL JD DOUYIN MINIAPP APP POS OUTLET |
| channel_name | `text NOT NULL` | 渠道名称 |
| channel_type | `text NOT NULL` | PLATFORM OWNED OFFLINE |
| has_user_events | `boolean NOT NULL` | 是否提供逐用户事件 |
| identity_scope | `text NOT NULL` | CHANNEL MEMBER MIXED |

约束与关联：

```sql
PRIMARY KEY (tenant_id, channel_id)
UNIQUE (tenant_id, channel_code)
CHECK (channel_type IN ('PLATFORM','OWNED','OFFLINE'))
CHECK (identity_scope IN ('CHANNEL','MEMBER','MIXED'))
CHECK (NOT has_user_events OR channel_type = 'OWNED')
ALTER TABLE core.channel ADD CONSTRAINT fk_b04_00 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.calendar

一个本地自然日。共享公开日期维；假日标签按课程自定义日历配置

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| calendar_date | `date NOT NULL` | Asia/Shanghai 自然日 |
| year_no | `smallint NOT NULL` | 年 |
| month_no | `smallint NOT NULL` | 月 |
| day_of_week | `smallint NOT NULL` | ISO 周一为 1 |
| iso_year | `smallint NOT NULL` | ISO 周所属年 |
| iso_week | `smallint NOT NULL` | ISO 周 |
| is_weekend | `boolean NOT NULL` | 是否周末 |
| festival_code | `text NOT NULL` | 课程事件标签 无则 NONE |

约束与关联：

```sql
PRIMARY KEY (calendar_date)
CHECK (month_no BETWEEN 1 AND 12)
CHECK (day_of_week BETWEEN 1 AND 7)
CHECK (iso_week BETWEEN 1 AND 53)
```

## core.brand

一个自有品牌。品牌归属唯一租户

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| brand_id | `bigint NOT NULL` | 品牌 ID |
| brand_code | `text NOT NULL` | 品牌代码 |
| brand_name | `text NOT NULL` | 品牌名称 |
| positioning | `text NOT NULL` | 大众 专业跑步 户外等定位 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, brand_id)
UNIQUE (tenant_id, brand_code)
ALTER TABLE core.brand ADD CONSTRAINT fk_b06_00 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.category

一个商品分类节点。每个 SPU 仅属于一个叶子分类

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| category_id | `bigint NOT NULL` | 分类 ID |
| parent_category_id | `bigint` | 父分类 |
| category_code | `text NOT NULL` | 分类代码 |
| category_name | `text NOT NULL` | 分类名称 |
| level_no | `smallint NOT NULL` | 一级或二级 |
| is_leaf | `boolean NOT NULL` | 是否允许挂接 SPU |

约束与关联：

```sql
PRIMARY KEY (tenant_id, category_id)
UNIQUE (tenant_id, category_code)
CHECK (level_no IN (1,2))
ALTER TABLE core.category ADD CONSTRAINT fk_b07_00 FOREIGN KEY (tenant_id, parent_category_id) REFERENCES core.category (tenant_id, category_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.category ADD CONSTRAINT fk_b07_01 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.sport

一个运动标签。多标签统计必须去重；非财务加总层级

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| sport_id | `bigint NOT NULL` | 标签 ID |
| sport_code | `text NOT NULL` | 运动代码 |
| sport_name | `text NOT NULL` | 跑步 露营 游泳等 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, sport_id)
UNIQUE (tenant_id, sport_code)
ALTER TABLE core.sport ADD CONSTRAINT fk_b08_00 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.spu

一款标准商品。品牌与主品类为独立属性

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| spu_id | `bigint NOT NULL` | SPU ID |
| brand_id | `bigint NOT NULL` | 自有品牌 |
| category_id | `bigint NOT NULL` | 唯一叶子分类 |
| spu_code | `text NOT NULL` | 款式代码 |
| spu_name | `text NOT NULL` | 规范化商品名称 |
| audience | `text NOT NULL` | UNISEX MALE FEMALE |
| season_code | `text NOT NULL` | ALL SUMMER WINTER SPRING_AUTUMN |
| launch_on | `date NOT NULL` | 上新日期 |
| discontinue_on | `date` | 停止新销售日期 不含 |
| attributes | `jsonb NOT NULL DEFAULT '{}'::jsonb` | 长尾非分析主轴属性 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, spu_id)
UNIQUE (tenant_id, spu_code)
CHECK (audience IN ('UNISEX','MALE','FEMALE'))
CHECK (season_code IN ('ALL','SUMMER','WINTER','SPRING_AUTUMN'))
CHECK (discontinue_on IS NULL OR discontinue_on > launch_on)
ALTER TABLE core.spu ADD CONSTRAINT fk_b09_00 FOREIGN KEY (tenant_id, brand_id) REFERENCES core.brand (tenant_id, brand_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.spu ADD CONSTRAINT fk_b09_01 FOREIGN KEY (tenant_id, category_id) REFERENCES core.category (tenant_id, category_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.spu ADD CONSTRAINT fk_b09_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.spu_sport

一个 SPU 与运动标签的关系。只能作为筛选或去重后的标签分析

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| spu_id | `bigint NOT NULL` | SPU |
| sport_id | `bigint NOT NULL` | 运动标签 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, spu_id, sport_id)
ALTER TABLE core.spu_sport ADD CONSTRAINT fk_b10_00 FOREIGN KEY (tenant_id, spu_id) REFERENCES core.spu (tenant_id, spu_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.spu_sport ADD CONSTRAINT fk_b10_01 FOREIGN KEY (tenant_id, sport_id) REFERENCES core.sport (tenant_id, sport_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.spu_sport ADD CONSTRAINT fk_b10_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.sku

一个可售商品规格。并非所有品类均按颜色乘尺码做笛卡尔积

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| sku_id | `bigint NOT NULL` | SKU ID |
| spu_id | `bigint NOT NULL` | 所属 SPU |
| sku_code | `text NOT NULL` | 企业统一 SKU 编码 |
| color_code | `text NOT NULL` | 颜色 不适用时 NA |
| size_system | `text NOT NULL` | CN_SHOE ALPHA CAPACITY WEIGHT MODEL NA |
| size_value | `text NOT NULL` | 例如 42 XL 30L 5KG |
| spec_key | `text NOT NULL` | 规范化规格组合键 |
| spec_attributes | `jsonb NOT NULL` | 可查询规格组合，包括颜色名称、尺码、容量、重量、人数或型号；单位明确 |
| weight_grams | `integer NOT NULL` | 单件克重 |
| launch_on | `date NOT NULL` | 可售开始 |
| discontinue_on | `date` | 可售结束 不含 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, sku_id)
UNIQUE (tenant_id, sku_code)
UNIQUE (tenant_id, spu_id, spec_key)
CHECK (weight_grams > 0)
CHECK (discontinue_on IS NULL OR discontinue_on > launch_on)
ALTER TABLE core.sku ADD CONSTRAINT fk_b11_00 FOREIGN KEY (tenant_id, spu_id) REFERENCES core.spu (tenant_id, spu_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.sku ADD CONSTRAINT fk_b11_01 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.channel_listing

某渠道商品编码的一个有效版本。保留平台编码与统一 SKU 的多对一映射

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| listing_id | `bigint NOT NULL` | 映射版本 ID |
| channel_id | `bigint NOT NULL` | 销售渠道 |
| external_sku_code | `text NOT NULL` | 平台编码 |
| sku_id | `bigint NOT NULL` | 统一 SKU |
| valid_from | `timestamptz NOT NULL` | 有效开始 包含 |
| valid_to | `timestamptz NOT NULL` | 有效结束 不含 |
| available_at | `timestamptz NOT NULL` | 此计划或版本在源中首次发布可见时刻 |
| load_batch_id | `bigint NOT NULL` | 来源采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, listing_id)
UNIQUE (tenant_id, channel_id, external_sku_code, valid_from)
UNIQUE (tenant_id, listing_id, sku_id, channel_id)
CHECK (valid_from < valid_to)
ALTER TABLE core.channel_listing ADD CONSTRAINT fk_b12_00 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.channel_listing ADD CONSTRAINT fk_b12_01 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.channel_listing ADD CONSTRAINT fk_b12_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.channel_listing ADD CONSTRAINT fk_b12_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.assortment

一个地点 SKU 的经营有效区间。停售但有残余库存时仍需保留库存快照

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| assortment_id | `bigint NOT NULL` | 经营区间 ID |
| site_id | `bigint NOT NULL` | 仓或店 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| sku_id | `bigint NOT NULL` | SKU |
| valid_from | `date NOT NULL` | 经营起点 包含 |
| valid_to | `date NOT NULL` | 经营终点 不含 |
| can_sell | `boolean NOT NULL` | 允许销售出库 |
| min_stock | `integer NOT NULL` | 补货点 单件 |
| target_stock | `integer NOT NULL` | 目标库存 单件 |
| available_at | `timestamptz NOT NULL` | 此计划或版本在源中首次发布可见时刻 |
| load_batch_id | `bigint NOT NULL` | 来源采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, assortment_id)
UNIQUE (tenant_id, site_id, sku_id, valid_from)
CHECK (valid_from < valid_to)
CHECK (min_stock >= 0)
CHECK (target_stock >= min_stock)
ALTER TABLE core.assortment ADD CONSTRAINT fk_b13_00 FOREIGN KEY (tenant_id, site_id, region_id) REFERENCES core.site (tenant_id, site_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.assortment ADD CONSTRAINT fk_b13_01 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.assortment ADD CONSTRAINT fk_b13_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.assortment ADD CONSTRAINT fk_b13_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.price_period

一个 SKU 渠道价格的有效区间。时间区间不得交叠；价格在下单时固化

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| price_id | `bigint NOT NULL` | 价格版本 |
| sku_id | `bigint NOT NULL` | SKU |
| channel_id | `bigint NOT NULL` | 渠道 |
| valid_from | `timestamptz NOT NULL` | 生效开始 |
| valid_to | `timestamptz NOT NULL` | 生效结束 不含 |
| list_price_cent | `bigint NOT NULL` | 单件标价；CNY 不含税整数分 |
| available_at | `timestamptz NOT NULL` | 此计划或版本在源中首次发布可见时刻 |
| load_batch_id | `bigint NOT NULL` | 来源采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, price_id)
UNIQUE (tenant_id, sku_id, channel_id, valid_from)
UNIQUE (tenant_id, price_id, sku_id, channel_id)
CHECK (valid_from < valid_to)
CHECK (list_price_cent >= 0)
ALTER TABLE core.price_period ADD CONSTRAINT fk_b14_00 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.price_period ADD CONSTRAINT fk_b14_01 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.price_period ADD CONSTRAINT fk_b14_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.price_period ADD CONSTRAINT fk_b14_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.cost_period

一个 SKU 标准采购成本的有效区间。仅决定新采购批次成本；旧库存不追溯改价

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| cost_id | `bigint NOT NULL` | 采购成本版本 |
| sku_id | `bigint NOT NULL` | SKU |
| valid_from | `timestamptz NOT NULL` | 生效开始 |
| valid_to | `timestamptz NOT NULL` | 生效结束 不含 |
| unit_cost_cent | `bigint NOT NULL` | 单位采购成本；CNY 不含税整数分 |
| available_at | `timestamptz NOT NULL` | 此计划或版本在源中首次发布可见时刻 |
| load_batch_id | `bigint NOT NULL` | 来源采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, cost_id)
UNIQUE (tenant_id, sku_id, valid_from)
CHECK (valid_from < valid_to)
CHECK (unit_cost_cent >= 0)
ALTER TABLE core.cost_period ADD CONSTRAINT fk_b15_00 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.cost_period ADD CONSTRAINT fk_b15_01 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.cost_period ADD CONSTRAINT fk_b15_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.customer

一个企业会员。保存合成姓名与初始申报属性，无真实个人资料

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| customer_id | `bigint NOT NULL` | 企业会员 ID |
| member_code | `text NOT NULL` | 合成会员编号 |
| display_name | `text NOT NULL` | 合成显示姓名，可重名，不用于身份关联 |
| attributes | `jsonb NOT NULL` | 入会时申报的运动偏好等合成属性，不含潜在消费倾向或未来标签 |
| joined_at | `timestamptz NOT NULL` | 入会时刻 |
| segment_code | `text NOT NULL` | 新客 高频 低频等固定初始分群 |
| home_geo_id | `bigint` | 登记城市 允许未知 |
| age_band | `text` | 合成年龄段 允许未知 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, customer_id)
UNIQUE (tenant_id, member_code)
ALTER TABLE core.customer ADD CONSTRAINT fk_b16_00 FOREIGN KEY (tenant_id, home_geo_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.customer ADD CONSTRAINT fk_b16_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.customer ADD CONSTRAINT fk_b16_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.customer_identity

一个渠道内的购买身份。不可变渠道内身份；会员绑定见 customer_identity_link，未识别用户不可合并成同一个客户

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| identity_id | `bigint NOT NULL` | 渠道身份 ID |
| channel_id | `bigint NOT NULL` | 来源渠道 |
| external_user_token | `text NOT NULL` | 不可逆合成令牌 |
| first_seen_at | `timestamptz NOT NULL` | 首次可见时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, identity_id)
UNIQUE (tenant_id, channel_id, external_user_token)
UNIQUE (tenant_id, identity_id, channel_id)
CHECK (available_at >= first_seen_at)
ALTER TABLE core.customer_identity ADD CONSTRAINT fk_b17_00 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.customer_identity ADD CONSTRAINT fk_b17_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.customer_identity ADD CONSTRAINT fk_b17_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.customer_identity_link

一条渠道身份到会员的已验证绑定。身份本身保持不可变；绑定独立记录，禁止把未来会员关联回填到历史订单

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| identity_link_id | `bigint NOT NULL` | 绑定记录 |
| identity_id | `bigint NOT NULL` | 渠道身份 |
| customer_id | `bigint NOT NULL` | 企业会员 |
| linked_at | `timestamptz NOT NULL` | 绑定确认时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, identity_link_id)
UNIQUE (tenant_id, identity_id)
CHECK (available_at >= linked_at)
ALTER TABLE core.customer_identity_link ADD CONSTRAINT fk_b18_00 FOREIGN KEY (tenant_id, identity_id) REFERENCES core.customer_identity (tenant_id, identity_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.customer_identity_link ADD CONSTRAINT fk_b18_01 FOREIGN KEY (tenant_id, customer_id) REFERENCES core.customer (tenant_id, customer_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.customer_identity_link ADD CONSTRAINT fk_b18_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.customer_identity_link ADD CONSTRAINT fk_b18_03 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.order_header

一个成功创建的订单头。精确百万配额包含支付失败和取消；无 mutable 当前状态

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| order_id | `bigint NOT NULL` | 订单 ID |
| order_no | `text NOT NULL` | 企业业务订单号 |
| contoso_proposal_id | `text NOT NULL` | 候选订单追踪 ID |
| channel_id | `bigint NOT NULL` | 下单渠道 |
| org_unit_id | `bigint NOT NULL` | 销售归属组织 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| demand_geo_id | `bigint NOT NULL` | 需求城市 |
| selling_site_id | `bigint` | 线下下单门店 线上为 NULL |
| identity_id | `bigint NOT NULL` | 渠道购买身份 |
| customer_id | `bigint` | 下单时已知会员；不事后回填 |
| ordered_at | `timestamptz NOT NULL` | 订单创建时刻 |
| order_date | `date NOT NULL` | ordered_at 转 Asia/Shanghai 的自然日 |
| currency | `char(3) NOT NULL` | 固定 CNY |
| gross_cent | `bigint NOT NULL` | 商品原价总额；CNY 不含税整数分 |
| discount_cent | `bigint NOT NULL` | 商品优惠总额；CNY 不含税整数分 |
| payable_cent | `bigint NOT NULL` | 应付商品额；v1 无向客户收取的运费；CNY 不含税整数分 |
| payment_deadline | `timestamptz NOT NULL` | 支付截止时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, order_id)
UNIQUE (tenant_id, order_no)
UNIQUE (tenant_id, contoso_proposal_id)
UNIQUE (tenant_id, order_id, region_id)
UNIQUE (tenant_id, order_id, region_id, channel_id)
CHECK (currency = 'CNY')
CHECK (gross_cent >= 0)
CHECK (discount_cent BETWEEN 0 AND gross_cent)
CHECK (payable_cent = gross_cent - discount_cent)
CHECK (payment_deadline >= ordered_at)
CHECK (order_date = (ordered_at AT TIME ZONE 'Asia/Shanghai')::date)
CHECK (available_at >= ordered_at)
CHECK (payable_cent > 0)
ALTER TABLE core.order_header ADD CONSTRAINT fk_b19_00 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_header ADD CONSTRAINT fk_b19_01 FOREIGN KEY (tenant_id, org_unit_id) REFERENCES core.org_unit (tenant_id, org_unit_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_header ADD CONSTRAINT fk_b19_02 FOREIGN KEY (tenant_id, region_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_header ADD CONSTRAINT fk_b19_03 FOREIGN KEY (tenant_id, demand_geo_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_header ADD CONSTRAINT fk_b19_04 FOREIGN KEY (tenant_id, selling_site_id) REFERENCES core.site (tenant_id, site_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_header ADD CONSTRAINT fk_b19_05 FOREIGN KEY (tenant_id, customer_id) REFERENCES core.customer (tenant_id, customer_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_header ADD CONSTRAINT fk_b19_06 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_header ADD CONSTRAINT fk_b19_07 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_header ADD CONSTRAINT fk_b19_08 FOREIGN KEY (tenant_id, identity_id, channel_id) REFERENCES core.customer_identity (tenant_id, identity_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.order_line

一张订单的一个 SKU 行。重复 SKU 合并成一行；商品价与优惠在下单时固化

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| order_line_id | `bigint NOT NULL` | 订单行 ID |
| order_id | `bigint NOT NULL` | 订单头 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| channel_id | `bigint NOT NULL` | 继承订单销售渠道；锁定有效映射和价格 |
| line_no | `integer NOT NULL` | 订单内行号 |
| sku_id | `bigint NOT NULL` | SKU |
| listing_id | `bigint` | 渠道商品版本 自建线下可无 |
| price_id | `bigint NOT NULL` | 采用价格版本 |
| quantity | `integer NOT NULL` | 订购单件数 |
| list_unit_cent | `bigint NOT NULL` | 原价单价；CNY 不含税整数分 |
| gross_cent | `bigint NOT NULL` | 行原价金额；CNY 不含税整数分 |
| discount_cent | `bigint NOT NULL` | 行优惠；CNY 不含税整数分 |
| net_cent | `bigint NOT NULL` | 行应付额；CNY 不含税整数分 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, order_line_id)
UNIQUE (tenant_id, order_id, line_no)
UNIQUE (tenant_id, order_id, sku_id)
UNIQUE (tenant_id, order_line_id, order_id, region_id, sku_id)
CHECK (line_no > 0)
CHECK (quantity > 0)
CHECK (list_unit_cent >= 0)
CHECK (gross_cent = list_unit_cent * quantity)
CHECK (discount_cent BETWEEN 0 AND gross_cent)
CHECK (net_cent = gross_cent - discount_cent)
ALTER TABLE core.order_line ADD CONSTRAINT fk_b20_00 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_line ADD CONSTRAINT fk_b20_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_line ADD CONSTRAINT fk_b20_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_line ADD CONSTRAINT fk_b20_03 FOREIGN KEY (tenant_id, order_id, region_id, channel_id) REFERENCES core.order_header (tenant_id, order_id, region_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_line ADD CONSTRAINT fk_b20_04 FOREIGN KEY (tenant_id, listing_id, sku_id, channel_id) REFERENCES core.channel_listing (tenant_id, listing_id, sku_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_line ADD CONSTRAINT fk_b20_05 FOREIGN KEY (tenant_id, price_id, sku_id, channel_id) REFERENCES core.price_period (tenant_id, price_id, sku_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.order_unit

订单行中的一个逻辑计量单件。用于部分履约 退货 成本与整分分摊；不代表实物序列号

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| order_unit_id | `bigint NOT NULL` | 逻辑单件 ID |
| order_line_id | `bigint NOT NULL` | 订单行 |
| order_id | `bigint NOT NULL` | 订单 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| sku_id | `bigint NOT NULL` | SKU |
| unit_no | `integer NOT NULL` | 行内单件序号 |
| gross_cent | `bigint NOT NULL` | 该单件原价；CNY 不含税整数分 |
| discount_cent | `bigint NOT NULL` | 分配到该单件的优惠；CNY 不含税整数分 |
| net_cent | `bigint NOT NULL` | 该单件应付额；CNY 不含税整数分 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, order_unit_id)
UNIQUE (tenant_id, order_line_id, unit_no)
UNIQUE (tenant_id, order_unit_id, order_id, region_id, sku_id)
UNIQUE (tenant_id, order_unit_id, region_id)
UNIQUE (tenant_id, order_unit_id, order_id, region_id)
CHECK (unit_no > 0)
CHECK (gross_cent >= 0)
CHECK (discount_cent BETWEEN 0 AND gross_cent)
CHECK (net_cent = gross_cent - discount_cent)
ALTER TABLE core.order_unit ADD CONSTRAINT fk_b21_00 FOREIGN KEY (tenant_id, order_line_id, order_id, region_id, sku_id) REFERENCES core.order_line (tenant_id, order_line_id, order_id, region_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_unit ADD CONSTRAINT fk_b21_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_unit ADD CONSTRAINT fk_b21_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.order_status_event

一个订单的一次状态变化。只能按 event_at 与 available_at 双条件重建状态

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| status_event_id | `bigint NOT NULL` | 状态事件 |
| order_id | `bigint NOT NULL` | 订单 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| event_seq | `integer NOT NULL` | 同一订单事件序号 |
| status | `text NOT NULL` | CREATED RESERVED PAID PART_SHIPPED SHIPPED COMPLETED CANCELLED |
| reason_code | `text NOT NULL` | NONE STOCK_LOCK_FAILED PAY_TIMEOUT CUSTOMER_CANCEL DELIVERY_FAILED |
| event_at | `timestamptz NOT NULL` | 业务状态变化时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, status_event_id)
UNIQUE (tenant_id, order_id, event_seq)
CHECK (status IN ('CREATED','RESERVED','PAID','PART_SHIPPED','SHIPPED','COMPLETED','CANCELLED'))
CHECK (event_seq > 0)
CHECK (available_at >= event_at)
ALTER TABLE core.order_status_event ADD CONSTRAINT fk_b22_00 FOREIGN KEY (tenant_id, order_id, region_id) REFERENCES core.order_header (tenant_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_status_event ADD CONSTRAINT fk_b22_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_status_event ADD CONSTRAINT fk_b22_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.order_unit_event

一个逻辑单件的一次状态变化。支持部分履约 取消 超时与原子预留释放；订单当前态只能汇总推导

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| unit_event_id | `bigint NOT NULL` | 单件状态事件 |
| order_unit_id | `bigint NOT NULL` | 订单单件 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| event_seq | `integer NOT NULL` | 同一单件顺序 |
| event_type | `text NOT NULL` | CREATED RESERVED RELEASED PAID SHIPPED DELIVERED CANCELLED |
| reason_code | `text NOT NULL` | NONE STOCK_LOCK_FAILED PAY_TIMEOUT CUSTOMER_CANCEL DELIVERY_FAILED |
| event_at | `timestamptz NOT NULL` | 业务时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, unit_event_id)
UNIQUE (tenant_id, order_unit_id, event_seq)
CHECK (event_type IN ('CREATED','RESERVED','RELEASED','PAID','SHIPPED','DELIVERED','CANCELLED'))
CHECK (event_seq > 0)
CHECK (available_at >= event_at)
ALTER TABLE core.order_unit_event ADD CONSTRAINT fk_b23_00 FOREIGN KEY (tenant_id, order_unit_id, region_id) REFERENCES core.order_unit (tenant_id, order_unit_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_unit_event ADD CONSTRAINT fk_b23_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_unit_event ADD CONSTRAINT fk_b23_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.discount_allocation

一个优惠对一个订单单件的分摊。按优先级逐次分摊；相同单件可命中多个优惠

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| allocation_id | `bigint NOT NULL` | 优惠分摊记录 |
| order_unit_id | `bigint NOT NULL` | 单件 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| promotion_id | `bigint NOT NULL` | 优惠规则 |
| apply_seq | `integer NOT NULL` | 应用次序 |
| discount_cent | `bigint NOT NULL` | 本次分摊优惠；CNY 不含税整数分 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, allocation_id)
UNIQUE (tenant_id, order_unit_id, promotion_id, apply_seq)
CHECK (apply_seq > 0)
CHECK (discount_cent >= 0)
ALTER TABLE core.discount_allocation ADD CONSTRAINT fk_b24_00 FOREIGN KEY (tenant_id, order_unit_id, region_id) REFERENCES core.order_unit (tenant_id, order_unit_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.discount_allocation ADD CONSTRAINT fk_b24_01 FOREIGN KEY (tenant_id, promotion_id) REFERENCES core.promotion (tenant_id, promotion_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.discount_allocation ADD CONSTRAINT fk_b24_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.discount_allocation ADD CONSTRAINT fk_b24_03 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.payment

一次支付尝试。成功支付累计满足应付才产生 PAID；允许一次订单多笔支付

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| payment_id | `bigint NOT NULL` | 支付尝试 ID |
| order_id | `bigint NOT NULL` | 订单 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| payment_no | `text NOT NULL` | 来源支付单号 |
| method | `text NOT NULL` | ALIPAY WECHAT BANK POS |
| status | `text NOT NULL` | SUCCEEDED FAILED |
| amount_cent | `bigint NOT NULL` | 本次尝试金额；CNY 不含税整数分 |
| attempted_at | `timestamptz NOT NULL` | 支付尝试时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, payment_id)
UNIQUE (tenant_id, payment_no)
UNIQUE (tenant_id, payment_id, order_id, region_id)
CHECK (status IN ('SUCCEEDED','FAILED'))
CHECK (amount_cent > 0)
CHECK (available_at >= attempted_at)
ALTER TABLE core.payment ADD CONSTRAINT fk_b25_00 FOREIGN KEY (tenant_id, order_id, region_id) REFERENCES core.order_header (tenant_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.payment ADD CONSTRAINT fk_b25_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.payment ADD CONSTRAINT fk_b25_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.refund

一次现金退款尝试。与销售冲减和实物入库分离；一笔退款引用一笔成功支付

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| refund_id | `bigint NOT NULL` | 退款 ID |
| payment_id | `bigint NOT NULL` | 原支付 |
| order_id | `bigint NOT NULL` | 订单 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| refund_no | `text NOT NULL` | 退款单号 |
| status | `text NOT NULL` | SUCCEEDED FAILED |
| refund_type | `text NOT NULL` | CANCEL RETURN |
| amount_cent | `bigint NOT NULL` | 退款尝试金额；CNY 不含税整数分 |
| attempted_at | `timestamptz NOT NULL` | 现金退款尝试时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, refund_id)
UNIQUE (tenant_id, refund_no)
UNIQUE (tenant_id, refund_id, order_id, region_id)
CHECK (status IN ('SUCCEEDED','FAILED'))
CHECK (refund_type IN ('CANCEL','RETURN'))
CHECK (amount_cent > 0)
CHECK (available_at >= attempted_at)
ALTER TABLE core.refund ADD CONSTRAINT fk_b26_00 FOREIGN KEY (tenant_id, payment_id, order_id, region_id) REFERENCES core.payment (tenant_id, payment_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.refund ADD CONSTRAINT fk_b26_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.refund ADD CONSTRAINT fk_b26_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.refund_allocation

一次退款分配到一个订单单件。可跨多笔原支付分拆退款；单件成功退款累计不得超过 net_cent

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| refund_allocation_id | `bigint NOT NULL` | 分摊 ID |
| refund_id | `bigint NOT NULL` | 退款 |
| order_id | `bigint NOT NULL` | 订单 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| order_unit_id | `bigint NOT NULL` | 单件 |
| amount_cent | `bigint NOT NULL` | 本次分摊退款；CNY 不含税整数分 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, refund_allocation_id)
UNIQUE (tenant_id, refund_id, order_unit_id)
CHECK (amount_cent > 0)
ALTER TABLE core.refund_allocation ADD CONSTRAINT fk_b27_00 FOREIGN KEY (tenant_id, refund_id, order_id, region_id) REFERENCES core.refund (tenant_id, refund_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.refund_allocation ADD CONSTRAINT fk_b27_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.refund_allocation ADD CONSTRAINT fk_b27_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.refund_allocation ADD CONSTRAINT fk_b27_03 FOREIGN KEY (tenant_id, order_unit_id, order_id, region_id) REFERENCES core.order_unit (tenant_id, order_unit_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.shipment

一张订单从一个地点发出的包裹或 POS 交付单。一次订单允许多个包裹；v1 每逻辑单件最多一次出库

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| shipment_id | `bigint NOT NULL` | 履约单 |
| order_id | `bigint NOT NULL` | 订单 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| from_site_id | `bigint NOT NULL` | 履约仓或店 |
| shipment_no | `text NOT NULL` | 履约单号 |
| fulfillment_type | `text NOT NULL` | DELIVERY PICKUP POS |
| created_at | `timestamptz NOT NULL` | 创建时刻 |
| promised_at | `timestamptz NOT NULL` | 承诺交付时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, shipment_id)
UNIQUE (tenant_id, shipment_no)
UNIQUE (tenant_id, shipment_id, order_id, region_id, from_site_id)
CHECK (fulfillment_type IN ('DELIVERY','PICKUP','POS'))
CHECK (promised_at >= created_at)
CHECK (available_at >= created_at)
ALTER TABLE core.shipment ADD CONSTRAINT fk_b28_00 FOREIGN KEY (tenant_id, order_id, region_id) REFERENCES core.order_header (tenant_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.shipment ADD CONSTRAINT fk_b28_01 FOREIGN KEY (tenant_id, from_site_id) REFERENCES core.site (tenant_id, site_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.shipment ADD CONSTRAINT fk_b28_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.shipment ADD CONSTRAINT fk_b28_03 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.shipment_item

一个包裹中的一个订单逻辑单件。固化从哪个库存批次出库；成本由成本台账确认

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| shipment_item_id | `bigint NOT NULL` | 履约单件 ID |
| shipment_id | `bigint NOT NULL` | 履约单 |
| order_unit_id | `bigint NOT NULL` | 订单单件 |
| order_id | `bigint NOT NULL` | 订单 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| sku_id | `bigint NOT NULL` | SKU |
| from_site_id | `bigint NOT NULL` | 出库地点 |
| lot_id | `bigint NOT NULL` | 出库批次 |
| shipped_at | `timestamptz NOT NULL` | 出库时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, shipment_item_id)
UNIQUE (tenant_id, order_unit_id)
UNIQUE (tenant_id, shipment_item_id, order_unit_id, region_id)
CHECK (available_at >= shipped_at)
ALTER TABLE core.shipment_item ADD CONSTRAINT fk_b29_00 FOREIGN KEY (tenant_id, shipment_id, order_id, region_id, from_site_id) REFERENCES core.shipment (tenant_id, shipment_id, order_id, region_id, from_site_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.shipment_item ADD CONSTRAINT fk_b29_01 FOREIGN KEY (tenant_id, order_unit_id, order_id, region_id, sku_id) REFERENCES core.order_unit (tenant_id, order_unit_id, order_id, region_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.shipment_item ADD CONSTRAINT fk_b29_02 FOREIGN KEY (tenant_id, lot_id, from_site_id, sku_id) REFERENCES core.inventory_lot (tenant_id, lot_id, site_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.shipment_item ADD CONSTRAINT fk_b29_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.shipment_item ADD CONSTRAINT fk_b29_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.shipment_event

一张履约单的一次物流状态事件。交付事件是收入确认依据；物流失败未交付不得认收入

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| shipment_event_id | `bigint NOT NULL` | 物流事件 |
| shipment_id | `bigint NOT NULL` | 履约单 |
| order_id | `bigint NOT NULL` | 订单 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| from_site_id | `bigint NOT NULL` | 出库地点 |
| event_seq | `integer NOT NULL` | 事件序号 |
| event_type | `text NOT NULL` | SHIPPED DELIVERED DELIVERY_FAILED RETURNED_TO_ORIGIN |
| event_at | `timestamptz NOT NULL` | 物流事件时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, shipment_event_id)
UNIQUE (tenant_id, shipment_id, event_seq)
CHECK (event_type IN ('SHIPPED','DELIVERED','DELIVERY_FAILED','RETURNED_TO_ORIGIN'))
CHECK (event_seq > 0)
CHECK (available_at >= event_at)
ALTER TABLE core.shipment_event ADD CONSTRAINT fk_b30_00 FOREIGN KEY (tenant_id, shipment_id, order_id, region_id, from_site_id) REFERENCES core.shipment (tenant_id, shipment_id, order_id, region_id, from_site_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.shipment_event ADD CONSTRAINT fk_b30_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.shipment_event ADD CONSTRAINT fk_b30_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.return_header

一张售后申请。可从跨区门店退货；销售归属保持原订单区域

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| return_id | `bigint NOT NULL` | 售后申请 ID |
| order_id | `bigint NOT NULL` | 原订单 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| return_no | `text NOT NULL` | 售后单号 |
| request_channel_id | `bigint NOT NULL` | 申请渠道 |
| receiving_site_id | `bigint` | 预计接收地点 |
| requested_at | `timestamptz NOT NULL` | 申请时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, return_id)
UNIQUE (tenant_id, return_no)
UNIQUE (tenant_id, return_id, order_id, region_id)
CHECK (available_at >= requested_at)
ALTER TABLE core.return_header ADD CONSTRAINT fk_b31_00 FOREIGN KEY (tenant_id, order_id, region_id) REFERENCES core.order_header (tenant_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.return_header ADD CONSTRAINT fk_b31_01 FOREIGN KEY (tenant_id, request_channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.return_header ADD CONSTRAINT fk_b31_02 FOREIGN KEY (tenant_id, receiving_site_id) REFERENCES core.site (tenant_id, site_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.return_header ADD CONSTRAINT fk_b31_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.return_header ADD CONSTRAINT fk_b31_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.return_item

一次售后对应一个已出库单件。v1 一个逻辑单件最多一条售后申请；换码拆退货与新订单且可不模拟

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| return_item_id | `bigint NOT NULL` | 售后单件 ID |
| return_id | `bigint NOT NULL` | 售后申请 |
| order_id | `bigint NOT NULL` | 原订单 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| order_unit_id | `bigint NOT NULL` | 原单件 |
| shipment_item_id | `bigint NOT NULL` | 原履约单件 |
| reason_code | `text NOT NULL` | SIZE QUALITY NOT_NEEDED DESCRIPTION OTHER |
| reason_description | `text NOT NULL` | 与原因码一致的合成客户描述，不包含验收前未知的结论 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, return_item_id)
UNIQUE (tenant_id, order_unit_id)
UNIQUE (tenant_id, return_item_id, order_unit_id, region_id)
CHECK (reason_code IN ('SIZE','QUALITY','NOT_NEEDED','DESCRIPTION','OTHER'))
ALTER TABLE core.return_item ADD CONSTRAINT fk_b32_00 FOREIGN KEY (tenant_id, return_id, order_id, region_id) REFERENCES core.return_header (tenant_id, return_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.return_item ADD CONSTRAINT fk_b32_01 FOREIGN KEY (tenant_id, shipment_item_id, order_unit_id, region_id) REFERENCES core.shipment_item (tenant_id, shipment_item_id, order_unit_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.return_item ADD CONSTRAINT fk_b32_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.return_item ADD CONSTRAINT fk_b32_03 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.return_item ADD CONSTRAINT fk_b32_04 FOREIGN KEY (tenant_id, order_unit_id, order_id, region_id) REFERENCES core.order_unit (tenant_id, order_unit_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.return_event

一个售后单件的一次状态事件。ACCEPTED 冲收入 RESTOCKED 冲原成本；现金退款另记

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| return_event_id | `bigint NOT NULL` | 售后事件 |
| return_item_id | `bigint NOT NULL` | 售后单件 |
| order_unit_id | `bigint NOT NULL` | 订单单件 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| event_seq | `integer NOT NULL` | 事件序号 |
| event_type | `text NOT NULL` | REQUESTED RECEIVED ACCEPTED REJECTED RESTOCKED DAMAGED SCRAPPED |
| site_id | `bigint` | 事件发生地点 无则 NULL |
| restocked_lot_id | `bigint` | 重新入库批次 非回库事件为 NULL |
| event_at | `timestamptz NOT NULL` | 业务事件时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, return_event_id)
UNIQUE (tenant_id, return_item_id, event_seq)
CHECK (event_type IN ('REQUESTED','RECEIVED','ACCEPTED','REJECTED','RESTOCKED','DAMAGED','SCRAPPED'))
CHECK (event_seq > 0)
CHECK (available_at >= event_at)
CHECK ((event_type = 'RESTOCKED') = (restocked_lot_id IS NOT NULL))
CHECK (event_type NOT IN ('RECEIVED','RESTOCKED','DAMAGED','SCRAPPED') OR site_id IS NOT NULL)
ALTER TABLE core.return_event ADD CONSTRAINT fk_b33_00 FOREIGN KEY (tenant_id, return_item_id, order_unit_id, region_id) REFERENCES core.return_item (tenant_id, return_item_id, order_unit_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.return_event ADD CONSTRAINT fk_b33_01 FOREIGN KEY (tenant_id, site_id) REFERENCES core.site (tenant_id, site_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.return_event ADD CONSTRAINT fk_b33_02 FOREIGN KEY (tenant_id, restocked_lot_id) REFERENCES core.inventory_lot (tenant_id, lot_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.return_event ADD CONSTRAINT fk_b33_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.return_event ADD CONSTRAINT fk_b33_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.inventory_lot

一批相同 SKU 成本的某地点库存。采购 转入 可售退货可新建批次；FIFO 出库并固化原成本

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| lot_id | `bigint NOT NULL` | 库存批次 |
| site_id | `bigint NOT NULL` | 地点 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| sku_id | `bigint NOT NULL` | SKU |
| parent_lot_id | `bigint` | 转移或退货来源批次 |
| cost_id | `bigint` | 新采购成本版本 退货转入可无 |
| received_at | `timestamptz NOT NULL` | 批次到达时刻 |
| unit_cost_cent | `bigint NOT NULL` | 本批单件成本；CNY 不含税整数分 |
| origin_type | `text NOT NULL` | OPENING PURCHASE TRANSFER RETURN |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, lot_id)
UNIQUE (tenant_id, lot_id, site_id, sku_id)
UNIQUE (tenant_id, lot_id, sku_id)
CHECK (unit_cost_cent >= 0)
CHECK (origin_type IN ('OPENING','PURCHASE','TRANSFER','RETURN'))
ALTER TABLE core.inventory_lot ADD CONSTRAINT fk_b34_00 FOREIGN KEY (tenant_id, site_id, region_id) REFERENCES core.site (tenant_id, site_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_lot ADD CONSTRAINT fk_b34_01 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_lot ADD CONSTRAINT fk_b34_02 FOREIGN KEY (tenant_id, cost_id) REFERENCES core.cost_period (tenant_id, cost_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_lot ADD CONSTRAINT fk_b34_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_lot ADD CONSTRAINT fk_b34_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_lot ADD CONSTRAINT fk_b34_05 FOREIGN KEY (tenant_id, parent_lot_id, sku_id) REFERENCES core.inventory_lot (tenant_id, lot_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.inventory_document

一笔采购 调拨 开账或处置业务单据。采购与补货有可观测的计划和实际时间，不只隐藏场景原因

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| inventory_doc_id | `bigint NOT NULL` | 库存业务单据 |
| document_no | `text NOT NULL` | 业务单号 |
| doc_type | `text NOT NULL` | OPENING PURCHASE TRANSFER DISPOSAL |
| from_site_id | `bigint` | 来源地点 采购开账可无 |
| to_site_id | `bigint NOT NULL` | 归属或目的地点 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| created_at | `timestamptz NOT NULL` | 单据创建时刻 |
| planned_at | `timestamptz NOT NULL` | 计划到达或处理时刻 |
| reason_code | `text NOT NULL` | NORMAL REPLENISHMENT DELAY CLEARANCE |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, inventory_doc_id)
UNIQUE (tenant_id, document_no)
UNIQUE (tenant_id, inventory_doc_id, region_id)
CHECK (doc_type IN ('OPENING','PURCHASE','TRANSFER','DISPOSAL'))
CHECK (planned_at >= created_at)
CHECK (available_at >= created_at)
ALTER TABLE core.inventory_document ADD CONSTRAINT fk_b35_00 FOREIGN KEY (tenant_id, from_site_id) REFERENCES core.site (tenant_id, site_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_document ADD CONSTRAINT fk_b35_01 FOREIGN KEY (tenant_id, to_site_id, region_id) REFERENCES core.site (tenant_id, site_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_document ADD CONSTRAINT fk_b35_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_document ADD CONSTRAINT fk_b35_03 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.inventory_document_line

库存业务单据中的一个 SKU。实际完成由库存流水决定，避免未来 actual_at 覆盖历史状态

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| inventory_doc_line_id | `bigint NOT NULL` | 单据行 |
| inventory_doc_id | `bigint NOT NULL` | 单据 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| sku_id | `bigint NOT NULL` | SKU |
| quantity | `integer NOT NULL` | 计划数量 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, inventory_doc_line_id)
UNIQUE (tenant_id, inventory_doc_id, sku_id)
CHECK (quantity > 0)
ALTER TABLE core.inventory_document_line ADD CONSTRAINT fk_b36_00 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_document_line ADD CONSTRAINT fk_b36_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_document_line ADD CONSTRAINT fk_b36_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_document_line ADD CONSTRAINT fk_b36_03 FOREIGN KEY (tenant_id, inventory_doc_id, region_id) REFERENCES core.inventory_document (tenant_id, inventory_doc_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.stock_allocation_attempt

一次订单锁库事务中一个候选地点 SKU 的尝试。包含失败尝试的可观察库存证据；整单验证后原子提交，失败不产生部分预留

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| allocation_attempt_id | `bigint NOT NULL` | 尝试行 ID |
| allocation_group_id | `bigint NOT NULL` | 全订单原子尝试组 |
| order_id | `bigint NOT NULL` | 已创建订单 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| site_id | `bigint NOT NULL` | 候选履约地点 |
| sku_id | `bigint NOT NULL` | 待预留 SKU |
| requested_qty | `integer NOT NULL` | 本地点拟承担数量 |
| available_before_qty | `integer NOT NULL` | 尝试前可承诺量 |
| outcome | `text NOT NULL` | COMMITTED INSUFFICIENT ROLLED_BACK |
| attempted_at | `timestamptz NOT NULL` | 锁库尝试时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, allocation_attempt_id)
UNIQUE (tenant_id, allocation_group_id, site_id, sku_id)
CHECK (requested_qty > 0)
CHECK (available_before_qty >= 0)
CHECK (outcome IN ('COMMITTED','INSUFFICIENT','ROLLED_BACK'))
CHECK (outcome <> 'COMMITTED' OR requested_qty <= available_before_qty)
CHECK (available_at >= attempted_at)
ALTER TABLE core.stock_allocation_attempt ADD CONSTRAINT fk_b37_00 FOREIGN KEY (tenant_id, order_id, region_id) REFERENCES core.order_header (tenant_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.stock_allocation_attempt ADD CONSTRAINT fk_b37_01 FOREIGN KEY (tenant_id, site_id) REFERENCES core.site (tenant_id, site_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.stock_allocation_attempt ADD CONSTRAINT fk_b37_02 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.stock_allocation_attempt ADD CONSTRAINT fk_b37_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.stock_allocation_attempt ADD CONSTRAINT fk_b37_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.inventory_movement

一个地点 SKU 批次的一次库存桶变化。可售 待检 损坏 预留 在途分开；同一 business_txn_id 原子提交，流水是库存真值

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| movement_id | `bigint NOT NULL` | 库存事件 ID |
| site_id | `bigint NOT NULL` | 地点 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| sku_id | `bigint NOT NULL` | SKU |
| lot_id | `bigint` | 物理批次 预留事件可无 |
| inventory_doc_line_id | `bigint` | 补货调拨等单据行 |
| order_unit_id | `bigint` | 订单单件引用 |
| return_item_id | `bigint` | 售后单件引用 |
| movement_type | `text NOT NULL` | OPENING RECEIPT RESERVE RELEASE SHIP RETURN_RECEIVE RESTOCK SCRAP TRANSFER_OUT TRANSIT_IN TRANSIT_OUT TRANSFER_IN DAMAGE RTO_RECEIPT |
| sellable_delta | `integer NOT NULL` | 可售物理库存变动 |
| quarantine_delta | `integer NOT NULL` | 隔离实物变动；包含待检与已接受退货后待恢复可售 |
| reserved_delta | `integer NOT NULL` | 预留量变动 |
| in_transit_delta | `integer NOT NULL` | 归目的地点的在途量变动 |
| event_at | `timestamptz NOT NULL` | 库存变动时刻 |
| event_seq | `bigint NOT NULL` | 租户内同时间排序号 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |
| damaged_delta | `integer NOT NULL` | 已判损坏尚未移出实物的数量变化 |
| business_txn_id | `bigint NOT NULL` | 原子业务提交 ID |
| source_kind | `text NOT NULL` | UNIT_EVENT SHIPMENT_EVENT RETURN_EVENT DOCUMENT_LINE |
| source_event_id | `bigint NOT NULL` | 对应源业务事件或单据行 ID |
| source_leg_no | `integer NOT NULL` | 同一来源拆出的稳定库存腿号 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, movement_id)
UNIQUE (tenant_id, source_kind, source_event_id, source_leg_no)
UNIQUE (tenant_id, event_seq)
CHECK (movement_type IN ('OPENING','RECEIPT','RESERVE','RELEASE','SHIP','RETURN_RECEIVE','RESTOCK','DAMAGE','SCRAP','RTO_RECEIPT','TRANSFER_OUT','TRANSIT_IN','TRANSIT_OUT','TRANSFER_IN'))
CHECK (sellable_delta <> 0 OR quarantine_delta <> 0 OR reserved_delta <> 0 OR in_transit_delta <> 0 OR damaged_delta <> 0)
CHECK (available_at >= event_at)
CHECK (source_kind IN ('UNIT_EVENT','SHIPMENT_EVENT','RETURN_EVENT','DOCUMENT_LINE'))
CHECK (source_leg_no > 0)
CHECK (event_seq > 0)
ALTER TABLE core.inventory_movement ADD CONSTRAINT fk_b38_00 FOREIGN KEY (tenant_id, site_id, region_id) REFERENCES core.site (tenant_id, site_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_movement ADD CONSTRAINT fk_b38_01 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_movement ADD CONSTRAINT fk_b38_02 FOREIGN KEY (tenant_id, lot_id, site_id, sku_id) REFERENCES core.inventory_lot (tenant_id, lot_id, site_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_movement ADD CONSTRAINT fk_b38_03 FOREIGN KEY (tenant_id, inventory_doc_line_id) REFERENCES core.inventory_document_line (tenant_id, inventory_doc_line_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_movement ADD CONSTRAINT fk_b38_04 FOREIGN KEY (tenant_id, order_unit_id) REFERENCES core.order_unit (tenant_id, order_unit_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_movement ADD CONSTRAINT fk_b38_05 FOREIGN KEY (tenant_id, return_item_id) REFERENCES core.return_item (tenant_id, return_item_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_movement ADD CONSTRAINT fk_b38_06 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_movement ADD CONSTRAINT fk_b38_07 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.inventory_snapshot

一个本地日末 地点 SKU 的有效库存快照。零库存仍保留；快照由当时已可见流水生成并带 cutoff；不跨日加总

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| snapshot_date | `date NOT NULL` | 当地自然日 |
| site_id | `bigint NOT NULL` | 地点 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| sku_id | `bigint NOT NULL` | SKU |
| sellable_qty | `integer NOT NULL` | 可售物理数 |
| quarantine_qty | `integer NOT NULL` | 隔离实物数；包含待检与已接受退货后待恢复可售 |
| damaged_qty | `integer NOT NULL` | 已判损坏尚未物理处置数量，不再计可售库存资产 |
| reserved_qty | `integer NOT NULL` | 预留数 |
| in_transit_qty | `integer NOT NULL` | 在途数 |
| available_qty | `integer NOT NULL` | 可售减预留 |
| as_of | `timestamptz NOT NULL` | 快照计算的信息截止时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, snapshot_date, site_id, sku_id, as_of)
CHECK (sellable_qty >= 0)
CHECK (quarantine_qty >= 0)
CHECK (reserved_qty BETWEEN 0 AND sellable_qty)
CHECK (in_transit_qty >= 0)
CHECK (available_qty = sellable_qty - reserved_qty)
CHECK (available_at >= as_of)
CHECK (damaged_qty >= 0)
ALTER TABLE core.inventory_snapshot ADD CONSTRAINT fk_b39_00 FOREIGN KEY (tenant_id, site_id, region_id) REFERENCES core.site (tenant_id, site_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_snapshot ADD CONSTRAINT fk_b39_01 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_snapshot ADD CONSTRAINT fk_b39_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_snapshot ADD CONSTRAINT fk_b39_03 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.inventory_valuation_snapshot

一个日末 地点 SKU 和观察截止的库存金额。由批次余额乘原批次成本汇总；只计可售物理库存，预留包含其中；待检和损坏不重复确认为存货资产

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| snapshot_date | `date NOT NULL` | 本地日末日期 |
| site_id | `bigint NOT NULL` | 地点 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| sku_id | `bigint NOT NULL` | SKU |
| as_of | `timestamptz NOT NULL` | 信息截止 |
| sellable_value_cent | `bigint NOT NULL` | 可售物理库存原批次成本合计；CNY 不含税整数分 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, snapshot_date, site_id, sku_id, as_of)
CHECK (sellable_value_cent >= 0)
CHECK (available_at >= as_of)
ALTER TABLE core.inventory_valuation_snapshot ADD CONSTRAINT fk_b40_00 FOREIGN KEY (tenant_id, site_id, region_id) REFERENCES core.site (tenant_id, site_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_valuation_snapshot ADD CONSTRAINT fk_b40_01 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_valuation_snapshot ADD CONSTRAINT fk_b40_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.inventory_valuation_snapshot ADD CONSTRAINT fk_b40_03 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.revenue_entry

一次单件收入确认或冲减。采用交付确认和退货接受口径；不替代法定总账

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| revenue_entry_id | `bigint NOT NULL` | 收入分录 |
| order_unit_id | `bigint NOT NULL` | 订单单件 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| entry_type | `text NOT NULL` | DELIVERY RETURN_ACCEPTED |
| shipment_event_id | `bigint` | 交付事件引用 |
| return_event_id | `bigint` | 退货接受事件引用 |
| quantity_delta | `smallint NOT NULL` | 销售 +1 退货 -1 |
| amount_cent | `bigint NOT NULL` | 有符号收入变动；CNY 不含税整数分 |
| recognized_at | `timestamptz NOT NULL` | 收入确认时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, revenue_entry_id)
UNIQUE (tenant_id, order_unit_id, entry_type)
CHECK ((entry_type = 'DELIVERY' AND quantity_delta = 1 AND amount_cent >= 0 AND shipment_event_id IS NOT NULL AND return_event_id IS NULL) OR (entry_type = 'RETURN_ACCEPTED' AND quantity_delta = -1 AND amount_cent <= 0 AND return_event_id IS NOT NULL AND shipment_event_id IS NULL))
CHECK (available_at >= recognized_at)
ALTER TABLE core.revenue_entry ADD CONSTRAINT fk_b41_00 FOREIGN KEY (tenant_id, order_unit_id, region_id) REFERENCES core.order_unit (tenant_id, order_unit_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.revenue_entry ADD CONSTRAINT fk_b41_01 FOREIGN KEY (tenant_id, shipment_event_id) REFERENCES core.shipment_event (tenant_id, shipment_event_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.revenue_entry ADD CONSTRAINT fk_b41_02 FOREIGN KEY (tenant_id, return_event_id) REFERENCES core.return_event (tenant_id, return_event_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.revenue_entry ADD CONSTRAINT fk_b41_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.revenue_entry ADD CONSTRAINT fk_b41_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.cost_entry

一次单件销售成本确认或冲回。交付计原批次成本；可售回库冲回原成本；损坏不冲回不二次扣损

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| cost_entry_id | `bigint NOT NULL` | 成本分录 |
| order_unit_id | `bigint NOT NULL` | 订单单件 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| entry_type | `text NOT NULL` | DELIVERY RESTOCK |
| lot_id | `bigint NOT NULL` | 原出库批次 |
| shipment_event_id | `bigint` | 交付事件 |
| return_event_id | `bigint` | 可售回库事件 |
| amount_cent | `bigint NOT NULL` | 有符号销售成本变动；增加成本为正；CNY 不含税整数分 |
| recognized_at | `timestamptz NOT NULL` | 成本确认或冲回时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, cost_entry_id)
UNIQUE (tenant_id, order_unit_id, entry_type)
CHECK ((entry_type = 'DELIVERY' AND amount_cent >= 0 AND shipment_event_id IS NOT NULL AND return_event_id IS NULL) OR (entry_type = 'RESTOCK' AND amount_cent <= 0 AND return_event_id IS NOT NULL AND shipment_event_id IS NULL))
CHECK (available_at >= recognized_at)
ALTER TABLE core.cost_entry ADD CONSTRAINT fk_b42_00 FOREIGN KEY (tenant_id, order_unit_id, region_id) REFERENCES core.order_unit (tenant_id, order_unit_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.cost_entry ADD CONSTRAINT fk_b42_01 FOREIGN KEY (tenant_id, lot_id) REFERENCES core.inventory_lot (tenant_id, lot_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.cost_entry ADD CONSTRAINT fk_b42_02 FOREIGN KEY (tenant_id, shipment_event_id) REFERENCES core.shipment_event (tenant_id, shipment_event_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.cost_entry ADD CONSTRAINT fk_b42_03 FOREIGN KEY (tenant_id, return_event_id) REFERENCES core.return_event (tenant_id, return_event_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.cost_entry ADD CONSTRAINT fk_b42_04 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.cost_entry ADD CONSTRAINT fk_b42_05 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.order_fee

订单对应的一笔经营变动费用。不含固定租金人力；费用冲回用负数；投放费在 campaign_daily 独立计

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| fee_id | `bigint NOT NULL` | 费用 ID |
| order_id | `bigint NOT NULL` | 订单 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| order_unit_id | `bigint` | 可以分配到单件；订单级费用为 NULL |
| fee_type | `text NOT NULL` | COMMISSION OUTBOUND_LOGISTICS RETURN_LOGISTICS PAYMENT_SERVICE |
| amount_cent | `bigint NOT NULL` | 有符号费用发生额；CNY 不含税整数分 |
| recognized_at | `timestamptz NOT NULL` | 费用确认时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |
| source_system | `text NOT NULL` | 费用来源系统 |
| source_fee_no | `text NOT NULL` | 来源费用唯一号；回调重试不得变号 |
| reversal_of_fee_id | `bigint` | 负费用冲回的原费用 ID，正费用为空 |
| source_event_kind | `text NOT NULL` | PAYMENT SHIPMENT RETURN REFUND |
| source_event_id | `bigint NOT NULL` | 费用发生依据的业务事件 ID |

约束与关联：

```sql
PRIMARY KEY (tenant_id, fee_id)
UNIQUE (tenant_id, source_system, source_fee_no)
UNIQUE (tenant_id, fee_id, order_id, region_id)
CHECK (fee_type IN ('COMMISSION','OUTBOUND_LOGISTICS','RETURN_LOGISTICS','PAYMENT_SERVICE'))
CHECK (available_at >= recognized_at)
CHECK ((amount_cent >= 0 AND reversal_of_fee_id IS NULL) OR (amount_cent < 0 AND reversal_of_fee_id IS NOT NULL))
CHECK (source_event_kind IN ('PAYMENT','SHIPMENT','RETURN','REFUND'))
ALTER TABLE core.order_fee ADD CONSTRAINT fk_b43_00 FOREIGN KEY (tenant_id, order_id, region_id) REFERENCES core.order_header (tenant_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_fee ADD CONSTRAINT fk_b43_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_fee ADD CONSTRAINT fk_b43_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_fee ADD CONSTRAINT fk_b43_03 FOREIGN KEY (tenant_id, order_unit_id, order_id, region_id) REFERENCES core.order_unit (tenant_id, order_unit_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_fee ADD CONSTRAINT fk_b43_04 FOREIGN KEY (tenant_id, reversal_of_fee_id, order_id, region_id) REFERENCES core.order_fee (tenant_id, fee_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.target_monthly

某月 渠道 大区的一项指标目标。v1 不同时混入集团总目标或品类目标；先聚合实际再关联

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| target_month | `date NOT NULL` | 月份第一天 |
| channel_id | `bigint NOT NULL` | 渠道 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| metric_code | `text NOT NULL` | NET_SALES CONTRIBUTION |
| target_cent | `bigint NOT NULL` | 目标金额 CNY整数分 |
| plan_version | `integer NOT NULL` | 目标版本 |
| approved_at | `timestamptz NOT NULL` | 批准时间 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, target_month, channel_id, region_id, metric_code, plan_version)
CHECK (extract(day FROM target_month) = 1)
CHECK (metric_code IN ('NET_SALES','CONTRIBUTION'))
CHECK (plan_version > 0)
CHECK (available_at >= approved_at)
ALTER TABLE core.target_monthly ADD CONSTRAINT fk_b44_00 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.target_monthly ADD CONSTRAINT fk_b44_01 FOREIGN KEY (tenant_id, region_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.target_monthly ADD CONSTRAINT fk_b44_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.target_monthly ADD CONSTRAINT fk_b44_03 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.campaign

一个营销活动。广告触达与订单下单渠道分离

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| campaign_id | `bigint NOT NULL` | 活动 ID |
| campaign_code | `text NOT NULL` | 活动代码 |
| campaign_name | `text NOT NULL` | 活动名称 |
| acquisition_source | `text NOT NULL` | 搜索 信息流 直播 私域等 |
| target_channel_id | `bigint` | 主要承接渠道 |
| starts_at | `timestamptz NOT NULL` | 活动起点 |
| ends_at | `timestamptz NOT NULL` | 活动终点 不含 |
| objective | `text NOT NULL` | ACQUISITION RETENTION CLEARANCE |
| available_at | `timestamptz NOT NULL` | 此计划或版本在源中首次发布可见时刻 |
| load_batch_id | `bigint NOT NULL` | 来源采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, campaign_id)
UNIQUE (tenant_id, campaign_code)
CHECK (starts_at < ends_at)
CHECK (objective IN ('ACQUISITION','RETENTION','CLEARANCE'))
ALTER TABLE core.campaign ADD CONSTRAINT fk_b45_00 FOREIGN KEY (tenant_id, target_channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.campaign ADD CONSTRAINT fk_b45_01 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.campaign ADD CONSTRAINT fk_b45_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.promotion

一个价格优惠规则。v1 只支持百分比优惠和满额减免；不含平台补贴和赠品

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| promotion_id | `bigint NOT NULL` | 优惠 ID |
| promotion_code | `text NOT NULL` | 优惠代码 |
| channel_id | `bigint NOT NULL` | 适用渠道 |
| campaign_id | `bigint` | 所属营销活动 允许无 |
| promotion_type | `text NOT NULL` | PERCENT THRESHOLD |
| discount_bps | `integer NOT NULL` | 折扣比例基点 0 至 10000 |
| threshold_cent | `bigint NOT NULL` | 门槛金额；CNY 不含税整数分 |
| discount_cent | `bigint NOT NULL` | 固定减免额；CNY 不含税整数分 |
| starts_at | `timestamptz NOT NULL` | 生效开始 |
| ends_at | `timestamptz NOT NULL` | 生效结束 不含 |
| priority_no | `integer NOT NULL` | 叠加排序 |
| available_at | `timestamptz NOT NULL` | 此计划或版本在源中首次发布可见时刻 |
| load_batch_id | `bigint NOT NULL` | 来源采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, promotion_id)
UNIQUE (tenant_id, promotion_code)
CHECK (promotion_type IN ('PERCENT','THRESHOLD'))
CHECK (discount_bps BETWEEN 0 AND 10000)
CHECK (threshold_cent >= 0)
CHECK (discount_cent >= 0)
CHECK (starts_at < ends_at)
ALTER TABLE core.promotion ADD CONSTRAINT fk_b46_00 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.promotion ADD CONSTRAINT fk_b46_01 FOREIGN KEY (tenant_id, campaign_id) REFERENCES core.campaign (tenant_id, campaign_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.promotion ADD CONSTRAINT fk_b46_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.promotion ADD CONSTRAINT fk_b46_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.web_session

自有线上渠道的一次会话。匿名访客与已绑定会员分别表达；平台渠道不生成此表

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| session_id | `bigint NOT NULL` | 会话 ID |
| channel_id | `bigint NOT NULL` | 自有渠道 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| identity_id | `bigint` | 识别出的渠道身份 |
| anonymous_token | `text NOT NULL` | 匿名设备会话令牌 |
| campaign_id | `bigint` | 可观察的活动来源 |
| started_at | `timestamptz NOT NULL` | 会话起点 |
| device_type | `text NOT NULL` | MOBILE DESKTOP TABLET |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, session_id)
UNIQUE (tenant_id, session_id, region_id)
CHECK (device_type IN ('MOBILE','DESKTOP','TABLET'))
CHECK (available_at >= started_at)
ALTER TABLE core.web_session ADD CONSTRAINT fk_b47_00 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.web_session ADD CONSTRAINT fk_b47_01 FOREIGN KEY (tenant_id, region_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.web_session ADD CONSTRAINT fk_b47_02 FOREIGN KEY (tenant_id, campaign_id) REFERENCES core.campaign (tenant_id, campaign_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.web_session ADD CONSTRAINT fk_b47_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.web_session ADD CONSTRAINT fk_b47_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.web_session ADD CONSTRAINT fk_b47_05 FOREIGN KEY (tenant_id, identity_id, channel_id) REFERENCES core.customer_identity (tenant_id, identity_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.behavior_event

一个可观察的会话行为事件。自有渠道完整同源轨迹；不可与订单独立随机生成

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| behavior_event_id | `bigint NOT NULL` | 事件 ID |
| session_id | `bigint NOT NULL` | 会话 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| event_seq | `integer NOT NULL` | 会话内递增序号 |
| event_type | `text NOT NULL` | PAGE_VIEW SEARCH PRODUCT_VIEW ADD_CART CHECKOUT_SUBMITTED CHECKOUT_REJECTED |
| search_query | `text` | 搜索事件的合成查询词，仅 SEARCH 可填写 |
| sku_id | `bigint` | 涉及 SKU 允许无 |
| order_id | `bigint` | 已创建的订单 允许无 |
| reason_code | `text NOT NULL` | NONE SOLD_OUT INVALID_CART |
| event_at | `timestamptz NOT NULL` | 行为发生时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, behavior_event_id)
UNIQUE (tenant_id, session_id, event_seq)
CHECK (event_type IN ('PAGE_VIEW','SEARCH','PRODUCT_VIEW','ADD_CART','CHECKOUT_SUBMITTED','CHECKOUT_REJECTED'))
CHECK (event_seq > 0)
CHECK (available_at >= event_at)
CHECK ((event_type = 'CHECKOUT_SUBMITTED') = (order_id IS NOT NULL))
CHECK (search_query IS NULL OR event_type = 'SEARCH')
ALTER TABLE core.behavior_event ADD CONSTRAINT fk_b48_00 FOREIGN KEY (tenant_id, session_id, region_id) REFERENCES core.web_session (tenant_id, session_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.behavior_event ADD CONSTRAINT fk_b48_01 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.behavior_event ADD CONSTRAINT fk_b48_02 FOREIGN KEY (tenant_id, order_id, region_id) REFERENCES core.order_header (tenant_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.behavior_event ADD CONSTRAINT fk_b48_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.behavior_event ADD CONSTRAINT fk_b48_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.campaign_daily

一个日 活动 承接渠道 经营区域。广告花费属于此粒度；不得直接连接订单明细后 SUM

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| report_date | `date NOT NULL` | 当地日期 |
| campaign_id | `bigint NOT NULL` | 活动 |
| channel_id | `bigint NOT NULL` | 承接渠道 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| impressions | `bigint NOT NULL` | 曝光数 |
| clicks | `bigint NOT NULL` | 点击数 |
| spend_cent | `bigint NOT NULL` | 当天广告花费；CNY 不含税整数分 |
| report_version | `integer NOT NULL` | 源报表版本 从1开始 |
| source_updated_at | `timestamptz NOT NULL` | 源报表更新时间 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, report_date, campaign_id, channel_id, region_id, report_version)
CHECK (impressions >= 0)
CHECK (clicks BETWEEN 0 AND impressions)
CHECK (spend_cent >= 0)
CHECK (report_version > 0)
CHECK (available_at >= source_updated_at)
ALTER TABLE core.campaign_daily ADD CONSTRAINT fk_b49_00 FOREIGN KEY (tenant_id, campaign_id) REFERENCES core.campaign (tenant_id, campaign_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.campaign_daily ADD CONSTRAINT fk_b49_01 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.campaign_daily ADD CONSTRAINT fk_b49_02 FOREIGN KEY (tenant_id, region_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.campaign_daily ADD CONSTRAINT fk_b49_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.campaign_daily ADD CONSTRAINT fk_b49_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.channel_product_daily

一个平台 日 渠道 SKU 区域的经营报表版本。只提供平台可见汇总；商品购买订单数不可跨 SKU 相加当独立订单数

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| report_date | `date NOT NULL` | 下单 cohort 的本地日期；支付随后到达则修订此日期版本 |
| channel_id | `bigint NOT NULL` | 平台渠道 |
| sku_id | `bigint NOT NULL` | SKU |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| product_views | `bigint NOT NULL` | 商品页访问事件数 PV |
| product_visitors | `bigint NOT NULL` | 商品页独立访客 UV |
| add_cart_users | `bigint NOT NULL` | 加购人数 |
| submitted_orders | `bigint NOT NULL` | 含本 SKU 的创建订单数 |
| paid_orders | `bigint NOT NULL` | 该创建日期 cohort 含本 SKU 的订单，截至版本可见时累计已足额支付单数 |
| paid_amount_cent | `bigint NOT NULL` | 该创建日期 cohort 已足额支付订单分配到本 SKU 的净额 CNY整数分；不是当日现金流 |
| report_version | `integer NOT NULL` | 源报表修订版本 |
| source_updated_at | `timestamptz NOT NULL` | 来源修订时间 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, report_date, channel_id, sku_id, region_id, report_version)
CHECK (product_views >= product_visitors)
CHECK (product_visitors >= 0)
CHECK (add_cart_users BETWEEN 0 AND product_visitors)
CHECK (submitted_orders >= 0)
CHECK (paid_orders BETWEEN 0 AND submitted_orders)
CHECK (paid_amount_cent >= 0)
CHECK (report_version > 0)
CHECK (available_at >= source_updated_at)
ALTER TABLE core.channel_product_daily ADD CONSTRAINT fk_b50_00 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.channel_product_daily ADD CONSTRAINT fk_b50_01 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.channel_product_daily ADD CONSTRAINT fk_b50_02 FOREIGN KEY (tenant_id, region_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.channel_product_daily ADD CONSTRAINT fk_b50_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.channel_product_daily ADD CONSTRAINT fk_b50_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.store_traffic_daily

一家门店一天的客流报表版本。客流是进店人次而非企业独立用户

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| report_date | `date NOT NULL` | 当地日期 |
| site_id | `bigint NOT NULL` | 门店 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| visits | `bigint NOT NULL` | 进店人次 |
| report_version | `integer NOT NULL` | 修订版本 |
| source_updated_at | `timestamptz NOT NULL` | 源更新时间 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, report_date, site_id, report_version)
CHECK (visits >= 0)
CHECK (report_version > 0)
CHECK (available_at >= source_updated_at)
ALTER TABLE core.store_traffic_daily ADD CONSTRAINT fk_b51_00 FOREIGN KEY (tenant_id, site_id, region_id) REFERENCES core.site (tenant_id, site_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.store_traffic_daily ADD CONSTRAINT fk_b51_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.store_traffic_daily ADD CONSTRAINT fk_b51_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.order_attribution

某归因模型版本对一张订单的一条触点归因。v1 LAST_NON_DIRECT_7D 最多一条每单；多触点扩展必须权重归一

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| attribution_id | `bigint NOT NULL` | 归因记录 ID |
| order_id | `bigint NOT NULL` | 订单 |
| region_id | `bigint NOT NULL` | 经营归属大区；与所属订单或地点一致 |
| campaign_id | `bigint` | 归因活动 无则自然或不可归因 |
| session_id | `bigint` | 可观察自有会话 平台可无 |
| touch_at | `timestamptz` | 触点时间 不可观测可空 |
| model_version | `text NOT NULL` | 固定 LAST_NON_DIRECT_7D_V1 |
| credit | `numeric(9,8) NOT NULL` | 归因权重 v1 固定1 |
| evidence_type | `text NOT NULL` | OWNED_TOUCH ORGANIC UNATTRIBUTABLE；平台仅有日聚合报表时必须 UNATTRIBUTABLE |
| computed_at | `timestamptz NOT NULL` | 归因计算时刻 |
| available_at | `timestamptz NOT NULL` | 源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效 |
| load_batch_id | `bigint NOT NULL` | 模拟采集批次；引用本租户采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, attribution_id)
UNIQUE (tenant_id, order_id, model_version)
CHECK (credit = 1)
CHECK (model_version = 'LAST_NON_DIRECT_7D_V1')
CHECK (evidence_type IN ('OWNED_TOUCH','ORGANIC','UNATTRIBUTABLE'))
CHECK (available_at >= computed_at)
CHECK ((evidence_type = 'OWNED_TOUCH' AND campaign_id IS NOT NULL AND session_id IS NOT NULL AND touch_at IS NOT NULL) OR (evidence_type IN ('ORGANIC','UNATTRIBUTABLE') AND campaign_id IS NULL AND session_id IS NULL AND touch_at IS NULL))
ALTER TABLE core.order_attribution ADD CONSTRAINT fk_b52_00 FOREIGN KEY (tenant_id, order_id, region_id) REFERENCES core.order_header (tenant_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_attribution ADD CONSTRAINT fk_b52_01 FOREIGN KEY (tenant_id, campaign_id) REFERENCES core.campaign (tenant_id, campaign_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_attribution ADD CONSTRAINT fk_b52_02 FOREIGN KEY (tenant_id, session_id) REFERENCES core.web_session (tenant_id, session_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_attribution ADD CONSTRAINT fk_b52_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_attribution ADD CONSTRAINT fk_b52_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.experiment_definition

一个预注册的双组会员随机实验。一个预注册的双组会员随机实验

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 业务企业租户 |
| experiment_id | `bigint NOT NULL` | 实验 ID |
| experiment_code | `text NOT NULL` | 租户内稳定实验代码 |
| channel_id | `bigint NOT NULL` | 固定自有承接渠道 |
| campaign_id | `bigint` | 关联活动，可空 |
| randomization_unit | `text NOT NULL` | 首版固定 CUSTOMER，按会员随机 |
| allocation_a | `numeric(9,8) NOT NULL` | 预注册 A 组概率，B 组为 1-A |
| starts_at | `timestamptz NOT NULL` | 实验起点，包含 |
| ends_at | `timestamptz NOT NULL` | 实验终点，不含 |
| primary_metric | `text NOT NULL` | 业务指标口径代码 |
| outcome_window_days | `integer NOT NULL` | 主结果观察天数 |
| guardrail_window_days | `integer NOT NULL` | 退款护栏成熟天数 |
| decision_rule | `jsonb NOT NULL` | 预注册效果/护栏/样本检查标准，不含私有效应真值 |
| registered_at | `timestamptz NOT NULL` | 预注册时刻 |
| available_at | `timestamptz NOT NULL` | 源可见时间 |
| load_batch_id | `bigint NOT NULL` | 采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, experiment_id)
UNIQUE (tenant_id, experiment_code)
UNIQUE (tenant_id, experiment_id, channel_id)
CHECK (randomization_unit = 'CUSTOMER')
CHECK (allocation_a > 0 AND allocation_a < 1)
CHECK (starts_at < ends_at)
CHECK (registered_at <= starts_at)
CHECK (available_at >= registered_at)
CHECK (available_at <= starts_at)
CHECK (outcome_window_days > 0)
CHECK (guardrail_window_days >= outcome_window_days)
CHECK (jsonb_typeof(decision_rule) = 'object')
ALTER TABLE core.experiment_definition ADD CONSTRAINT fk_b53_00 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.experiment_definition ADD CONSTRAINT fk_b53_01 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.experiment_definition ADD CONSTRAINT fk_b53_02 FOREIGN KEY (tenant_id, campaign_id) REFERENCES core.campaign (tenant_id, campaign_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.experiment_definition ADD CONSTRAINT fk_b53_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.experiment_assignment

一个实验中一个会员的首次分配，包含未转化者。一个实验中一个会员的首次分配，包含未转化者

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 业务企业租户 |
| experiment_id | `bigint NOT NULL` | 实验 ID |
| unit_id | `bigint NOT NULL` | 随机单元：core.customer.customer_id |
| variant | `text NOT NULL` | A 或 B |
| channel_id | `bigint NOT NULL` | 实验承接渠道 |
| region_id | `bigint NOT NULL` | 入组时固定经营区域 |
| assigned_at | `timestamptz NOT NULL` | 分流发生时刻 |
| available_at | `timestamptz NOT NULL` | 分流可见时刻 |
| load_batch_id | `bigint NOT NULL` | 采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, experiment_id, unit_id)
UNIQUE (tenant_id, experiment_id, unit_id, variant, channel_id, region_id)
CHECK (variant IN ('A','B'))
CHECK (available_at >= assigned_at)
ALTER TABLE core.experiment_assignment ADD CONSTRAINT fk_b54_00 FOREIGN KEY (tenant_id, experiment_id, channel_id) REFERENCES core.experiment_definition (tenant_id, experiment_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.experiment_assignment ADD CONSTRAINT fk_b54_01 FOREIGN KEY (tenant_id, unit_id) REFERENCES core.customer (tenant_id, customer_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.experiment_assignment ADD CONSTRAINT fk_b54_02 FOREIGN KEY (tenant_id, region_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.experiment_assignment ADD CONSTRAINT fk_b54_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.experiment_exposure

一次已分配会员的可追溯实验曝光。一次已分配会员的可追溯实验曝光

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 业务企业租户 |
| exposure_id | `bigint NOT NULL` | 曝光事件 ID |
| experiment_id | `bigint NOT NULL` | 实验 ID |
| unit_id | `bigint NOT NULL` | 随机会员单元 |
| variant | `text NOT NULL` | 必须与分配一致 |
| channel_id | `bigint NOT NULL` | 实验承接渠道 |
| region_id | `bigint NOT NULL` | 分配时经营区域 |
| session_id | `bigint` | 可关联自有会话 |
| exposed_at | `timestamptz NOT NULL` | 曝光发生时间 |
| available_at | `timestamptz NOT NULL` | 源可见时间 |
| load_batch_id | `bigint NOT NULL` | 采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, exposure_id)
CHECK (variant IN ('A','B'))
CHECK (available_at >= exposed_at)
ALTER TABLE core.experiment_exposure ADD CONSTRAINT fk_b55_00 FOREIGN KEY (tenant_id, experiment_id, unit_id, variant, channel_id, region_id) REFERENCES core.experiment_assignment (tenant_id, experiment_id, unit_id, variant, channel_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.experiment_exposure ADD CONSTRAINT fk_b55_01 FOREIGN KEY (tenant_id, session_id, region_id) REFERENCES core.web_session (tenant_id, session_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.experiment_exposure ADD CONSTRAINT fk_b55_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## ops.dataset_release

一行一个发布版本。一库仅激活一个版本；文件以 release_id 隔离

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| release_id | `text NOT NULL` | 不可变发布 ID |
| schema_version | `text NOT NULL` | 模型版本 |
| generator_commit | `text NOT NULL` | 定制生成器代码 commit |
| contoso_commit | `text` | 实际复用的 Contoso 固定提交；纯合成模式为空，不能伪造来源 |
| config_sha256 | `char(64) NOT NULL` | 规范化配置摘要 |
| catalog_sha256 | `char(64) NOT NULL` | 商品目录摘要 |
| master_seed | `bigint NOT NULL` | 全局随机种子 |
| order_start | `date NOT NULL` | 下单起始本地日期 |
| order_end_exclusive | `date NOT NULL` | 下单结束本地日期 不含 |
| simulation_end_exclusive | `date NOT NULL` | 事件推进截止本地日期 不含 |
| published_as_of | `timestamptz NOT NULL` | 此数据库允许的最大数据可见时刻 UTC |
| status | `text NOT NULL` | BUILDING VALIDATED PUBLISHED |
| created_at | `timestamptz NOT NULL` | 版本创建时刻 UTC |
| source_mode | `text NOT NULL` | CONTOSO_DERIVED 或 PURE_SYNTHETIC；如实记录实际来源 |

约束与关联：

```sql
PRIMARY KEY (release_id)
CHECK (status IN ('BUILDING','VALIDATED','PUBLISHED'))
CHECK (order_start < order_end_exclusive)
CHECK (order_end_exclusive < simulation_end_exclusive)
CHECK (source_mode IN ('CONTOSO_DERIVED','PURE_SYNTHETIC'))
CHECK ((source_mode = 'CONTOSO_DERIVED' AND contoso_commit IS NOT NULL) OR (source_mode = 'PURE_SYNTHETIC' AND contoso_commit IS NULL))
```

## ops.ingestion_batch

一个租户一个源的一次采集批次。独立区分业务发生与采集到达

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| batch_id | `bigint NOT NULL` | 批次 ID |
| source_system | `text NOT NULL` | PIM OMS POS WMS CRM ADS WEB ERP |
| source_from | `timestamptz NOT NULL` | 本批业务窗口起点 包含 |
| source_to | `timestamptz NOT NULL` | 本批业务窗口终点 不含 |
| received_at | `timestamptz NOT NULL` | 采集批次到达时刻 |
| status | `text NOT NULL` | READY DELAYED FAILED |
| row_count | `bigint NOT NULL` | 批次行数 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, batch_id)
CHECK (source_from < source_to)
CHECK (row_count >= 0)
CHECK (status IN ('READY','DELAYED','FAILED'))
ALTER TABLE ops.ingestion_batch ADD CONSTRAINT fk_b57_00 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## ops.generation_run

一次生成或恢复运行。代码 配置 输入指纹及检查点必须匹配才允许恢复

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| run_id | `text NOT NULL` | 运行 ID |
| release_id | `text NOT NULL` | 发布版本 |
| stage | `text NOT NULL` | ACQUIRE WEIGHTS CONTEXT PROPOSAL SIMULATE PUBLISH VALIDATE |
| status | `text NOT NULL` | RUNNING SUCCEEDED FAILED |
| started_at | `timestamptz NOT NULL` | 运行起点 |
| finished_at | `timestamptz` | 结束时间 |
| checkpoint_uri | `text` | 最新已提交检查点 |
| input_sha256 | `char(64) NOT NULL` | 输入规范化摘要 |

约束与关联：

```sql
PRIMARY KEY (run_id)
CHECK (status IN ('RUNNING','SUCCEEDED','FAILED'))
ALTER TABLE ops.generation_run ADD CONSTRAINT fk_b58_00 FOREIGN KEY (release_id) REFERENCES ops.dataset_release (release_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## ops.file_manifest

一份已提交的数据或配置文件。幂等提交与发布依据；不暴露给业务 Agent

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| file_id | `text NOT NULL` | 内容地址文件 ID |
| release_id | `text NOT NULL` | 发布版本 |
| run_id | `text NOT NULL` | 运行 |
| tenant_id | `smallint` | 业务租户 无则公共元数据 |
| asset_name | `text NOT NULL` | 逻辑表或资产名 |
| partition_key | `text NOT NULL` | 规范化分区键 |
| relative_path | `text NOT NULL` | 相对版本根的文件路径 |
| row_count | `bigint NOT NULL` | 逻辑行数 |
| byte_size | `bigint NOT NULL` | 字节数 |
| sha256 | `char(64) NOT NULL` | 物理文件摘要 |
| logical_sha256 | `char(64) NOT NULL` | 按规定排序的逻辑内容摘要 |
| schema_sha256 | `char(64) NOT NULL` | schema摘要 |
| committed_at | `timestamptz NOT NULL` | 提交时间 |

约束与关联：

```sql
PRIMARY KEY (file_id)
UNIQUE (release_id, relative_path)
CHECK (row_count >= 0)
CHECK (byte_size >= 0)
ALTER TABLE ops.file_manifest ADD CONSTRAINT fk_b59_00 FOREIGN KEY (release_id) REFERENCES ops.dataset_release (release_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE ops.file_manifest ADD CONSTRAINT fk_b59_01 FOREIGN KEY (run_id) REFERENCES ops.generation_run (run_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE ops.file_manifest ADD CONSTRAINT fk_b59_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## ops.source_watermark

某源在一个已观察时点的完整性水位。complete_through 由批次连续覆盖得到，不能使用 MAX(event_at)

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| source_system | `text NOT NULL` | 源系统 |
| observed_at | `timestamptz NOT NULL` | 检查时间 |
| complete_through | `timestamptz NOT NULL` | 确认完整的业务时间截止 不含 |
| expected_batches | `integer NOT NULL` | 应到批次数 |
| arrived_batches | `integer NOT NULL` | 已到批次数 |
| status | `text NOT NULL` | COMPLETE DELAYED FAILED |
| missing_batch_ids | `jsonb NOT NULL DEFAULT '[]'::jsonb` | 缺失批次 ID数组 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, source_system, observed_at)
CHECK (arrived_batches BETWEEN 0 AND expected_batches)
CHECK (status IN ('COMPLETE','DELAYED','FAILED'))
CHECK (complete_through <= observed_at)
ALTER TABLE ops.source_watermark ADD CONSTRAINT fk_b60_00 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## sec.principal

一个真实数据库登录身份。认证使用 session_user，禁止依赖任意 SQL 可改的 tenant GUC

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| db_role | `name NOT NULL` | 实际数据库登录角色名 |
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| persona | `text NOT NULL` | EXEC ANALYST REGION MARKETING |
| all_regions | `boolean NOT NULL` | 允许本租户全部区域 |
| can_view_cost | `boolean NOT NULL` | 允许采购成本 成本台账 与费用 |

约束与关联：

```sql
PRIMARY KEY (db_role)
UNIQUE (db_role, tenant_id)
CHECK (persona IN ('EXEC','ANALYST','REGION','MARKETING'))
ALTER TABLE sec.principal ADD CONSTRAINT fk_b61_00 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## sec.principal_region

登录角色的一条区域授权。仅受信任管理员可写

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| db_role | `name NOT NULL` | 登录角色 |
| tenant_id | `smallint NOT NULL` | 企业租户；101 主租户，102 和 103 隔离租户 |
| region_id | `bigint NOT NULL` | 授权大区 |

约束与关联：

```sql
PRIMARY KEY (db_role, tenant_id, region_id)
ALTER TABLE sec.principal_region ADD CONSTRAINT fk_b62_00 FOREIGN KEY (tenant_id, region_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE sec.principal_region ADD CONSTRAINT fk_b62_01 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE sec.principal_region ADD CONSTRAINT fk_b62_02 FOREIGN KEY (db_role, tenant_id) REFERENCES sec.principal (db_role, tenant_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.order_delivery_address

订单下单时固化的合成收件地址；非真实个人资料，门店即时购买无快递地址

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` | 所属企业 |
| order_id | `bigint NOT NULL` | 原订单 |
| region_id | `bigint NOT NULL` | 原订单销售归属区域，不自动等同收件区域 |
| recipient_name | `text NOT NULL` | 合成收件人，可与购买会员不同 |
| district_geo_id | `bigint NOT NULL` | 收件区县地理节点 |
| address_line | `text NOT NULL` | 标记为合成的街道、社区、楼栋门牌 |
| address_kind | `text NOT NULL` | 住宅、办公或临时地址 |
| captured_at | `timestamptz NOT NULL` | 下单时点 |
| available_at | `timestamptz NOT NULL` | 源中首次可见时间 |
| load_batch_id | `bigint NOT NULL` | 采集批次 |

约束与关联：

```sql
PRIMARY KEY (tenant_id, order_id)
CHECK (address_kind IN ('HOME','OFFICE','TEMPORARY'))
CHECK (available_at >= captured_at)
ALTER TABLE core.order_delivery_address ADD CONSTRAINT fk_address_order FOREIGN KEY (tenant_id, order_id, region_id) REFERENCES core.order_header (tenant_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_delivery_address ADD CONSTRAINT fk_address_geo FOREIGN KEY (tenant_id, district_geo_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE core.order_delivery_address ADD CONSTRAINT fk_address_batch FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;
```

## core.store_operating_day

逐门店每日营业覆盖声明；包含零成交日，单位分钟

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` |  |
| site_id | `bigint NOT NULL` |  |
| region_id | `bigint NOT NULL` |  |
| business_date | `date NOT NULL` |  |
| open_minutes | `integer NOT NULL` |  |
| reason_code | `text NOT NULL` |  |
| available_at | `timestamptz NOT NULL` |  |
| load_batch_id | `bigint NOT NULL` |  |

约束与关联：

```sql
PRIMARY KEY (tenant_id, site_id, business_date)
CHECK (open_minutes BETWEEN 0 AND 1440)
ALTER TABLE core.store_operating_day ADD CONSTRAINT store_operating_day_tenant_id_site_id_fk FOREIGN KEY (tenant_id, site_id) REFERENCES core.site (tenant_id, site_id);
ALTER TABLE core.store_operating_day ADD CONSTRAINT store_operating_day_tenant_id_load_batch_id_fk FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id);
```

## core.price_exposure

自有渠道真实浏览价格；匿名保持空identity，未成交浏览保留

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` |  |
| exposure_id | `bigint NOT NULL` |  |
| identity_id | `bigint` |  |
| session_id | `bigint NOT NULL` |  |
| sku_id | `bigint NOT NULL` |  |
| channel_id | `bigint NOT NULL` |  |
| region_id | `bigint NOT NULL` |  |
| price_id | `bigint NOT NULL` |  |
| shown_list_cent | `bigint NOT NULL` |  |
| shown_offer_cent | `bigint NOT NULL` |  |
| viewed_at | `timestamptz NOT NULL` |  |
| available_at | `timestamptz NOT NULL` |  |
| load_batch_id | `bigint NOT NULL` |  |

约束与关联：

```sql
PRIMARY KEY (tenant_id, exposure_id)
CHECK (shown_list_cent >= shown_offer_cent AND shown_offer_cent >= 0)
ALTER TABLE core.price_exposure ADD CONSTRAINT price_exposure_tenant_id_session_id_fk FOREIGN KEY (tenant_id, session_id) REFERENCES core.web_session (tenant_id, session_id);
ALTER TABLE core.price_exposure ADD CONSTRAINT price_exposure_tenant_id_sku_id_fk FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id);
ALTER TABLE core.price_exposure ADD CONSTRAINT price_exposure_tenant_id_price_id_fk FOREIGN KEY (tenant_id, price_id) REFERENCES core.price_period (tenant_id, price_id);
ALTER TABLE core.price_exposure ADD CONSTRAINT price_exposure_tenant_id_identity_id_fk FOREIGN KEY (tenant_id, identity_id) REFERENCES core.customer_identity (tenant_id, identity_id);
ALTER TABLE core.price_exposure ADD CONSTRAINT price_exposure_tenant_id_load_batch_id_fk FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id);
```

## core.campaign_attribution_daily

平台按原获客日期聚合的归因报告；退款回溯原队列；首购仅指本模拟历史内平台首购

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` |  |
| campaign_id | `bigint NOT NULL` |  |
| channel_id | `bigint NOT NULL` |  |
| cohort_date | `date NOT NULL` |  |
| attribution_model | `text NOT NULL` |  |
| model_version | `text NOT NULL` |  |
| report_version | `integer NOT NULL` |  |
| coverage_status | `text NOT NULL` |  |
| attributed_paid_cent | `bigint` |  |
| attributed_refund_cent | `bigint` |  |
| new_buyer_count | `integer` |  |
| new_buyer_definition | `text NOT NULL` |  |
| observed_at | `timestamptz NOT NULL` |  |
| available_at | `timestamptz NOT NULL` |  |
| load_batch_id | `bigint NOT NULL` |  |

约束与关联：

```sql
PRIMARY KEY (tenant_id, campaign_id, cohort_date, report_version)
CHECK (coverage_status IN ('KNOWN','UNKNOWN'))
CHECK (coverage_status <> 'UNKNOWN' OR (attributed_paid_cent IS NULL AND attributed_refund_cent IS NULL AND new_buyer_count IS NULL))
ALTER TABLE core.campaign_attribution_daily ADD CONSTRAINT campaign_attribution_daily_tenant_id_campaign_id_fk FOREIGN KEY (tenant_id, campaign_id) REFERENCES core.campaign (tenant_id, campaign_id);
ALTER TABLE core.campaign_attribution_daily ADD CONSTRAINT campaign_attribution_daily_tenant_id_load_batch_id_fk FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id);
```

## ops.asset_period_status

全租户指定资产业务日的历史完整度声明；源watermark仍只表示采集状态

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` |  |
| asset_id | `text NOT NULL` |  |
| period_start | `date NOT NULL` |  |
| period_end | `date NOT NULL` |  |
| observed_at | `timestamptz NOT NULL` |  |
| status | `text NOT NULL` |  |
| reason_code | `text NOT NULL` |  |
| last_visible_report_version | `integer` |  |
| source_coverage_end | `timestamptz` |  |
| reconciled_at | `timestamptz` |  |
| available_at | `timestamptz NOT NULL` |  |

约束与关联：

```sql
PRIMARY KEY (tenant_id, asset_id, period_start, period_end, observed_at)
CHECK (period_end > period_start)
CHECK (status IN ('PENDING','PARTIAL','COMPLETE'))
CHECK (available_at >= observed_at)
CHECK (status <> 'COMPLETE' OR (source_coverage_end IS NOT NULL AND source_coverage_end >= (period_end::timestamp AT TIME ZONE 'Asia/Shanghai') AND reconciled_at IS NOT NULL AND reconciled_at <= observed_at))
ALTER TABLE ops.asset_period_status ADD CONSTRAINT asset_period_status_tenant_id_fk FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id);
```

## core.intervention_definition

预登记价格观察方案；未复购采用固定60日窗，不将短期减少解释成永久流失

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` |  |
| intervention_id | `text NOT NULL` |  |
| channel_id | `bigint NOT NULL` |  |
| starts_at | `timestamptz NOT NULL` |  |
| registered_at | `timestamptz NOT NULL` |  |
| pre_weeks | `integer NOT NULL` |  |
| post_weeks | `integer NOT NULL` |  |
| outcome_definition | `text NOT NULL` |  |
| identification_limit | `text NOT NULL` |  |
| available_at | `timestamptz NOT NULL` |  |
| load_batch_id | `bigint NOT NULL` |  |

约束与关联：

```sql
PRIMARY KEY (tenant_id, intervention_id)
ALTER TABLE core.intervention_definition ADD CONSTRAINT intervention_definition_tenant_id_channel_id_fk FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id);
ALTER TABLE core.intervention_definition ADD CONSTRAINT intervention_definition_tenant_id_load_batch_id_fk FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id);
```

## core.intervention_cohort

干预前形成的会员队列；包含之后完全不购买者，分组按事先产品偏好定义

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` |  |
| intervention_id | `text NOT NULL` |  |
| customer_id | `bigint NOT NULL` |  |
| identity_id | `bigint NOT NULL` |  |
| sku_id | `bigint NOT NULL` |  |
| region_id | `bigint NOT NULL` |  |
| cohort_group | `text NOT NULL` |  |
| eligible_at | `timestamptz NOT NULL` |  |
| available_at | `timestamptz NOT NULL` |  |
| load_batch_id | `bigint NOT NULL` |  |

约束与关联：

```sql
PRIMARY KEY (tenant_id, intervention_id, customer_id)
CHECK (cohort_group IN ('TREATED','CONTROL'))
ALTER TABLE core.intervention_cohort ADD CONSTRAINT intervention_cohort_tenant_id_intervention_id_fk FOREIGN KEY (tenant_id, intervention_id) REFERENCES core.intervention_definition (tenant_id, intervention_id);
ALTER TABLE core.intervention_cohort ADD CONSTRAINT intervention_cohort_tenant_id_customer_id_fk FOREIGN KEY (tenant_id, customer_id) REFERENCES core.customer (tenant_id, customer_id);
ALTER TABLE core.intervention_cohort ADD CONSTRAINT intervention_cohort_tenant_id_identity_id_fk FOREIGN KEY (tenant_id, identity_id) REFERENCES core.customer_identity (tenant_id, identity_id);
ALTER TABLE core.intervention_cohort ADD CONSTRAINT intervention_cohort_tenant_id_sku_id_fk FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id);
ALTER TABLE core.intervention_cohort ADD CONSTRAINT intervention_cohort_tenant_id_load_batch_id_fk FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id);
```

## core.procurement_revision

采购预计到货修订通知；不覆盖采购单原计划日期

| 字段 | SQL 定义 | 说明 |
|---|---|---|
| tenant_id | `smallint NOT NULL` |  |
| inventory_doc_line_id | `bigint NOT NULL` |  |
| revision_no | `integer NOT NULL` |  |
| region_id | `bigint NOT NULL` |  |
| notified_at | `timestamptz NOT NULL` |  |
| revised_due_at | `timestamptz NOT NULL` |  |
| reason_code | `text NOT NULL` |  |
| notice_text | `text NOT NULL` |  |
| available_at | `timestamptz NOT NULL` |  |
| load_batch_id | `bigint NOT NULL` |  |

约束与关联：

```sql
PRIMARY KEY (tenant_id, inventory_doc_line_id, revision_no)
ALTER TABLE core.procurement_revision ADD CONSTRAINT procurement_revision_tenant_id_inventory_doc_line_id_fk FOREIGN KEY (tenant_id, inventory_doc_line_id) REFERENCES core.inventory_document_line (tenant_id, inventory_doc_line_id);
ALTER TABLE core.procurement_revision ADD CONSTRAINT procurement_revision_tenant_id_load_batch_id_fk FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id);
```

