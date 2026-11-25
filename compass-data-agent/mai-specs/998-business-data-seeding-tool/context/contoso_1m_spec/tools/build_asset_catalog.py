import json,re,hashlib,copy
from pathlib import Path
import yaml
root=Path(__file__).resolve().parents[1]
load=lambda p:json.loads((root/p).read_text())
schema=load('config/schema_contract.json'); patch=load('config/contoso_patch_contract.json')
profile=yaml.safe_load((root/'config/profile_1m.yaml').read_text())
gates=load('validation/assertions.json')
mapping_text=(root/'docs/generation_mapping.md').read_text()
generation={}
for line in mapping_text.splitlines():
 m=re.match(r'^\| `(\w+\.\w+)` \| (.*?) \| (.*?) \|$',line)
 if m:generation[m[1]]={'primary_stage_and_input':m[2],'production_rule':m[3]}
security_text=(root/'sql/02_security.sql').read_text()
security={f'core.{a}':{'scope':b,'can_view_cost_required':c=='true'} for a,b,c in re.findall(r"\('([a-z_]+)',\s*'(TENANT|PUBLIC_DATE|CUSTOMER_FULL|SALES_REGION|SITE_REGION)',\s*(true|false)\)",security_text)}
assert len(schema['tables'])==63 and len(generation)==63 and len(security)==53

owners={}
def own(code,source_systems,names):
 for n in names.split(): owners[n]={'code':code,'source_systems':source_systems}
own('DATA_PLATFORM',[], 'ops.dataset_release ops.ingestion_batch ops.generation_run ops.file_manifest ops.source_watermark')
own('IAM',[], 'sec.principal sec.principal_region')
own('EVALUATION',[], 'eval.scenario eval.question eval.expected_result')
own('ERP',['ERP'],'core.tenant core.geo_area core.org_unit core.site core.channel core.calendar core.target_monthly')
own('PIM',['PIM'],'core.brand core.category core.sport core.spu core.spu_sport core.sku core.channel_listing core.price_period')
own('WMS',['PIM','WMS'],'core.assortment')
own('ERP',['ERP'],'core.cost_period core.revenue_entry core.cost_entry core.order_fee')
own('CRM',['CRM'],'core.customer core.customer_identity core.customer_identity_link')
own('ADS',['ADS'],'core.campaign core.campaign_daily core.channel_product_daily')
own('OMS',['OMS','POS'],'core.promotion core.order_header core.order_line core.order_unit core.order_status_event core.order_unit_event core.discount_allocation core.payment core.refund core.refund_allocation core.return_header core.return_item')
own('OMS',['OMS','WMS'],'core.stock_allocation_attempt')
own('WMS',['WMS'],'core.inventory_lot core.inventory_document core.inventory_document_line core.inventory_movement core.inventory_snapshot core.inventory_valuation_snapshot')
own('WMS',['WMS','POS'],'core.shipment core.shipment_item core.shipment_event core.return_event')
own('WEB',['WEB'],'core.web_session core.behavior_event')
own('ADS',['WEB','OMS','ADS'],'core.order_attribution')
own('POS',['POS'],'core.store_traffic_daily')
assert set(owners)=={t['name'] for t in schema['tables']}

# These labels describe semantic layers; they do not create extra physical schemas.
master=set('tenant geo_area org_unit site channel brand category sport spu spu_sport sku customer customer_identity calendar campaign promotion'.split())
versions=set('channel_listing assortment price_period cost_period customer_identity_link'.split())
reports=set('campaign_daily channel_product_daily store_traffic_daily'.split())
snapshots={'inventory_snapshot','inventory_valuation_snapshot'}

def layer(n):
 s,t=n.split('.')
 if s=='ops':return 'OPS_CONTROL'
 if s=='sec':return 'SEC_ACCESS'
 if s=='eval':return 'EVAL_HIDDEN'
 if t in master:return 'CORE_MASTER'
 if t in versions:return 'CORE_VERSIONED_REFERENCE'
 if t in reports:return 'CORE_SOURCE_REPORT'
 if t in snapshots:return 'CORE_SNAPSHOT'
 if t=='target_monthly':return 'CORE_PLAN'
 return 'CORE_FACT'

row={}
def dynamic(names,rule):
 for n in names.split():row[n]={'kind':'dynamic','rule':rule,'exact_rows':None}
def fixed(n,number,rule,per_tenant=None):
 row[n]={'kind':'fixed','rule':rule,'exact_rows':number}
 if per_tenant is not None:row[n]['exact_rows_by_tenant']=per_tenant
per=lambda key:{str(t['tenant_id']):t[key] for t in profile['tenants']}
fixed('core.tenant',len(profile['tenants']),'冻结 profile 中每个独立经营企业一行。')
for name,key in [('brand','brands'),('spu','spu'),('sku','sku'),('customer','members'),('customer_identity','identities'),('order_header','orders')]:
 fixed('core.'+name,sum(per(key).values()),'冻结 config/profile_1m.yaml 的逐租户 '+key+' 配额；行数表示目标，不表示已经生成。',per(key))
