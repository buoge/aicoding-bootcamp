"""Authoritative data contract; emits PostgreSQL DDL, dictionary, JSON, and ER sources.

This is a specification compiler, not the million-order data generator.
"""
from pathlib import Path
import json
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]
TABLES = []

def C(name, typ, desc, null=False, default=None):
    return dict(name=name, type=typ, description=desc, nullable=null, default=default)

def FK(cols, target, refs=None):
    if isinstance(cols, str): cols = cols.split(',')
    if refs is None: refs = cols
    if isinstance(refs, str): refs = refs.split(',')
    return dict(columns=cols, references=target, reference_columns=refs)

def T(name, domain, grain, desc, columns, pk, fks=(), uq=(), checks=(), indexes=(), scope=None, cost=False, audit=False):
    cols = list(columns)
    if audit:
        cols += [C('available_at','timestamptz','源记录首次可见 UTC 时刻；事件不得早于发生，预先发布计划可以早于生效'),
                 C('load_batch_id','bigint','模拟采集批次；引用本租户采集批次')]
        fks = list(fks) + [FK('tenant_id,load_batch_id','ops.ingestion_batch','tenant_id,batch_id')]
    if name not in ('core.tenant',) and any(c['name']=='tenant_id' for c in cols):
        fks = list(fks) + [FK('tenant_id','core.tenant')]
    t = dict(name=name, domain=domain, grain=grain, description=desc, columns=cols,
             primary_key=pk.split(','), foreign_keys=list(fks), unique=[x.split(',') for x in uq],
             checks=list(checks), indexes=list(indexes), scope=scope, cost_protected=cost, audit=audit)
    TABLES.append(t)
    return t

def tenant(): return C('tenant_id','smallint','企业租户；101 主租户，102 和 103 隔离租户')
def ID(n, d): return C(n,'bigint',d)
def region(): return C('region_id','bigint','经营归属大区；与所属订单或地点一致')
def ts(n,d): return C(n,'timestamptz',d)
def amount(n,d): return C(n,'bigint',d+'；CNY 不含税整数分')
def unitfk(parent): return FK('tenant_id,order_unit_id,region_id',parent,'tenant_id,order_unit_id,region_id')

T('ops.dataset_release','治理','一行一个发布版本','一库仅激活一个版本；文件以 release_id 隔离',[
 C('release_id','text','不可变发布 ID'),C('schema_version','text','模型版本'),
 C('generator_commit','text','定制生成器代码 commit'),C('contoso_commit','text','上游固定 commit'),
 C('config_sha256','char(64)','规范化配置摘要'),C('catalog_sha256','char(64)','商品目录摘要'),
 C('master_seed','bigint','全局随机种子'),C('order_start','date','下单起始本地日期'),
 C('order_end_exclusive','date','下单结束本地日期 不含'),C('simulation_end_exclusive','date','事件推进截止本地日期 不含'),
 ts('published_as_of','此数据库允许的最大数据可见时刻 UTC'),C('status','text','BUILDING VALIDATED PUBLISHED'),
 ts('created_at','版本创建时刻 UTC')], 'release_id', checks=["status IN ('BUILDING','VALIDATED','PUBLISHED')","order_start < order_end_exclusive","order_end_exclusive < simulation_end_exclusive"])

T('core.tenant','组织','一个独立经营企业','SaaS 隔离边界；品牌与地区不是租户',[
 tenant(),C('tenant_code','text','稳定企业代码'),C('tenant_name','text','虚构企业名称'),
 C('timezone','text','v1 固定 Asia/Shanghai'),C('currency','char(3)','v1 固定 CNY'),
 C('order_quota','bigint','本版本精确订单头配额'),C('release_id','text','数据版本')],
 'tenant_id',fks=[FK('release_id','ops.dataset_release')],uq=['tenant_code'],
 checks=["timezone = 'Asia/Shanghai'","currency = 'CNY'","order_quota > 0"])

T('ops.ingestion_batch','治理','一个租户一个源的一次采集批次','独立区分业务发生与采集到达',[
 tenant(),ID('batch_id','批次 ID'),C('source_system','text','PIM OMS POS WMS CRM ADS WEB ERP'),
 ts('source_from','本批业务窗口起点 包含'),ts('source_to','本批业务窗口终点 不含'),
 ts('received_at','采集批次到达时刻'),C('status','text','READY DELAYED FAILED'),C('row_count','bigint','批次行数')],
 'tenant_id,batch_id',checks=["source_from < source_to","row_count >= 0","status IN ('READY','DELAYED','FAILED')"])

T('core.geo_area','组织','一个地理节点','经营大区 省份 城市的稳定层级；不模拟行政区划变化',[
 tenant(),ID('geo_id','地理节点'),C('parent_geo_id','bigint','父地理节点',True),
 C('geo_level','text','REGION PROVINCE CITY'),C('geo_code','text','内部稳定代码'),C('geo_name','text','地理名称'),
 C('region_id','bigint','所属大区的 geo_id；大区自身引用自身')], 'tenant_id,geo_id',
 fks=[FK('tenant_id,parent_geo_id','core.geo_area','tenant_id,geo_id'),FK('tenant_id,region_id','core.geo_area','tenant_id,geo_id')],
 uq=['tenant_id,geo_code'],checks=["geo_level IN ('REGION','PROVINCE','CITY')"])

T('core.org_unit','组织','一个经营组织','组织与区域分别建模；v1 组织归属不随历史变动',[
 tenant(),ID('org_unit_id','组织 ID'),C('parent_org_unit_id','bigint','上级组织',True),
 C('org_code','text','组织代码'),C('org_name','text','组织名称'),C('org_type','text','GROUP REGION STORE ECOM')],
 'tenant_id,org_unit_id',fks=[FK('tenant_id,parent_org_unit_id','core.org_unit','tenant_id,org_unit_id')],uq=['tenant_id,org_code'],checks=["org_type IN ('GROUP','REGION','STORE','ECOM')"])

T('core.site','组织','一个实体门店或仓库','统一地点模型；下单渠道和履约地点分离',[
 tenant(),ID('site_id','地点 ID'),C('site_code','text','门店或仓库代码'),C('site_name','text','地点名称'),
 C('site_type','text','STORE OUTLET WAREHOUSE'),ID('org_unit_id','经营组织'),ID('geo_id','所在城市'),region(),
 C('opened_on','date','开业日 包含'),C('closed_on','date','关闭日 不含',True),C('area_sqm','integer','门店或仓库面积 平方米')],
 'tenant_id,site_id',fks=[FK('tenant_id,org_unit_id','core.org_unit'),FK('tenant_id,geo_id','core.geo_area'),FK('tenant_id,region_id','core.geo_area','tenant_id,geo_id')],
 uq=['tenant_id,site_code','tenant_id,site_id,region_id'],checks=["site_type IN ('STORE','OUTLET','WAREHOUSE')","area_sqm > 0","closed_on IS NULL OR opened_on < closed_on"],scope='region_id')

T('core.channel','组织','一个销售渠道','营销活动来源单独在 campaign 中定义',[
 tenant(),ID('channel_id','渠道 ID'),C('channel_code','text','TMALL JD DOUYIN MINIAPP APP POS OUTLET'),
 C('channel_name','text','渠道名称'),C('channel_type','text','PLATFORM OWNED OFFLINE'),
 C('has_user_events','boolean','是否提供逐用户事件'),C('identity_scope','text','CHANNEL MEMBER MIXED')],
 'tenant_id,channel_id',uq=['tenant_id,channel_code'],checks=["channel_type IN ('PLATFORM','OWNED','OFFLINE')","identity_scope IN ('CHANNEL','MEMBER','MIXED')","NOT has_user_events OR channel_type = 'OWNED'"])

T('core.brand','商品','一个自有品牌','品牌归属唯一租户',[
 tenant(),ID('brand_id','品牌 ID'),C('brand_code','text','品牌代码'),C('brand_name','text','品牌名称'),C('positioning','text','大众 专业跑步 户外等定位')],
 'tenant_id,brand_id',uq=['tenant_id,brand_code'])
T('core.category','商品','一个商品分类节点','每个 SPU 仅属于一个叶子分类',[
 tenant(),ID('category_id','分类 ID'),C('parent_category_id','bigint','父分类',True),C('category_code','text','分类代码'),C('category_name','text','分类名称'),C('level_no','smallint','一级或二级'),C('is_leaf','boolean','是否允许挂接 SPU')],
 'tenant_id,category_id',fks=[FK('tenant_id,parent_category_id','core.category','tenant_id,category_id')],uq=['tenant_id,category_code'],checks=['level_no IN (1,2)'])
T('core.sport','商品','一个运动标签','多标签统计必须去重；非财务加总层级',[
 tenant(),ID('sport_id','标签 ID'),C('sport_code','text','运动代码'),C('sport_name','text','跑步 露营 游泳等')],'tenant_id,sport_id',uq=['tenant_id,sport_code'])
T('core.spu','商品','一款标准商品','品牌与主品类为独立属性',[
 tenant(),ID('spu_id','SPU ID'),ID('brand_id','自有品牌'),ID('category_id','唯一叶子分类'),C('spu_code','text','款式代码'),C('spu_name','text','规范化商品名称'),
 C('audience','text','UNISEX MEN WOMEN CHILDREN'),C('season_code','text','ALL SPRING_SUMMER AUTUMN_WINTER'),C('launch_on','date','上新日期'),C('discontinue_on','date','停止新销售日期 不含',True),C('attributes','jsonb','长尾非分析主轴属性',default="'{}'::jsonb")],
 'tenant_id,spu_id',fks=[FK('tenant_id,brand_id','core.brand'),FK('tenant_id,category_id','core.category')],uq=['tenant_id,spu_code'],checks=["audience IN ('UNISEX','MEN','WOMEN','CHILDREN')","season_code IN ('ALL','SPRING_SUMMER','AUTUMN_WINTER')","discontinue_on IS NULL OR discontinue_on > launch_on"])
