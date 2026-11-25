-- Generated from tools/build_contract.py. One database per immutable dataset release.

-- PostgreSQL 17. All CREATE statements run once in a new empty database.

BEGIN;

SET TIME ZONE 'UTC';

CREATE SCHEMA IF NOT EXISTS core;

CREATE SCHEMA IF NOT EXISTS ops;

CREATE SCHEMA IF NOT EXISTS sec;

CREATE SCHEMA IF NOT EXISTS eval;

CREATE SCHEMA IF NOT EXISTS mart;

CREATE TABLE ops.dataset_release (
    release_id text NOT NULL,
    schema_version text NOT NULL,
    generator_commit text NOT NULL,
    contoso_commit text NOT NULL,
    config_sha256 char(64) NOT NULL,
    catalog_sha256 char(64) NOT NULL,
    master_seed bigint NOT NULL,
    order_start date NOT NULL,
    order_end_exclusive date NOT NULL,
    simulation_end_exclusive date NOT NULL,
    published_as_of timestamptz NOT NULL,
    status text NOT NULL,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (release_id),
    CHECK (status IN ('BUILDING','VALIDATED','PUBLISHED')),
    CHECK (order_start < order_end_exclusive),
    CHECK (order_end_exclusive < simulation_end_exclusive)
);

COMMENT ON TABLE ops.dataset_release IS '一行一个发布版本。一库仅激活一个版本；文件以 release_id 隔离';

COMMENT ON COLUMN ops.dataset_release.release_id IS '不可变发布 ID';

COMMENT ON COLUMN ops.dataset_release.schema_version IS '模型版本';

COMMENT ON COLUMN ops.dataset_release.generator_commit IS '定制生成器代码 commit';

COMMENT ON COLUMN ops.dataset_release.contoso_commit IS '上游固定 commit';

COMMENT ON COLUMN ops.dataset_release.config_sha256 IS '规范化配置摘要';

COMMENT ON COLUMN ops.dataset_release.catalog_sha256 IS '商品目录摘要';

COMMENT ON COLUMN ops.dataset_release.master_seed IS '全局随机种子';

COMMENT ON COLUMN ops.dataset_release.order_start IS '下单起始本地日期';

COMMENT ON COLUMN ops.dataset_release.order_end_exclusive IS '下单结束本地日期 不含';

COMMENT ON COLUMN ops.dataset_release.simulation_end_exclusive IS '事件推进截止本地日期 不含';

COMMENT ON COLUMN ops.dataset_release.published_as_of IS '此数据库允许的最大数据可见时刻 UTC';

COMMENT ON COLUMN ops.dataset_release.status IS 'BUILDING VALIDATED PUBLISHED';

COMMENT ON COLUMN ops.dataset_release.created_at IS '版本创建时刻 UTC';

CREATE TABLE core.tenant (
    tenant_id smallint NOT NULL,
    tenant_code text NOT NULL,
    tenant_name text NOT NULL,
    timezone text NOT NULL,
    currency char(3) NOT NULL,
    order_quota bigint NOT NULL,
    release_id text NOT NULL,
    PRIMARY KEY (tenant_id),
    UNIQUE (tenant_code),
    CHECK (timezone = 'Asia/Shanghai'),
    CHECK (currency = 'CNY'),
    CHECK (order_quota > 0)
);

COMMENT ON TABLE core.tenant IS '一个独立经营企业。SaaS 隔离边界；品牌与地区不是租户';

COMMENT ON COLUMN core.tenant.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.tenant.tenant_code IS '稳定企业代码';

COMMENT ON COLUMN core.tenant.tenant_name IS '虚构企业名称';

COMMENT ON COLUMN core.tenant.timezone IS 'v1 固定 Asia/Shanghai';

COMMENT ON COLUMN core.tenant.currency IS 'v1 固定 CNY';

COMMENT ON COLUMN core.tenant.order_quota IS '本版本精确订单头配额';

COMMENT ON COLUMN core.tenant.release_id IS '数据版本';

CREATE TABLE ops.ingestion_batch (
    tenant_id smallint NOT NULL,
    batch_id bigint NOT NULL,
    source_system text NOT NULL,
    source_from timestamptz NOT NULL,
    source_to timestamptz NOT NULL,
    received_at timestamptz NOT NULL,
    status text NOT NULL,
    row_count bigint NOT NULL,
    PRIMARY KEY (tenant_id, batch_id),
    CHECK (source_from < source_to),
    CHECK (row_count >= 0),
    CHECK (status IN ('READY','DELAYED','FAILED'))
);

COMMENT ON TABLE ops.ingestion_batch IS '一个租户一个源的一次采集批次。独立区分业务发生与采集到达';

COMMENT ON COLUMN ops.ingestion_batch.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN ops.ingestion_batch.batch_id IS '批次 ID';

COMMENT ON COLUMN ops.ingestion_batch.source_system IS 'PIM OMS POS WMS CRM ADS WEB ERP';

COMMENT ON COLUMN ops.ingestion_batch.source_from IS '本批业务窗口起点 包含';

COMMENT ON COLUMN ops.ingestion_batch.source_to IS '本批业务窗口终点 不含';

COMMENT ON COLUMN ops.ingestion_batch.received_at IS '采集批次到达时刻';

COMMENT ON COLUMN ops.ingestion_batch.status IS 'READY DELAYED FAILED';

COMMENT ON COLUMN ops.ingestion_batch.row_count IS '批次行数';

CREATE TABLE core.geo_area (
    tenant_id smallint NOT NULL,
    geo_id bigint NOT NULL,
    parent_geo_id bigint,
    geo_level text NOT NULL,
    geo_code text NOT NULL,
    geo_name text NOT NULL,
    region_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, geo_id),
    UNIQUE (tenant_id, geo_code),
    CHECK (geo_level IN ('REGION','PROVINCE','CITY'))
);

COMMENT ON TABLE core.geo_area IS '一个地理节点。经营大区 省份 城市的稳定层级；不模拟行政区划变化';

COMMENT ON COLUMN core.geo_area.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.geo_area.geo_id IS '地理节点';

COMMENT ON COLUMN core.geo_area.parent_geo_id IS '父地理节点';

COMMENT ON COLUMN core.geo_area.geo_level IS 'REGION PROVINCE CITY';

COMMENT ON COLUMN core.geo_area.geo_code IS '内部稳定代码';

COMMENT ON COLUMN core.geo_area.geo_name IS '地理名称';

COMMENT ON COLUMN core.geo_area.region_id IS '所属大区的 geo_id；大区自身引用自身';

CREATE TABLE core.org_unit (
    tenant_id smallint NOT NULL,
    org_unit_id bigint NOT NULL,
    parent_org_unit_id bigint,
    org_code text NOT NULL,
    org_name text NOT NULL,
    org_type text NOT NULL,
    PRIMARY KEY (tenant_id, org_unit_id),
    UNIQUE (tenant_id, org_code),
    CHECK (org_type IN ('GROUP','REGION','STORE','ECOM'))
);

COMMENT ON TABLE core.org_unit IS '一个经营组织。组织与区域分别建模；v1 组织归属不随历史变动';

COMMENT ON COLUMN core.org_unit.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.org_unit.org_unit_id IS '组织 ID';

COMMENT ON COLUMN core.org_unit.parent_org_unit_id IS '上级组织';

COMMENT ON COLUMN core.org_unit.org_code IS '组织代码';

COMMENT ON COLUMN core.org_unit.org_name IS '组织名称';

COMMENT ON COLUMN core.org_unit.org_type IS 'GROUP REGION STORE ECOM';

CREATE TABLE core.site (
    tenant_id smallint NOT NULL,
    site_id bigint NOT NULL,
    site_code text NOT NULL,
    site_name text NOT NULL,
    site_type text NOT NULL,
    org_unit_id bigint NOT NULL,
    geo_id bigint NOT NULL,
    region_id bigint NOT NULL,
    opened_on date NOT NULL,
    closed_on date,
    area_sqm integer NOT NULL,
    PRIMARY KEY (tenant_id, site_id),
    UNIQUE (tenant_id, site_code),
    UNIQUE (tenant_id, site_id, region_id),
    CHECK (site_type IN ('STORE','OUTLET','WAREHOUSE')),
    CHECK (area_sqm > 0),
    CHECK (closed_on IS NULL OR opened_on < closed_on)
);

COMMENT ON TABLE core.site IS '一个实体门店或仓库。统一地点模型；下单渠道和履约地点分离；地点地址与名称是租户内共享维度，地点经营事实另按实际区域授权';

COMMENT ON COLUMN core.site.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.site.site_id IS '地点 ID';

COMMENT ON COLUMN core.site.site_code IS '门店或仓库代码';

COMMENT ON COLUMN core.site.site_name IS '地点名称';

COMMENT ON COLUMN core.site.site_type IS 'STORE OUTLET WAREHOUSE';

COMMENT ON COLUMN core.site.org_unit_id IS '经营组织';

COMMENT ON COLUMN core.site.geo_id IS '所在城市';

COMMENT ON COLUMN core.site.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.site.opened_on IS '开业日 包含';

COMMENT ON COLUMN core.site.closed_on IS '关闭日 不含';

COMMENT ON COLUMN core.site.area_sqm IS '门店或仓库面积 平方米';

CREATE TABLE core.channel (
    tenant_id smallint NOT NULL,
    channel_id bigint NOT NULL,
    channel_code text NOT NULL,
    channel_name text NOT NULL,
    channel_type text NOT NULL,
    has_user_events boolean NOT NULL,
    identity_scope text NOT NULL,
    PRIMARY KEY (tenant_id, channel_id),
    UNIQUE (tenant_id, channel_code),
    CHECK (channel_type IN ('PLATFORM','OWNED','OFFLINE')),
    CHECK (identity_scope IN ('CHANNEL','MEMBER','MIXED')),
    CHECK (NOT has_user_events OR channel_type = 'OWNED')
);

COMMENT ON TABLE core.channel IS '一个销售渠道。营销活动来源单独在 campaign 中定义';

COMMENT ON COLUMN core.channel.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.channel.channel_id IS '渠道 ID';

COMMENT ON COLUMN core.channel.channel_code IS 'TMALL JD DOUYIN MINIAPP APP POS OUTLET';

COMMENT ON COLUMN core.channel.channel_name IS '渠道名称';

COMMENT ON COLUMN core.channel.channel_type IS 'PLATFORM OWNED OFFLINE';

COMMENT ON COLUMN core.channel.has_user_events IS '是否提供逐用户事件';

COMMENT ON COLUMN core.channel.identity_scope IS 'CHANNEL MEMBER MIXED';

CREATE TABLE core.brand (
    tenant_id smallint NOT NULL,
    brand_id bigint NOT NULL,
    brand_code text NOT NULL,
    brand_name text NOT NULL,
    positioning text NOT NULL,
    PRIMARY KEY (tenant_id, brand_id),
    UNIQUE (tenant_id, brand_code)
);

COMMENT ON TABLE core.brand IS '一个自有品牌。品牌归属唯一租户';

COMMENT ON COLUMN core.brand.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.brand.brand_id IS '品牌 ID';

COMMENT ON COLUMN core.brand.brand_code IS '品牌代码';

COMMENT ON COLUMN core.brand.brand_name IS '品牌名称';

COMMENT ON COLUMN core.brand.positioning IS '大众 专业跑步 户外等定位';

CREATE TABLE core.category (
    tenant_id smallint NOT NULL,
    category_id bigint NOT NULL,
    parent_category_id bigint,
    category_code text NOT NULL,
    category_name text NOT NULL,
    level_no smallint NOT NULL,
    is_leaf boolean NOT NULL,
    PRIMARY KEY (tenant_id, category_id),
    UNIQUE (tenant_id, category_code),
    CHECK (level_no IN (1,2))
);

COMMENT ON TABLE core.category IS '一个商品分类节点。每个 SPU 仅属于一个叶子分类';

COMMENT ON COLUMN core.category.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.category.category_id IS '分类 ID';

COMMENT ON COLUMN core.category.parent_category_id IS '父分类';

COMMENT ON COLUMN core.category.category_code IS '分类代码';

COMMENT ON COLUMN core.category.category_name IS '分类名称';

COMMENT ON COLUMN core.category.level_no IS '一级或二级';

COMMENT ON COLUMN core.category.is_leaf IS '是否允许挂接 SPU';

CREATE TABLE core.sport (
    tenant_id smallint NOT NULL,
    sport_id bigint NOT NULL,
    sport_code text NOT NULL,
    sport_name text NOT NULL,
    PRIMARY KEY (tenant_id, sport_id),
    UNIQUE (tenant_id, sport_code)
);

COMMENT ON TABLE core.sport IS '一个运动标签。多标签统计必须去重；非财务加总层级';

COMMENT ON COLUMN core.sport.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.sport.sport_id IS '标签 ID';

COMMENT ON COLUMN core.sport.sport_code IS '运动代码';

COMMENT ON COLUMN core.sport.sport_name IS '跑步 露营 游泳等';

CREATE TABLE core.spu (
    tenant_id smallint NOT NULL,
    spu_id bigint NOT NULL,
    brand_id bigint NOT NULL,
    category_id bigint NOT NULL,
    spu_code text NOT NULL,
    spu_name text NOT NULL,
    audience text NOT NULL,
    season_code text NOT NULL,
    launch_on date NOT NULL,
    discontinue_on date,
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (tenant_id, spu_id),
    UNIQUE (tenant_id, spu_code),
    CHECK (audience IN ('UNISEX','MEN','WOMEN','CHILDREN')),
    CHECK (season_code IN ('ALL','SPRING_SUMMER','AUTUMN_WINTER')),
    CHECK (discontinue_on IS NULL OR discontinue_on > launch_on)
);

COMMENT ON TABLE core.spu IS '一款标准商品。品牌与主品类为独立属性';

COMMENT ON COLUMN core.spu.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.spu.spu_id IS 'SPU ID';

COMMENT ON COLUMN core.spu.brand_id IS '自有品牌';

COMMENT ON COLUMN core.spu.category_id IS '唯一叶子分类';

COMMENT ON COLUMN core.spu.spu_code IS '款式代码';

COMMENT ON COLUMN core.spu.spu_name IS '规范化商品名称';

COMMENT ON COLUMN core.spu.audience IS 'UNISEX MEN WOMEN CHILDREN';

COMMENT ON COLUMN core.spu.season_code IS 'ALL SPRING_SUMMER AUTUMN_WINTER';

COMMENT ON COLUMN core.spu.launch_on IS '上新日期';

COMMENT ON COLUMN core.spu.discontinue_on IS '停止新销售日期 不含';

COMMENT ON COLUMN core.spu.attributes IS '长尾非分析主轴属性';

CREATE TABLE core.spu_sport (
    tenant_id smallint NOT NULL,
    spu_id bigint NOT NULL,
    sport_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, spu_id, sport_id)
);

COMMENT ON TABLE core.spu_sport IS '一个 SPU 与运动标签的关系。只能作为筛选或去重后的标签分析';

COMMENT ON COLUMN core.spu_sport.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.spu_sport.spu_id IS 'SPU';

COMMENT ON COLUMN core.spu_sport.sport_id IS '运动标签';

CREATE TABLE core.sku (
    tenant_id smallint NOT NULL,
    sku_id bigint NOT NULL,
    spu_id bigint NOT NULL,
    sku_code text NOT NULL,
    color_code text NOT NULL,
    size_system text NOT NULL,
    size_value text NOT NULL,
    spec_key text NOT NULL,
    weight_grams integer NOT NULL,
    launch_on date NOT NULL,
    discontinue_on date,
    PRIMARY KEY (tenant_id, sku_id),
    UNIQUE (tenant_id, sku_code),
    UNIQUE (tenant_id, spu_id, spec_key),
    CHECK (weight_grams > 0),
    CHECK (discontinue_on IS NULL OR discontinue_on > launch_on)
);