site_count={str(t['tenant_id']):t['stores']+t['warehouses'] for t in profile['tenants']}
fixed('core.site',sum(site_count.values()),'门店总数已包含 OUTLET，再加仓库；不重复计算奥莱。',site_count)
fixed('core.channel',len(profile['channels'])*len(profile['tenants']),'每个租户实例化冻结渠道字典；当前每租户 7 个。',{str(t['tenant_id']):len(profile['channels']) for t in profile['tenants']})
category_n=len(profile['categories'])+sum(len(c['subcategories']) for c in profile['categories'])
fixed('core.category',category_n*len(profile['tenants']),'每个租户实例化 8 个一级与 24 个二级品类节点。',{str(t['tenant_id']):category_n for t in profile['tenants']})
fixed('core.calendar',profile['time']['daily_snapshot_days'],'全局共享日历：订单期 1096 天 + 生命周期尾窗 90 天；不按租户复制。')
fixed('ops.dataset_release',1,'本规范数据库每次装载一个不可变 release；跨版本控制目录可以在外部管理面维护，不运行本发布库的 H02 门禁。')
dynamic('ops.ingestion_batch','按租户×源计划窗口产生采集批次，包含按变更触发与失败/延迟批次；以实际批次清单计数。')
dynamic('core.geo_area','按冻结的租户内区域/省/市字典产生树节点；只固定配置中的字典覆盖，不随机增加地理层级。')
dynamic('core.org_unit','按冻结组织树产生集团、区域、门店、电商组织；数量来自实际组织配置。')
dynamic('core.sport','按冻结运动标签字典产生；标签数独立于商品财务品类。')
dynamic('core.spu_sport','按合法 SPU×运动标签关系产生；每个关系一行，禁止把标签关系扩成重复销售事实。')
dynamic('core.channel_listing','对实际售卖的渠道×SKU 生成非重叠编码有效版本；数量由上架范围及换码计划决定。')
dynamic('core.assortment','对实际经营的地点×SKU 生成有效区间；约 24800 个基础组合仅为容量参考，不是 SKU×所有地点全积，也不是区间行数硬配额。')
dynamic('core.price_period','实际 SKU×渠道价格计划的有效区间数；每次计划变价增加版本，不按每天复制不变价格。')
dynamic('core.cost_period','SKU 采购成本计划的有效区间数；新采购批次引用计划，旧批次成本不重抽。')
dynamic('core.customer_identity_link','每个确实发生且有证据的渠道身份绑定一行；v1 每个 identity 最多一条，未绑定身份不造映射。')
dynamic('core.campaign','按冻结投放计划建立活动；数量来自活动日历及承接渠道配置。')
dynamic('core.promotion','按冻结优惠计划建立规则与时段；未参与优惠的订单不强制分配规则。')
dynamic('core.order_line','每单原始 proposal 相同 SKU 在同价/同 listing/同优惠上下文下合并后的行数之和；不锁死为百万行。')
dynamic('core.order_unit','等于所有规范订单行 quantity 之和；一个逻辑计量单件一行，不是商品序列号。')
dynamic('core.order_status_event','每个订单实际经过的合法状态事件数之和；保留 CREATED 与取消等终止路径，不补齐未发生状态。')
dynamic('core.order_unit_event','每个逻辑单件实际发生的状态事件数之和；用于部分履约/取消，不读取未来当前态。')
dynamic('core.discount_allocation','每个实际适用优惠×订单单件的分摊记录；无优惠单件不强制造行，多次优惠按固定次序分摊。')
dynamic('core.payment','实际支付尝试数，包含失败、拆分支付与合法重试；attempted_at 即时完成，不固定一单一笔。')
dynamic('core.refund','取消/接受退货后实际发生的退款尝试数；退款成功与失败均保留，不固定等于售后件数。')
dynamic('core.refund_allocation','退款尝试实际分配的逻辑单件数之和；每笔分配和等于退款金额，成功累计不超原额。')
dynamic('core.inventory_lot','开账/采购/调入/退货收货形成的实际地点 SKU 成本批次数；按原批成本拆批，不按每件采购固定一批。')
dynamic('core.shipment','全额支付后实际创建的分仓包裹/POS 交付单数；可以一单多包，取消未发货不造包裹。')
dynamic('core.shipment_item','实际出库逻辑单件数；v1 每个 order_unit 至多一次，故不超过 order_unit 总行数。')
dynamic('core.shipment_event','实际履约单经过的物流事件数之和，含失败/RTO；不为未交付包裹造 DELIVERED。')
dynamic('core.return_header','实际售后申请单数；一张申请可包含多个已交付单件。')
dynamic('core.return_item','实际售后单件数；v1 同一逻辑单件最多一个申请，不超过合法已出库/交付候选集合。')
dynamic('core.return_event','每个售后单件实际发生的申请/收货/验收/回库或损坏处置事件数之和。')
dynamic('core.inventory_document','期初、采购、调拨、处置计划实际创建的业务单据数；补货由库存过程反应式触发。')
dynamic('core.inventory_document_line','实际库存业务单据内的 SKU 行数之和；计划数量与库存事件分开保存。')
dynamic('core.inventory_movement','实际库存原子事务的来源事件腿数之和；包括预留/释放/出库/收货/调拨/待检/损坏/报废。')
for n in ['core.inventory_snapshot','core.inventory_valuation_snapshot']:
 dynamic(n,'对每个业务日的 active_assortment 或任一库存桶非零的地点×SKU 域输出一行；保留零库存经营组合和停售残余库存。全时期仅 final_restated 一套，历史知识时点按需重放缓存；每张表约 29412800 行仅为容量参考。')
 row[n]['capacity_reference_rows']=profile['inventory']['single_version_snapshot_reference_rows_per_table']
 row[n]['capacity_reference_is_hard_quota']=False
 row[n]['full_period_versions']=profile['inventory']['snapshots_knowledge_versions']