T('core.spu_sport','商品','一个 SPU 与运动标签的关系','只能作为筛选或去重后的标签分析',[
 tenant(),ID('spu_id','SPU'),ID('sport_id','运动标签')],'tenant_id,spu_id,sport_id',fks=[FK('tenant_id,spu_id','core.spu'),FK('tenant_id,sport_id','core.sport')])
T('core.sku','商品','一个可售商品规格','并非所有品类均按颜色乘尺码做笛卡尔积',[
 tenant(),ID('sku_id','SKU ID'),ID('spu_id','所属 SPU'),C('sku_code','text','企业统一 SKU 编码'),C('color_code','text','颜色 不适用时 NA'),C('size_system','text','CN_SHOE ALPHA CAPACITY WEIGHT MODEL NA'),C('size_value','text','例如 42 XL 30L 5KG'),C('spec_key','text','规范化规格组合键'),C('weight_grams','integer','单件克重'),C('launch_on','date','可售开始'),C('discontinue_on','date','可售结束 不含',True)],
 'tenant_id,sku_id',fks=[FK('tenant_id,spu_id','core.spu')],uq=['tenant_id,sku_code','tenant_id,spu_id,spec_key'],checks=['weight_grams > 0','discontinue_on IS NULL OR discontinue_on > launch_on'])
T('core.channel_listing','商品','某渠道商品编码的一个有效版本','保留平台编码与统一 SKU 的多对一映射',[
 tenant(),ID('listing_id','映射版本 ID'),ID('channel_id','销售渠道'),C('external_sku_code','text','平台编码'),ID('sku_id','统一 SKU'),ts('valid_from','有效开始 包含'),ts('valid_to','有效结束 不含')],
 'tenant_id,listing_id',fks=[FK('tenant_id,channel_id','core.channel'),FK('tenant_id,sku_id','core.sku')],uq=['tenant_id,channel_id,external_sku_code,valid_from'],checks=['valid_from < valid_to'])
T('core.assortment','商品','一个地点 SKU 的经营有效区间','停售但有残余库存时仍需保留库存快照',[
 tenant(),ID('assortment_id','经营区间 ID'),ID('site_id','仓或店'),region(),ID('sku_id','SKU'),C('valid_from','date','经营起点 包含'),C('valid_to','date','经营终点 不含'),C('can_sell','boolean','允许销售出库'),C('min_stock','integer','补货点 单件'),C('target_stock','integer','目标库存 单件')],
 'tenant_id,assortment_id',fks=[FK('tenant_id,site_id,region_id','core.site','tenant_id,site_id,region_id'),FK('tenant_id,sku_id','core.sku')],uq=['tenant_id,site_id,sku_id,valid_from'],checks=['valid_from < valid_to','min_stock >= 0','target_stock >= min_stock'],scope='region_id')
T('core.price_period','商品','一个 SKU 渠道价格的有效区间','时间区间不得交叠；价格在下单时固化',[
 tenant(),ID('price_id','价格版本'),ID('sku_id','SKU'),ID('channel_id','渠道'),ts('valid_from','生效开始'),ts('valid_to','生效结束 不含'),amount('list_price_cent','单件标价')],
 'tenant_id,price_id',fks=[FK('tenant_id,sku_id','core.sku'),FK('tenant_id,channel_id','core.channel')],uq=['tenant_id,sku_id,channel_id,valid_from'],checks=['valid_from < valid_to','list_price_cent >= 0'])
T('core.cost_period','商品','一个 SKU 标准采购成本的有效区间','仅决定新采购批次成本；旧库存不追溯改价',[
 tenant(),ID('cost_id','采购成本版本'),ID('sku_id','SKU'),ts('valid_from','生效开始'),ts('valid_to','生效结束 不含'),amount('unit_cost_cent','单位采购成本')],
 'tenant_id,cost_id',fks=[FK('tenant_id,sku_id','core.sku')],uq=['tenant_id,sku_id,valid_from'],checks=['valid_from < valid_to','unit_cost_cent >= 0'],cost=True)
T('core.customer','客户','一个企业会员','仅保存合成分群属性；无真实姓名电话地址',[
 tenant(),ID('customer_id','企业会员 ID'),C('member_code','text','合成会员编号'),ts('joined_at','入会时刻'),C('segment_code','text','新客 高频 低频等固定初始分群'),C('home_geo_id','bigint','登记城市 允许未知',True),C('age_band','text','合成年龄段 允许未知',True)],
 'tenant_id,customer_id',fks=[FK('tenant_id,home_geo_id','core.geo_area','tenant_id,geo_id')],uq=['tenant_id,member_code'],audit=True)
T('core.customer_identity','客户','一个渠道内的购买身份','未绑定会员仍有渠道内身份；映射只能在 available_at 后使用',[
 tenant(),ID('identity_id','渠道身份 ID'),ID('channel_id','来源渠道'),C('external_user_token','text','不可逆合成令牌'),C('customer_id','bigint','已明确绑定的会员 ID',True),ts('first_seen_at','首次可见时刻'),C('linked_at','timestamptz','确认绑定时刻',True)],
 'tenant_id,identity_id',fks=[FK('tenant_id,channel_id','core.channel'),FK('tenant_id,customer_id','core.customer')],uq=['tenant_id,channel_id,external_user_token'],checks=['(customer_id IS NULL) = (linked_at IS NULL)'],audit=True)
T('core.calendar','组织','一个本地自然日','共享公开日期维；假日标签按课程自定义日历配置',[
 C('calendar_date','date','Asia/Shanghai 自然日'),C('year_no','smallint','年'),C('month_no','smallint','月'),C('day_of_week','smallint','ISO 周一为 1'),C('iso_year','smallint','ISO 周所属年'),C('iso_week','smallint','ISO 周'),C('is_weekend','boolean','是否周末'),C('festival_code','text','课程事件标签 无则 NONE')],
 'calendar_date',checks=['month_no BETWEEN 1 AND 12','day_of_week BETWEEN 1 AND 7','iso_week BETWEEN 1 AND 53'])
T('core.campaign','营销','一个营销活动','广告触达与订单下单渠道分离',[
 tenant(),ID('campaign_id','活动 ID'),C('campaign_code','text','活动代码'),C('campaign_name','text','活动名称'),C('acquisition_source','text','搜索 信息流 直播 私域等'),C('target_channel_id','bigint','主要承接渠道',True),ts('starts_at','活动起点'),ts('ends_at','活动终点 不含'),C('objective','text','ACQUISITION RETENTION CLEARANCE')],
 'tenant_id,campaign_id',fks=[FK('tenant_id,target_channel_id','core.channel','tenant_id,channel_id')],uq=['tenant_id,campaign_code'],checks=['starts_at < ends_at',"objective IN ('ACQUISITION','RETENTION','CLEARANCE')"])
T('core.promotion','营销','一个价格优惠规则','v1 只支持百分比优惠和满额减免；不含平台补贴和赠品',[
 tenant(),ID('promotion_id','优惠 ID'),C('promotion_code','text','优惠代码'),ID('channel_id','适用渠道'),C('campaign_id','bigint','所属营销活动 允许无',True),C('promotion_type','text','PERCENT THRESHOLD'),C('discount_bps','integer','折扣比例基点 0 至 10000'),amount('threshold_cent','门槛金额'),amount('discount_cent','固定减免额'),ts('starts_at','生效开始'),ts('ends_at','生效结束 不含'),C('priority_no','integer','叠加排序')],
 'tenant_id,promotion_id',fks=[FK('tenant_id,channel_id','core.channel'),FK('tenant_id,campaign_id','core.campaign')],uq=['tenant_id,promotion_code'],checks=["promotion_type IN ('PERCENT','THRESHOLD')",'discount_bps BETWEEN 0 AND 10000','threshold_cent >= 0','discount_cent >= 0','starts_at < ends_at'])

T('core.order_header','交易','一个成功创建的订单头','精确百万配额包含支付失败和取消；无 mutable 当前状态',[
 tenant(),ID('order_id','订单 ID'),C('order_no','text','企业业务订单号'),C('contoso_proposal_id','text','候选订单追踪 ID'),
 ID('channel_id','下单渠道'),ID('org_unit_id','销售归属组织'),region(),ID('demand_geo_id','需求城市'),
 C('selling_site_id','bigint','线下下单门店 线上为 NULL',True),ID('identity_id','渠道购买身份'),
 C('customer_id','bigint','下单时已知会员；不事后回填',True),ts('ordered_at','订单创建时刻'),
 C('order_date','date','ordered_at 转 Asia/Shanghai 的自然日'),C('currency','char(3)','固定 CNY'),
 amount('gross_cent','商品原价总额'),amount('discount_cent','商品优惠总额'),amount('payable_cent','应付商品额；v1 无向客户收取的运费'),
 ts('payment_deadline','支付截止时刻')],
 'tenant_id,order_id',fks=[FK('tenant_id,channel_id','core.channel'),FK('tenant_id,org_unit_id','core.org_unit'),FK('tenant_id,region_id','core.geo_area','tenant_id,geo_id'),FK('tenant_id,demand_geo_id','core.geo_area','tenant_id,geo_id'),FK('tenant_id,selling_site_id','core.site','tenant_id,site_id'),FK('tenant_id,identity_id','core.customer_identity'),FK('tenant_id,customer_id','core.customer')],
 uq=['tenant_id,order_no','tenant_id,contoso_proposal_id','tenant_id,order_id,region_id'],
 checks=["currency = 'CNY'",'gross_cent >= 0','discount_cent BETWEEN 0 AND gross_cent','payable_cent = gross_cent - discount_cent','payment_deadline >= ordered_at',"order_date = (ordered_at AT TIME ZONE 'Asia/Shanghai')::date",'available_at >= ordered_at'],
 indexes=[['tenant_id','order_date','channel_id'],['tenant_id','customer_id','ordered_at']],scope='region_id',audit=True)