COMMENT ON TABLE core.sku IS '一个可售商品规格。并非所有品类均按颜色乘尺码做笛卡尔积';

COMMENT ON COLUMN core.sku.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.sku.sku_id IS 'SKU ID';

COMMENT ON COLUMN core.sku.spu_id IS '所属 SPU';

COMMENT ON COLUMN core.sku.sku_code IS '企业统一 SKU 编码';

COMMENT ON COLUMN core.sku.color_code IS '颜色 不适用时 NA';

COMMENT ON COLUMN core.sku.size_system IS 'CN_SHOE ALPHA CAPACITY WEIGHT MODEL NA';

COMMENT ON COLUMN core.sku.size_value IS '例如 42 XL 30L 5KG';

COMMENT ON COLUMN core.sku.spec_key IS '规范化规格组合键';

COMMENT ON COLUMN core.sku.weight_grams IS '单件克重';

COMMENT ON COLUMN core.sku.launch_on IS '可售开始';

COMMENT ON COLUMN core.sku.discontinue_on IS '可售结束 不含';

CREATE TABLE core.channel_listing (
    tenant_id smallint NOT NULL,
    listing_id bigint NOT NULL,
    channel_id bigint NOT NULL,
    external_sku_code text NOT NULL,
    sku_id bigint NOT NULL,
    valid_from timestamptz NOT NULL,
    valid_to timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, listing_id),
    UNIQUE (tenant_id, channel_id, external_sku_code, valid_from),
    UNIQUE (tenant_id, listing_id, sku_id, channel_id),
    CHECK (valid_from < valid_to)
);

COMMENT ON TABLE core.channel_listing IS '某渠道商品编码的一个有效版本。保留平台编码与统一 SKU 的多对一映射';

COMMENT ON COLUMN core.channel_listing.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.channel_listing.listing_id IS '映射版本 ID';

COMMENT ON COLUMN core.channel_listing.channel_id IS '销售渠道';

COMMENT ON COLUMN core.channel_listing.external_sku_code IS '平台编码';

COMMENT ON COLUMN core.channel_listing.sku_id IS '统一 SKU';

COMMENT ON COLUMN core.channel_listing.valid_from IS '有效开始 包含';

COMMENT ON COLUMN core.channel_listing.valid_to IS '有效结束 不含';

COMMENT ON COLUMN core.channel_listing.available_at IS '此计划或版本在源中首次发布可见时刻';

COMMENT ON COLUMN core.channel_listing.load_batch_id IS '来源采集批次';

CREATE TABLE core.assortment (
    tenant_id smallint NOT NULL,
    assortment_id bigint NOT NULL,
    site_id bigint NOT NULL,
    region_id bigint NOT NULL,
    sku_id bigint NOT NULL,
    valid_from date NOT NULL,
    valid_to date NOT NULL,
    can_sell boolean NOT NULL,
    min_stock integer NOT NULL,
    target_stock integer NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, assortment_id),
    UNIQUE (tenant_id, site_id, sku_id, valid_from),
    CHECK (valid_from < valid_to),
    CHECK (min_stock >= 0),
    CHECK (target_stock >= min_stock)
);

COMMENT ON TABLE core.assortment IS '一个地点 SKU 的经营有效区间。停售但有残余库存时仍需保留库存快照';

COMMENT ON COLUMN core.assortment.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.assortment.assortment_id IS '经营区间 ID';

COMMENT ON COLUMN core.assortment.site_id IS '仓或店';

COMMENT ON COLUMN core.assortment.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.assortment.sku_id IS 'SKU';

COMMENT ON COLUMN core.assortment.valid_from IS '经营起点 包含';

COMMENT ON COLUMN core.assortment.valid_to IS '经营终点 不含';

COMMENT ON COLUMN core.assortment.can_sell IS '允许销售出库';

COMMENT ON COLUMN core.assortment.min_stock IS '补货点 单件';

COMMENT ON COLUMN core.assortment.target_stock IS '目标库存 单件';

COMMENT ON COLUMN core.assortment.available_at IS '此计划或版本在源中首次发布可见时刻';

COMMENT ON COLUMN core.assortment.load_batch_id IS '来源采集批次';

CREATE TABLE core.price_period (
    tenant_id smallint NOT NULL,
    price_id bigint NOT NULL,
    sku_id bigint NOT NULL,
    channel_id bigint NOT NULL,
    valid_from timestamptz NOT NULL,
    valid_to timestamptz NOT NULL,
    list_price_cent bigint NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, price_id),
    UNIQUE (tenant_id, sku_id, channel_id, valid_from),
    UNIQUE (tenant_id, price_id, sku_id, channel_id),
    CHECK (valid_from < valid_to),
    CHECK (list_price_cent >= 0)
);

COMMENT ON TABLE core.price_period IS '一个 SKU 渠道价格的有效区间。时间区间不得交叠；价格在下单时固化';

COMMENT ON COLUMN core.price_period.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.price_period.price_id IS '价格版本';

COMMENT ON COLUMN core.price_period.sku_id IS 'SKU';

COMMENT ON COLUMN core.price_period.channel_id IS '渠道';

COMMENT ON COLUMN core.price_period.valid_from IS '生效开始';

COMMENT ON COLUMN core.price_period.valid_to IS '生效结束 不含';

COMMENT ON COLUMN core.price_period.list_price_cent IS '单件标价；CNY 不含税整数分';

COMMENT ON COLUMN core.price_period.available_at IS '此计划或版本在源中首次发布可见时刻';

COMMENT ON COLUMN core.price_period.load_batch_id IS '来源采集批次';

CREATE TABLE core.cost_period (
    tenant_id smallint NOT NULL,
    cost_id bigint NOT NULL,
    sku_id bigint NOT NULL,
    valid_from timestamptz NOT NULL,
    valid_to timestamptz NOT NULL,
    unit_cost_cent bigint NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, cost_id),
    UNIQUE (tenant_id, sku_id, valid_from),
    CHECK (valid_from < valid_to),
    CHECK (unit_cost_cent >= 0)
);

COMMENT ON TABLE core.cost_period IS '一个 SKU 标准采购成本的有效区间。仅决定新采购批次成本；旧库存不追溯改价';

COMMENT ON COLUMN core.cost_period.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.cost_period.cost_id IS '采购成本版本';

COMMENT ON COLUMN core.cost_period.sku_id IS 'SKU';

COMMENT ON COLUMN core.cost_period.valid_from IS '生效开始';

COMMENT ON COLUMN core.cost_period.valid_to IS '生效结束 不含';

COMMENT ON COLUMN core.cost_period.unit_cost_cent IS '单位采购成本；CNY 不含税整数分';

COMMENT ON COLUMN core.cost_period.available_at IS '此计划或版本在源中首次发布可见时刻';

COMMENT ON COLUMN core.cost_period.load_batch_id IS '来源采集批次';

CREATE TABLE core.customer (
    tenant_id smallint NOT NULL,
    customer_id bigint NOT NULL,
    member_code text NOT NULL,
    joined_at timestamptz NOT NULL,
    segment_code text NOT NULL,
    home_geo_id bigint,
    age_band text,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, customer_id),
    UNIQUE (tenant_id, member_code)
);

COMMENT ON TABLE core.customer IS '一个企业会员。仅保存合成分群属性；无真实姓名电话地址';

COMMENT ON COLUMN core.customer.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.customer.customer_id IS '企业会员 ID';

COMMENT ON COLUMN core.customer.member_code IS '合成会员编号';

COMMENT ON COLUMN core.customer.joined_at IS '入会时刻';

COMMENT ON COLUMN core.customer.segment_code IS '新客 高频 低频等固定初始分群';

COMMENT ON COLUMN core.customer.home_geo_id IS '登记城市 允许未知';

COMMENT ON COLUMN core.customer.age_band IS '合成年龄段 允许未知';

COMMENT ON COLUMN core.customer.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.customer.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.customer_identity (
    tenant_id smallint NOT NULL,
    identity_id bigint NOT NULL,
    channel_id bigint NOT NULL,
    external_user_token text NOT NULL,
    first_seen_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, identity_id),
    UNIQUE (tenant_id, channel_id, external_user_token),
    UNIQUE (tenant_id, identity_id, channel_id),
    CHECK (available_at >= first_seen_at)
);

COMMENT ON TABLE core.customer_identity IS '一个渠道内的购买身份。不可变渠道内身份；会员绑定见 customer_identity_link，未识别用户不可合并成同一个客户';

COMMENT ON COLUMN core.customer_identity.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.customer_identity.identity_id IS '渠道身份 ID';

COMMENT ON COLUMN core.customer_identity.channel_id IS '来源渠道';

COMMENT ON COLUMN core.customer_identity.external_user_token IS '不可逆合成令牌';

COMMENT ON COLUMN core.customer_identity.first_seen_at IS '首次可见时刻';

COMMENT ON COLUMN core.customer_identity.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.customer_identity.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.calendar (
    calendar_date date NOT NULL,
    year_no smallint NOT NULL,
    month_no smallint NOT NULL,
    day_of_week smallint NOT NULL,
    iso_year smallint NOT NULL,
    iso_week smallint NOT NULL,
    is_weekend boolean NOT NULL,
    festival_code text NOT NULL,
    PRIMARY KEY (calendar_date),
    CHECK (month_no BETWEEN 1 AND 12),
    CHECK (day_of_week BETWEEN 1 AND 7),
    CHECK (iso_week BETWEEN 1 AND 53)
);

COMMENT ON TABLE core.calendar IS '一个本地自然日。共享公开日期维；假日标签按课程自定义日历配置';

COMMENT ON COLUMN core.calendar.calendar_date IS 'Asia/Shanghai 自然日';

COMMENT ON COLUMN core.calendar.year_no IS '年';

COMMENT ON COLUMN core.calendar.month_no IS '月';

COMMENT ON COLUMN core.calendar.day_of_week IS 'ISO 周一为 1';

COMMENT ON COLUMN core.calendar.iso_year IS 'ISO 周所属年';

COMMENT ON COLUMN core.calendar.iso_week IS 'ISO 周';

COMMENT ON COLUMN core.calendar.is_weekend IS '是否周末';

COMMENT ON COLUMN core.calendar.festival_code IS '课程事件标签 无则 NONE';

CREATE TABLE core.campaign (
    tenant_id smallint NOT NULL,
    campaign_id bigint NOT NULL,
    campaign_code text NOT NULL,
    campaign_name text NOT NULL,
    acquisition_source text NOT NULL,
    target_channel_id bigint,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    objective text NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, campaign_id),
    UNIQUE (tenant_id, campaign_code),
    CHECK (starts_at < ends_at),
    CHECK (objective IN ('ACQUISITION','RETENTION','CLEARANCE'))
);

COMMENT ON TABLE core.campaign IS '一个营销活动。广告触达与订单下单渠道分离';

COMMENT ON COLUMN core.campaign.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.campaign.campaign_id IS '活动 ID';

COMMENT ON COLUMN core.campaign.campaign_code IS '活动代码';

COMMENT ON COLUMN core.campaign.campaign_name IS '活动名称';

COMMENT ON COLUMN core.campaign.acquisition_source IS '搜索 信息流 直播 私域等';

COMMENT ON COLUMN core.campaign.target_channel_id IS '主要承接渠道';

COMMENT ON COLUMN core.campaign.starts_at IS '活动起点';

COMMENT ON COLUMN core.campaign.ends_at IS '活动终点 不含';

COMMENT ON COLUMN core.campaign.objective IS 'ACQUISITION RETENTION CLEARANCE';

COMMENT ON COLUMN core.campaign.available_at IS '此计划或版本在源中首次发布可见时刻';

COMMENT ON COLUMN core.campaign.load_batch_id IS '来源采集批次';

CREATE TABLE core.promotion (
    tenant_id smallint NOT NULL,
    promotion_id bigint NOT NULL,
    promotion_code text NOT NULL,
    channel_id bigint NOT NULL,
    campaign_id bigint,
    promotion_type text NOT NULL,
    discount_bps integer NOT NULL,
    threshold_cent bigint NOT NULL,
    discount_cent bigint NOT NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    priority_no integer NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, promotion_id),
    UNIQUE (tenant_id, promotion_code),
    CHECK (promotion_type IN ('PERCENT','THRESHOLD')),
    CHECK (discount_bps BETWEEN 0 AND 10000),
    CHECK (threshold_cent >= 0),
    CHECK (discount_cent >= 0),
    CHECK (starts_at < ends_at)
);

COMMENT ON TABLE core.promotion IS '一个价格优惠规则。v1 只支持百分比优惠和满额减免；不含平台补贴和赠品';

COMMENT ON COLUMN core.promotion.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.promotion.promotion_id IS '优惠 ID';

COMMENT ON COLUMN core.promotion.promotion_code IS '优惠代码';

COMMENT ON COLUMN core.promotion.channel_id IS '适用渠道';

COMMENT ON COLUMN core.promotion.campaign_id IS '所属营销活动 允许无';

COMMENT ON COLUMN core.promotion.promotion_type IS 'PERCENT THRESHOLD';

COMMENT ON COLUMN core.promotion.discount_bps IS '折扣比例基点 0 至 10000';

COMMENT ON COLUMN core.promotion.threshold_cent IS '门槛金额；CNY 不含税整数分';

COMMENT ON COLUMN core.promotion.discount_cent IS '固定减免额；CNY 不含税整数分';

COMMENT ON COLUMN core.promotion.starts_at IS '生效开始';

COMMENT ON COLUMN core.promotion.ends_at IS '生效结束 不含';

COMMENT ON COLUMN core.promotion.priority_no IS '叠加排序';

COMMENT ON COLUMN core.promotion.available_at IS '此计划或版本在源中首次发布可见时刻';

COMMENT ON COLUMN core.promotion.load_batch_id IS '来源采集批次';

CREATE TABLE core.order_header (
    tenant_id smallint NOT NULL,
    order_id bigint NOT NULL,
    order_no text NOT NULL,
    contoso_proposal_id text NOT NULL,
    channel_id bigint NOT NULL,
    org_unit_id bigint NOT NULL,
    region_id bigint NOT NULL,
    demand_geo_id bigint NOT NULL,
    selling_site_id bigint,
    identity_id bigint NOT NULL,
    customer_id bigint,
    ordered_at timestamptz NOT NULL,
    order_date date NOT NULL,
    currency char(3) NOT NULL,
    gross_cent bigint NOT NULL,
    discount_cent bigint NOT NULL,
    payable_cent bigint NOT NULL,
    payment_deadline timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, order_id),
    UNIQUE (tenant_id, order_no),
    UNIQUE (tenant_id, contoso_proposal_id),
    UNIQUE (tenant_id, order_id, region_id),
    UNIQUE (tenant_id, order_id, region_id, channel_id),
    CHECK (currency = 'CNY'),
    CHECK (gross_cent >= 0),
    CHECK (discount_cent BETWEEN 0 AND gross_cent),
    CHECK (payable_cent = gross_cent - discount_cent),
    CHECK (payment_deadline >= ordered_at),
    CHECK (order_date = (ordered_at AT TIME ZONE 'Asia/Shanghai')::date),
    CHECK (available_at >= ordered_at),
    CHECK (payable_cent > 0)
);

COMMENT ON TABLE core.order_header IS '一个成功创建的订单头。精确百万配额包含支付失败和取消；无 mutable 当前状态';