dynamic('core.revenue_entry','等于已交付单件正向收入分录数 + 已接受售后单件收入冲减数；源事件未发生不预生成收入。')
dynamic('core.cost_entry','等于已交付单件原批 COGS 分录数 + 可售回库单件原 COGS 冲回数；损坏/RTO 不产生虚假冲回。')
dynamic('core.order_fee','实际产生的佣金、物流、支付手续费及有原费用引用的冲回数；来源幂等；投放费用仅在 campaign_daily。')
dynamic('core.stock_allocation_attempt','每个整单 allocation_group 的实际候选地点×SKU 尝试数；包含不足和回滚证据，不按所有仓库全积。')
dynamic('core.web_session','自有渠道已提交及未提交订单会话数；按同源流量过程生成，平台与线下不造 session。')
dynamic('core.behavior_event','自有会话实际事件数之和；包括未转化/拒绝行为，不能按每个订单填一套固定轨迹。')
dynamic('core.campaign_daily','有效活动日×目标渠道×全部该租户区域×实际报告版本；无投放区域仍显式 0 报告，源缺报保持未知。')
dynamic('core.channel_product_daily','实际平台可见的日×渠道×SKU×区域报告域及其修订版本；订单指标按创建日 cohort 计算，不从聚合报告倒造用户触点。')
dynamic('core.store_traffic_daily','实际开业门店×报告日×源报告版本；暂停营业与采集缺失按源过程表达，不以 0 替代未知。')
dynamic('core.order_attribution','每个纳入已完成归因计算的订单×固定模型一行，credit=1；全量最终计算覆盖所有订单时与订单头 1:1；平台为 UNATTRIBUTABLE，不能增加虚假触点。')
dynamic('core.target_monthly','冻结预算域的月×渠道×区域×指标×批准版本；无明确品类预算分摊表时不生成品类目标。')
dynamic('ops.generation_run','实际阶段调用与恢复运行数；失败重试保留新运行记录，不改变业务实体身份。')
dynamic('ops.file_manifest','实际完整提交的配置、中间资产、事实分区和检查点文件数；物理文件数量随体积与冻结分区规划变化。')
dynamic('ops.source_watermark','租户×源×实际观察时点的水位版本数；按连续已到完整批次计算，不以最大事件时间替代完整性。')
dynamic('sec.principal','管理员批准的实际数据库登录身份数；不因 Agent 自报 persona 创建授权。')
dynamic('sec.principal_region','部分区域登录身份的明确授权集合大小；all_regions 身份不靠复制所有区域记录表示。')
dynamic('eval.scenario','冻结场景目录中的注入机制/数据故障/反事实情节数；版本变化由评测配置决定。')
dynamic('eval.question','冻结 validation/question_catalog.json 中的题目版本数；保留 business/knowledge/reference 三时钟与角色。')
dynamic('eval.expected_result','实际通过独立验证的 question×release 组合数；未运行的金标不造已计算结果。')
assert set(row)==set(owners)