T('core.order_line','交易','一张订单的一个 SKU 行','重复 SKU 合并成一行；商品价与优惠在下单时固化',[
 tenant(),ID('order_line_id','订单行 ID'),ID('order_id','订单头'),region(),C('line_no','integer','订单内行号'),ID('sku_id','SKU'),
 C('listing_id','bigint','渠道商品版本 自建线下可无',True),ID('price_id','采用价格版本'),C('quantity','integer','订购单件数'),
 amount('list_unit_cent','原价单价'),amount('gross_cent','行原价金额'),amount('discount_cent','行优惠'),amount('net_cent','行应付额')],
 'tenant_id,order_line_id',fks=[FK('tenant_id,order_id,region_id','core.order_header','tenant_id,order_id,region_id'),FK('tenant_id,sku_id','core.sku'),FK('tenant_id,listing_id','core.channel_listing'),FK('tenant_id,price_id','core.price_period')],
 uq=['tenant_id,order_id,line_no','tenant_id,order_id,sku_id','tenant_id,order_line_id,order_id,region_id,sku_id'],
 checks=['line_no > 0','quantity > 0','list_unit_cent >= 0','gross_cent = list_unit_cent * quantity','discount_cent BETWEEN 0 AND gross_cent','net_cent = gross_cent - discount_cent'],indexes=[['tenant_id','sku_id','order_id']],scope='region_id',audit=True)

T('core.order_unit','交易','订单行中的一个逻辑计量单件','用于部分履约 退货 成本与整分分摊；不代表实物序列号',[
 tenant(),ID('order_unit_id','逻辑单件 ID'),ID('order_line_id','订单行'),ID('order_id','订单'),region(),ID('sku_id','SKU'),
 C('unit_no','integer','行内单件序号'),amount('gross_cent','该单件原价'),amount('discount_cent','分配到该单件的优惠'),amount('net_cent','该单件应付额')],
 'tenant_id,order_unit_id',fks=[FK('tenant_id,order_line_id,order_id,region_id,sku_id','core.order_line','tenant_id,order_line_id,order_id,region_id,sku_id')],
 uq=['tenant_id,order_line_id,unit_no','tenant_id,order_unit_id,order_id,region_id,sku_id','tenant_id,order_unit_id,region_id'],
 checks=['unit_no > 0','gross_cent >= 0','discount_cent BETWEEN 0 AND gross_cent','net_cent = gross_cent - discount_cent'],scope='region_id',audit=True)

T('core.order_status_event','交易','一个订单的一次状态变化','只能按 event_at 与 available_at 双条件重建状态',[
 tenant(),ID('status_event_id','状态事件'),ID('order_id','订单'),region(),C('event_seq','integer','同一订单事件序号'),
 C('status','text','CREATED RESERVED PAID PART_SHIPPED SHIPPED COMPLETED CANCELLED'),C('reason_code','text','NONE STOCK_LOCK_FAILED PAY_TIMEOUT CUSTOMER_CANCEL DELIVERY_FAILED'),ts('event_at','业务状态变化时刻')],
 'tenant_id,status_event_id',fks=[FK('tenant_id,order_id,region_id','core.order_header','tenant_id,order_id,region_id')],uq=['tenant_id,order_id,event_seq'],
 checks=["status IN ('CREATED','RESERVED','PAID','PART_SHIPPED','SHIPPED','COMPLETED','CANCELLED')",'event_seq > 0','available_at >= event_at'],indexes=[['tenant_id','order_id','event_at']],scope='region_id',audit=True)

T('core.discount_allocation','交易','一个优惠对一个订单单件的分摊','按优先级逐次分摊；相同单件可命中多个优惠',[
 tenant(),ID('allocation_id','优惠分摊记录'),ID('order_unit_id','单件'),region(),ID('promotion_id','优惠规则'),C('apply_seq','integer','应用次序'),amount('discount_cent','本次分摊优惠')],
 'tenant_id,allocation_id',fks=[unitfk('core.order_unit'),FK('tenant_id,promotion_id','core.promotion')],uq=['tenant_id,order_unit_id,promotion_id,apply_seq'],checks=['apply_seq > 0','discount_cent >= 0'],scope='region_id',audit=True)

T('core.payment','交易','一次支付尝试','成功支付累计满足应付才产生 PAID；允许一次订单多笔支付',[
 tenant(),ID('payment_id','支付尝试 ID'),ID('order_id','订单'),region(),C('payment_no','text','来源支付单号'),C('method','text','ALIPAY WECHAT BANK POS'),C('status','text','SUCCEEDED FAILED'),amount('amount_cent','本次尝试金额'),ts('attempted_at','支付尝试时刻')],
 'tenant_id,payment_id',fks=[FK('tenant_id,order_id,region_id','core.order_header','tenant_id,order_id,region_id')],uq=['tenant_id,payment_no','tenant_id,payment_id,order_id,region_id'],checks=["status IN ('SUCCEEDED','FAILED')",'amount_cent > 0','available_at >= attempted_at'],indexes=[['tenant_id','order_id']],scope='region_id',audit=True)

T('core.refund','交易','一次现金退款尝试','与销售冲减和实物入库分离；一笔退款引用一笔成功支付',[
 tenant(),ID('refund_id','退款 ID'),ID('payment_id','原支付'),ID('order_id','订单'),region(),C('refund_no','text','退款单号'),C('status','text','SUCCEEDED FAILED'),C('refund_type','text','CANCEL RETURN'),amount('amount_cent','退款尝试金额'),ts('attempted_at','现金退款尝试时刻')],
 'tenant_id,refund_id',fks=[FK('tenant_id,payment_id,order_id,region_id','core.payment','tenant_id,payment_id,order_id,region_id')],uq=['tenant_id,refund_no','tenant_id,refund_id,order_id,region_id'],checks=["status IN ('SUCCEEDED','FAILED')","refund_type IN ('CANCEL','RETURN')",'amount_cent > 0','available_at >= attempted_at'],scope='region_id',audit=True)

T('core.refund_allocation','交易','一次退款分配到一个订单单件','可跨多笔原支付分拆退款；单件成功退款累计不得超过 net_cent',[
 tenant(),ID('refund_allocation_id','分摊 ID'),ID('refund_id','退款'),ID('order_id','订单'),region(),ID('order_unit_id','单件'),amount('amount_cent','本次分摊退款')],
 'tenant_id,refund_allocation_id',fks=[FK('tenant_id,refund_id,order_id,region_id','core.refund','tenant_id,refund_id,order_id,region_id'),unitfk('core.order_unit')],uq=['tenant_id,refund_id,order_unit_id'],checks=['amount_cent > 0'],scope='region_id',audit=True)

T('core.inventory_lot','库存','一批相同 SKU 成本的某地点库存','采购 转入 可售退货可新建批次；FIFO 出库并固化原成本',[
 tenant(),ID('lot_id','库存批次'),ID('site_id','地点'),region(),ID('sku_id','SKU'),C('parent_lot_id','bigint','转移或退货来源批次',True),C('cost_id','bigint','新采购成本版本 退货转入可无',True),ts('received_at','批次到达时刻'),amount('unit_cost_cent','本批单件成本'),C('origin_type','text','OPENING PURCHASE TRANSFER RETURN')],
 'tenant_id,lot_id',fks=[FK('tenant_id,site_id,region_id','core.site','tenant_id,site_id,region_id'),FK('tenant_id,sku_id','core.sku'),FK('tenant_id,parent_lot_id','core.inventory_lot','tenant_id,lot_id'),FK('tenant_id,cost_id','core.cost_period')],
 uq=['tenant_id,lot_id,site_id,sku_id'],checks=['unit_cost_cent >= 0',"origin_type IN ('OPENING','PURCHASE','TRANSFER','RETURN')"],scope='region_id',cost=True,audit=True)

T('core.shipment','履约','一张订单从一个地点发出的包裹或 POS 交付单','一次订单允许多个包裹；v1 每逻辑单件最多一次出库',[
 tenant(),ID('shipment_id','履约单'),ID('order_id','订单'),region(),ID('from_site_id','履约仓或店'),C('shipment_no','text','履约单号'),C('fulfillment_type','text','DELIVERY PICKUP POS'),ts('created_at','创建时刻'),ts('promised_at','承诺交付时刻')],
 'tenant_id,shipment_id',fks=[FK('tenant_id,order_id,region_id','core.order_header','tenant_id,order_id,region_id'),FK('tenant_id,from_site_id','core.site','tenant_id,site_id')],uq=['tenant_id,shipment_no','tenant_id,shipment_id,order_id,region_id,from_site_id'],checks=["fulfillment_type IN ('DELIVERY','PICKUP','POS')",'promised_at >= created_at','available_at >= created_at'],scope='region_id',audit=True)