COMMENT ON COLUMN core.order_header.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.order_header.order_id IS '订单 ID';

COMMENT ON COLUMN core.order_header.order_no IS '企业业务订单号';

COMMENT ON COLUMN core.order_header.contoso_proposal_id IS '候选订单追踪 ID';

COMMENT ON COLUMN core.order_header.channel_id IS '下单渠道';

COMMENT ON COLUMN core.order_header.org_unit_id IS '销售归属组织';

COMMENT ON COLUMN core.order_header.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.order_header.demand_geo_id IS '需求城市';

COMMENT ON COLUMN core.order_header.selling_site_id IS '线下下单门店 线上为 NULL';

COMMENT ON COLUMN core.order_header.identity_id IS '渠道购买身份';

COMMENT ON COLUMN core.order_header.customer_id IS '下单时已知会员；不事后回填';

COMMENT ON COLUMN core.order_header.ordered_at IS '订单创建时刻';

COMMENT ON COLUMN core.order_header.order_date IS 'ordered_at 转 Asia/Shanghai 的自然日';

COMMENT ON COLUMN core.order_header.currency IS '固定 CNY';

COMMENT ON COLUMN core.order_header.gross_cent IS '商品原价总额；CNY 不含税整数分';

COMMENT ON COLUMN core.order_header.discount_cent IS '商品优惠总额；CNY 不含税整数分';

COMMENT ON COLUMN core.order_header.payable_cent IS '应付商品额；v1 无向客户收取的运费；CNY 不含税整数分';

COMMENT ON COLUMN core.order_header.payment_deadline IS '支付截止时刻';

COMMENT ON COLUMN core.order_header.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.order_header.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.order_line (
    tenant_id smallint NOT NULL,
    order_line_id bigint NOT NULL,
    order_id bigint NOT NULL,
    region_id bigint NOT NULL,
    channel_id bigint NOT NULL,
    line_no integer NOT NULL,
    sku_id bigint NOT NULL,
    listing_id bigint,
    price_id bigint NOT NULL,
    quantity integer NOT NULL,
    list_unit_cent bigint NOT NULL,
    gross_cent bigint NOT NULL,
    discount_cent bigint NOT NULL,
    net_cent bigint NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, order_line_id),
    UNIQUE (tenant_id, order_id, line_no),
    UNIQUE (tenant_id, order_id, sku_id),
    UNIQUE (tenant_id, order_line_id, order_id, region_id, sku_id),
    CHECK (line_no > 0),
    CHECK (quantity > 0),
    CHECK (list_unit_cent >= 0),
    CHECK (gross_cent = list_unit_cent * quantity),
    CHECK (discount_cent BETWEEN 0 AND gross_cent),
    CHECK (net_cent = gross_cent - discount_cent)
);

COMMENT ON TABLE core.order_line IS '一张订单的一个 SKU 行。重复 SKU 合并成一行；商品价与优惠在下单时固化';

COMMENT ON COLUMN core.order_line.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.order_line.order_line_id IS '订单行 ID';

COMMENT ON COLUMN core.order_line.order_id IS '订单头';

COMMENT ON COLUMN core.order_line.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.order_line.channel_id IS '继承订单销售渠道；锁定有效映射和价格';

COMMENT ON COLUMN core.order_line.line_no IS '订单内行号';

COMMENT ON COLUMN core.order_line.sku_id IS 'SKU';

COMMENT ON COLUMN core.order_line.listing_id IS '渠道商品版本 自建线下可无';

COMMENT ON COLUMN core.order_line.price_id IS '采用价格版本';

COMMENT ON COLUMN core.order_line.quantity IS '订购单件数';

COMMENT ON COLUMN core.order_line.list_unit_cent IS '原价单价；CNY 不含税整数分';

COMMENT ON COLUMN core.order_line.gross_cent IS '行原价金额；CNY 不含税整数分';

COMMENT ON COLUMN core.order_line.discount_cent IS '行优惠；CNY 不含税整数分';

COMMENT ON COLUMN core.order_line.net_cent IS '行应付额；CNY 不含税整数分';

COMMENT ON COLUMN core.order_line.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.order_line.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.order_unit (
    tenant_id smallint NOT NULL,
    order_unit_id bigint NOT NULL,
    order_line_id bigint NOT NULL,
    order_id bigint NOT NULL,
    region_id bigint NOT NULL,
    sku_id bigint NOT NULL,
    unit_no integer NOT NULL,
    gross_cent bigint NOT NULL,
    discount_cent bigint NOT NULL,
    net_cent bigint NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, order_unit_id),
    UNIQUE (tenant_id, order_line_id, unit_no),
    UNIQUE (tenant_id, order_unit_id, order_id, region_id, sku_id),
    UNIQUE (tenant_id, order_unit_id, region_id),
    UNIQUE (tenant_id, order_unit_id, order_id, region_id),
    CHECK (unit_no > 0),
    CHECK (gross_cent >= 0),
    CHECK (discount_cent BETWEEN 0 AND gross_cent),
    CHECK (net_cent = gross_cent - discount_cent)
);

COMMENT ON TABLE core.order_unit IS '订单行中的一个逻辑计量单件。用于部分履约 退货 成本与整分分摊；不代表实物序列号';

COMMENT ON COLUMN core.order_unit.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.order_unit.order_unit_id IS '逻辑单件 ID';

COMMENT ON COLUMN core.order_unit.order_line_id IS '订单行';

COMMENT ON COLUMN core.order_unit.order_id IS '订单';

COMMENT ON COLUMN core.order_unit.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.order_unit.sku_id IS 'SKU';

COMMENT ON COLUMN core.order_unit.unit_no IS '行内单件序号';

COMMENT ON COLUMN core.order_unit.gross_cent IS '该单件原价；CNY 不含税整数分';

COMMENT ON COLUMN core.order_unit.discount_cent IS '分配到该单件的优惠；CNY 不含税整数分';

COMMENT ON COLUMN core.order_unit.net_cent IS '该单件应付额；CNY 不含税整数分';

COMMENT ON COLUMN core.order_unit.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.order_unit.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.order_status_event (
    tenant_id smallint NOT NULL,
    status_event_id bigint NOT NULL,
    order_id bigint NOT NULL,
    region_id bigint NOT NULL,
    event_seq integer NOT NULL,
    status text NOT NULL,
    reason_code text NOT NULL,
    event_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, status_event_id),
    UNIQUE (tenant_id, order_id, event_seq),
    CHECK (status IN ('CREATED','RESERVED','PAID','PART_SHIPPED','SHIPPED','COMPLETED','CANCELLED')),
    CHECK (event_seq > 0),
    CHECK (available_at >= event_at)
);

COMMENT ON TABLE core.order_status_event IS '一个订单的一次状态变化。只能按 event_at 与 available_at 双条件重建状态';

COMMENT ON COLUMN core.order_status_event.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.order_status_event.status_event_id IS '状态事件';

COMMENT ON COLUMN core.order_status_event.order_id IS '订单';

COMMENT ON COLUMN core.order_status_event.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.order_status_event.event_seq IS '同一订单事件序号';

COMMENT ON COLUMN core.order_status_event.status IS 'CREATED RESERVED PAID PART_SHIPPED SHIPPED COMPLETED CANCELLED';

COMMENT ON COLUMN core.order_status_event.reason_code IS 'NONE STOCK_LOCK_FAILED PAY_TIMEOUT CUSTOMER_CANCEL DELIVERY_FAILED';

COMMENT ON COLUMN core.order_status_event.event_at IS '业务状态变化时刻';

COMMENT ON COLUMN core.order_status_event.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.order_status_event.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.discount_allocation (
    tenant_id smallint NOT NULL,
    allocation_id bigint NOT NULL,
    order_unit_id bigint NOT NULL,
    region_id bigint NOT NULL,
    promotion_id bigint NOT NULL,
    apply_seq integer NOT NULL,
    discount_cent bigint NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, allocation_id),
    UNIQUE (tenant_id, order_unit_id, promotion_id, apply_seq),
    CHECK (apply_seq > 0),
    CHECK (discount_cent >= 0)
);

COMMENT ON TABLE core.discount_allocation IS '一个优惠对一个订单单件的分摊。按优先级逐次分摊；相同单件可命中多个优惠';

COMMENT ON COLUMN core.discount_allocation.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.discount_allocation.allocation_id IS '优惠分摊记录';

COMMENT ON COLUMN core.discount_allocation.order_unit_id IS '单件';

COMMENT ON COLUMN core.discount_allocation.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.discount_allocation.promotion_id IS '优惠规则';

COMMENT ON COLUMN core.discount_allocation.apply_seq IS '应用次序';

COMMENT ON COLUMN core.discount_allocation.discount_cent IS '本次分摊优惠；CNY 不含税整数分';

COMMENT ON COLUMN core.discount_allocation.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.discount_allocation.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.payment (
    tenant_id smallint NOT NULL,
    payment_id bigint NOT NULL,
    order_id bigint NOT NULL,
    region_id bigint NOT NULL,
    payment_no text NOT NULL,
    method text NOT NULL,
    status text NOT NULL,
    amount_cent bigint NOT NULL,
    attempted_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, payment_id),
    UNIQUE (tenant_id, payment_no),
    UNIQUE (tenant_id, payment_id, order_id, region_id),
    CHECK (status IN ('SUCCEEDED','FAILED')),
    CHECK (amount_cent > 0),
    CHECK (available_at >= attempted_at)
);

COMMENT ON TABLE core.payment IS '一次支付尝试。成功支付累计满足应付才产生 PAID；允许一次订单多笔支付';

COMMENT ON COLUMN core.payment.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.payment.payment_id IS '支付尝试 ID';

COMMENT ON COLUMN core.payment.order_id IS '订单';

COMMENT ON COLUMN core.payment.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.payment.payment_no IS '来源支付单号';

COMMENT ON COLUMN core.payment.method IS 'ALIPAY WECHAT BANK POS';

COMMENT ON COLUMN core.payment.status IS 'SUCCEEDED FAILED';

COMMENT ON COLUMN core.payment.amount_cent IS '本次尝试金额；CNY 不含税整数分';

COMMENT ON COLUMN core.payment.attempted_at IS '支付尝试时刻';

COMMENT ON COLUMN core.payment.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.payment.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.refund (
    tenant_id smallint NOT NULL,
    refund_id bigint NOT NULL,
    payment_id bigint NOT NULL,
    order_id bigint NOT NULL,
    region_id bigint NOT NULL,
    refund_no text NOT NULL,
    status text NOT NULL,
    refund_type text NOT NULL,
    amount_cent bigint NOT NULL,
    attempted_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, refund_id),
    UNIQUE (tenant_id, refund_no),
    UNIQUE (tenant_id, refund_id, order_id, region_id),
    CHECK (status IN ('SUCCEEDED','FAILED')),
    CHECK (refund_type IN ('CANCEL','RETURN')),
    CHECK (amount_cent > 0),
    CHECK (available_at >= attempted_at)
);

COMMENT ON TABLE core.refund IS '一次现金退款尝试。与销售冲减和实物入库分离；一笔退款引用一笔成功支付';

COMMENT ON COLUMN core.refund.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.refund.refund_id IS '退款 ID';

COMMENT ON COLUMN core.refund.payment_id IS '原支付';

COMMENT ON COLUMN core.refund.order_id IS '订单';

COMMENT ON COLUMN core.refund.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.refund.refund_no IS '退款单号';

COMMENT ON COLUMN core.refund.status IS 'SUCCEEDED FAILED';

COMMENT ON COLUMN core.refund.refund_type IS 'CANCEL RETURN';

COMMENT ON COLUMN core.refund.amount_cent IS '退款尝试金额；CNY 不含税整数分';

COMMENT ON COLUMN core.refund.attempted_at IS '现金退款尝试时刻';

COMMENT ON COLUMN core.refund.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.refund.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.refund_allocation (
    tenant_id smallint NOT NULL,
    refund_allocation_id bigint NOT NULL,
    refund_id bigint NOT NULL,
    order_id bigint NOT NULL,
    region_id bigint NOT NULL,
    order_unit_id bigint NOT NULL,
    amount_cent bigint NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, refund_allocation_id),
    UNIQUE (tenant_id, refund_id, order_unit_id),
    CHECK (amount_cent > 0)
);

COMMENT ON TABLE core.refund_allocation IS '一次退款分配到一个订单单件。可跨多笔原支付分拆退款；单件成功退款累计不得超过 net_cent';

COMMENT ON COLUMN core.refund_allocation.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.refund_allocation.refund_allocation_id IS '分摊 ID';

COMMENT ON COLUMN core.refund_allocation.refund_id IS '退款';

COMMENT ON COLUMN core.refund_allocation.order_id IS '订单';

COMMENT ON COLUMN core.refund_allocation.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.refund_allocation.order_unit_id IS '单件';

COMMENT ON COLUMN core.refund_allocation.amount_cent IS '本次分摊退款；CNY 不含税整数分';

COMMENT ON COLUMN core.refund_allocation.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.refund_allocation.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.inventory_lot (
    tenant_id smallint NOT NULL,
    lot_id bigint NOT NULL,
    site_id bigint NOT NULL,
    region_id bigint NOT NULL,
    sku_id bigint NOT NULL,
    parent_lot_id bigint,
    cost_id bigint,
    received_at timestamptz NOT NULL,
    unit_cost_cent bigint NOT NULL,
    origin_type text NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, lot_id),
    UNIQUE (tenant_id, lot_id, site_id, sku_id),
    UNIQUE (tenant_id, lot_id, sku_id),
    CHECK (unit_cost_cent >= 0),
    CHECK (origin_type IN ('OPENING','PURCHASE','TRANSFER','RETURN'))
);

COMMENT ON TABLE core.inventory_lot IS '一批相同 SKU 成本的某地点库存。采购 转入 可售退货可新建批次；FIFO 出库并固化原成本';

COMMENT ON COLUMN core.inventory_lot.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.inventory_lot.lot_id IS '库存批次';

COMMENT ON COLUMN core.inventory_lot.site_id IS '地点';

COMMENT ON COLUMN core.inventory_lot.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.inventory_lot.sku_id IS 'SKU';

COMMENT ON COLUMN core.inventory_lot.parent_lot_id IS '转移或退货来源批次';

COMMENT ON COLUMN core.inventory_lot.cost_id IS '新采购成本版本 退货转入可无';

COMMENT ON COLUMN core.inventory_lot.received_at IS '批次到达时刻';

COMMENT ON COLUMN core.inventory_lot.unit_cost_cent IS '本批单件成本；CNY 不含税整数分';

COMMENT ON COLUMN core.inventory_lot.origin_type IS 'OPENING PURCHASE TRANSFER RETURN';

COMMENT ON COLUMN core.inventory_lot.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.inventory_lot.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.shipment (
    tenant_id smallint NOT NULL,
    shipment_id bigint NOT NULL,
    order_id bigint NOT NULL,
    region_id bigint NOT NULL,
    from_site_id bigint NOT NULL,
    shipment_no text NOT NULL,
    fulfillment_type text NOT NULL,
    created_at timestamptz NOT NULL,
    promised_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, shipment_id),
    UNIQUE (tenant_id, shipment_no),
    UNIQUE (tenant_id, shipment_id, order_id, region_id, from_site_id),
    CHECK (fulfillment_type IN ('DELIVERY','PICKUP','POS')),
    CHECK (promised_at >= created_at),
    CHECK (available_at >= created_at)
);

COMMENT ON TABLE core.shipment IS '一张订单从一个地点发出的包裹或 POS 交付单。一次订单允许多个包裹；v1 每逻辑单件最多一次出库';

COMMENT ON COLUMN core.shipment.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.shipment.shipment_id IS '履约单';