# Partition expressions are export metadata, not new columns or PostgreSQL PARTITION BY clauses.
month={
'core.order_header':'order_date','core.order_line':'order_header.order_date (按 tenant_id/order_id 回连)','core.order_unit':'order_header.order_date (按 tenant_id/order_id 回连)',
'core.discount_allocation':'order_header.order_date (经 order_unit 回连原订单)','core.order_status_event':'event_at','core.order_unit_event':'event_at',
'core.payment':'attempted_at','core.refund':'attempted_at','core.refund_allocation':'refund.attempted_at (按 tenant_id/refund_id 回连)',
'core.inventory_lot':'received_at','core.shipment':'created_at','core.shipment_item':'shipped_at','core.shipment_event':'event_at',
'core.return_header':'requested_at','core.return_item':'return_header.requested_at (按 tenant_id/return_id 回连)','core.return_event':'event_at',
'core.inventory_document':'created_at','core.inventory_document_line':'inventory_document.created_at (按 tenant_id/inventory_doc_id 回连)',
'core.inventory_movement':'event_at','core.inventory_snapshot':'snapshot_date','core.inventory_valuation_snapshot':'snapshot_date',
'core.revenue_entry':'recognized_at','core.cost_entry':'recognized_at','core.order_fee':'recognized_at','core.web_session':'started_at','core.behavior_event':'event_at',
'core.campaign_daily':'report_date','core.channel_product_daily':'report_date','core.store_traffic_daily':'report_date','core.order_attribution':'order_header.order_date (按 tenant_id/order_id 回连)',
'core.target_monthly':'target_month','core.stock_allocation_attempt':'attempted_at'}

def partition_for(t):
 n=t['name']; s=n.split('.')[0]
 if s in ('ops','sec','eval'):
  return {'physical_baseline':'PostgreSQL 17 控制/权限/隐藏评测表','postgresql_partitioned':False,'parquet_keys':[], 'business_month_basis':None,'rule':'不为这些小控制表强制按月拆分；需要导出时按 release 或已冻结运行快照提交。'}
 if n in month:
  return {'physical_baseline':'不可变 Parquet；全量 PG 装载可选','postgresql_partitioned':False,'parquet_keys':['release_id','tenant_id','business_month'],'business_month_basis':month[n],'rule':'时间戳按 Asia/Shanghai 转本地月份，DATE 直接取月份；父表分区键通过租户复合键解析。固定分区边界与 worker 数无关，不按 SKU/site 再层层拆目录。'}
 return {'physical_baseline':'规范主数据/版本表；小表可单文件，PG 装载可选','postgresql_partitioned':False,'parquet_keys':['release_id']+(['tenant_id'] if 'tenant_id' in [c['name'] for c in t['columns']] else []),'business_month_basis':None,'rule':'小主表按 release 或 tenant 单文件；带有效期/可知时间的版本保留在行内，不每天复制，不从全时期删除历史版本。'}

scope_rules={
'TENANT':'本租户只读；地点/商品/组织等维度不按区域裁掉。',
'PUBLIC_DATE':'已认证登录可读共享日历；全局表无 tenant_id。',
'CUSTOMER_FULL':'仅 all_regions=true 且获授 contoso_customer_full_ro 的身份可直读客户/渠道身份三表；区域身份仅经 api.customer_profile_for_orders 取授权订单关联的粗粒度画像。',
'SALES_REGION':'本租户 + 原订单/销售归属 region；跨区域发货或退货接收不改销售权限。行为/日报/目标按其经营 region。',
'SITE_REGION':'本租户 + 实际地点/库存作业归属 region；不能借库存权限扩大为另一销售区域的订单权限。'}

patchgate_map={}
def pg(names,ids):
 for n in names.split():patchgate_map[n]=ids.split()