T('core.shipment_item','履约','一个包裹中的一个订单逻辑单件','固化从哪个库存批次出库；成本由成本台账确认',[
 tenant(),ID('shipment_item_id','履约单件 ID'),ID('shipment_id','履约单'),ID('order_unit_id','订单单件'),ID('order_id','订单'),region(),ID('sku_id','SKU'),ID('from_site_id','出库地点'),ID('lot_id','出库批次'),ts('shipped_at','出库时刻')],
 'tenant_id,shipment_item_id',fks=[FK('tenant_id,shipment_id,order_id,region_id,from_site_id','core.shipment','tenant_id,shipment_id,order_id,region_id,from_site_id'),FK('tenant_id,order_unit_id,order_id,region_id,sku_id','core.order_unit','tenant_id,order_unit_id,order_id,region_id,sku_id'),FK('tenant_id,lot_id,from_site_id,sku_id','core.inventory_lot','tenant_id,lot_id,site_id,sku_id')],
 uq=['tenant_id,order_unit_id','tenant_id,shipment_item_id,order_unit_id,region_id'],checks=['available_at >= shipped_at'],scope='region_id',audit=True)

T('core.shipment_event','履约','一张履约单的一次物流状态事件','交付事件是收入确认依据；物流失败未交付不得认收入',[
 tenant(),ID('shipment_event_id','物流事件'),ID('shipment_id','履约单'),ID('order_id','订单'),region(),ID('from_site_id','出库地点'),C('event_seq','integer','事件序号'),C('event_type','text','SHIPPED DELIVERED DELIVERY_FAILED RETURNED_TO_ORIGIN'),ts('event_at','物流事件时刻')],
 'tenant_id,shipment_event_id',fks=[FK('tenant_id,shipment_id,order_id,region_id,from_site_id','core.shipment','tenant_id,shipment_id,order_id,region_id,from_site_id')],uq=['tenant_id,shipment_id,event_seq'],checks=["event_type IN ('SHIPPED','DELIVERED','DELIVERY_FAILED','RETURNED_TO_ORIGIN')",'event_seq > 0','available_at >= event_at'],scope='region_id',audit=True)

T('core.return_header','售后','一张售后申请','可从跨区门店退货；销售归属保持原订单区域',[
 tenant(),ID('return_id','售后申请 ID'),ID('order_id','原订单'),region(),C('return_no','text','售后单号'),ID('request_channel_id','申请渠道'),C('receiving_site_id','bigint','预计接收地点',True),ts('requested_at','申请时刻')],
 'tenant_id,return_id',fks=[FK('tenant_id,order_id,region_id','core.order_header','tenant_id,order_id,region_id'),FK('tenant_id,request_channel_id','core.channel','tenant_id,channel_id'),FK('tenant_id,receiving_site_id','core.site','tenant_id,site_id')],uq=['tenant_id,return_no','tenant_id,return_id,order_id,region_id'],checks=['available_at >= requested_at'],scope='region_id',audit=True)

T('core.return_item','售后','一次售后对应一个已出库单件','v1 一个逻辑单件最多一条售后申请；换码拆退货与新订单且可不模拟',[
 tenant(),ID('return_item_id','售后单件 ID'),ID('return_id','售后申请'),ID('order_id','原订单'),region(),ID('order_unit_id','原单件'),ID('shipment_item_id','原履约单件'),C('reason_code','text','SIZE QUALITY NOT_NEEDED DESCRIPTION OTHER')],
 'tenant_id,return_item_id',fks=[FK('tenant_id,return_id,order_id,region_id','core.return_header','tenant_id,return_id,order_id,region_id'),FK('tenant_id,shipment_item_id,order_unit_id,region_id','core.shipment_item','tenant_id,shipment_item_id,order_unit_id,region_id')],uq=['tenant_id,order_unit_id','tenant_id,return_item_id,order_unit_id,region_id'],checks=["reason_code IN ('SIZE','QUALITY','NOT_NEEDED','DESCRIPTION','OTHER')"],scope='region_id',audit=True)

T('core.return_event','售后','一个售后单件的一次状态事件','ACCEPTED 冲收入 RESTOCKED 冲原成本；现金退款另记',[
 tenant(),ID('return_event_id','售后事件'),ID('return_item_id','售后单件'),ID('order_unit_id','订单单件'),region(),C('event_seq','integer','事件序号'),C('event_type','text','REQUESTED RECEIVED ACCEPTED REJECTED RESTOCKED SCRAPPED'),C('site_id','bigint','事件发生地点 无则 NULL',True),C('restocked_lot_id','bigint','重新入库批次 非回库事件为 NULL',True),ts('event_at','业务事件时刻')],
 'tenant_id,return_event_id',fks=[FK('tenant_id,return_item_id,order_unit_id,region_id','core.return_item','tenant_id,return_item_id,order_unit_id,region_id'),FK('tenant_id,site_id','core.site'),FK('tenant_id,restocked_lot_id','core.inventory_lot','tenant_id,lot_id')],uq=['tenant_id,return_item_id,event_seq'],checks=["event_type IN ('REQUESTED','RECEIVED','ACCEPTED','REJECTED','RESTOCKED','SCRAPPED')",'event_seq > 0','available_at >= event_at',"(event_type = 'RESTOCKED') = (restocked_lot_id IS NOT NULL)"],scope='region_id',audit=True)

T('core.inventory_document','库存','一笔采购 调拨 开账或处置业务单据','采购与补货有可观测的计划和实际时间，不只隐藏场景原因',[
 tenant(),ID('inventory_doc_id','库存业务单据'),C('document_no','text','业务单号'),C('doc_type','text','OPENING PURCHASE TRANSFER DISPOSAL'),C('from_site_id','bigint','来源地点 采购开账可无',True),ID('to_site_id','归属或目的地点'),region(),ts('created_at','单据创建时刻'),ts('planned_at','计划到达或处理时刻'),C('reason_code','text','NORMAL REPLENISHMENT DELAY CLEARANCE')],
 'tenant_id,inventory_doc_id',fks=[FK('tenant_id,from_site_id','core.site','tenant_id,site_id'),FK('tenant_id,to_site_id,region_id','core.site','tenant_id,site_id,region_id')],uq=['tenant_id,document_no'],checks=["doc_type IN ('OPENING','PURCHASE','TRANSFER','DISPOSAL')",'planned_at >= created_at','available_at >= created_at'],scope='region_id',audit=True)
T('core.inventory_document_line','库存','库存业务单据中的一个 SKU','实际完成由库存流水决定，避免未来 actual_at 覆盖历史状态',[
 tenant(),ID('inventory_doc_line_id','单据行'),ID('inventory_doc_id','单据'),ID('sku_id','SKU'),C('quantity','integer','计划数量')],
 'tenant_id,inventory_doc_line_id',fks=[FK('tenant_id,inventory_doc_id','core.inventory_document'),FK('tenant_id,sku_id','core.sku')],uq=['tenant_id,inventory_doc_id,sku_id'],checks=['quantity > 0'],audit=True)

T('core.inventory_movement','库存','一个地点 SKU 批次的一次库存桶变化','可售 待检 预留 在途分开；流水是库存唯一真值',[
 tenant(),ID('movement_id','库存事件 ID'),ID('site_id','地点'),region(),ID('sku_id','SKU'),C('lot_id','bigint','物理批次 预留事件可无',True),
 C('inventory_doc_line_id','bigint','补货调拨等单据行',True),C('order_unit_id','bigint','订单单件引用',True),C('return_item_id','bigint','售后单件引用',True),
 C('movement_type','text','OPENING RECEIPT RESERVE RELEASE SHIP RETURN_RECEIVE RESTOCK SCRAP TRANSFER_OUT TRANSIT_IN TRANSIT_OUT TRANSFER_IN'),
 C('sellable_delta','integer','可售物理库存变动'),C('quarantine_delta','integer','待检库存变动'),C('reserved_delta','integer','预留量变动'),C('in_transit_delta','integer','归目的地点的在途量变动'),ts('event_at','库存变动时刻'),C('event_seq','bigint','租户内同时间排序号')],
 'tenant_id,movement_id',fks=[FK('tenant_id,site_id,region_id','core.site','tenant_id,site_id,region_id'),FK('tenant_id,sku_id','core.sku'),FK('tenant_id,lot_id,site_id,sku_id','core.inventory_lot','tenant_id,lot_id,site_id,sku_id'),FK('tenant_id,inventory_doc_line_id','core.inventory_document_line'),FK('tenant_id,order_unit_id','core.order_unit'),FK('tenant_id,return_item_id','core.return_item')],
 checks=["movement_type IN ('OPENING','RECEIPT','RESERVE','RELEASE','SHIP','RETURN_RECEIVE','RESTOCK','SCRAP','TRANSFER_OUT','TRANSIT_IN','TRANSIT_OUT','TRANSFER_IN')",'sellable_delta <> 0 OR quarantine_delta <> 0 OR reserved_delta <> 0 OR in_transit_delta <> 0','available_at >= event_at'],indexes=[['tenant_id','site_id','sku_id','event_at','event_seq']],scope='region_id',audit=True)

T('core.inventory_snapshot','库存','一个本地日末 地点 SKU 的有效库存快照','零库存仍保留；快照由当时已可见流水生成并带 cutoff；不跨日加总',[
 tenant(),C('snapshot_date','date','当地自然日'),ID('site_id','地点'),region(),ID('sku_id','SKU'),C('sellable_qty','integer','可售物理数'),C('quarantine_qty','integer','待检数'),C('reserved_qty','integer','预留数'),C('in_transit_qty','integer','在途数'),C('available_qty','integer','可售减预留'),ts('as_of','快照计算的信息截止时刻')],
 'tenant_id,snapshot_date,site_id,sku_id,as_of',fks=[FK('tenant_id,site_id,region_id','core.site','tenant_id,site_id,region_id'),FK('tenant_id,sku_id','core.sku')],checks=['sellable_qty >= 0','quarantine_qty >= 0','reserved_qty BETWEEN 0 AND sellable_qty','in_transit_qty >= 0','available_qty = sellable_qty - reserved_qty','available_at >= as_of'],indexes=[['tenant_id','site_id','snapshot_date']],scope='region_id',audit=True)