COMMENT ON COLUMN core.shipment.order_id IS '订单';

COMMENT ON COLUMN core.shipment.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.shipment.from_site_id IS '履约仓或店';

COMMENT ON COLUMN core.shipment.shipment_no IS '履约单号';

COMMENT ON COLUMN core.shipment.fulfillment_type IS 'DELIVERY PICKUP POS';

COMMENT ON COLUMN core.shipment.created_at IS '创建时刻';

COMMENT ON COLUMN core.shipment.promised_at IS '承诺交付时刻';

COMMENT ON COLUMN core.shipment.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.shipment.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.shipment_item (
    tenant_id smallint NOT NULL,
    shipment_item_id bigint NOT NULL,
    shipment_id bigint NOT NULL,
    order_unit_id bigint NOT NULL,
    order_id bigint NOT NULL,
    region_id bigint NOT NULL,
    sku_id bigint NOT NULL,
    from_site_id bigint NOT NULL,
    lot_id bigint NOT NULL,
    shipped_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, shipment_item_id),
    UNIQUE (tenant_id, order_unit_id),
    UNIQUE (tenant_id, shipment_item_id, order_unit_id, region_id),
    CHECK (available_at >= shipped_at)
);

COMMENT ON TABLE core.shipment_item IS '一个包裹中的一个订单逻辑单件。固化从哪个库存批次出库；成本由成本台账确认';

COMMENT ON COLUMN core.shipment_item.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.shipment_item.shipment_item_id IS '履约单件 ID';

COMMENT ON COLUMN core.shipment_item.shipment_id IS '履约单';

COMMENT ON COLUMN core.shipment_item.order_unit_id IS '订单单件';

COMMENT ON COLUMN core.shipment_item.order_id IS '订单';

COMMENT ON COLUMN core.shipment_item.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.shipment_item.sku_id IS 'SKU';

COMMENT ON COLUMN core.shipment_item.from_site_id IS '出库地点';

COMMENT ON COLUMN core.shipment_item.lot_id IS '出库批次';

COMMENT ON COLUMN core.shipment_item.shipped_at IS '出库时刻';

COMMENT ON COLUMN core.shipment_item.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.shipment_item.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.shipment_event (
    tenant_id smallint NOT NULL,
    shipment_event_id bigint NOT NULL,
    shipment_id bigint NOT NULL,
    order_id bigint NOT NULL,
    region_id bigint NOT NULL,
    from_site_id bigint NOT NULL,
    event_seq integer NOT NULL,
    event_type text NOT NULL,
    event_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, shipment_event_id),
    UNIQUE (tenant_id, shipment_id, event_seq),
    CHECK (event_type IN ('SHIPPED','DELIVERED','DELIVERY_FAILED','RETURNED_TO_ORIGIN')),
    CHECK (event_seq > 0),
    CHECK (available_at >= event_at)
);

COMMENT ON TABLE core.shipment_event IS '一张履约单的一次物流状态事件。交付事件是收入确认依据；物流失败未交付不得认收入';

COMMENT ON COLUMN core.shipment_event.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.shipment_event.shipment_event_id IS '物流事件';

COMMENT ON COLUMN core.shipment_event.shipment_id IS '履约单';

COMMENT ON COLUMN core.shipment_event.order_id IS '订单';

COMMENT ON COLUMN core.shipment_event.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.shipment_event.from_site_id IS '出库地点';

COMMENT ON COLUMN core.shipment_event.event_seq IS '事件序号';

COMMENT ON COLUMN core.shipment_event.event_type IS 'SHIPPED DELIVERED DELIVERY_FAILED RETURNED_TO_ORIGIN';

COMMENT ON COLUMN core.shipment_event.event_at IS '物流事件时刻';

COMMENT ON COLUMN core.shipment_event.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.shipment_event.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.return_header (
    tenant_id smallint NOT NULL,
    return_id bigint NOT NULL,
    order_id bigint NOT NULL,
    region_id bigint NOT NULL,
    return_no text NOT NULL,
    request_channel_id bigint NOT NULL,
    receiving_site_id bigint,
    requested_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, return_id),
    UNIQUE (tenant_id, return_no),
    UNIQUE (tenant_id, return_id, order_id, region_id),
    CHECK (available_at >= requested_at)
);

COMMENT ON TABLE core.return_header IS '一张售后申请。可从跨区门店退货；销售归属保持原订单区域';

COMMENT ON COLUMN core.return_header.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.return_header.return_id IS '售后申请 ID';

COMMENT ON COLUMN core.return_header.order_id IS '原订单';

COMMENT ON COLUMN core.return_header.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.return_header.return_no IS '售后单号';

COMMENT ON COLUMN core.return_header.request_channel_id IS '申请渠道';

COMMENT ON COLUMN core.return_header.receiving_site_id IS '预计接收地点';

COMMENT ON COLUMN core.return_header.requested_at IS '申请时刻';

COMMENT ON COLUMN core.return_header.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.return_header.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.return_item (
    tenant_id smallint NOT NULL,
    return_item_id bigint NOT NULL,
    return_id bigint NOT NULL,
    order_id bigint NOT NULL,
    region_id bigint NOT NULL,
    order_unit_id bigint NOT NULL,
    shipment_item_id bigint NOT NULL,
    reason_code text NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, return_item_id),
    UNIQUE (tenant_id, order_unit_id),
    UNIQUE (tenant_id, return_item_id, order_unit_id, region_id),
    CHECK (reason_code IN ('SIZE','QUALITY','NOT_NEEDED','DESCRIPTION','OTHER'))
);

COMMENT ON TABLE core.return_item IS '一次售后对应一个已出库单件。v1 一个逻辑单件最多一条售后申请；换码拆退货与新订单且可不模拟';

COMMENT ON COLUMN core.return_item.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.return_item.return_item_id IS '售后单件 ID';

COMMENT ON COLUMN core.return_item.return_id IS '售后申请';

COMMENT ON COLUMN core.return_item.order_id IS '原订单';

COMMENT ON COLUMN core.return_item.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.return_item.order_unit_id IS '原单件';

COMMENT ON COLUMN core.return_item.shipment_item_id IS '原履约单件';

COMMENT ON COLUMN core.return_item.reason_code IS 'SIZE QUALITY NOT_NEEDED DESCRIPTION OTHER';

COMMENT ON COLUMN core.return_item.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.return_item.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.return_event (
    tenant_id smallint NOT NULL,
    return_event_id bigint NOT NULL,
    return_item_id bigint NOT NULL,
    order_unit_id bigint NOT NULL,
    region_id bigint NOT NULL,
    event_seq integer NOT NULL,
    event_type text NOT NULL,
    site_id bigint,
    restocked_lot_id bigint,
    event_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, return_event_id),
    UNIQUE (tenant_id, return_item_id, event_seq),
    CHECK (event_type IN ('REQUESTED','RECEIVED','ACCEPTED','REJECTED','RESTOCKED','DAMAGED','SCRAPPED')),
    CHECK (event_seq > 0),
    CHECK (available_at >= event_at),
    CHECK ((event_type = 'RESTOCKED') = (restocked_lot_id IS NOT NULL)),
    CHECK (event_type NOT IN ('RECEIVED','RESTOCKED','DAMAGED','SCRAPPED') OR site_id IS NOT NULL)
);

COMMENT ON TABLE core.return_event IS '一个售后单件的一次状态事件。ACCEPTED 冲收入 RESTOCKED 冲原成本；现金退款另记';

COMMENT ON COLUMN core.return_event.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.return_event.return_event_id IS '售后事件';

COMMENT ON COLUMN core.return_event.return_item_id IS '售后单件';

COMMENT ON COLUMN core.return_event.order_unit_id IS '订单单件';

COMMENT ON COLUMN core.return_event.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.return_event.event_seq IS '事件序号';

COMMENT ON COLUMN core.return_event.event_type IS 'REQUESTED RECEIVED ACCEPTED REJECTED RESTOCKED DAMAGED SCRAPPED';

COMMENT ON COLUMN core.return_event.site_id IS '事件发生地点 无则 NULL';

COMMENT ON COLUMN core.return_event.restocked_lot_id IS '重新入库批次 非回库事件为 NULL';

COMMENT ON COLUMN core.return_event.event_at IS '业务事件时刻';

COMMENT ON COLUMN core.return_event.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.return_event.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.inventory_document (
    tenant_id smallint NOT NULL,
    inventory_doc_id bigint NOT NULL,
    document_no text NOT NULL,
    doc_type text NOT NULL,
    from_site_id bigint,
    to_site_id bigint NOT NULL,
    region_id bigint NOT NULL,
    created_at timestamptz NOT NULL,
    planned_at timestamptz NOT NULL,
    reason_code text NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, inventory_doc_id),
    UNIQUE (tenant_id, document_no),
    UNIQUE (tenant_id, inventory_doc_id, region_id),
    CHECK (doc_type IN ('OPENING','PURCHASE','TRANSFER','DISPOSAL')),
    CHECK (planned_at >= created_at),
    CHECK (available_at >= created_at)
);

COMMENT ON TABLE core.inventory_document IS '一笔采购 调拨 开账或处置业务单据。采购与补货有可观测的计划和实际时间，不只隐藏场景原因';

COMMENT ON COLUMN core.inventory_document.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.inventory_document.inventory_doc_id IS '库存业务单据';

COMMENT ON COLUMN core.inventory_document.document_no IS '业务单号';

COMMENT ON COLUMN core.inventory_document.doc_type IS 'OPENING PURCHASE TRANSFER DISPOSAL';

COMMENT ON COLUMN core.inventory_document.from_site_id IS '来源地点 采购开账可无';

COMMENT ON COLUMN core.inventory_document.to_site_id IS '归属或目的地点';

COMMENT ON COLUMN core.inventory_document.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.inventory_document.created_at IS '单据创建时刻';

COMMENT ON COLUMN core.inventory_document.planned_at IS '计划到达或处理时刻';

COMMENT ON COLUMN core.inventory_document.reason_code IS 'NORMAL REPLENISHMENT DELAY CLEARANCE';

COMMENT ON COLUMN core.inventory_document.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.inventory_document.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.inventory_document_line (
    tenant_id smallint NOT NULL,
    inventory_doc_line_id bigint NOT NULL,
    inventory_doc_id bigint NOT NULL,
    region_id bigint NOT NULL,
    sku_id bigint NOT NULL,
    quantity integer NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, inventory_doc_line_id),
    UNIQUE (tenant_id, inventory_doc_id, sku_id),
    CHECK (quantity > 0)
);

COMMENT ON TABLE core.inventory_document_line IS '库存业务单据中的一个 SKU。实际完成由库存流水决定，避免未来 actual_at 覆盖历史状态';

COMMENT ON COLUMN core.inventory_document_line.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.inventory_document_line.inventory_doc_line_id IS '单据行';

COMMENT ON COLUMN core.inventory_document_line.inventory_doc_id IS '单据';

COMMENT ON COLUMN core.inventory_document_line.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.inventory_document_line.sku_id IS 'SKU';

COMMENT ON COLUMN core.inventory_document_line.quantity IS '计划数量';

COMMENT ON COLUMN core.inventory_document_line.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.inventory_document_line.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.inventory_movement (
    tenant_id smallint NOT NULL,
    movement_id bigint NOT NULL,
    site_id bigint NOT NULL,
    region_id bigint NOT NULL,
    sku_id bigint NOT NULL,
    lot_id bigint,
    inventory_doc_line_id bigint,
    order_unit_id bigint,
    return_item_id bigint,
    movement_type text NOT NULL,
    sellable_delta integer NOT NULL,
    quarantine_delta integer NOT NULL,
    reserved_delta integer NOT NULL,
    in_transit_delta integer NOT NULL,
    event_at timestamptz NOT NULL,
    event_seq bigint NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    damaged_delta integer NOT NULL,
    business_txn_id bigint NOT NULL,
    source_kind text NOT NULL,
    source_event_id bigint NOT NULL,
    source_leg_no integer NOT NULL,
    PRIMARY KEY (tenant_id, movement_id),
    UNIQUE (tenant_id, source_kind, source_event_id, source_leg_no),
    UNIQUE (tenant_id, event_seq),
    CHECK (movement_type IN ('OPENING','RECEIPT','RESERVE','RELEASE','SHIP','RETURN_RECEIVE','RESTOCK','DAMAGE','SCRAP','RTO_RECEIPT','TRANSFER_OUT','TRANSIT_IN','TRANSIT_OUT','TRANSFER_IN')),
    CHECK (sellable_delta <> 0 OR quarantine_delta <> 0 OR reserved_delta <> 0 OR in_transit_delta <> 0 OR damaged_delta <> 0),
    CHECK (available_at >= event_at),
    CHECK (source_kind IN ('UNIT_EVENT','SHIPMENT_EVENT','RETURN_EVENT','DOCUMENT_LINE')),
    CHECK (source_leg_no > 0),
    CHECK (event_seq > 0)
);

COMMENT ON TABLE core.inventory_movement IS '一个地点 SKU 批次的一次库存桶变化。可售 待检 损坏 预留 在途分开；同一 business_txn_id 原子提交，流水是库存真值';

COMMENT ON COLUMN core.inventory_movement.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.inventory_movement.movement_id IS '库存事件 ID';

COMMENT ON COLUMN core.inventory_movement.site_id IS '地点';

COMMENT ON COLUMN core.inventory_movement.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.inventory_movement.sku_id IS 'SKU';

COMMENT ON COLUMN core.inventory_movement.lot_id IS '物理批次 预留事件可无';

COMMENT ON COLUMN core.inventory_movement.inventory_doc_line_id IS '补货调拨等单据行';

COMMENT ON COLUMN core.inventory_movement.order_unit_id IS '订单单件引用';

COMMENT ON COLUMN core.inventory_movement.return_item_id IS '售后单件引用';

COMMENT ON COLUMN core.inventory_movement.movement_type IS 'OPENING RECEIPT RESERVE RELEASE SHIP RETURN_RECEIVE RESTOCK SCRAP TRANSFER_OUT TRANSIT_IN TRANSIT_OUT TRANSFER_IN DAMAGE RTO_RECEIPT';

COMMENT ON COLUMN core.inventory_movement.sellable_delta IS '可售物理库存变动';

COMMENT ON COLUMN core.inventory_movement.quarantine_delta IS '隔离实物变动；包含待检与已接受退货后待恢复可售';

COMMENT ON COLUMN core.inventory_movement.reserved_delta IS '预留量变动';

COMMENT ON COLUMN core.inventory_movement.in_transit_delta IS '归目的地点的在途量变动';

COMMENT ON COLUMN core.inventory_movement.event_at IS '库存变动时刻';

COMMENT ON COLUMN core.inventory_movement.event_seq IS '租户内同时间排序号';

COMMENT ON COLUMN core.inventory_movement.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.inventory_movement.load_batch_id IS '模拟采集批次；引用本租户采集批次';

COMMENT ON COLUMN core.inventory_movement.damaged_delta IS '已判损坏尚未移出实物的数量变化';

COMMENT ON COLUMN core.inventory_movement.business_txn_id IS '原子业务提交 ID';

COMMENT ON COLUMN core.inventory_movement.source_kind IS 'UNIT_EVENT SHIPMENT_EVENT RETURN_EVENT DOCUMENT_LINE';

COMMENT ON COLUMN core.inventory_movement.source_event_id IS '对应源业务事件或单据行 ID';

COMMENT ON COLUMN core.inventory_movement.source_leg_no IS '同一来源拆出的稳定库存腿号';