pg('ops.dataset_release ops.file_manifest','SOURCE-01 RNG-02 RECOVERY-01')
pg('ops.generation_run','SOURCE-01 RNG-01 RNG-02 RECOVERY-01')
pg('ops.ingestion_batch ops.source_watermark','VISIBLE-01 RECOVERY-01')
pg('core.tenant core.order_header','QUOTA-01 CONTEXT-01 OMS-01')
pg('core.geo_area core.org_unit core.site core.channel','CONTEXT-01')
pg('core.category core.spu core.sku core.channel_listing core.assortment','ASSORTMENT-01')
pg('core.price_period core.promotion core.discount_allocation','MONEY-01 MERGE-01')
pg('core.cost_period core.inventory_lot','FIFO-01')
pg('core.customer core.customer_identity core.customer_identity_link','IDENTITY-01')
pg('core.calendar','REUSE-01 QUOTA-01')
pg('core.campaign','CONTEXT-01 VISIBLE-01')
pg('core.order_line core.order_unit','MERGE-01 MONEY-01')
pg('core.order_status_event core.order_unit_event core.stock_allocation_attempt','OMS-01 ATOMIC-01 STOCK-01')
pg('core.payment core.shipment core.shipment_item','PREPAY-01 FIFO-01')
pg('core.inventory_movement','ATOMIC-01 FIFO-01 BUCKET-01 VISIBLE-01')
pg('core.inventory_document core.inventory_document_line','BUCKET-01 RECOVERY-01')
pg('core.inventory_snapshot core.inventory_valuation_snapshot','VISIBLE-01 FIFO-01 BUCKET-01')
pg('core.shipment_event core.return_header core.return_item core.return_event core.revenue_entry core.cost_entry','FIFO-01 BUCKET-01 VISIBLE-01')
pg('core.order_fee','FEE-01')
pg('core.web_session core.behavior_event core.channel_product_daily core.order_attribution','PLATFORM-01 CONTEXT-01')
pg('core.campaign_daily core.store_traffic_daily core.target_monthly','VISIBLE-01')
valid_patch_ids={a['id'] for a in patch['acceptance']}
assets=[]
for t in schema['tables']:
 n=t['name']; sec=copy.deepcopy(security.get(n,{'scope':'INTERNAL_ONLY','can_view_cost_required':False}))
 sec['rule']=scope_rules.get(sec['scope'],'业务登录及 Agent 不可读明细；管理员、流水线或独立评测器使用独立受控凭据。')
 if sec['can_view_cost_required']:sec['rule']+=' 另需 can_view_cost；无权限的指标金额应为 NULL，而非伪造 0。'
 sec['force_rls']=n.startswith('core.')
 sec['agent_direct_database_or_file_access']=False
 sec['enforcement_source']='sql/02_security.sql' if n.startswith(('core.','sec.')) else 'sql/02_security.sql 的 schema/table 撤权与白名单 API'
 if n=='ops.source_watermark':sec['rule']+=' 仅 api.source_status 白名单列可向本人租户公开，历史水位选择仍需 broker。'
 if n=='sec.principal':sec['rule']+=' api.access_context 仅返回当前 session_user 自身授权摘要。'
 hits=[g['gate_id'] for g in gates if n in re.findall(r'\b(?:core|ops|sec|eval)\.[a-z_]+\b',g['sql'])]
 ids=patchgate_map.get(n,[]);assert set(ids)<=valid_patch_ids
 assets.append({
  'asset_name':n,'asset_kind':'canonical_table','layer':layer(n),'schema':n.split('.')[0], 'business_domain':t['domain'],
  'owner':owners[n]['code'],'grain':t['grain'],'description':t.get('description',''),
  'primary_key':t['primary_key'],'column_count':len(t['columns']),
  'source':{'source_systems':owners[n]['source_systems'],'primary_stage_and_input':generation[n]['primary_stage_and_input'],'production_rule':generation[n]['production_rule'],
   'contract_source':'config/schema_contract.json','generation_source':'docs/generation_mapping.md',
   'foreign_key_dependencies':sorted({f['references'] for f in t.get('foreign_keys',[])})},
  'permission':sec,'partition':partition_for(t),'generation_phase':generation[n]['primary_stage_and_input'],
  'row_count_policy':row[n],
  'acceptance':{'schema_constraints':'sql/01_schema.sql + config/schema_contract.json','schema_pk':True,'schema_fk_count':len(t.get('foreign_keys',[])),
   'schema_unique_count':len(t.get('unique',[])),'schema_check_count':len(t.get('checks',[])),
   'sql_gate_source':'validation/acceptance.sql','sql_gate_index_source':'validation/assertions.json',
   'implemented_sql_gates_referencing_asset':hits,'generator_contract_source':'config/contoso_patch_contract.json#/acceptance','generator_acceptance_ids':ids,
   'scope_warning':'这些 gate ID 按实际验收 SQL 引用表匹配，表示该表参与检查，不表示该资产全部业务规则或百万数据已验收。没有专用 H/B gate 时仍须执行结构约束、生产规则及权限验收。'},
  'field_metadata_pointer':f"config/schema_contract.json#/tables/{schema['tables'].index(t)}"
 })