T('core.revenue_entry','财务','一次单件收入确认或冲减','采用交付确认和退货接受口径；不替代法定总账',[
 tenant(),ID('revenue_entry_id','收入分录'),ID('order_unit_id','订单单件'),region(),C('entry_type','text','DELIVERY RETURN_ACCEPTED'),C('shipment_event_id','bigint','交付事件引用',True),C('return_event_id','bigint','退货接受事件引用',True),C('quantity_delta','smallint','销售 +1 退货 -1'),amount('amount_cent','有符号收入变动'),ts('recognized_at','收入确认时刻')],
 'tenant_id,revenue_entry_id',fks=[unitfk('core.order_unit'),FK('tenant_id,shipment_event_id','core.shipment_event'),FK('tenant_id,return_event_id','core.return_event')],uq=['tenant_id,order_unit_id,entry_type'],
 checks=["(entry_type = 'DELIVERY' AND quantity_delta = 1 AND amount_cent >= 0 AND shipment_event_id IS NOT NULL AND return_event_id IS NULL) OR (entry_type = 'RETURN_ACCEPTED' AND quantity_delta = -1 AND amount_cent <= 0 AND return_event_id IS NOT NULL AND shipment_event_id IS NULL)",'available_at >= recognized_at'],indexes=[['tenant_id','recognized_at']],scope='region_id',audit=True)
T('core.cost_entry','财务','一次单件销售成本确认或冲回','交付计原批次成本；可售回库冲回原成本；损坏不冲回不二次扣损',[
 tenant(),ID('cost_entry_id','成本分录'),ID('order_unit_id','订单单件'),region(),C('entry_type','text','DELIVERY RESTOCK'),ID('lot_id','原出库批次'),C('shipment_event_id','bigint','交付事件',True),C('return_event_id','bigint','可售回库事件',True),amount('amount_cent','有符号销售成本变动；增加成本为正'),ts('recognized_at','成本确认或冲回时刻')],
 'tenant_id,cost_entry_id',fks=[unitfk('core.order_unit'),FK('tenant_id,lot_id','core.inventory_lot'),FK('tenant_id,shipment_event_id','core.shipment_event'),FK('tenant_id,return_event_id','core.return_event')],uq=['tenant_id,order_unit_id,entry_type'],
 checks=["(entry_type = 'DELIVERY' AND amount_cent >= 0 AND shipment_event_id IS NOT NULL AND return_event_id IS NULL) OR (entry_type = 'RESTOCK' AND amount_cent <= 0 AND return_event_id IS NOT NULL AND shipment_event_id IS NULL)",'available_at >= recognized_at'],scope='region_id',cost=True,audit=True)
T('core.order_fee','财务','订单对应的一笔经营变动费用','不含固定租金人力；费用冲回用负数；投放费在 campaign_daily 独立计',[
 tenant(),ID('fee_id','费用 ID'),ID('order_id','订单'),region(),C('order_unit_id','bigint','可以分配到单件；订单级费用为 NULL',True),C('fee_type','text','COMMISSION OUTBOUND_LOGISTICS RETURN_LOGISTICS PAYMENT_SERVICE'),amount('amount_cent','有符号费用发生额'),ts('recognized_at','费用确认时刻')],
 'tenant_id,fee_id',fks=[FK('tenant_id,order_id,region_id','core.order_header','tenant_id,order_id,region_id'),unitfk('core.order_unit')],checks=["fee_type IN ('COMMISSION','OUTBOUND_LOGISTICS','RETURN_LOGISTICS','PAYMENT_SERVICE')",'available_at >= recognized_at'],scope='region_id',cost=True,audit=True)

T('core.order_unit_event','交易','一个逻辑单件的一次状态变化','支持部分履约 取消 超时与原子预留释放；订单当前态只能汇总推导',[
 tenant(),ID('unit_event_id','单件状态事件'),ID('order_unit_id','订单单件'),region(),C('event_seq','integer','同一单件顺序'),C('event_type','text','CREATED RESERVED RELEASED PAID SHIPPED DELIVERED CANCELLED'),C('reason_code','text','NONE STOCK_LOCK_FAILED PAY_TIMEOUT CUSTOMER_CANCEL DELIVERY_FAILED'),ts('event_at','业务时刻')],
 'tenant_id,unit_event_id',fks=[unitfk('core.order_unit')],uq=['tenant_id,order_unit_id,event_seq'],checks=["event_type IN ('CREATED','RESERVED','RELEASED','PAID','SHIPPED','DELIVERED','CANCELLED')",'event_seq > 0','available_at >= event_at'],scope='region_id',audit=True)

T('core.web_session','行为','自有线上渠道的一次会话','匿名访客与已绑定会员分别表达；平台渠道不生成此表',[
 tenant(),ID('session_id','会话 ID'),ID('channel_id','自有渠道'),region(),C('identity_id','bigint','识别出的渠道身份',True),C('anonymous_token','text','匿名设备会话令牌'),C('campaign_id','bigint','可观察的活动来源',True),ts('started_at','会话起点'),C('device_type','text','MOBILE DESKTOP TABLET')],
 'tenant_id,session_id',fks=[FK('tenant_id,channel_id','core.channel'),FK('tenant_id,region_id','core.geo_area','tenant_id,geo_id'),FK('tenant_id,identity_id','core.customer_identity'),FK('tenant_id,campaign_id','core.campaign')],uq=['tenant_id,session_id,region_id'],checks=["device_type IN ('MOBILE','DESKTOP','TABLET')",'available_at >= started_at'],scope='region_id',audit=True)
T('core.behavior_event','行为','一个可观察的会话行为事件','自有渠道完整同源轨迹；不可与订单独立随机生成',[
 tenant(),ID('behavior_event_id','事件 ID'),ID('session_id','会话'),region(),C('event_seq','integer','会话内递增序号'),C('event_type','text','PAGE_VIEW SEARCH PRODUCT_VIEW ADD_CART CHECKOUT_SUBMITTED CHECKOUT_REJECTED'),C('sku_id','bigint','涉及 SKU 允许无',True),C('order_id','bigint','已创建的订单 允许无',True),C('reason_code','text','NONE SOLD_OUT INVALID_CART'),ts('event_at','行为发生时刻')],
 'tenant_id,behavior_event_id',fks=[FK('tenant_id,session_id,region_id','core.web_session','tenant_id,session_id,region_id'),FK('tenant_id,sku_id','core.sku'),FK('tenant_id,order_id,region_id','core.order_header','tenant_id,order_id,region_id')],uq=['tenant_id,session_id,event_seq'],
 checks=["event_type IN ('PAGE_VIEW','SEARCH','PRODUCT_VIEW','ADD_CART','CHECKOUT_SUBMITTED','CHECKOUT_REJECTED')",'event_seq > 0','available_at >= event_at',"(event_type = 'CHECKOUT_SUBMITTED') = (order_id IS NOT NULL)"],indexes=[['tenant_id','session_id','event_at'],['tenant_id','event_at']],scope='region_id',audit=True)

T('core.campaign_daily','营销','一个日 活动 承接渠道 经营区域','广告花费属于此粒度；不得直接连接订单明细后 SUM',[
 tenant(),C('report_date','date','当地日期'),ID('campaign_id','活动'),ID('channel_id','承接渠道'),region(),C('impressions','bigint','曝光数'),C('clicks','bigint','点击数'),amount('spend_cent','当天广告花费'),C('report_version','integer','源报表版本 从1开始'),ts('source_updated_at','源报表更新时间')],
 'tenant_id,report_date,campaign_id,channel_id,region_id,report_version',fks=[FK('tenant_id,campaign_id','core.campaign'),FK('tenant_id,channel_id','core.channel'),FK('tenant_id,region_id','core.geo_area','tenant_id,geo_id')],checks=['impressions >= 0','clicks BETWEEN 0 AND impressions','spend_cent >= 0','report_version > 0','available_at >= source_updated_at'],scope='region_id',audit=True)
T('core.channel_product_daily','营销','一个平台 日 渠道 SKU 区域的经营报表版本','只提供平台可见汇总；商品购买订单数不可跨 SKU 相加当独立订单数',[
 tenant(),C('report_date','date','当地日期'),ID('channel_id','平台渠道'),ID('sku_id','SKU'),region(),C('product_views','bigint','商品页访问事件数 PV'),C('product_visitors','bigint','商品页独立访客 UV'),C('add_cart_users','bigint','加购人数'),C('submitted_orders','bigint','含本 SKU 的创建订单数'),C('paid_orders','bigint','含本 SKU 的支付成功订单数'),amount('paid_amount_cent','分配到本 SKU 的支付成交额'),C('report_version','integer','源报表修订版本'),ts('source_updated_at','来源修订时间')],
 'tenant_id,report_date,channel_id,sku_id,region_id,report_version',fks=[FK('tenant_id,channel_id','core.channel'),FK('tenant_id,sku_id','core.sku'),FK('tenant_id,region_id','core.geo_area','tenant_id,geo_id')],checks=['product_views >= product_visitors','product_visitors >= 0','add_cart_users BETWEEN 0 AND product_visitors','submitted_orders >= 0','paid_orders BETWEEN 0 AND submitted_orders','paid_amount_cent >= 0','report_version > 0','available_at >= source_updated_at'],scope='region_id',audit=True)