CREATE TABLE core.inventory_snapshot (
    tenant_id smallint NOT NULL,
    snapshot_date date NOT NULL,
    site_id bigint NOT NULL,
    region_id bigint NOT NULL,
    sku_id bigint NOT NULL,
    sellable_qty integer NOT NULL,
    quarantine_qty integer NOT NULL,
    damaged_qty integer NOT NULL,
    reserved_qty integer NOT NULL,
    in_transit_qty integer NOT NULL,
    available_qty integer NOT NULL,
    as_of timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, snapshot_date, site_id, sku_id, as_of),
    CHECK (sellable_qty >= 0),
    CHECK (quarantine_qty >= 0),
    CHECK (reserved_qty BETWEEN 0 AND sellable_qty),
    CHECK (in_transit_qty >= 0),
    CHECK (available_qty = sellable_qty - reserved_qty),
    CHECK (available_at >= as_of),
    CHECK (damaged_qty >= 0)
);

COMMENT ON TABLE core.inventory_snapshot IS '一个本地日末 地点 SKU 的有效库存快照。零库存仍保留；快照由当时已可见流水生成并带 cutoff；不跨日加总';

COMMENT ON COLUMN core.inventory_snapshot.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.inventory_snapshot.snapshot_date IS '当地自然日';

COMMENT ON COLUMN core.inventory_snapshot.site_id IS '地点';

COMMENT ON COLUMN core.inventory_snapshot.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.inventory_snapshot.sku_id IS 'SKU';

COMMENT ON COLUMN core.inventory_snapshot.sellable_qty IS '可售物理数';

COMMENT ON COLUMN core.inventory_snapshot.quarantine_qty IS '隔离实物数；包含待检与已接受退货后待恢复可售';

COMMENT ON COLUMN core.inventory_snapshot.damaged_qty IS '已判损坏尚未物理处置数量，不再计可售库存资产';

COMMENT ON COLUMN core.inventory_snapshot.reserved_qty IS '预留数';

COMMENT ON COLUMN core.inventory_snapshot.in_transit_qty IS '在途数';

COMMENT ON COLUMN core.inventory_snapshot.available_qty IS '可售减预留';

COMMENT ON COLUMN core.inventory_snapshot.as_of IS '快照计算的信息截止时刻';

COMMENT ON COLUMN core.inventory_snapshot.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.inventory_snapshot.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.revenue_entry (
    tenant_id smallint NOT NULL,
    revenue_entry_id bigint NOT NULL,
    order_unit_id bigint NOT NULL,
    region_id bigint NOT NULL,
    entry_type text NOT NULL,
    shipment_event_id bigint,
    return_event_id bigint,
    quantity_delta smallint NOT NULL,
    amount_cent bigint NOT NULL,
    recognized_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, revenue_entry_id),
    UNIQUE (tenant_id, order_unit_id, entry_type),
    CHECK ((entry_type = 'DELIVERY' AND quantity_delta = 1 AND amount_cent >= 0 AND shipment_event_id IS NOT NULL AND return_event_id IS NULL) OR (entry_type = 'RETURN_ACCEPTED' AND quantity_delta = -1 AND amount_cent <= 0 AND return_event_id IS NOT NULL AND shipment_event_id IS NULL)),
    CHECK (available_at >= recognized_at)
);

COMMENT ON TABLE core.revenue_entry IS '一次单件收入确认或冲减。采用交付确认和退货接受口径；不替代法定总账';

COMMENT ON COLUMN core.revenue_entry.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.revenue_entry.revenue_entry_id IS '收入分录';

COMMENT ON COLUMN core.revenue_entry.order_unit_id IS '订单单件';

COMMENT ON COLUMN core.revenue_entry.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.revenue_entry.entry_type IS 'DELIVERY RETURN_ACCEPTED';

COMMENT ON COLUMN core.revenue_entry.shipment_event_id IS '交付事件引用';

COMMENT ON COLUMN core.revenue_entry.return_event_id IS '退货接受事件引用';

COMMENT ON COLUMN core.revenue_entry.quantity_delta IS '销售 +1 退货 -1';

COMMENT ON COLUMN core.revenue_entry.amount_cent IS '有符号收入变动；CNY 不含税整数分';

COMMENT ON COLUMN core.revenue_entry.recognized_at IS '收入确认时刻';

COMMENT ON COLUMN core.revenue_entry.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.revenue_entry.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.cost_entry (
    tenant_id smallint NOT NULL,
    cost_entry_id bigint NOT NULL,
    order_unit_id bigint NOT NULL,
    region_id bigint NOT NULL,
    entry_type text NOT NULL,
    lot_id bigint NOT NULL,
    shipment_event_id bigint,
    return_event_id bigint,
    amount_cent bigint NOT NULL,
    recognized_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, cost_entry_id),
    UNIQUE (tenant_id, order_unit_id, entry_type),
    CHECK ((entry_type = 'DELIVERY' AND amount_cent >= 0 AND shipment_event_id IS NOT NULL AND return_event_id IS NULL) OR (entry_type = 'RESTOCK' AND amount_cent <= 0 AND return_event_id IS NOT NULL AND shipment_event_id IS NULL)),
    CHECK (available_at >= recognized_at)
);

COMMENT ON TABLE core.cost_entry IS '一次单件销售成本确认或冲回。交付计原批次成本；可售回库冲回原成本；损坏不冲回不二次扣损';

COMMENT ON COLUMN core.cost_entry.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.cost_entry.cost_entry_id IS '成本分录';

COMMENT ON COLUMN core.cost_entry.order_unit_id IS '订单单件';

COMMENT ON COLUMN core.cost_entry.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.cost_entry.entry_type IS 'DELIVERY RESTOCK';

COMMENT ON COLUMN core.cost_entry.lot_id IS '原出库批次';

COMMENT ON COLUMN core.cost_entry.shipment_event_id IS '交付事件';

COMMENT ON COLUMN core.cost_entry.return_event_id IS '可售回库事件';

COMMENT ON COLUMN core.cost_entry.amount_cent IS '有符号销售成本变动；增加成本为正；CNY 不含税整数分';

COMMENT ON COLUMN core.cost_entry.recognized_at IS '成本确认或冲回时刻';

COMMENT ON COLUMN core.cost_entry.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.cost_entry.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.order_fee (
    tenant_id smallint NOT NULL,
    fee_id bigint NOT NULL,
    order_id bigint NOT NULL,
    region_id bigint NOT NULL,
    order_unit_id bigint,
    fee_type text NOT NULL,
    amount_cent bigint NOT NULL,
    recognized_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    source_system text NOT NULL,
    source_fee_no text NOT NULL,
    reversal_of_fee_id bigint,
    source_event_kind text NOT NULL,
    source_event_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, fee_id),
    UNIQUE (tenant_id, source_system, source_fee_no),
    UNIQUE (tenant_id, fee_id, order_id, region_id),
    CHECK (fee_type IN ('COMMISSION','OUTBOUND_LOGISTICS','RETURN_LOGISTICS','PAYMENT_SERVICE')),
    CHECK (available_at >= recognized_at),
    CHECK ((amount_cent >= 0 AND reversal_of_fee_id IS NULL) OR (amount_cent < 0 AND reversal_of_fee_id IS NOT NULL)),
    CHECK (source_event_kind IN ('PAYMENT','SHIPMENT','RETURN','REFUND'))
);

COMMENT ON TABLE core.order_fee IS '订单对应的一笔经营变动费用。不含固定租金人力；费用冲回用负数；投放费在 campaign_daily 独立计';

COMMENT ON COLUMN core.order_fee.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.order_fee.fee_id IS '费用 ID';

COMMENT ON COLUMN core.order_fee.order_id IS '订单';

COMMENT ON COLUMN core.order_fee.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.order_fee.order_unit_id IS '可以分配到单件；订单级费用为 NULL';

COMMENT ON COLUMN core.order_fee.fee_type IS 'COMMISSION OUTBOUND_LOGISTICS RETURN_LOGISTICS PAYMENT_SERVICE';

COMMENT ON COLUMN core.order_fee.amount_cent IS '有符号费用发生额；CNY 不含税整数分';

COMMENT ON COLUMN core.order_fee.recognized_at IS '费用确认时刻';

COMMENT ON COLUMN core.order_fee.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.order_fee.load_batch_id IS '模拟采集批次；引用本租户采集批次';

COMMENT ON COLUMN core.order_fee.source_system IS '费用来源系统';

COMMENT ON COLUMN core.order_fee.source_fee_no IS '来源费用唯一号；回调重试不得变号';

COMMENT ON COLUMN core.order_fee.reversal_of_fee_id IS '负费用冲回的原费用 ID，正费用为空';

COMMENT ON COLUMN core.order_fee.source_event_kind IS 'PAYMENT SHIPMENT RETURN REFUND';

COMMENT ON COLUMN core.order_fee.source_event_id IS '费用发生依据的业务事件 ID';

CREATE TABLE core.order_unit_event (
    tenant_id smallint NOT NULL,
    unit_event_id bigint NOT NULL,
    order_unit_id bigint NOT NULL,
    region_id bigint NOT NULL,
    event_seq integer NOT NULL,
    event_type text NOT NULL,
    reason_code text NOT NULL,
    event_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, unit_event_id),
    UNIQUE (tenant_id, order_unit_id, event_seq),
    CHECK (event_type IN ('CREATED','RESERVED','RELEASED','PAID','SHIPPED','DELIVERED','CANCELLED')),
    CHECK (event_seq > 0),
    CHECK (available_at >= event_at)
);

COMMENT ON TABLE core.order_unit_event IS '一个逻辑单件的一次状态变化。支持部分履约 取消 超时与原子预留释放；订单当前态只能汇总推导';

COMMENT ON COLUMN core.order_unit_event.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.order_unit_event.unit_event_id IS '单件状态事件';

COMMENT ON COLUMN core.order_unit_event.order_unit_id IS '订单单件';

COMMENT ON COLUMN core.order_unit_event.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.order_unit_event.event_seq IS '同一单件顺序';

COMMENT ON COLUMN core.order_unit_event.event_type IS 'CREATED RESERVED RELEASED PAID SHIPPED DELIVERED CANCELLED';

COMMENT ON COLUMN core.order_unit_event.reason_code IS 'NONE STOCK_LOCK_FAILED PAY_TIMEOUT CUSTOMER_CANCEL DELIVERY_FAILED';

COMMENT ON COLUMN core.order_unit_event.event_at IS '业务时刻';

COMMENT ON COLUMN core.order_unit_event.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.order_unit_event.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.web_session (
    tenant_id smallint NOT NULL,
    session_id bigint NOT NULL,
    channel_id bigint NOT NULL,
    region_id bigint NOT NULL,
    identity_id bigint,
    anonymous_token text NOT NULL,
    campaign_id bigint,
    started_at timestamptz NOT NULL,
    device_type text NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, session_id),
    UNIQUE (tenant_id, session_id, region_id),
    CHECK (device_type IN ('MOBILE','DESKTOP','TABLET')),
    CHECK (available_at >= started_at)
);

COMMENT ON TABLE core.web_session IS '自有线上渠道的一次会话。匿名访客与已绑定会员分别表达；平台渠道不生成此表';

COMMENT ON COLUMN core.web_session.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.web_session.session_id IS '会话 ID';

COMMENT ON COLUMN core.web_session.channel_id IS '自有渠道';

COMMENT ON COLUMN core.web_session.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.web_session.identity_id IS '识别出的渠道身份';

COMMENT ON COLUMN core.web_session.anonymous_token IS '匿名设备会话令牌';

COMMENT ON COLUMN core.web_session.campaign_id IS '可观察的活动来源';

COMMENT ON COLUMN core.web_session.started_at IS '会话起点';

COMMENT ON COLUMN core.web_session.device_type IS 'MOBILE DESKTOP TABLET';

COMMENT ON COLUMN core.web_session.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.web_session.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.behavior_event (
    tenant_id smallint NOT NULL,
    behavior_event_id bigint NOT NULL,
    session_id bigint NOT NULL,
    region_id bigint NOT NULL,
    event_seq integer NOT NULL,
    event_type text NOT NULL,
    sku_id bigint,
    order_id bigint,
    reason_code text NOT NULL,
    event_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, behavior_event_id),
    UNIQUE (tenant_id, session_id, event_seq),
    CHECK (event_type IN ('PAGE_VIEW','SEARCH','PRODUCT_VIEW','ADD_CART','CHECKOUT_SUBMITTED','CHECKOUT_REJECTED')),
    CHECK (event_seq > 0),
    CHECK (available_at >= event_at),
    CHECK ((event_type = 'CHECKOUT_SUBMITTED') = (order_id IS NOT NULL))
);

COMMENT ON TABLE core.behavior_event IS '一个可观察的会话行为事件。自有渠道完整同源轨迹；不可与订单独立随机生成';

COMMENT ON COLUMN core.behavior_event.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.behavior_event.behavior_event_id IS '事件 ID';

COMMENT ON COLUMN core.behavior_event.session_id IS '会话';

COMMENT ON COLUMN core.behavior_event.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.behavior_event.event_seq IS '会话内递增序号';

COMMENT ON COLUMN core.behavior_event.event_type IS 'PAGE_VIEW SEARCH PRODUCT_VIEW ADD_CART CHECKOUT_SUBMITTED CHECKOUT_REJECTED';

COMMENT ON COLUMN core.behavior_event.sku_id IS '涉及 SKU 允许无';

COMMENT ON COLUMN core.behavior_event.order_id IS '已创建的订单 允许无';

COMMENT ON COLUMN core.behavior_event.reason_code IS 'NONE SOLD_OUT INVALID_CART';

COMMENT ON COLUMN core.behavior_event.event_at IS '行为发生时刻';

COMMENT ON COLUMN core.behavior_event.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.behavior_event.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.campaign_daily (
    tenant_id smallint NOT NULL,
    report_date date NOT NULL,
    campaign_id bigint NOT NULL,
    channel_id bigint NOT NULL,
    region_id bigint NOT NULL,
    impressions bigint NOT NULL,
    clicks bigint NOT NULL,
    spend_cent bigint NOT NULL,
    report_version integer NOT NULL,
    source_updated_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, report_date, campaign_id, channel_id, region_id, report_version),
    CHECK (impressions >= 0),
    CHECK (clicks BETWEEN 0 AND impressions),
    CHECK (spend_cent >= 0),
    CHECK (report_version > 0),
    CHECK (available_at >= source_updated_at)
);

COMMENT ON TABLE core.campaign_daily IS '一个日 活动 承接渠道 经营区域。广告花费属于此粒度；不得直接连接订单明细后 SUM';

COMMENT ON COLUMN core.campaign_daily.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.campaign_daily.report_date IS '当地日期';

COMMENT ON COLUMN core.campaign_daily.campaign_id IS '活动';

COMMENT ON COLUMN core.campaign_daily.channel_id IS '承接渠道';

COMMENT ON COLUMN core.campaign_daily.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.campaign_daily.impressions IS '曝光数';

COMMENT ON COLUMN core.campaign_daily.clicks IS '点击数';

COMMENT ON COLUMN core.campaign_daily.spend_cent IS '当天广告花费；CNY 不含税整数分';

COMMENT ON COLUMN core.campaign_daily.report_version IS '源报表版本 从1开始';

COMMENT ON COLUMN core.campaign_daily.source_updated_at IS '源报表更新时间';