intermediate_meta={
'category_projection.csv':('PIM','每租户一个 Contoso 一级分类代理映射','COMPILE','core.category 一级节点及冻结曲线配置','fixed',category_n*0+len(profile['categories'])*len(profile['tenants']),'每租户一个一级分类一行。','SOURCE-01 REUSE-01 ASSORTMENT-01'),
'subcategory_projection.csv':('PIM','每租户一个 Contoso 二级分类代理映射','COMPILE','core.category 叶子节点、category_projection.csv','fixed',sum(len(c['subcategories']) for c in profile['categories'])*len(profile['tenants']),'每租户一个二级分类一行。','SOURCE-01 REUSE-01 ASSORTMENT-01'),
'product_projection.csv':('PIM','每租户一个可抽样 SKU 的 Contoso 商品投影','COMPILE','core.sku、core.spu、分类投影与冻结商品权重','fixed',sum(per('sku').values()),'冻结百万 profile 每个合法 SKU 一个投影；不输出权威成交成本或售价。','SOURCE-01 REUSE-01 ASSORTMENT-01 MONEY-01'),
'product_id_map.parquet':('PIM','每租户一个 Contoso 商品代理 ID 到统一 SKU 的映射','COMPILE','core.sku、product_projection.csv','fixed',sum(per('sku').values()),'与 product_projection 双向 1:1。','SOURCE-01 ASSORTMENT-01 MERGE-01'),
'calendar_weights.parquet':('DATA_PLATFORM','一个租户一个新建订单业务日的日期权重','WEIGHTS','固定 Contoso 权重内核、课程日期和输入投影','fixed',profile['time']['order_days']*len(profile['tenants']),'3 个租户×1096 个新单日期；无尾窗订单权重。','REUSE-01 QUOTA-01 RNG-01 RNG-02'),
'assortment_profiles.parquet':('PIM','一个 profile 的一个合法候选商品有效区间','COMPILE/CONTEXT','上市、channel_listing、assortment、渠道/区域/客群与规格配置','dynamic',None,'实际 profile×候选商品×有效区间数；不以实时库存删选候选。','ASSORTMENT-01 STOCK-01'),
'context_plan.parquet':('OMS','一个已经固定创建上下文的订单槽位','CONTEXT','calendar_weights、冻结租户配额、身份/绑定、渠道/地区及场景配置','fixed',sum(per('orders').values()),'与逐租户订单头目标一一对应；101/102/103 为 900000/50000/50000。','QUOTA-01 CONTEXT-01 IDENTITY-01 STOCK-01'),
'order_proposals.parquet':('OMS','一个 context 槽位的原始购物篮候选头','PROPOSAL','context_plan、assortment_profiles、商品投影和 Contoso 抽样内核','fixed',sum(per('orders').values()),'与 context_plan 逐槽位 1:1，不能按成功支付/库存过滤。','QUOTA-01 CONTEXT-01 REUSE-01 MONEY-01'),
'order_proposal_lines.parquet':('OMS','一个原始候选头内的一条未合并商品行','PROPOSAL','order_proposals、条件可售集合与命名行数/商品/数量抽样','dynamic',None,'等于候选头 line_count 之和；保留重复 SKU 原始行。','REUSE-01 ASSORTMENT-01 MERGE-01 RNG-02'),
'source_to_order_line.parquet':('DATA_PLATFORM','一条原始候选行到规范订单行及单件区间的映射','SIMULATE/canonicalize','order_proposal_lines、规范 order_line/order_unit 和整数分定价上下文','dynamic',None,'与原始候选行 1:1；多个原始行可以映到同一规范行，不等于规范订单行数。','MERGE-01 MONEY-01 SOURCE-01')
}
intermediates=[]
for i,a in enumerate(patch['assets']):
 n=a['asset_name'];owner,grain,phase,source,kind,count,rule,ids=intermediate_meta[n]
 item=copy.deepcopy(a) # All patch keys and field contracts are reused unchanged.
 item.update({'asset_kind':'intermediate_file','layer':'STAGING_INTERNAL','owner':owner,'grain':grain,
  'contract_source':f'config/contoso_patch_contract.json#/assets/{i}',
  'source':source,'generation_phase':phase,
  'permission':{'scope':'INTERNAL_ONLY','agent_direct_database_or_file_access':False,'rule':'仅受控构建、生成、验收和血缘审计可读；路径、候选、隐藏上下文及 RNG 不向业务 Agent 暴露。'},
  'partition':{'keys':['release_id','tenant_id']+(['business_month_or_frozen_slot_range'] if phase in ('CONTEXT','PROPOSAL','SIMULATE/canonicalize') else []),
   'rule':'复用 patch wire_format.partition_rule；日期或槽位分区边界须冻结、与 worker 数无关。小投影/权重按租户单文件；文件内按原 primary_key 排序。'},
  'row_count_policy':{'kind':kind,'exact_rows':count,'rule':rule},
  'acceptance':{'inline_assertion_source':f'config/contoso_patch_contract.json#/assets/{i}/assertions','generator_acceptance_ids':ids.split(),'implemented_database_table':False}})
 intermediates.append(item)

