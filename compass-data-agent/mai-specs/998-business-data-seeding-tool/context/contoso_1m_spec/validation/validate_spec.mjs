/** Specification validation only. Does not build the production million-order dataset.
 * Usage: PGLITE_MODULE=/path/to/@electric-sql/pglite node validation/validate_spec.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const db=new PGlite();
const checks=[];
process.on('uncaughtException',e=>{console.error(JSON.stringify({error:e.message,code:e.code,detail:e.detail,where:e.where,last_check:checks.at(-1)}));process.exit(1);});
function record(name,ok,detail={}) {checks.push({name,passed:ok,...detail});if(!ok)throw new Error(name+': '+JSON.stringify(detail));}
async function insert(table,row){const keys=Object.keys(row);return db.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(k=>row[k]));}
async function rejects(name,sql,values,code){try{await db.query(sql,values);record(name,false,{reason:'invalid action was accepted'});}catch(e){record(name,e.code===code,{expected_code:code,observed_code:e.code});}}
const ddl=fs.readFileSync(path.join(root,'sql/01_schema.sql'),'utf8');
await db.exec(ddl);
const model=JSON.parse(fs.readFileSync(path.join(root,'config/schema_contract.json'),'utf8'));
const tables=await db.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema IN ('core','ops','sec','eval') AND table_type='BASE TABLE'");
record('canonical_ddl_executes',tables.rows[0].n===model.tables.length,{tables:tables.rows[0].n});
const assertions=JSON.parse(fs.readFileSync(path.join(root,'validation/assertions.json'),'utf8'));
for(const a of assertions){const result=await db.query(a.sql);record('sql_compiles_'+a.gate_id,result.rows.length===1,{empty_schema_violations:Number(result.rows[0].violations)});}

const t0='2022-12-01T00:00:00Z', t1='2023-01-01T04:00:00Z';
await insert('ops.dataset_release',{release_id:'spec-fixture',schema_version:'1.0.0',generator_commit:'SPEC_NOT_GENERATED',contoso_commit:'eaeb57a9eaa6ad0cdab4fb527552102685434ee0',config_sha256:'0'.repeat(64),catalog_sha256:'0'.repeat(64),master_seed:20261019,order_start:'2023-01-01',order_end_exclusive:'2026-01-01',simulation_end_exclusive:'2026-04-01',published_as_of:'2026-03-31T16:00:00Z',status:'BUILDING',created_at:t0});
for(const tid of [101,102]){
 await insert('core.tenant',{tenant_id:tid,tenant_code:'T'+tid,tenant_name:'Spec Tenant '+tid,timezone:'Asia/Shanghai',currency:'CNY',order_quota:tid===101?900000:50000,release_id:'spec-fixture'});
 await insert('ops.ingestion_batch',{tenant_id:tid,batch_id:1,source_system:'PIM',source_from:'2022-01-01T00:00:00Z',source_to:'2026-04-01T00:00:00Z',received_at:t0,status:'READY',row_count:0});
 for(const rid of [1,2])await insert('core.geo_area',{tenant_id:tid,geo_id:rid,parent_geo_id:null,geo_level:'REGION',geo_code:'R'+rid,geo_name:'Region '+rid,region_id:rid});
 await insert('core.geo_area',{tenant_id:tid,geo_id:11,parent_geo_id:1,geo_level:'CITY',geo_code:'C11',geo_name:'City',region_id:1});
 await insert('core.org_unit',{tenant_id:tid,org_unit_id:1,parent_org_unit_id:null,org_code:'GROUP',org_name:'Group',org_type:'GROUP'});
 await insert('core.channel',{tenant_id:tid,channel_id:1,channel_code:'APP',channel_name:'App',channel_type:'OWNED',has_user_events:true,identity_scope:'MIXED'});
 await insert('core.brand',{tenant_id:tid,brand_id:1,brand_code:'BRAND',brand_name:'Synthetic brand',positioning:'MASS'});
 await insert('core.category',{tenant_id:tid,category_id:1,parent_category_id:null,category_code:'RUN',category_name:'Running',level_no:2,is_leaf:true});
 await insert('core.spu',{tenant_id:tid,spu_id:1,brand_id:1,category_id:1,spu_code:'P1',spu_name:'Shoe',audience:'UNISEX',season_code:'ALL',launch_on:'2022-01-01',discontinue_on:null,attributes:{}});
 for(const sid of [1,2])await insert('core.sku',{tenant_id:tid,sku_id:sid,spu_id:1,sku_code:'SKU'+sid,color_code:'BLACK',size_system:'CN_SHOE',size_value:String(40+sid),spec_key:'BLACK_'+sid,weight_grams:500,launch_on:'2022-01-01',discontinue_on:null});
 await insert('core.customer_identity',{tenant_id:tid,identity_id:1,channel_id:1,external_user_token:'ANON1',first_seen_at:t0,available_at:t0,load_batch_id:1});
 await insert('core.price_period',{tenant_id:tid,price_id:1,sku_id:1,channel_id:1,valid_from:t0,valid_to:'2026-04-01T00:00:00Z',list_price_cent:1000,available_at:t0,load_batch_id:1});
 await insert('core.cost_period',{tenant_id:tid,cost_id:1,sku_id:1,valid_from:t0,valid_to:'2026-04-01T00:00:00Z',unit_cost_cent:600,available_at:t0,load_batch_id:1});
 for(const oid of tid===101?[1,2]:[1])await insert('core.order_header',{tenant_id:tid,order_id:oid,order_no:'O'+oid,contoso_proposal_id:'P'+oid,channel_id:1,org_unit_id:1,region_id:oid,demand_geo_id:11,selling_site_id:null,identity_id:1,customer_id:null,ordered_at:t1,order_date:'2023-01-01',currency:'CNY',gross_cent:1000,discount_cent:0,payable_cent:1000,payment_deadline:'2023-01-01T04:30:00Z',available_at:t1,load_batch_id:1});
}
await insert('core.brand',{tenant_id:101,brand_id:7,brand_code:'ONLY101',brand_name:'Only 101',positioning:'MASS'});
await rejects('cross_tenant_fk_rejected',"INSERT INTO core.spu(tenant_id,spu_id,brand_id,category_id,spu_code,spu_name,audience,season_code,launch_on) VALUES(102,7,7,1,'BAD','BAD','UNISEX','ALL','2022-01-01')",[], '23503');
await rejects('wrong_sku_price_fk_rejected',"INSERT INTO core.order_line(tenant_id,order_line_id,order_id,region_id,channel_id,line_no,sku_id,listing_id,price_id,quantity,list_unit_cent,gross_cent,discount_cent,net_cent,available_at,load_batch_id) VALUES(101,9,1,1,1,1,2,NULL,1,1,1000,1000,0,1000,$1,1)",[t1],'23503');
await rejects('broken_money_check_rejected',"INSERT INTO core.order_line(tenant_id,order_line_id,order_id,region_id,channel_id,line_no,sku_id,price_id,quantity,list_unit_cent,gross_cent,discount_cent,net_cent,available_at,load_batch_id) VALUES(101,9,1,1,1,1,1,1,1,1000,1000,100,999,$1,1)",[t1],'23514');
await rejects('negative_inventory_snapshot_rejected',"INSERT INTO core.inventory_snapshot(tenant_id,snapshot_date,site_id,region_id,sku_id,sellable_qty,quarantine_qty,damaged_qty,reserved_qty,in_transit_qty,available_qty,as_of,available_at,load_batch_id) VALUES(101,'2023-01-01',1,1,1,1,0,0,2,0,-1,$1,$1,1)",[t1],'23514');

const secPath=path.join(root,'sql/02_security.sql');
if(fs.existsSync(secPath)){
 await db.exec(fs.readFileSync(secPath,'utf8'));
 record('security_ddl_executes',true);
 const metricsPath=path.join(root,'sql/03_metrics.sql');
 if(fs.existsSync(metricsPath)){
  await db.exec(fs.readFileSync(metricsPath,'utf8'));record('metric_functions_deploy',true);
  const audit={available_at:t1,load_batch_id:1};
  await insert('core.site',{tenant_id:101,site_id:10,site_code:'EAST_DC',site_name:'East DC',site_type:'WAREHOUSE',org_unit_id:1,geo_id:11,region_id:1,opened_on:'2022-01-01',closed_on:null,area_sqm:1000});
  await insert('core.inventory_lot',{tenant_id:101,lot_id:1,site_id:10,region_id:1,sku_id:1,parent_lot_id:null,cost_id:1,received_at:t0,unit_cost_cent:600,origin_type:'OPENING',available_at:t0,load_batch_id:1});
  await insert('core.order_line',{tenant_id:101,order_line_id:1,order_id:1,region_id:1,channel_id:1,line_no:1,sku_id:1,listing_id:null,price_id:1,quantity:1,list_unit_cent:1000,gross_cent:1000,discount_cent:0,net_cent:1000,...audit});
  await insert('core.order_unit',{tenant_id:101,order_unit_id:1,order_line_id:1,order_id:1,region_id:1,sku_id:1,unit_no:1,gross_cent:1000,discount_cent:0,net_cent:1000,...audit});
  for(const [pid,amount,time] of [[1,600,'2023-01-01T04:01:00Z'],[2,400,'2023-01-01T04:02:00Z']])await insert('core.payment',{tenant_id:101,payment_id:pid,order_id:1,region_id:1,payment_no:'PAY'+pid,method:'WECHAT',status:'SUCCEEDED',amount_cent:amount,attempted_at:time,available_at:time,load_batch_id:1});
  await insert('core.shipment',{tenant_id:101,shipment_id:1,order_id:1,region_id:1,from_site_id:10,shipment_no:'SHIP1',fulfillment_type:'DELIVERY',created_at:'2023-01-01T04:02:00Z',promised_at:'2023-01-01T04:04:00Z',available_at:'2023-01-01T04:02:00Z',load_batch_id:1});
  await insert('core.shipment_item',{tenant_id:101,shipment_item_id:1,shipment_id:1,order_unit_id:1,order_id:1,region_id:1,sku_id:1,from_site_id:10,lot_id:1,shipped_at:'2023-01-01T04:03:00Z',available_at:'2023-01-01T04:03:00Z',load_batch_id:1});
  for(const [eid,kind,time] of [[1,'SHIPPED','2023-01-01T04:03:00Z'],[2,'DELIVERED','2023-01-01T04:04:00Z']])await insert('core.shipment_event',{tenant_id:101,shipment_event_id:eid,shipment_id:1,order_id:1,region_id:1,from_site_id:10,event_seq:eid,event_type:kind,event_at:time,available_at:time,load_batch_id:1});
  await insert('core.revenue_entry',{tenant_id:101,revenue_entry_id:1,order_unit_id:1,region_id:1,entry_type:'DELIVERY',shipment_event_id:2,return_event_id:null,quantity_delta:1,amount_cent:1000,recognized_at:'2023-01-01T04:04:00Z',available_at:'2023-01-01T04:04:00Z',load_batch_id:1});
  await insert('core.cost_entry',{tenant_id:101,cost_entry_id:1,order_unit_id:1,region_id:1,entry_type:'DELIVERY',lot_id:1,shipment_event_id:2,return_event_id:null,amount_cent:600,recognized_at:'2023-01-01T04:04:00Z',available_at:'2023-01-01T04:04:00Z',load_batch_id:1});
  await insert('core.order_fee',{tenant_id:101,fee_id:1,order_id:1,region_id:1,order_unit_id:null,fee_type:'PAYMENT_SERVICE',amount_cent:10,recognized_at:'2023-01-01T04:01:00Z',source_system:'PAY',source_fee_no:'FEE1',reversal_of_fee_id:null,source_event_kind:'PAYMENT',source_event_id:1,available_at:'2023-01-01T04:01:00Z',load_batch_id:1});
  await insert('core.order_status_event',{tenant_id:101,status_event_id:1,order_id:1,region_id:1,event_seq:1,status:'CREATED',reason_code:'NONE',event_at:t1,available_at:'2023-01-01T04:00:01Z',load_batch_id:1});
  await insert('core.campaign',{tenant_id:101,campaign_id:1,campaign_code:'TEST',campaign_name:'Test',acquisition_source:'SEARCH',target_channel_id:1,starts_at:'2022-12-31T16:00:00Z',ends_at:'2023-01-01T16:00:00Z',objective:'ACQUISITION',available_at:t0,load_batch_id:1});
  for(const [version,spend,avail] of [[1,100,'2023-01-02T00:00:00Z'],[2,150,'2023-01-03T00:00:00Z']])await insert('core.campaign_daily',{tenant_id:101,report_date:'2023-01-01',campaign_id:1,channel_id:1,region_id:1,impressions:1000,clicks:100,spend_cent:spend,report_version:version,source_updated_at:avail,available_at:avail,load_batch_id:1});
 }
 const roles=[['spec_t101',101,'EXEC',true,true],['spec_t102',102,'EXEC',true,true],['spec_east',101,'REGION',false,false],['spec_marketing',101,'MARKETING',true,false]];
 for(const [role,tid,persona,allRegions,cost] of roles){
   await db.exec(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT contoso_business_ro TO ${role};`);
   await insert('sec.principal',{db_role:role,tenant_id:tid,persona,all_regions:allRegions,can_view_cost:cost});
 }
 await insert('sec.principal_region',{db_role:'spec_east',tenant_id:101,region_id:1});
 await db.exec('CREATE ROLE spec_unmapped LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT contoso_business_ro TO spec_unmapped;');
 // PGlite reuses one embedded session. Restore the original fixture administrator
 // explicitly; production brokers must use distinct authenticated connections.
 async function asRole(role,fn){await db.exec(`SET SESSION AUTHORIZATION ${role}`);try{await fn();}finally{await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE;');}}
 await asRole('spec_t101',async()=>{
   let r=await db.query('SELECT DISTINCT tenant_id FROM core.order_header');record('tenant_101_isolation',r.rows.length===1&&r.rows[0].tenant_id===101);
   await db.exec("SET app.tenant_id='102'");r=await db.query('SELECT DISTINCT tenant_id FROM core.order_header');record('tenant_guc_cannot_override_identity',r.rows.length===1&&r.rows[0].tenant_id===101);
   await db.exec('SET ROLE contoso_business_ro');r=await db.query('SELECT DISTINCT tenant_id FROM core.order_header');record('set_role_keeps_authenticated_subject',r.rows.length===1&&r.rows[0].tenant_id===101);await db.exec('RESET ROLE');
   r=await db.query('SELECT count(*)::int n FROM core.cost_period');record('authorized_cost_visible',r.rows[0].n===1);
   await rejects('eval_direct_read_denied','SELECT * FROM eval.question',[],'42501');
   await rejects('permission_map_read_denied','SELECT * FROM sec.principal',[],'42501');
   await rejects('business_update_denied',"UPDATE core.order_header SET order_no='HACK'",[],'42501');
   await rejects('assume_another_tenant_login_denied','SET ROLE spec_t102',[],'42501');
   await rejects('assume_security_owner_denied','SET ROLE contoso_security_owner',[],'42501');
   if(fs.existsSync(metricsPath)){
    const args=['2022-12-31T16:00:00Z','2023-01-01T16:00:00Z'];
    let m=await db.query('SELECT * FROM mart.sales_daily($1,$2,$3) WHERE region_id=1',[...args,'2023-01-01T17:00:00Z']);
    record('missing_ads_produces_null_contribution',m.rows.length===1&&m.rows[0].contribution_cent===null&&m.rows[0].ads_complete===false&&Number(m.rows[0].gross_profit_cent)===400);
    m=await db.query('SELECT * FROM mart.sales_daily($1,$2,$3) WHERE region_id=1',[...args,'2023-01-02T12:00:00Z']);
    record('metric_aggregates_independent_facts',Number(m.rows[0].net_sales_cent)===1000&&Number(m.rows[0].cogs_cent)===600&&Number(m.rows[0].ad_spend_cent)===100&&Number(m.rows[0].contribution_cent)===290);
    m=await db.query('SELECT * FROM mart.sales_daily($1,$2,$3) WHERE region_id=1',[...args,'2023-01-04T00:00:00Z']);
    record('ad_version_is_selected_after_knowledge_filter',Number(m.rows[0].ad_spend_cent)===150&&Number(m.rows[0].contribution_cent)===240);
    m=await db.query('SELECT * FROM mart.cash_daily($1,$2,$3)',[...args,'2023-01-02T12:00:00Z']);
    record('split_payments_sum_without_fanout',m.rows.length===1&&Number(m.rows[0].paid_cash_cent)===1000&&Number(m.rows[0].successful_payment_attempts)===2);
    await rejects('daily_metric_rejects_partial_day','SELECT * FROM mart.sales_daily($1,$2,$3)',['2023-01-01T00:01:00Z',args[1],'2023-01-04T00:00:00Z'],'22023');
    const states=await db.query('SELECT * FROM mart.order_state_at($1,$2)',['2023-01-01T04:00:00.500Z','2023-01-01T04:00:00.500Z']);
    record('late_state_event_does_not_leak_into_history',states.rows.length===2&&states.rows.every(s=>s.state_code==='UNKNOWN'&&s.state_event_id===null));
   }
 });
 await asRole('spec_t102',async()=>{const r=await db.query('SELECT DISTINCT tenant_id FROM core.order_header');record('tenant_102_isolation',r.rows.length===1&&r.rows[0].tenant_id===102);});
 await asRole('spec_east',async()=>{
   let r=await db.query('SELECT order_id,region_id FROM core.order_header');record('region_scope_filters_same_tenant',r.rows.length===1&&Number(r.rows[0].region_id)===1);
   r=await db.query('SELECT count(*)::int n FROM core.cost_period');record('region_cost_denied_by_policy',r.rows[0].n===0);
   await rejects('regional_customer_source_denied','SELECT * FROM core.customer_identity',[],'42501');
   await db.query('SELECT * FROM api.customer_profile_for_orders');record('regional_customer_profile_view_accessible',true);
 });
 await asRole('spec_marketing',async()=>{const r=await db.query('SELECT count(*)::int n FROM core.cost_period');record('marketing_cost_denied_by_policy',r.rows[0].n===0);
   if(fs.existsSync(metricsPath)){const m=await db.query('SELECT * FROM mart.sales_daily($1,$2,$3) WHERE region_id=1',['2022-12-31T16:00:00Z','2023-01-01T16:00:00Z','2023-01-04T00:00:00Z']);record('hidden_cost_never_becomes_zero_margin',m.rows.length===1&&m.rows[0].cogs_cent===null&&m.rows[0].gross_profit_cent===null&&m.rows[0].contribution_cent===null&&m.rows[0].cost_visible===false);}
 });
 await asRole('spec_unmapped',async()=>{const r=await db.query('SELECT count(*)::int n FROM core.order_header');record('unmapped_login_default_deny',r.rows[0].n===0);});
 await db.exec(fs.readFileSync(secPath,'utf8'));record('security_deployment_idempotent',true);
}
const version=await db.query('SELECT version() AS version');
const report={scope:'Specification DDL, SQL compilation, and adversarial constraint checks. No million-row production run.',engine:version.rows[0].version,tables:model.tables.length,columns:model.tables.reduce((n,t)=>n+t.columns.length,0),checks,passed:checks.every(c=>c.passed)};
fs.writeFileSync(path.join(root,'validation/spec_validation_report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,tables:report.tables,columns:report.columns,checks:checks.length,engine:report.engine}));
await db.close();