T('core.store_traffic_daily','营销','一家门店一天的客流报表版本','客流是进店人次而非企业独立用户',[
 tenant(),C('report_date','date','当地日期'),ID('site_id','门店'),region(),C('visits','bigint','进店人次'),C('report_version','integer','修订版本'),ts('source_updated_at','源更新时间')],
 'tenant_id,report_date,site_id,report_version',fks=[FK('tenant_id,site_id,region_id','core.site','tenant_id,site_id,region_id')],checks=['visits >= 0','report_version > 0','available_at >= source_updated_at'],scope='region_id',audit=True)
T('core.order_attribution','营销','某归因模型版本对一张订单的一条触点归因','v1 LAST_NON_DIRECT_7D 最多一条每单；多触点扩展必须权重归一',[
 tenant(),ID('attribution_id','归因记录 ID'),ID('order_id','订单'),region(),C('campaign_id','bigint','归因活动 无则自然或不可归因',True),C('session_id','bigint','可观察自有会话 平台可无',True),C('touch_at','timestamptz','触点时间 不可观测可空',True),C('model_version','text','固定 LAST_NON_DIRECT_7D_V1'),C('credit','numeric(9,8)','归因权重 v1 固定1'),C('evidence_type','text','OWNED_TOUCH PLATFORM_REPORTED ORGANIC UNATTRIBUTABLE'),ts('computed_at','归因计算时刻')],
 'tenant_id,attribution_id',fks=[FK('tenant_id,order_id,region_id','core.order_header','tenant_id,order_id,region_id'),FK('tenant_id,campaign_id','core.campaign'),FK('tenant_id,session_id','core.web_session')],uq=['tenant_id,order_id,model_version'],checks=['credit = 1',"model_version = 'LAST_NON_DIRECT_7D_V1'","evidence_type IN ('OWNED_TOUCH','PLATFORM_REPORTED','ORGANIC','UNATTRIBUTABLE')",'available_at >= computed_at'],scope='region_id',audit=True)
T('core.target_monthly','计划','某月 渠道 大区的一项指标目标','v1 不同时混入集团总目标或品类目标；先聚合实际再关联',[
 tenant(),C('target_month','date','月份第一天'),ID('channel_id','渠道'),region(),C('metric_code','text','NET_SALES CONTRIBUTION'),C('target_cent','bigint','目标金额 CNY整数分'),C('plan_version','integer','目标版本'),ts('approved_at','批准时间')],
 'tenant_id,target_month,channel_id,region_id,metric_code,plan_version',fks=[FK('tenant_id,channel_id','core.channel'),FK('tenant_id,region_id','core.geo_area','tenant_id,geo_id')],checks=["extract(day FROM target_month) = 1","metric_code IN ('NET_SALES','CONTRIBUTION')",'plan_version > 0','available_at >= approved_at'],scope='region_id',audit=True)

T('ops.generation_run','治理','一次生成或恢复运行','代码 配置 输入指纹及检查点必须匹配才允许恢复',[
 C('run_id','text','运行 ID'),C('release_id','text','发布版本'),C('stage','text','ACQUIRE WEIGHTS CONTEXT PROPOSAL SIMULATE PUBLISH VALIDATE'),C('status','text','RUNNING SUCCEEDED FAILED'),ts('started_at','运行起点'),C('finished_at','timestamptz','结束时间',True),C('checkpoint_uri','text','最新已提交检查点',True),C('input_sha256','char(64)','输入规范化摘要')],
 'run_id',fks=[FK('release_id','ops.dataset_release')],checks=["status IN ('RUNNING','SUCCEEDED','FAILED')"])
T('ops.file_manifest','治理','一份已提交的数据或配置文件','幂等提交与发布依据；不暴露给业务 Agent',[
 C('file_id','text','内容地址文件 ID'),C('release_id','text','发布版本'),C('run_id','text','运行'),C('tenant_id','smallint','业务租户 无则公共元数据',True),C('asset_name','text','逻辑表或资产名'),C('partition_key','text','规范化分区键'),C('relative_path','text','相对版本根的文件路径'),C('row_count','bigint','逻辑行数'),C('byte_size','bigint','字节数'),C('sha256','char(64)','物理文件摘要'),C('logical_sha256','char(64)','按规定排序的逻辑内容摘要'),C('schema_sha256','char(64)','schema摘要'),ts('committed_at','提交时间')],
 'file_id',fks=[FK('release_id','ops.dataset_release'),FK('run_id','ops.generation_run')],uq=['release_id,relative_path'],checks=['row_count >= 0','byte_size >= 0'])
T('ops.source_watermark','治理','某源在一个已观察时点的完整性水位','complete_through 由批次连续覆盖得到，不能使用 MAX(event_at)',[
 tenant(),C('source_system','text','源系统'),ts('observed_at','检查时间'),ts('complete_through','确认完整的业务时间截止 不含'),C('expected_batches','integer','应到批次数'),C('arrived_batches','integer','已到批次数'),C('status','text','COMPLETE DELAYED FAILED'),C('missing_batch_ids','jsonb','缺失批次 ID数组',default="'[]'::jsonb")],
 'tenant_id,source_system,observed_at',checks=['arrived_batches BETWEEN 0 AND expected_batches',"status IN ('COMPLETE','DELAYED','FAILED')",'complete_through <= observed_at'])

T('sec.principal','权限','一个真实数据库登录身份','认证使用 session_user，禁止依赖任意 SQL 可改的 tenant GUC',[
 C('db_role','name','实际数据库登录角色名'),tenant(),C('persona','text','EXEC ANALYST REGION MARKETING'),C('all_regions','boolean','允许本租户全部区域'),C('can_view_cost','boolean','允许采购成本 成本台账 与费用')],
 'db_role',checks=["persona IN ('EXEC','ANALYST','REGION','MARKETING')"])
T('sec.principal_region','权限','登录角色的一条区域授权','仅受信任管理员可写',[
 C('db_role','name','登录角色'),tenant(),ID('region_id','授权大区')],
 'db_role,tenant_id,region_id',fks=[FK('db_role','sec.principal'),FK('tenant_id,region_id','core.geo_area','tenant_id,geo_id')])
T('eval.scenario','评测','一个业务或数据链路情节','对业务 Agent 和普通查询角色完全隔离',[
 C('scenario_id','text','场景代码'),tenant(),C('scenario_type','text','BUSINESS DATA_PIPELINE ACCESS'),C('title','text','场景标题'),C('parameters','jsonb','确定性注入参数'),C('observable_evidence','jsonb','可见证据资产及范围'),C('truth_definition','jsonb','预期变化算法与反事实定义')],
 'scenario_id')
T('eval.question','评测','一条自然语言评测题的版本','每题固定权限 时间口径 数据版本和结果形式',[
 C('question_id','text','题号'),C('scenario_id','text','所属情节 普通指标题可无',True),tenant(),C('persona','text','测试角色'),C('question_text','text','中文题目'),ts('business_as_of','业务事件截止'),ts('knowledge_as_of','数据可见截止'),C('metric_version','text','指标版本'),C('gold_sql_path','text','独立金标SQL相对路径'),C('expected_shape','jsonb','列名 类型 排序 单位 图表维度'),C('tolerance','jsonb','金额0 容差 比率容差等')],
 'question_id',fks=[FK('scenario_id','eval.scenario')])
T('eval.expected_result','评测','一条题目在一个版本上的金标结果','不把 Agent 自己生成的 SQL 当金标',[
 C('question_id','text','题号'),C('release_id','text','版本'),C('result_sha256','char(64)','规范化结果摘要'),C('result_rows','jsonb','小规模金标结果 或存放摘要与文件路径'),C('verifier_version','text','独立验证器版本'),ts('computed_at','金标生成时刻')],
 'question_id,release_id',fks=[FK('question_id','eval.question'),FK('release_id','ops.dataset_release')])

T('core.customer_identity_link','客户','一条渠道身份到会员的已验证绑定','身份本身保持不可变；绑定独立记录，禁止把未来会员关联回填到历史订单',[
 tenant(),ID('identity_link_id','绑定记录'),ID('identity_id','渠道身份'),ID('customer_id','企业会员'),ts('linked_at','绑定确认时刻')],
 'tenant_id,identity_link_id',fks=[FK('tenant_id,identity_id','core.customer_identity'),FK('tenant_id,customer_id','core.customer')],uq=['tenant_id,identity_id'],checks=['available_at >= linked_at'],audit=True)

T('core.stock_allocation_attempt','库存','一次订单锁库事务中一个候选地点 SKU 的尝试','包含失败尝试的可观察库存证据；整单验证后原子提交，失败不产生部分预留',[
 tenant(),ID('allocation_attempt_id','尝试行 ID'),ID('allocation_group_id','全订单原子尝试组'),ID('order_id','已创建订单'),region(),ID('site_id','候选履约地点'),ID('sku_id','待预留 SKU'),C('requested_qty','integer','本地点拟承担数量'),C('available_before_qty','integer','尝试前可承诺量'),C('outcome','text','COMMITTED INSUFFICIENT ROLLED_BACK'),ts('attempted_at','锁库尝试时刻')],
 'tenant_id,allocation_attempt_id',fks=[FK('tenant_id,order_id,region_id','core.order_header','tenant_id,order_id,region_id'),FK('tenant_id,site_id','core.site'),FK('tenant_id,sku_id','core.sku')],uq=['tenant_id,allocation_group_id,site_id,sku_id'],checks=['requested_qty > 0','available_before_qty >= 0',"outcome IN ('COMMITTED','INSUFFICIENT','ROLLED_BACK')","outcome <> 'COMMITTED' OR requested_qty <= available_before_qty",'available_at >= attempted_at'],scope='region_id',audit=True)