source_paths=['config/schema_contract.json','config/contoso_patch_contract.json','config/profile_1m.yaml','docs/generation_mapping.md','sql/01_schema.sql','sql/02_security.sql','validation/assertions.json','validation/acceptance.sql']
result={
 'catalog_name':'Contoso 中国运动户外百万订单数据资产目录','catalog_version':'1.0.0','schema_version':schema['schema_version'],
 'status':'DESIGN_AND_CONTRACT_CATALOG_NOT_GENERATED_DATA',
 'canonical_table_count':len(assets),'intermediate_asset_count':len(intermediates),
 'source_fingerprints':[{'path':p,'sha256':hashlib.sha256((root/p).read_bytes()).hexdigest()} for p in source_paths],
 'interpretation':{
  'grain_and_primary_keys':'规范表 grain/PK 直接来自当前 schema_contract；不重写 schema。部分日报/目标 grain 文案简写，物理版本维以完整 PK 为准。',
  'owners':'owner 为本合成企业的责任系统设计；source_systems 为接入来源，构建实现仍属待开发。Contoso 只生产权重/候选，不提供真实企业订单/成本/库存。',
  'layers':'CORE_* 为 core schema 内的逻辑分类；OPS_CONTROL/SEC_ACCESS/EVAL_HIDDEN 对应既有 schema；STAGING_INTERNAL 仅文件，不新增 10 张数据库表。',
  'partition':'分区字段是 Parquet 导出元数据。business_month 和 release_id 可能通过 manifest/父事实取得，不新增到原表字段。01_schema.sql 当前不采用 PostgreSQL 原生分区。',
  'counts':'fixed 是冻结 profile 预期配额，不是已生成行数；dynamic 不填写精确值，实际记录数以完成 manifest 为准。库存约 29412800 是每张快照表的容量参考，两张分别计入。',
  'authorization':'63 表目录与中间资产目录均属设计/管理员资料。Agent 不持数据库凭据、原始路径或文件；业务通过可信工具 API。PG RLS 已有可执行契约；DuckDB 文件层须由可信 broker 另行实施等价 tenant/region/cost/column 过滤，不能声称自动继承 PG RLS。',
  'asof':'RLS 与 AsOf 独立。历史 broker 须固定 business/knowledge/reference 并截断所有依赖，仅提供授权可见 schema；当前参数化指标函数不是完整 AsOf broker。全时期 final_restated 库存不能通过简单过滤 available_at 冒充历史知识库存。',
  'acceptance':'结构约束、已编写 H/B SQL、patch 中待实现生成器验收分别列出；SQL 引用到某表不等于该表所有业务语义已检查。本文不声明百万数据已生产。'},
 'fixed_profile_reference':{'release_id':profile['release_id'],'tenant_order_quotas':per('orders'),'time':profile['time'],'money':profile['money'],
  'tenants':profile['tenants'],'snapshot_domain':profile['inventory']['snapshot_domain'],'snapshot_versions':profile['inventory']['snapshots_knowledge_versions']},
 'canonical_assets':assets,'intermediate_assets':intermediates,
 'sql_acceptance_gate_index':[{'gate_id':g['gate_id'],'title':g['title'],'expected_violations':g['expected_violations']} for g in gates],
 'generator_acceptance_index':copy.deepcopy(patch['acceptance'])
}
(root/'config/asset_catalog.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')

# Human-readable catalog: every canonical asset carries all requested metadata.
def qkey(v):return ', '.join('`'+x+'`' for x in v)
def rowtext(r):
 s=('固定 '+format(r['exact_rows'],',')+' 行目标。 ' if r['kind']=='fixed' else '动态；不设精确行数。 ')+r['rule']
 if r.get('exact_rows_by_tenant'):s+=' 租户配额：'+', '.join(f'{k}={v:,}' for k,v in r['exact_rows_by_tenant'].items())+'。'
 return s
def cell(s):return str(s).replace('|','／').replace('\n',' ')
md=['# 百万订单数据资产目录','',
'本目录从最终 `schema_contract.json` 生成 **63 张规范表**的 grain、主键及引用关系，并直接复用 `contoso_patch_contract.json` 的 **10 份中间资产**原字段契约。目录是实现依据；百万级事实尚待生成，固定配额和容量参考均不代表已有数据。',
'', '## 1. 使用边界','']
for k in ['owners','layers','partition','counts','authorization','asof','acceptance']:md.append('- '+result['interpretation'][k])
md.extend(['','权威来源：`config/schema_contract.json`、`config/profile_1m.yaml`、`docs/generation_mapping.md`、`sql/01_schema.sql`、`sql/02_security.sql`、`validation/acceptance.sql` / `validation/assertions.json`。全部来源文件的 SHA-256 保存在 JSON 目录；字段级契约仍以 schema 为准。',
'', '## 2. 固定配额和存储规则','', '| 固定目标 | 当前百万 profile |','|---|---|'])
for name in ['core.tenant','core.order_header','core.brand','core.spu','core.sku','core.site','core.customer','core.customer_identity','core.channel','core.category','core.calendar']:
 md.append(f'| `{name}` | {row[name]["exact_rows"]:,} 行；'+cell(row[name]['rule'])+' |')