COMMENT ON COLUMN core.campaign_daily.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.campaign_daily.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.channel_product_daily (
    tenant_id smallint NOT NULL,
    report_date date NOT NULL,
    channel_id bigint NOT NULL,
    sku_id bigint NOT NULL,
    region_id bigint NOT NULL,
    product_views bigint NOT NULL,
    product_visitors bigint NOT NULL,
    add_cart_users bigint NOT NULL,
    submitted_orders bigint NOT NULL,
    paid_orders bigint NOT NULL,
    paid_amount_cent bigint NOT NULL,
    report_version integer NOT NULL,
    source_updated_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, report_date, channel_id, sku_id, region_id, report_version),
    CHECK (product_views >= product_visitors),
    CHECK (product_visitors >= 0),
    CHECK (add_cart_users BETWEEN 0 AND product_visitors),
    CHECK (submitted_orders >= 0),
    CHECK (paid_orders BETWEEN 0 AND submitted_orders),
    CHECK (paid_amount_cent >= 0),
    CHECK (report_version > 0),
    CHECK (available_at >= source_updated_at)
);

COMMENT ON TABLE core.channel_product_daily IS '一个平台 日 渠道 SKU 区域的经营报表版本。只提供平台可见汇总；商品购买订单数不可跨 SKU 相加当独立订单数';

COMMENT ON COLUMN core.channel_product_daily.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.channel_product_daily.report_date IS '下单 cohort 的本地日期；支付随后到达则修订此日期版本';

COMMENT ON COLUMN core.channel_product_daily.channel_id IS '平台渠道';

COMMENT ON COLUMN core.channel_product_daily.sku_id IS 'SKU';

COMMENT ON COLUMN core.channel_product_daily.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.channel_product_daily.product_views IS '商品页访问事件数 PV';

COMMENT ON COLUMN core.channel_product_daily.product_visitors IS '商品页独立访客 UV';

COMMENT ON COLUMN core.channel_product_daily.add_cart_users IS '加购人数';

COMMENT ON COLUMN core.channel_product_daily.submitted_orders IS '含本 SKU 的创建订单数';

COMMENT ON COLUMN core.channel_product_daily.paid_orders IS '该创建日期 cohort 含本 SKU 的订单，截至版本可见时累计已足额支付单数';

COMMENT ON COLUMN core.channel_product_daily.paid_amount_cent IS '该创建日期 cohort 已足额支付订单分配到本 SKU 的净额 CNY整数分；不是当日现金流';

COMMENT ON COLUMN core.channel_product_daily.report_version IS '源报表修订版本';

COMMENT ON COLUMN core.channel_product_daily.source_updated_at IS '来源修订时间';

COMMENT ON COLUMN core.channel_product_daily.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.channel_product_daily.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.store_traffic_daily (
    tenant_id smallint NOT NULL,
    report_date date NOT NULL,
    site_id bigint NOT NULL,
    region_id bigint NOT NULL,
    visits bigint NOT NULL,
    report_version integer NOT NULL,
    source_updated_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, report_date, site_id, report_version),
    CHECK (visits >= 0),
    CHECK (report_version > 0),
    CHECK (available_at >= source_updated_at)
);

COMMENT ON TABLE core.store_traffic_daily IS '一家门店一天的客流报表版本。客流是进店人次而非企业独立用户';

COMMENT ON COLUMN core.store_traffic_daily.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.store_traffic_daily.report_date IS '当地日期';

COMMENT ON COLUMN core.store_traffic_daily.site_id IS '门店';

COMMENT ON COLUMN core.store_traffic_daily.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.store_traffic_daily.visits IS '进店人次';

COMMENT ON COLUMN core.store_traffic_daily.report_version IS '修订版本';

COMMENT ON COLUMN core.store_traffic_daily.source_updated_at IS '源更新时间';

COMMENT ON COLUMN core.store_traffic_daily.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.store_traffic_daily.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.order_attribution (
    tenant_id smallint NOT NULL,
    attribution_id bigint NOT NULL,
    order_id bigint NOT NULL,
    region_id bigint NOT NULL,
    campaign_id bigint,
    session_id bigint,
    touch_at timestamptz,
    model_version text NOT NULL,
    credit numeric(9,8) NOT NULL,
    evidence_type text NOT NULL,
    computed_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, attribution_id),
    UNIQUE (tenant_id, order_id, model_version),
    CHECK (credit = 1),
    CHECK (model_version = 'LAST_NON_DIRECT_7D_V1'),
    CHECK (evidence_type IN ('OWNED_TOUCH','ORGANIC','UNATTRIBUTABLE')),
    CHECK (available_at >= computed_at),
    CHECK ((evidence_type = 'OWNED_TOUCH' AND campaign_id IS NOT NULL AND session_id IS NOT NULL AND touch_at IS NOT NULL) OR (evidence_type IN ('ORGANIC','UNATTRIBUTABLE') AND campaign_id IS NULL AND session_id IS NULL AND touch_at IS NULL))
);

COMMENT ON TABLE core.order_attribution IS '某归因模型版本对一张订单的一条触点归因。v1 LAST_NON_DIRECT_7D 最多一条每单；多触点扩展必须权重归一';

COMMENT ON COLUMN core.order_attribution.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.order_attribution.attribution_id IS '归因记录 ID';

COMMENT ON COLUMN core.order_attribution.order_id IS '订单';

COMMENT ON COLUMN core.order_attribution.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.order_attribution.campaign_id IS '归因活动 无则自然或不可归因';

COMMENT ON COLUMN core.order_attribution.session_id IS '可观察自有会话 平台可无';

COMMENT ON COLUMN core.order_attribution.touch_at IS '触点时间 不可观测可空';

COMMENT ON COLUMN core.order_attribution.model_version IS '固定 LAST_NON_DIRECT_7D_V1';

COMMENT ON COLUMN core.order_attribution.credit IS '归因权重 v1 固定1';

COMMENT ON COLUMN core.order_attribution.evidence_type IS 'OWNED_TOUCH ORGANIC UNATTRIBUTABLE；平台仅有日聚合报表时必须 UNATTRIBUTABLE';

COMMENT ON COLUMN core.order_attribution.computed_at IS '归因计算时刻';

COMMENT ON COLUMN core.order_attribution.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.order_attribution.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.target_monthly (
    tenant_id smallint NOT NULL,
    target_month date NOT NULL,
    channel_id bigint NOT NULL,
    region_id bigint NOT NULL,
    metric_code text NOT NULL,
    target_cent bigint NOT NULL,
    plan_version integer NOT NULL,
    approved_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, target_month, channel_id, region_id, metric_code, plan_version),
    CHECK (extract(day FROM target_month) = 1),
    CHECK (metric_code IN ('NET_SALES','CONTRIBUTION')),
    CHECK (plan_version > 0),
    CHECK (available_at >= approved_at)
);

COMMENT ON TABLE core.target_monthly IS '某月 渠道 大区的一项指标目标。v1 不同时混入集团总目标或品类目标；先聚合实际再关联';

COMMENT ON COLUMN core.target_monthly.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.target_monthly.target_month IS '月份第一天';

COMMENT ON COLUMN core.target_monthly.channel_id IS '渠道';

COMMENT ON COLUMN core.target_monthly.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.target_monthly.metric_code IS 'NET_SALES CONTRIBUTION';

COMMENT ON COLUMN core.target_monthly.target_cent IS '目标金额 CNY整数分';

COMMENT ON COLUMN core.target_monthly.plan_version IS '目标版本';

COMMENT ON COLUMN core.target_monthly.approved_at IS '批准时间';

COMMENT ON COLUMN core.target_monthly.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.target_monthly.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE ops.generation_run (
    run_id text NOT NULL,
    release_id text NOT NULL,
    stage text NOT NULL,
    status text NOT NULL,
    started_at timestamptz NOT NULL,
    finished_at timestamptz,
    checkpoint_uri text,
    input_sha256 char(64) NOT NULL,
    PRIMARY KEY (run_id),
    CHECK (status IN ('RUNNING','SUCCEEDED','FAILED'))
);

COMMENT ON TABLE ops.generation_run IS '一次生成或恢复运行。代码 配置 输入指纹及检查点必须匹配才允许恢复';

COMMENT ON COLUMN ops.generation_run.run_id IS '运行 ID';

COMMENT ON COLUMN ops.generation_run.release_id IS '发布版本';

COMMENT ON COLUMN ops.generation_run.stage IS 'ACQUIRE WEIGHTS CONTEXT PROPOSAL SIMULATE PUBLISH VALIDATE';

COMMENT ON COLUMN ops.generation_run.status IS 'RUNNING SUCCEEDED FAILED';

COMMENT ON COLUMN ops.generation_run.started_at IS '运行起点';

COMMENT ON COLUMN ops.generation_run.finished_at IS '结束时间';

COMMENT ON COLUMN ops.generation_run.checkpoint_uri IS '最新已提交检查点';

COMMENT ON COLUMN ops.generation_run.input_sha256 IS '输入规范化摘要';

CREATE TABLE ops.file_manifest (
    file_id text NOT NULL,
    release_id text NOT NULL,
    run_id text NOT NULL,
    tenant_id smallint,
    asset_name text NOT NULL,
    partition_key text NOT NULL,
    relative_path text NOT NULL,
    row_count bigint NOT NULL,
    byte_size bigint NOT NULL,
    sha256 char(64) NOT NULL,
    logical_sha256 char(64) NOT NULL,
    schema_sha256 char(64) NOT NULL,
    committed_at timestamptz NOT NULL,
    PRIMARY KEY (file_id),
    UNIQUE (release_id, relative_path),
    CHECK (row_count >= 0),
    CHECK (byte_size >= 0)
);

COMMENT ON TABLE ops.file_manifest IS '一份已提交的数据或配置文件。幂等提交与发布依据；不暴露给业务 Agent';

COMMENT ON COLUMN ops.file_manifest.file_id IS '内容地址文件 ID';

COMMENT ON COLUMN ops.file_manifest.release_id IS '发布版本';

COMMENT ON COLUMN ops.file_manifest.run_id IS '运行';

COMMENT ON COLUMN ops.file_manifest.tenant_id IS '业务租户 无则公共元数据';

COMMENT ON COLUMN ops.file_manifest.asset_name IS '逻辑表或资产名';

COMMENT ON COLUMN ops.file_manifest.partition_key IS '规范化分区键';

COMMENT ON COLUMN ops.file_manifest.relative_path IS '相对版本根的文件路径';

COMMENT ON COLUMN ops.file_manifest.row_count IS '逻辑行数';

COMMENT ON COLUMN ops.file_manifest.byte_size IS '字节数';

COMMENT ON COLUMN ops.file_manifest.sha256 IS '物理文件摘要';

COMMENT ON COLUMN ops.file_manifest.logical_sha256 IS '按规定排序的逻辑内容摘要';

COMMENT ON COLUMN ops.file_manifest.schema_sha256 IS 'schema摘要';

COMMENT ON COLUMN ops.file_manifest.committed_at IS '提交时间';

CREATE TABLE ops.source_watermark (
    tenant_id smallint NOT NULL,
    source_system text NOT NULL,
    observed_at timestamptz NOT NULL,
    complete_through timestamptz NOT NULL,
    expected_batches integer NOT NULL,
    arrived_batches integer NOT NULL,
    status text NOT NULL,
    missing_batch_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    PRIMARY KEY (tenant_id, source_system, observed_at),
    CHECK (arrived_batches BETWEEN 0 AND expected_batches),
    CHECK (status IN ('COMPLETE','DELAYED','FAILED')),
    CHECK (complete_through <= observed_at)
);

COMMENT ON TABLE ops.source_watermark IS '某源在一个已观察时点的完整性水位。complete_through 由批次连续覆盖得到，不能使用 MAX(event_at)';

COMMENT ON COLUMN ops.source_watermark.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN ops.source_watermark.source_system IS '源系统';

COMMENT ON COLUMN ops.source_watermark.observed_at IS '检查时间';

COMMENT ON COLUMN ops.source_watermark.complete_through IS '确认完整的业务时间截止 不含';

COMMENT ON COLUMN ops.source_watermark.expected_batches IS '应到批次数';

COMMENT ON COLUMN ops.source_watermark.arrived_batches IS '已到批次数';

COMMENT ON COLUMN ops.source_watermark.status IS 'COMPLETE DELAYED FAILED';

COMMENT ON COLUMN ops.source_watermark.missing_batch_ids IS '缺失批次 ID数组';

CREATE TABLE sec.principal (
    db_role name NOT NULL,
    tenant_id smallint NOT NULL,
    persona text NOT NULL,
    all_regions boolean NOT NULL,
    can_view_cost boolean NOT NULL,
    PRIMARY KEY (db_role),
    UNIQUE (db_role, tenant_id),
    CHECK (persona IN ('EXEC','ANALYST','REGION','MARKETING'))
);

COMMENT ON TABLE sec.principal IS '一个真实数据库登录身份。认证使用 session_user，禁止依赖任意 SQL 可改的 tenant GUC';

COMMENT ON COLUMN sec.principal.db_role IS '实际数据库登录角色名';

COMMENT ON COLUMN sec.principal.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN sec.principal.persona IS 'EXEC ANALYST REGION MARKETING';

COMMENT ON COLUMN sec.principal.all_regions IS '允许本租户全部区域';

COMMENT ON COLUMN sec.principal.can_view_cost IS '允许采购成本 成本台账 与费用';

CREATE TABLE sec.principal_region (
    db_role name NOT NULL,
    tenant_id smallint NOT NULL,
    region_id bigint NOT NULL,
    PRIMARY KEY (db_role, tenant_id, region_id)
);

COMMENT ON TABLE sec.principal_region IS '登录角色的一条区域授权。仅受信任管理员可写';

COMMENT ON COLUMN sec.principal_region.db_role IS '登录角色';

COMMENT ON COLUMN sec.principal_region.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN sec.principal_region.region_id IS '授权大区';

CREATE TABLE eval.scenario (
    scenario_id text NOT NULL,
    tenant_id smallint NOT NULL,
    scenario_type text NOT NULL,
    title text NOT NULL,
    parameters jsonb NOT NULL,
    observable_evidence jsonb NOT NULL,
    truth_definition jsonb NOT NULL,
    PRIMARY KEY (scenario_id)
);

COMMENT ON TABLE eval.scenario IS '一个业务或数据链路情节。对业务 Agent 和普通查询角色完全隔离';

COMMENT ON COLUMN eval.scenario.scenario_id IS '场景代码';

COMMENT ON COLUMN eval.scenario.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN eval.scenario.scenario_type IS 'BUSINESS DATA_PIPELINE ACCESS';

COMMENT ON COLUMN eval.scenario.title IS '场景标题';

COMMENT ON COLUMN eval.scenario.parameters IS '确定性注入参数';

COMMENT ON COLUMN eval.scenario.observable_evidence IS '可见证据资产及范围';

COMMENT ON COLUMN eval.scenario.truth_definition IS '预期变化算法与反事实定义';

CREATE TABLE eval.question (
    question_id text NOT NULL,
    scenario_id text,
    tenant_id smallint NOT NULL,
    persona text NOT NULL,
    question_text text NOT NULL,
    business_as_of timestamptz NOT NULL,
    knowledge_as_of timestamptz NOT NULL,
    reference_time timestamptz NOT NULL,
    metric_version text NOT NULL,
    gold_sql_path text NOT NULL,
    expected_shape jsonb NOT NULL,
    tolerance jsonb NOT NULL,
    PRIMARY KEY (question_id)
);

COMMENT ON TABLE eval.question IS '一条自然语言评测题的版本。每题固定权限 时间口径 数据版本和结果形式';

COMMENT ON COLUMN eval.question.question_id IS '题号';

COMMENT ON COLUMN eval.question.scenario_id IS '所属情节 普通指标题可无';

COMMENT ON COLUMN eval.question.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN eval.question.persona IS '测试角色';

COMMENT ON COLUMN eval.question.question_text IS '中文题目';