T('core.inventory_valuation_snapshot','库存','一个日末 地点 SKU 和观察截止的库存金额','由批次余额乘原批次成本汇总；只计可售物理库存，预留包含其中；待检和损坏不重复确认为存货资产',[
 tenant(),C('snapshot_date','date','本地日末日期'),ID('site_id','地点'),region(),ID('sku_id','SKU'),ts('as_of','信息截止'),amount('sellable_value_cent','可售物理库存原批次成本合计')],
 'tenant_id,snapshot_date,site_id,sku_id,as_of',fks=[FK('tenant_id,site_id,region_id','core.site','tenant_id,site_id,region_id'),FK('tenant_id,sku_id','core.sku')],checks=['sellable_value_cent >= 0','available_at >= as_of'],scope='region_id',cost=True,audit=True)

# Strengthen business-chain keys beyond tenant isolation.
BY = {t['name']:t for t in TABLES}

# Immutable identity plus independently observed membership binding.
ident=BY['core.customer_identity']
ident['columns']=[c for c in ident['columns'] if c['name'] not in ('customer_id','linked_at')]
ident['foreign_keys']=[f for f in ident['foreign_keys'] if f['references']!='core.customer']
ident['checks']=['available_at >= first_seen_at']
ident['description']='不可变渠道内身份；会员绑定见 customer_identity_link，未识别用户不可合并成同一个客户'
ident['unique'].append(['tenant_id','identity_id','channel_id'])
for name in ['core.order_header','core.web_session']:
    t=BY[name]
    t['foreign_keys']=[f for f in t['foreign_keys'] if f['references']!='core.customer_identity']+[FK('tenant_id,identity_id,channel_id','core.customer_identity','tenant_id,identity_id,channel_id')]

# Effective versions also have a knowledge time; published plans may precede their effective dates.
for name in ['core.channel_listing','core.assortment','core.price_period','core.cost_period','core.campaign','core.promotion']:
    t=BY[name]; t['audit']=True
    t['columns'] += [ts('available_at','此计划或版本在源中首次发布可见时刻'),ID('load_batch_id','来源采集批次')]
    t['foreign_keys'].append(FK('tenant_id,load_batch_id','ops.ingestion_batch','tenant_id,batch_id'))
BY['core.order_header']['unique'].append(['tenant_id','order_id','region_id','channel_id'])
BY['core.order_header']['checks'].append('payable_cent > 0')
for name,id_col in [('core.channel_listing','listing_id'),('core.price_period','price_id')]:
    BY[name]['unique'].append(['tenant_id',id_col,'sku_id','channel_id'])
ol=BY['core.order_line']; ol['columns'].insert(4,ID('channel_id','继承订单销售渠道；锁定有效映射和价格'))
ol['foreign_keys']=[f for f in ol['foreign_keys'] if f['references'] not in ('core.order_header','core.channel_listing','core.price_period')]+[
 FK('tenant_id,order_id,region_id,channel_id','core.order_header','tenant_id,order_id,region_id,channel_id'),
 FK('tenant_id,listing_id,sku_id,channel_id','core.channel_listing','tenant_id,listing_id,sku_id,channel_id'),
 FK('tenant_id,price_id,sku_id,channel_id','core.price_period','tenant_id,price_id,sku_id,channel_id')]

# Physical damaged stock is distinct from both quarantine and physical disposal.
re=BY['core.return_event']
for c in re['columns']:
    if c['name']=='event_type':c['description']='REQUESTED RECEIVED ACCEPTED REJECTED RESTOCKED DAMAGED SCRAPPED'
re['checks']=[v.replace("'RESTOCKED','SCRAPPED'","'RESTOCKED','DAMAGED','SCRAPPED'") for v in re['checks']]
re['checks'].append("event_type NOT IN ('RECEIVED','RESTOCKED','DAMAGED','SCRAPPED') OR site_id IS NOT NULL")
mv=BY['core.inventory_movement']; mv['description']='可售 待检 损坏 预留 在途分开；同一 business_txn_id 原子提交，流水是库存真值'
mv['columns'] += [C('damaged_delta','integer','已判损坏尚未移出实物的数量变化'),ID('business_txn_id','原子业务提交 ID'),C('source_kind','text','UNIT_EVENT SHIPMENT_EVENT RETURN_EVENT DOCUMENT_LINE'),ID('source_event_id','对应源业务事件或单据行 ID'),C('source_leg_no','integer','同一来源拆出的稳定库存腿号')]
mv['unique'] += [['tenant_id','source_kind','source_event_id','source_leg_no'],['tenant_id','event_seq']]
mv['checks']=[v.replace("'RESTOCK','SCRAP'","'RESTOCK','DAMAGE','SCRAP','RTO_RECEIPT'").replace('OR in_transit_delta <> 0','OR in_transit_delta <> 0 OR damaged_delta <> 0') for v in mv['checks']]
mv['checks'] += ["source_kind IN ('UNIT_EVENT','SHIPMENT_EVENT','RETURN_EVENT','DOCUMENT_LINE')",'source_leg_no > 0','event_seq > 0']
for c in mv['columns']:
    if c['name']=='movement_type':c['description']+=' DAMAGE RTO_RECEIPT'
snap=BY['core.inventory_snapshot']; snap['columns'].insert(7,C('damaged_qty','integer','已判损坏尚未物理处置数量，不再计可售库存资产'))
snap['checks'].append('damaged_qty >= 0')
lot=BY['core.inventory_lot']; lot['unique'].append(['tenant_id','lot_id','sku_id'])
lot['foreign_keys']=[f for f in lot['foreign_keys'] if not ('parent_lot_id' in f['columns'])]+[FK('tenant_id,parent_lot_id,sku_id','core.inventory_lot','tenant_id,lot_id,sku_id')]
BY['eval.question']['columns'].insert(7,ts('reference_time','解释昨天 本月 最近30天的固定语义时钟；独立于真实运行日期'))
cp=BY['core.channel_product_daily']
for c in cp['columns']:
    if c['name']=='report_date':c['description']='下单 cohort 的本地日期；支付随后到达则修订此日期版本'
    if c['name']=='paid_orders':c['description']='该创建日期 cohort 含本 SKU 的订单，截至版本可见时累计已足额支付单数'
    if c['name']=='paid_amount_cent':c['description']='该创建日期 cohort 已足额支付订单分配到本 SKU 的净额 CNY整数分；不是当日现金流'
at=BY['core.order_attribution']
at['checks']=[v.replace("'OWNED_TOUCH','PLATFORM_REPORTED','ORGANIC','UNATTRIBUTABLE'","'OWNED_TOUCH','ORGANIC','UNATTRIBUTABLE'") for v in at['checks']]
at['checks'].append("(evidence_type = 'OWNED_TOUCH' AND campaign_id IS NOT NULL AND session_id IS NOT NULL AND touch_at IS NOT NULL) OR (evidence_type IN ('ORGANIC','UNATTRIBUTABLE') AND campaign_id IS NULL AND session_id IS NULL AND touch_at IS NULL)")
for c in at['columns']:
    if c['name']=='evidence_type':c['description']='OWNED_TOUCH ORGANIC UNATTRIBUTABLE；平台仅有日聚合报表时必须 UNATTRIBUTABLE'
BY['core.order_unit']['unique'].append(['tenant_id','order_unit_id','order_id','region_id'])
BY['core.inventory_document']['unique'].append(['tenant_id','inventory_doc_id','region_id'])
dl=BY['core.inventory_document_line']; dl['columns'].insert(3,region()); dl['scope']='region_id'
dl['foreign_keys']=[f for f in dl['foreign_keys'] if f['references']!='core.inventory_document']+[FK('tenant_id,inventory_doc_id,region_id','core.inventory_document','tenant_id,inventory_doc_id,region_id')]
for name in ['core.refund_allocation','core.order_fee']:
    t=BY[name]
    t['foreign_keys']=[f for f in t['foreign_keys'] if f['references']!='core.order_unit']+[FK('tenant_id,order_unit_id,order_id,region_id','core.order_unit','tenant_id,order_unit_id,order_id,region_id')]
BY['core.return_item']['foreign_keys'].append(FK('tenant_id,order_unit_id,order_id,region_id','core.order_unit','tenant_id,order_unit_id,order_id,region_id'))
BY['sec.principal']['unique'].append(['db_role','tenant_id'])
BY['sec.principal_region']['foreign_keys']=[f for f in BY['sec.principal_region']['foreign_keys'] if f['references']!='sec.principal']+[FK('db_role,tenant_id','sec.principal','db_role,tenant_id')]
fee=BY['core.order_fee']
fee['columns'] += [C('source_system','text','费用来源系统'),C('source_fee_no','text','来源费用唯一号；回调重试不得变号'),C('reversal_of_fee_id','bigint','负费用冲回的原费用 ID，正费用为空',True),C('source_event_kind','text','PAYMENT SHIPMENT RETURN REFUND'),ID('source_event_id','费用发生依据的业务事件 ID')]
fee['unique'] += [['tenant_id','source_system','source_fee_no'],['tenant_id','fee_id','order_id','region_id']]
fee['foreign_keys'].append(FK('tenant_id,reversal_of_fee_id,order_id,region_id','core.order_fee','tenant_id,fee_id,order_id,region_id'))
fee['checks'] += ["(amount_cent >= 0 AND reversal_of_fee_id IS NULL) OR (amount_cent < 0 AND reversal_of_fee_id IS NOT NULL)","source_event_kind IN ('PAYMENT','SHIPMENT','RETURN','REFUND')"]
BY['core.site']['scope']=None
BY['core.site']['description']+='；地点地址与名称是租户内共享维度，地点经营事实另按实际区域授权'
for t in TABLES:
    for c in t['columns']:
        if c['name']=='quarantine_delta':c['description']='隔离实物变动；包含待检与已接受退货后待恢复可售'
        if c['name']=='quarantine_qty':c['description']='隔离实物数；包含待检与已接受退货后待恢复可售'
    t['access_class']=('PRIVATE_CONTROL' if not t['name'].startswith('core.') else
        'CUSTOMER_RESTRICTED' if t['domain']=='客户' else
        'REGION_COST' if t['cost_protected'] and t['scope'] else
        'TENANT_COST' if t['cost_protected'] else
        'REGION_BUSINESS' if t['scope'] else
        'PUBLIC_CALENDAR' if t['name']=='core.calendar' else 'TENANT_DIMENSION')