md.extend(['','主要事实分区为 `release_id / tenant_id / business_month`，时间戳先按北京时间取月份，源报告以 report_date、金融以 recognized_at、现金以 attempted_at 分区。缺日期子表按租户复合键回连明确父事实；分区元数据不冒充新的字段。小主表可单文件。目标文件 128—256 MiB、row group 约 10 万行是初始配置，不承诺实际压缩比或吞吐。',
'','库存数量与估值分别输出一套全时期 final_restated；域为有效 assortment 或任一库存桶非零的地点×SKU。两张快照表各约 29,412,800 行只是容量参考，不做全部 SKU×全部地点×全部日期的无条件笛卡尔积。',
'','## 3. 63 张规范表','',
'下列“SQL 检查”按实际断言文本引用匹配。它表示该表参与检查；没有专用 H/B 编号的主表仍受 PK/FK/UNIQUE/CHECK 与冻结配置约束。编号对应文末索引。源系统责任方不等同于表访问者。',''])
for i,a in enumerate(assets,1):
 md.extend([f'### {i:02d}. `{a["asset_name"]}`','', '| 项目 | 契约 |','|---|---|'])
 vals=[('层 / owner',f'{a["layer"]} / {a["owner"]}；业务域：{a["business_domain"]}'),('粒度',a['grain']),('主键',qkey(a['primary_key'])),
 ('来源','接入系统：'+(', '.join(a['source']['source_systems']) or '无业务源接入；内部控制/授权/评测')+'；'+a['source']['primary_stage_and_input']),
 ('引用链',qkey(a['source']['foreign_key_dependencies']) or '无外键；按本表主键和配置约束。'),
 ('产生阶段',a['generation_phase']+'；'+a['source']['production_rule']),
 ('权限',a['permission']['scope']+(' + COST' if a['permission']['can_view_cost_required'] else '')+'：'+a['permission']['rule']),
 ('分区',a['partition']['physical_baseline']+'；Parquet 键：'+(', '.join(a['partition']['parquet_keys']) or '无强制文件分区')+'；月份依据：'+(a['partition']['business_month_basis'] or '不强制按月')),
 ('行数策略',rowtext(a['row_count_policy'])),
 ('验收来源','`01_schema.sql` 结构约束；SQL 检查：'+(', '.join(a['acceptance']['implemented_sql_gates_referencing_asset']) or '当前无直接引用本表的 H/B gate')+'；patch 生成器验收：'+(', '.join(a['acceptance']['generator_acceptance_ids']) or '按上列产生规则及冻结配置验证')+'；权限按 `02_security.sql` / `docs/security_contract.md` 验证。')]
 for k,v in vals:md.append(f'| {k} | {cell(v)} |')
 md.append('')
md.extend(['## 4. 10 份中间资产','',
'JSON 目录保留 patch 资产原有的 format、producer、consumers、fields、primary_key、assertions，逐字段不改写；这里只增加目录元数据。它们是受控生成资产，由 `ops.file_manifest` 管理，不另建业务表，也不供 Agent 直接读取。',''])
for i,a in enumerate(intermediates,1):
 md.extend([f'### I{i:02d}. `{a["asset_name"]}`','', '| 项目 | 契约 |','|---|---|'])
 vals=[('层 / owner',a['layer']+' / '+a['owner']),('粒度',a['grain']),('主键',qkey(a['primary_key'])),('来源',a['source']),
 ('产生阶段',a['generation_phase']+'；producer='+a['producer']+'；consumers='+', '.join(a['consumers'])),
 ('权限',a['permission']['rule']),('分区',', '.join(a['partition']['keys'])+'；'+a['partition']['rule']),('行数策略',rowtext(a['row_count_policy'])),
 ('验收来源',a['contract_source']+'；'+', '.join(a['acceptance']['generator_acceptance_ids'])+'；'+ '；'.join(a['assertions'])),
 ('字段契约',f"JSON 目录保留 patch 原定义共 {len(a['fields'])} 个字段、类型和 nullable；不复用 Contoso 旧 Sales/Orders 作为财务真值。")]
 for k,v in vals:md.append(f'| {k} | {cell(v)} |')
 md.append('')
md.extend(['## 5. 已编写 SQL 验收编号','',
'以下名称直接来自 `validation/assertions.json`，对应同包 `validation/acceptance.sql`。H35 是费用冲回上限；H36 是费用来源。支付/退款 attempted_at 即时完成属于 v1 时间契约，不另占 H35。此索引只标识已编写断言，不声称全量数据已经运行通过。','',
'| ID | 断言名称 |','|---|---|'])
for g in gates:md.append('| '+g['gate_id']+' | '+cell(g['title'])+' |')
md.extend(['','## 6. 生成器合同验收编号','',
'这些项目来自补丁契约，需在实现、构建或生成数据后实际执行；与上述可执行 SQL 断言分开管理。','',
'| ID | 要求 |','|---|---|'])
for g in patch['acceptance']:md.append('| '+g['id']+' | '+cell(g['assertion'])+' |')
md.append('')
(root/'docs/asset_catalog.md').write_text('\n'.join(md))
print(json.dumps({'canonical_tables':len(assets),'intermediate_assets':len(intermediates),'columns':sum(a['column_count'] for a in assets),'foreign_keys':sum(a['acceptance']['schema_fk_count'] for a in assets),'gate_count':len(gates),'files':[{ 'path':str(root/p),'bytes':(root/p).stat().st_size} for p in ['config/asset_catalog.json','docs/asset_catalog.md']]},ensure_ascii=False))