COMMENT ON COLUMN eval.question.business_as_of IS '业务事件截止';

COMMENT ON COLUMN eval.question.knowledge_as_of IS '数据可见截止';

COMMENT ON COLUMN eval.question.reference_time IS '解释昨天 本月 最近30天的固定语义时钟；独立于真实运行日期';

COMMENT ON COLUMN eval.question.metric_version IS '指标版本';

COMMENT ON COLUMN eval.question.gold_sql_path IS '独立金标SQL相对路径';

COMMENT ON COLUMN eval.question.expected_shape IS '列名 类型 排序 单位 图表维度';

COMMENT ON COLUMN eval.question.tolerance IS '金额0 容差 比率容差等';

CREATE TABLE eval.expected_result (
    question_id text NOT NULL,
    release_id text NOT NULL,
    result_sha256 char(64) NOT NULL,
    result_rows jsonb NOT NULL,
    verifier_version text NOT NULL,
    computed_at timestamptz NOT NULL,
    PRIMARY KEY (question_id, release_id)
);

COMMENT ON TABLE eval.expected_result IS '一条题目在一个版本上的金标结果。不把 Agent 自己生成的 SQL 当金标';

COMMENT ON COLUMN eval.expected_result.question_id IS '题号';

COMMENT ON COLUMN eval.expected_result.release_id IS '版本';

COMMENT ON COLUMN eval.expected_result.result_sha256 IS '规范化结果摘要';

COMMENT ON COLUMN eval.expected_result.result_rows IS '小规模金标结果 或存放摘要与文件路径';

COMMENT ON COLUMN eval.expected_result.verifier_version IS '独立验证器版本';

COMMENT ON COLUMN eval.expected_result.computed_at IS '金标生成时刻';

CREATE TABLE core.customer_identity_link (
    tenant_id smallint NOT NULL,
    identity_link_id bigint NOT NULL,
    identity_id bigint NOT NULL,
    customer_id bigint NOT NULL,
    linked_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, identity_link_id),
    UNIQUE (tenant_id, identity_id),
    CHECK (available_at >= linked_at)
);

COMMENT ON TABLE core.customer_identity_link IS '一条渠道身份到会员的已验证绑定。身份本身保持不可变；绑定独立记录，禁止把未来会员关联回填到历史订单';

COMMENT ON COLUMN core.customer_identity_link.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.customer_identity_link.identity_link_id IS '绑定记录';

COMMENT ON COLUMN core.customer_identity_link.identity_id IS '渠道身份';

COMMENT ON COLUMN core.customer_identity_link.customer_id IS '企业会员';

COMMENT ON COLUMN core.customer_identity_link.linked_at IS '绑定确认时刻';

COMMENT ON COLUMN core.customer_identity_link.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.customer_identity_link.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.stock_allocation_attempt (
    tenant_id smallint NOT NULL,
    allocation_attempt_id bigint NOT NULL,
    allocation_group_id bigint NOT NULL,
    order_id bigint NOT NULL,
    region_id bigint NOT NULL,
    site_id bigint NOT NULL,
    sku_id bigint NOT NULL,
    requested_qty integer NOT NULL,
    available_before_qty integer NOT NULL,
    outcome text NOT NULL,
    attempted_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, allocation_attempt_id),
    UNIQUE (tenant_id, allocation_group_id, site_id, sku_id),
    CHECK (requested_qty > 0),
    CHECK (available_before_qty >= 0),
    CHECK (outcome IN ('COMMITTED','INSUFFICIENT','ROLLED_BACK')),
    CHECK (outcome <> 'COMMITTED' OR requested_qty <= available_before_qty),
    CHECK (available_at >= attempted_at)
);

COMMENT ON TABLE core.stock_allocation_attempt IS '一次订单锁库事务中一个候选地点 SKU 的尝试。包含失败尝试的可观察库存证据；整单验证后原子提交，失败不产生部分预留';

COMMENT ON COLUMN core.stock_allocation_attempt.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.stock_allocation_attempt.allocation_attempt_id IS '尝试行 ID';

COMMENT ON COLUMN core.stock_allocation_attempt.allocation_group_id IS '全订单原子尝试组';

COMMENT ON COLUMN core.stock_allocation_attempt.order_id IS '已创建订单';

COMMENT ON COLUMN core.stock_allocation_attempt.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.stock_allocation_attempt.site_id IS '候选履约地点';

COMMENT ON COLUMN core.stock_allocation_attempt.sku_id IS '待预留 SKU';

COMMENT ON COLUMN core.stock_allocation_attempt.requested_qty IS '本地点拟承担数量';

COMMENT ON COLUMN core.stock_allocation_attempt.available_before_qty IS '尝试前可承诺量';

COMMENT ON COLUMN core.stock_allocation_attempt.outcome IS 'COMMITTED INSUFFICIENT ROLLED_BACK';

COMMENT ON COLUMN core.stock_allocation_attempt.attempted_at IS '锁库尝试时刻';

COMMENT ON COLUMN core.stock_allocation_attempt.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.stock_allocation_attempt.load_batch_id IS '模拟采集批次；引用本租户采集批次';

CREATE TABLE core.inventory_valuation_snapshot (
    tenant_id smallint NOT NULL,
    snapshot_date date NOT NULL,
    site_id bigint NOT NULL,
    region_id bigint NOT NULL,
    sku_id bigint NOT NULL,
    as_of timestamptz NOT NULL,
    sellable_value_cent bigint NOT NULL,
    available_at timestamptz NOT NULL,
    load_batch_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, snapshot_date, site_id, sku_id, as_of),
    CHECK (sellable_value_cent >= 0),
    CHECK (available_at >= as_of)
);

COMMENT ON TABLE core.inventory_valuation_snapshot IS '一个日末 地点 SKU 和观察截止的库存金额。由批次余额乘原批次成本汇总；只计可售物理库存，预留包含其中；待检和损坏不重复确认为存货资产';

COMMENT ON COLUMN core.inventory_valuation_snapshot.tenant_id IS '企业租户；101 主租户，102 和 103 隔离租户';

COMMENT ON COLUMN core.inventory_valuation_snapshot.snapshot_date IS '本地日末日期';

COMMENT ON COLUMN core.inventory_valuation_snapshot.site_id IS '地点';

COMMENT ON COLUMN core.inventory_valuation_snapshot.region_id IS '经营归属大区；与所属订单或地点一致';

COMMENT ON COLUMN core.inventory_valuation_snapshot.sku_id IS 'SKU';

COMMENT ON COLUMN core.inventory_valuation_snapshot.as_of IS '信息截止';

COMMENT ON COLUMN core.inventory_valuation_snapshot.sellable_value_cent IS '可售物理库存原批次成本合计；CNY 不含税整数分';

COMMENT ON COLUMN core.inventory_valuation_snapshot.available_at IS '源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效';

COMMENT ON COLUMN core.inventory_valuation_snapshot.load_batch_id IS '模拟采集批次；引用本租户采集批次';