def validate_model():
    for t in TABLES:
        names=[c['name'] for c in t['columns']]
        assert len(names)==len(set(names)),t['name']
        for cols in [t['primary_key']]+t['unique']:
            assert set(cols)<=set(names),(t['name'],cols)
        for f in t['foreign_keys']:
            assert set(f['columns'])<=set(names),(t['name'],f)
            target=BY[f['references']]
            assert set(f['reference_columns'])<=set(c['name'] for c in target['columns']),(t['name'],f)
            assert f['reference_columns'] in [target['primary_key']]+target['unique'],(t['name'],f,'not unique')
            assert len(f['columns'])==len(f['reference_columns'])
            lt={c['name']:c['type'] for c in t['columns']}; rt={c['name']:c['type'] for c in target['columns']}
            assert all(lt[a]==rt[b] for a,b in zip(f['columns'],f['reference_columns'])),(t['name'],f,'type mismatch')
            if 'tenant_id' in names and f['references'].startswith('core.'):
                assert 'tenant_id' in f['columns'],(t['name'],f,'missing tenant FK')

def q(s): return "'"+s.replace("'","''")+"'"

def emit():
    validate_model()
    (ROOT/'config'/'schema_contract.json').write_text(json.dumps({'schema_version':'1.0.0','dialect':'PostgreSQL 17','tables':TABLES},ensure_ascii=False,indent=2)+'\n')
    sql=['-- Generated from tools/build_contract.py. One database per immutable dataset release.',
         '-- PostgreSQL 17. All CREATE statements run once in a new empty database.',
         'BEGIN;',"SET TIME ZONE 'UTC';"]
    sql += [f'CREATE SCHEMA IF NOT EXISTS {s};' for s in ['core','ops','sec','eval','mart']]
    for t in TABLES:
        defs=[]
        for c in t['columns']:
            d=f"    {c['name']} {c['type']}"+('' if c['nullable'] else ' NOT NULL')
            if c['default'] is not None:d+=' DEFAULT '+c['default']
            defs.append(d)
        defs += ['    PRIMARY KEY ('+', '.join(t['primary_key'])+')']
        defs += ['    UNIQUE ('+', '.join(u)+')' for u in t['unique']]
        defs += ['    CHECK ('+v+')' for v in t['checks']]
        sql.append('CREATE TABLE '+t['name']+' (\n'+',\n'.join(defs)+'\n);')
        sql.append('COMMENT ON TABLE '+t['name']+' IS '+q(t['grain']+'。'+t['description'])+';')
        for c in t['columns']:sql.append('COMMENT ON COLUMN '+t['name']+'.'+c['name']+' IS '+q(c['description'])+';')
    # All tables exist before FK creation, including self references and audited dimensions.
    for ti,t in enumerate(TABLES):
        for fi,f in enumerate(t['foreign_keys']):
            sql.append('ALTER TABLE '+t['name']+f' ADD CONSTRAINT fk_{ti:02}_{fi:02} FOREIGN KEY ('+', '.join(f['columns'])+') REFERENCES '+f['references']+' ('+', '.join(f['reference_columns'])+') DEFERRABLE INITIALLY IMMEDIATE;')
        for ii,idx in enumerate(t['indexes']):
            sql.append(f"CREATE INDEX ix_{ti:02}_{ii:02} ON {t['name']} ("+', '.join(idx)+');')
    sql+=['COMMIT;']
    (ROOT/'sql'/'01_schema.sql').write_text('\n\n'.join(sql)+'\n')
    md=['# 完整数据字典','', '模型版本 1.0.0。本文与 DDL 和 ER 图由同一模型生成。金额均为 CNY 不含税整数分，UTC 时刻使用 timestamptz。',
        '',f"共 {len(TABLES)} 张表，{sum(len(t['columns']) for t in TABLES)} 个字段。数据库每次装载一个不可变数据版本。",'',
        '字段中的 available_at 是该记录的来源可见时间；load_batch_id 关联模拟采集批次。租户主键和外键必须整体传递。','']
    for t in TABLES:
        md += ['## '+t['name'],'',t['description'],'','**粒度：**'+t['grain'],'','**主键：**`'+', '.join(t['primary_key'])+'`','',
               '**权限分类：**`'+t['access_class']+'`；实际策略见 02_security.sql。','',
               '| 字段 | 类型 | 可空 | 默认值 | 语义 |','|---|---|---|---|---|']
        for c in t['columns']:md.append('| `'+c['name']+'` | `'+c['type']+'` | '+('是' if c['nullable'] else '否')+' | '+str(c['default'] or '无')+' | '+c['description']+' |')
        if t['foreign_keys']:
            md += ['','**外键：**','']+[f"- `({', '.join(f['columns'])})` → `{f['references']}({', '.join(f['reference_columns'])})`" for f in t['foreign_keys']]
        if t['unique']:md+=['','**唯一约束：**','']+['- `'+', '.join(u)+'`' for u in t['unique']]
        if t['checks']:md+=['','**行内约束：**','']+['- `'+v+'`' for v in t['checks']]
        if t['indexes']:md+=['','**查询索引：**','']+['- `'+', '.join(v)+'`' for v in t['indexes']]
        md += ['']
    (ROOT/'docs'/'schema_dictionary.md').write_text('\n'.join(md)+'\n')
    domains={
      '01_organization':['core.tenant','core.geo_area','core.org_unit','core.site','core.channel','sec.principal','sec.principal_region'],
      '02_product':['core.brand','core.category','core.sport','core.spu','core.spu_sport','core.sku','core.channel_listing','core.price_period','core.cost_period','core.assortment'],
      '03_orders':['core.customer','core.customer_identity','core.customer_identity_link','core.order_header','core.order_line','core.order_unit','core.order_status_event','core.order_unit_event','core.discount_allocation','core.promotion'],
      '04_payment_return':['core.order_header','core.order_unit','core.payment','core.refund','core.refund_allocation','core.return_header','core.return_item','core.return_event'],
      '05_fulfillment':['core.site','core.order_unit','core.shipment','core.shipment_item','core.shipment_event','core.stock_allocation_attempt'],
      '06_inventory':['core.site','core.sku','core.inventory_lot','core.inventory_document','core.inventory_document_line','core.inventory_movement','core.inventory_snapshot','core.inventory_valuation_snapshot'],
      '07_finance':['core.order_unit','core.shipment_event','core.return_event','core.revenue_entry','core.cost_entry','core.order_fee'],
      '08_marketing':['core.campaign','core.campaign_daily','core.order_header','core.order_attribution','core.web_session','core.behavior_event','core.channel_product_daily','core.store_traffic_daily','core.target_monthly'],
      '09_governance':['core.tenant','ops.dataset_release','ops.ingestion_batch','ops.generation_run','ops.file_manifest','ops.source_watermark','eval.scenario','eval.question','eval.expected_result']}
    (ROOT/'config'/'er_groups.json').write_text(json.dumps(domains,ensure_ascii=False,indent=2)+'\n')
    for name, group in domains.items():
        lines=['erDiagram','    direction TB']
        for tn in group:
            t=BY[tn]; node=tn.replace('.','_'); lines.append('    '+node+' {')
            for c in t['columns']:
                if c['name'] in set(t['primary_key'])|{v for f in t['foreign_keys'] for v in f['columns']}:
                    typ=c['type'].split('(')[0].replace(' ','_'); tag=' PK' if c['name'] in t['primary_key'] else ' FK'
                    lines.append(f"        {typ} {c['name']}{tag}")
            lines.append('    }')
        seen=set()
        for tn in group:
            for f in BY[tn]['foreign_keys']:
                target=f['references']
                if target in group and target!=tn and (target,tn) not in seen:
                    seen.add((target,tn)); optional=any(c['nullable'] for c in BY[tn]['columns'] if c['name'] in f['columns'])
                    parent='|o' if optional else '||'
                    lines.append('    '+target.replace('.','_')+' '+parent+'--o{ '+tn.replace('.','_')+' : "'+','.join(x for x in f['columns'] if x!='tenant_id')+'"')
        (ROOT/'diagrams'/(name+'.mmd')).write_text('\n'.join(lines)+'\n')
    summary={'tables':len(TABLES),'columns':sum(len(t['columns']) for t in TABLES),'foreign_keys':sum(len(t['foreign_keys']) for t in TABLES),'domains':dict(Counter(t['domain'] for t in TABLES))}
    (ROOT/'validation'/'model_summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(summary,ensure_ascii=False))

if __name__=='__main__':emit()