ALTER TABLE core.tenant ADD CONSTRAINT fk_01_00 FOREIGN KEY (release_id) REFERENCES ops.dataset_release (release_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE ops.ingestion_batch ADD CONSTRAINT fk_02_00 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.geo_area ADD CONSTRAINT fk_03_00 FOREIGN KEY (tenant_id, parent_geo_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.geo_area ADD CONSTRAINT fk_03_01 FOREIGN KEY (tenant_id, region_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.geo_area ADD CONSTRAINT fk_03_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.org_unit ADD CONSTRAINT fk_04_00 FOREIGN KEY (tenant_id, parent_org_unit_id) REFERENCES core.org_unit (tenant_id, org_unit_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.org_unit ADD CONSTRAINT fk_04_01 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.site ADD CONSTRAINT fk_05_00 FOREIGN KEY (tenant_id, org_unit_id) REFERENCES core.org_unit (tenant_id, org_unit_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.site ADD CONSTRAINT fk_05_01 FOREIGN KEY (tenant_id, geo_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.site ADD CONSTRAINT fk_05_02 FOREIGN KEY (tenant_id, region_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.site ADD CONSTRAINT fk_05_03 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.channel ADD CONSTRAINT fk_06_00 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.brand ADD CONSTRAINT fk_07_00 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.category ADD CONSTRAINT fk_08_00 FOREIGN KEY (tenant_id, parent_category_id) REFERENCES core.category (tenant_id, category_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.category ADD CONSTRAINT fk_08_01 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.sport ADD CONSTRAINT fk_09_00 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.spu ADD CONSTRAINT fk_10_00 FOREIGN KEY (tenant_id, brand_id) REFERENCES core.brand (tenant_id, brand_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.spu ADD CONSTRAINT fk_10_01 FOREIGN KEY (tenant_id, category_id) REFERENCES core.category (tenant_id, category_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.spu ADD CONSTRAINT fk_10_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.spu_sport ADD CONSTRAINT fk_11_00 FOREIGN KEY (tenant_id, spu_id) REFERENCES core.spu (tenant_id, spu_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.spu_sport ADD CONSTRAINT fk_11_01 FOREIGN KEY (tenant_id, sport_id) REFERENCES core.sport (tenant_id, sport_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.spu_sport ADD CONSTRAINT fk_11_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.sku ADD CONSTRAINT fk_12_00 FOREIGN KEY (tenant_id, spu_id) REFERENCES core.spu (tenant_id, spu_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.sku ADD CONSTRAINT fk_12_01 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.channel_listing ADD CONSTRAINT fk_13_00 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.channel_listing ADD CONSTRAINT fk_13_01 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.channel_listing ADD CONSTRAINT fk_13_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.channel_listing ADD CONSTRAINT fk_13_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.assortment ADD CONSTRAINT fk_14_00 FOREIGN KEY (tenant_id, site_id, region_id) REFERENCES core.site (tenant_id, site_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.assortment ADD CONSTRAINT fk_14_01 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.assortment ADD CONSTRAINT fk_14_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.assortment ADD CONSTRAINT fk_14_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.price_period ADD CONSTRAINT fk_15_00 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.price_period ADD CONSTRAINT fk_15_01 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.price_period ADD CONSTRAINT fk_15_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.price_period ADD CONSTRAINT fk_15_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.cost_period ADD CONSTRAINT fk_16_00 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.cost_period ADD CONSTRAINT fk_16_01 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.cost_period ADD CONSTRAINT fk_16_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.customer ADD CONSTRAINT fk_17_00 FOREIGN KEY (tenant_id, home_geo_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.customer ADD CONSTRAINT fk_17_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.customer ADD CONSTRAINT fk_17_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.customer_identity ADD CONSTRAINT fk_18_00 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.customer_identity ADD CONSTRAINT fk_18_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.customer_identity ADD CONSTRAINT fk_18_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.campaign ADD CONSTRAINT fk_20_00 FOREIGN KEY (tenant_id, target_channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.campaign ADD CONSTRAINT fk_20_01 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.campaign ADD CONSTRAINT fk_20_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.promotion ADD CONSTRAINT fk_21_00 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.promotion ADD CONSTRAINT fk_21_01 FOREIGN KEY (tenant_id, campaign_id) REFERENCES core.campaign (tenant_id, campaign_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.promotion ADD CONSTRAINT fk_21_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.promotion ADD CONSTRAINT fk_21_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_header ADD CONSTRAINT fk_22_00 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_header ADD CONSTRAINT fk_22_01 FOREIGN KEY (tenant_id, org_unit_id) REFERENCES core.org_unit (tenant_id, org_unit_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_header ADD CONSTRAINT fk_22_02 FOREIGN KEY (tenant_id, region_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_header ADD CONSTRAINT fk_22_03 FOREIGN KEY (tenant_id, demand_geo_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_header ADD CONSTRAINT fk_22_04 FOREIGN KEY (tenant_id, selling_site_id) REFERENCES core.site (tenant_id, site_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_header ADD CONSTRAINT fk_22_05 FOREIGN KEY (tenant_id, customer_id) REFERENCES core.customer (tenant_id, customer_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_header ADD CONSTRAINT fk_22_06 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_header ADD CONSTRAINT fk_22_07 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_header ADD CONSTRAINT fk_22_08 FOREIGN KEY (tenant_id, identity_id, channel_id) REFERENCES core.customer_identity (tenant_id, identity_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX ix_22_00 ON core.order_header (tenant_id, order_date, channel_id);

CREATE INDEX ix_22_01 ON core.order_header (tenant_id, customer_id, ordered_at);

ALTER TABLE core.order_line ADD CONSTRAINT fk_23_00 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_line ADD CONSTRAINT fk_23_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_line ADD CONSTRAINT fk_23_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_line ADD CONSTRAINT fk_23_03 FOREIGN KEY (tenant_id, order_id, region_id, channel_id) REFERENCES core.order_header (tenant_id, order_id, region_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_line ADD CONSTRAINT fk_23_04 FOREIGN KEY (tenant_id, listing_id, sku_id, channel_id) REFERENCES core.channel_listing (tenant_id, listing_id, sku_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_line ADD CONSTRAINT fk_23_05 FOREIGN KEY (tenant_id, price_id, sku_id, channel_id) REFERENCES core.price_period (tenant_id, price_id, sku_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX ix_23_00 ON core.order_line (tenant_id, sku_id, order_id);

ALTER TABLE core.order_unit ADD CONSTRAINT fk_24_00 FOREIGN KEY (tenant_id, order_line_id, order_id, region_id, sku_id) REFERENCES core.order_line (tenant_id, order_line_id, order_id, region_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_unit ADD CONSTRAINT fk_24_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_unit ADD CONSTRAINT fk_24_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_status_event ADD CONSTRAINT fk_25_00 FOREIGN KEY (tenant_id, order_id, region_id) REFERENCES core.order_header (tenant_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_status_event ADD CONSTRAINT fk_25_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_status_event ADD CONSTRAINT fk_25_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX ix_25_00 ON core.order_status_event (tenant_id, order_id, event_at);

ALTER TABLE core.discount_allocation ADD CONSTRAINT fk_26_00 FOREIGN KEY (tenant_id, order_unit_id, region_id) REFERENCES core.order_unit (tenant_id, order_unit_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.discount_allocation ADD CONSTRAINT fk_26_01 FOREIGN KEY (tenant_id, promotion_id) REFERENCES core.promotion (tenant_id, promotion_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.discount_allocation ADD CONSTRAINT fk_26_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.discount_allocation ADD CONSTRAINT fk_26_03 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.payment ADD CONSTRAINT fk_27_00 FOREIGN KEY (tenant_id, order_id, region_id) REFERENCES core.order_header (tenant_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.payment ADD CONSTRAINT fk_27_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.payment ADD CONSTRAINT fk_27_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX ix_27_00 ON core.payment (tenant_id, order_id);

ALTER TABLE core.refund ADD CONSTRAINT fk_28_00 FOREIGN KEY (tenant_id, payment_id, order_id, region_id) REFERENCES core.payment (tenant_id, payment_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.refund ADD CONSTRAINT fk_28_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.refund ADD CONSTRAINT fk_28_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.refund_allocation ADD CONSTRAINT fk_29_00 FOREIGN KEY (tenant_id, refund_id, order_id, region_id) REFERENCES core.refund (tenant_id, refund_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.refund_allocation ADD CONSTRAINT fk_29_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.refund_allocation ADD CONSTRAINT fk_29_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.refund_allocation ADD CONSTRAINT fk_29_03 FOREIGN KEY (tenant_id, order_unit_id, order_id, region_id) REFERENCES core.order_unit (tenant_id, order_unit_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_lot ADD CONSTRAINT fk_30_00 FOREIGN KEY (tenant_id, site_id, region_id) REFERENCES core.site (tenant_id, site_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_lot ADD CONSTRAINT fk_30_01 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_lot ADD CONSTRAINT fk_30_02 FOREIGN KEY (tenant_id, cost_id) REFERENCES core.cost_period (tenant_id, cost_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_lot ADD CONSTRAINT fk_30_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_lot ADD CONSTRAINT fk_30_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_lot ADD CONSTRAINT fk_30_05 FOREIGN KEY (tenant_id, parent_lot_id, sku_id) REFERENCES core.inventory_lot (tenant_id, lot_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.shipment ADD CONSTRAINT fk_31_00 FOREIGN KEY (tenant_id, order_id, region_id) REFERENCES core.order_header (tenant_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.shipment ADD CONSTRAINT fk_31_01 FOREIGN KEY (tenant_id, from_site_id) REFERENCES core.site (tenant_id, site_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.shipment ADD CONSTRAINT fk_31_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.shipment ADD CONSTRAINT fk_31_03 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.shipment_item ADD CONSTRAINT fk_32_00 FOREIGN KEY (tenant_id, shipment_id, order_id, region_id, from_site_id) REFERENCES core.shipment (tenant_id, shipment_id, order_id, region_id, from_site_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.shipment_item ADD CONSTRAINT fk_32_01 FOREIGN KEY (tenant_id, order_unit_id, order_id, region_id, sku_id) REFERENCES core.order_unit (tenant_id, order_unit_id, order_id, region_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.shipment_item ADD CONSTRAINT fk_32_02 FOREIGN KEY (tenant_id, lot_id, from_site_id, sku_id) REFERENCES core.inventory_lot (tenant_id, lot_id, site_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.shipment_item ADD CONSTRAINT fk_32_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.shipment_item ADD CONSTRAINT fk_32_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.shipment_event ADD CONSTRAINT fk_33_00 FOREIGN KEY (tenant_id, shipment_id, order_id, region_id, from_site_id) REFERENCES core.shipment (tenant_id, shipment_id, order_id, region_id, from_site_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.shipment_event ADD CONSTRAINT fk_33_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.shipment_event ADD CONSTRAINT fk_33_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.return_header ADD CONSTRAINT fk_34_00 FOREIGN KEY (tenant_id, order_id, region_id) REFERENCES core.order_header (tenant_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.return_header ADD CONSTRAINT fk_34_01 FOREIGN KEY (tenant_id, request_channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.return_header ADD CONSTRAINT fk_34_02 FOREIGN KEY (tenant_id, receiving_site_id) REFERENCES core.site (tenant_id, site_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.return_header ADD CONSTRAINT fk_34_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.return_header ADD CONSTRAINT fk_34_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.return_item ADD CONSTRAINT fk_35_00 FOREIGN KEY (tenant_id, return_id, order_id, region_id) REFERENCES core.return_header (tenant_id, return_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.return_item ADD CONSTRAINT fk_35_01 FOREIGN KEY (tenant_id, shipment_item_id, order_unit_id, region_id) REFERENCES core.shipment_item (tenant_id, shipment_item_id, order_unit_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.return_item ADD CONSTRAINT fk_35_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.return_item ADD CONSTRAINT fk_35_03 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.return_item ADD CONSTRAINT fk_35_04 FOREIGN KEY (tenant_id, order_unit_id, order_id, region_id) REFERENCES core.order_unit (tenant_id, order_unit_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.return_event ADD CONSTRAINT fk_36_00 FOREIGN KEY (tenant_id, return_item_id, order_unit_id, region_id) REFERENCES core.return_item (tenant_id, return_item_id, order_unit_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.return_event ADD CONSTRAINT fk_36_01 FOREIGN KEY (tenant_id, site_id) REFERENCES core.site (tenant_id, site_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.return_event ADD CONSTRAINT fk_36_02 FOREIGN KEY (tenant_id, restocked_lot_id) REFERENCES core.inventory_lot (tenant_id, lot_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.return_event ADD CONSTRAINT fk_36_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.return_event ADD CONSTRAINT fk_36_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_document ADD CONSTRAINT fk_37_00 FOREIGN KEY (tenant_id, from_site_id) REFERENCES core.site (tenant_id, site_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_document ADD CONSTRAINT fk_37_01 FOREIGN KEY (tenant_id, to_site_id, region_id) REFERENCES core.site (tenant_id, site_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_document ADD CONSTRAINT fk_37_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_document ADD CONSTRAINT fk_37_03 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_document_line ADD CONSTRAINT fk_38_00 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_document_line ADD CONSTRAINT fk_38_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_document_line ADD CONSTRAINT fk_38_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_document_line ADD CONSTRAINT fk_38_03 FOREIGN KEY (tenant_id, inventory_doc_id, region_id) REFERENCES core.inventory_document (tenant_id, inventory_doc_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_movement ADD CONSTRAINT fk_39_00 FOREIGN KEY (tenant_id, site_id, region_id) REFERENCES core.site (tenant_id, site_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_movement ADD CONSTRAINT fk_39_01 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_movement ADD CONSTRAINT fk_39_02 FOREIGN KEY (tenant_id, lot_id, site_id, sku_id) REFERENCES core.inventory_lot (tenant_id, lot_id, site_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_movement ADD CONSTRAINT fk_39_03 FOREIGN KEY (tenant_id, inventory_doc_line_id) REFERENCES core.inventory_document_line (tenant_id, inventory_doc_line_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_movement ADD CONSTRAINT fk_39_04 FOREIGN KEY (tenant_id, order_unit_id) REFERENCES core.order_unit (tenant_id, order_unit_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_movement ADD CONSTRAINT fk_39_05 FOREIGN KEY (tenant_id, return_item_id) REFERENCES core.return_item (tenant_id, return_item_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_movement ADD CONSTRAINT fk_39_06 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_movement ADD CONSTRAINT fk_39_07 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX ix_39_00 ON core.inventory_movement (tenant_id, site_id, sku_id, event_at, event_seq);

ALTER TABLE core.inventory_snapshot ADD CONSTRAINT fk_40_00 FOREIGN KEY (tenant_id, site_id, region_id) REFERENCES core.site (tenant_id, site_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_snapshot ADD CONSTRAINT fk_40_01 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_snapshot ADD CONSTRAINT fk_40_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_snapshot ADD CONSTRAINT fk_40_03 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX ix_40_00 ON core.inventory_snapshot (tenant_id, site_id, snapshot_date);

ALTER TABLE core.revenue_entry ADD CONSTRAINT fk_41_00 FOREIGN KEY (tenant_id, order_unit_id, region_id) REFERENCES core.order_unit (tenant_id, order_unit_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.revenue_entry ADD CONSTRAINT fk_41_01 FOREIGN KEY (tenant_id, shipment_event_id) REFERENCES core.shipment_event (tenant_id, shipment_event_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.revenue_entry ADD CONSTRAINT fk_41_02 FOREIGN KEY (tenant_id, return_event_id) REFERENCES core.return_event (tenant_id, return_event_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.revenue_entry ADD CONSTRAINT fk_41_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.revenue_entry ADD CONSTRAINT fk_41_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX ix_41_00 ON core.revenue_entry (tenant_id, recognized_at);

ALTER TABLE core.cost_entry ADD CONSTRAINT fk_42_00 FOREIGN KEY (tenant_id, order_unit_id, region_id) REFERENCES core.order_unit (tenant_id, order_unit_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.cost_entry ADD CONSTRAINT fk_42_01 FOREIGN KEY (tenant_id, lot_id) REFERENCES core.inventory_lot (tenant_id, lot_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.cost_entry ADD CONSTRAINT fk_42_02 FOREIGN KEY (tenant_id, shipment_event_id) REFERENCES core.shipment_event (tenant_id, shipment_event_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.cost_entry ADD CONSTRAINT fk_42_03 FOREIGN KEY (tenant_id, return_event_id) REFERENCES core.return_event (tenant_id, return_event_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.cost_entry ADD CONSTRAINT fk_42_04 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.cost_entry ADD CONSTRAINT fk_42_05 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_fee ADD CONSTRAINT fk_43_00 FOREIGN KEY (tenant_id, order_id, region_id) REFERENCES core.order_header (tenant_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_fee ADD CONSTRAINT fk_43_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_fee ADD CONSTRAINT fk_43_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_fee ADD CONSTRAINT fk_43_03 FOREIGN KEY (tenant_id, order_unit_id, order_id, region_id) REFERENCES core.order_unit (tenant_id, order_unit_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_fee ADD CONSTRAINT fk_43_04 FOREIGN KEY (tenant_id, reversal_of_fee_id, order_id, region_id) REFERENCES core.order_fee (tenant_id, fee_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_unit_event ADD CONSTRAINT fk_44_00 FOREIGN KEY (tenant_id, order_unit_id, region_id) REFERENCES core.order_unit (tenant_id, order_unit_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_unit_event ADD CONSTRAINT fk_44_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_unit_event ADD CONSTRAINT fk_44_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.web_session ADD CONSTRAINT fk_45_00 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.web_session ADD CONSTRAINT fk_45_01 FOREIGN KEY (tenant_id, region_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.web_session ADD CONSTRAINT fk_45_02 FOREIGN KEY (tenant_id, campaign_id) REFERENCES core.campaign (tenant_id, campaign_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.web_session ADD CONSTRAINT fk_45_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.web_session ADD CONSTRAINT fk_45_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.web_session ADD CONSTRAINT fk_45_05 FOREIGN KEY (tenant_id, identity_id, channel_id) REFERENCES core.customer_identity (tenant_id, identity_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.behavior_event ADD CONSTRAINT fk_46_00 FOREIGN KEY (tenant_id, session_id, region_id) REFERENCES core.web_session (tenant_id, session_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.behavior_event ADD CONSTRAINT fk_46_01 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.behavior_event ADD CONSTRAINT fk_46_02 FOREIGN KEY (tenant_id, order_id, region_id) REFERENCES core.order_header (tenant_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.behavior_event ADD CONSTRAINT fk_46_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.behavior_event ADD CONSTRAINT fk_46_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX ix_46_00 ON core.behavior_event (tenant_id, session_id, event_at);

CREATE INDEX ix_46_01 ON core.behavior_event (tenant_id, event_at);

ALTER TABLE core.campaign_daily ADD CONSTRAINT fk_47_00 FOREIGN KEY (tenant_id, campaign_id) REFERENCES core.campaign (tenant_id, campaign_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.campaign_daily ADD CONSTRAINT fk_47_01 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.campaign_daily ADD CONSTRAINT fk_47_02 FOREIGN KEY (tenant_id, region_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.campaign_daily ADD CONSTRAINT fk_47_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.campaign_daily ADD CONSTRAINT fk_47_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.channel_product_daily ADD CONSTRAINT fk_48_00 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.channel_product_daily ADD CONSTRAINT fk_48_01 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.channel_product_daily ADD CONSTRAINT fk_48_02 FOREIGN KEY (tenant_id, region_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.channel_product_daily ADD CONSTRAINT fk_48_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.channel_product_daily ADD CONSTRAINT fk_48_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.store_traffic_daily ADD CONSTRAINT fk_49_00 FOREIGN KEY (tenant_id, site_id, region_id) REFERENCES core.site (tenant_id, site_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.store_traffic_daily ADD CONSTRAINT fk_49_01 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.store_traffic_daily ADD CONSTRAINT fk_49_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_attribution ADD CONSTRAINT fk_50_00 FOREIGN KEY (tenant_id, order_id, region_id) REFERENCES core.order_header (tenant_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_attribution ADD CONSTRAINT fk_50_01 FOREIGN KEY (tenant_id, campaign_id) REFERENCES core.campaign (tenant_id, campaign_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_attribution ADD CONSTRAINT fk_50_02 FOREIGN KEY (tenant_id, session_id) REFERENCES core.web_session (tenant_id, session_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_attribution ADD CONSTRAINT fk_50_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.order_attribution ADD CONSTRAINT fk_50_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.target_monthly ADD CONSTRAINT fk_51_00 FOREIGN KEY (tenant_id, channel_id) REFERENCES core.channel (tenant_id, channel_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.target_monthly ADD CONSTRAINT fk_51_01 FOREIGN KEY (tenant_id, region_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.target_monthly ADD CONSTRAINT fk_51_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.target_monthly ADD CONSTRAINT fk_51_03 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE ops.generation_run ADD CONSTRAINT fk_52_00 FOREIGN KEY (release_id) REFERENCES ops.dataset_release (release_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE ops.file_manifest ADD CONSTRAINT fk_53_00 FOREIGN KEY (release_id) REFERENCES ops.dataset_release (release_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE ops.file_manifest ADD CONSTRAINT fk_53_01 FOREIGN KEY (run_id) REFERENCES ops.generation_run (run_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE ops.file_manifest ADD CONSTRAINT fk_53_02 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE ops.source_watermark ADD CONSTRAINT fk_54_00 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE sec.principal ADD CONSTRAINT fk_55_00 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE sec.principal_region ADD CONSTRAINT fk_56_00 FOREIGN KEY (tenant_id, region_id) REFERENCES core.geo_area (tenant_id, geo_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE sec.principal_region ADD CONSTRAINT fk_56_01 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE sec.principal_region ADD CONSTRAINT fk_56_02 FOREIGN KEY (db_role, tenant_id) REFERENCES sec.principal (db_role, tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE eval.scenario ADD CONSTRAINT fk_57_00 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE eval.question ADD CONSTRAINT fk_58_00 FOREIGN KEY (scenario_id) REFERENCES eval.scenario (scenario_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE eval.question ADD CONSTRAINT fk_58_01 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE eval.expected_result ADD CONSTRAINT fk_59_00 FOREIGN KEY (question_id) REFERENCES eval.question (question_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE eval.expected_result ADD CONSTRAINT fk_59_01 FOREIGN KEY (release_id) REFERENCES ops.dataset_release (release_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.customer_identity_link ADD CONSTRAINT fk_60_00 FOREIGN KEY (tenant_id, identity_id) REFERENCES core.customer_identity (tenant_id, identity_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.customer_identity_link ADD CONSTRAINT fk_60_01 FOREIGN KEY (tenant_id, customer_id) REFERENCES core.customer (tenant_id, customer_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.customer_identity_link ADD CONSTRAINT fk_60_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.customer_identity_link ADD CONSTRAINT fk_60_03 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.stock_allocation_attempt ADD CONSTRAINT fk_61_00 FOREIGN KEY (tenant_id, order_id, region_id) REFERENCES core.order_header (tenant_id, order_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.stock_allocation_attempt ADD CONSTRAINT fk_61_01 FOREIGN KEY (tenant_id, site_id) REFERENCES core.site (tenant_id, site_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.stock_allocation_attempt ADD CONSTRAINT fk_61_02 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.stock_allocation_attempt ADD CONSTRAINT fk_61_03 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.stock_allocation_attempt ADD CONSTRAINT fk_61_04 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_valuation_snapshot ADD CONSTRAINT fk_62_00 FOREIGN KEY (tenant_id, site_id, region_id) REFERENCES core.site (tenant_id, site_id, region_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_valuation_snapshot ADD CONSTRAINT fk_62_01 FOREIGN KEY (tenant_id, sku_id) REFERENCES core.sku (tenant_id, sku_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_valuation_snapshot ADD CONSTRAINT fk_62_02 FOREIGN KEY (tenant_id, load_batch_id) REFERENCES ops.ingestion_batch (tenant_id, batch_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE core.inventory_valuation_snapshot ADD CONSTRAINT fk_62_03 FOREIGN KEY (tenant_id) REFERENCES core.tenant (tenant_id) DEFERRABLE INITIALLY IMMEDIATE;

COMMIT;
