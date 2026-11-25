-- Analyses are scoped to tenant 101. Counts expose small denominators instead of hiding them.
-- name: winter_region_season
SELECT g.geo_name region,CASE WHEN extract(month FROM o.order_date) IN(11,12,1,2) THEN 'winter' ELSE 'other' END season,count(DISTINCT o.order_id) orders,sum(l.quantity) units,sum(l.net_cent)/100.0 amount_yuan FROM core.order_header o JOIN core.order_line l USING(tenant_id,order_id) JOIN core.sku k USING(tenant_id,sku_id) JOIN core.spu p USING(tenant_id,spu_id) JOIN core.geo_area g ON g.tenant_id=o.tenant_id AND g.geo_id=o.region_id WHERE o.tenant_id=101 AND p.spu_name LIKE '%秋羽%' GROUP BY 1,2 ORDER BY 1,2;
-- name: named_black_42_stockout
SELECT p.spu_name,k.color_code,k.size_value,s.site_name,count(*) attempts,count(*) FILTER(WHERE a.outcome='INSUFFICIENT') failures,min(a.available_before_qty) minimum_available FROM core.stock_allocation_attempt a JOIN core.sku k USING(tenant_id,sku_id) JOIN core.spu p USING(tenant_id,spu_id) JOIN core.site s USING(tenant_id,site_id) WHERE a.tenant_id=101 AND p.spu_code='101-P037' AND k.color_code='BLACK' AND k.size_value='42' GROUP BY 1,2,3,4 ORDER BY 1,4;
-- name: tent_sleeping_bag_baskets
WITH baskets AS(SELECT l.order_id,bool_or(p.attributes->>'family'='tent') tent,bool_or(p.attributes->>'family'='sleeping_bag') sleeping_bag FROM core.order_line l JOIN core.sku k USING(tenant_id,sku_id) JOIN core.spu p USING(tenant_id,spu_id) WHERE l.tenant_id=101 GROUP BY 1) SELECT count(*) all_orders,count(*) FILTER(WHERE tent) tent_orders,count(*) FILTER(WHERE tent AND sleeping_bag) paired_orders,count(*) FILTER(WHERE NOT tent AND sleeping_bag) bag_without_tent FROM baskets;
-- name: old_new_training_tops
SELECT p.spu_name,to_char(o.order_date,'YYYY-MM') AS month_key,count(DISTINCT o.order_id) orders,sum(l.quantity) units FROM core.order_line l JOIN core.order_header o USING(tenant_id,order_id) JOIN core.sku k USING(tenant_id,sku_id) JOIN core.spu p USING(tenant_id,spu_id) WHERE l.tenant_id=101 AND p.spu_code IN('101-P002','101-P035') GROUP BY 1,2 ORDER BY 2,1;
-- name: member_cohort_repeat
WITH spend AS(SELECT customer_id,count(*) orders FROM core.order_header WHERE tenant_id=101 AND customer_id IS NOT NULL AND order_date<'2026-01-01' GROUP BY 1) SELECT to_char(c.joined_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM') cohort,count(*) members,count(*) FILTER(WHERE s.orders>0) purchasing_members,count(*) FILTER(WHERE s.orders>=2) repeat_members FROM core.customer c LEFT JOIN spend s USING(customer_id) WHERE c.tenant_id=101 AND c.joined_at<'2025-10-01T00:00:00+08' GROUP BY 1 ORDER BY 1;
-- name: shipping_weight_lane
WITH weights AS(SELECT si.tenant_id,si.shipment_id,sum(k.weight_grams) grams FROM core.shipment_item si JOIN core.sku k USING(tenant_id,sku_id) GROUP BY 1,2) SELECT CASE WHEN w.grams>=5000 THEN 'heavy' ELSE 'light' END weight_band,CASE WHEN s.region_id=site.region_id THEN 'same_region' ELSE 'cross_region' END lane,count(*) shipments,round(avg(w.grams)) average_grams,round(avg(f.amount_cent)/100,2) fee_yuan FROM core.shipment s JOIN weights w USING(tenant_id,shipment_id) JOIN core.site site ON site.tenant_id=s.tenant_id AND site.site_id=s.from_site_id JOIN core.order_fee f ON f.tenant_id=s.tenant_id AND f.source_event_id=s.shipment_id AND f.fee_type='OUTBOUND_LOGISTICS' WHERE s.tenant_id=101 GROUP BY 1,2 ORDER BY 1,2;
-- name: return_reasons_maturity
SELECT p.attributes->>'product_type' product_type,r.reason_code,count(*) return_units,count(*) FILTER(WHERE o.order_date<='2025-11-30') mature_order_units FROM core.return_item r JOIN core.order_unit u USING(tenant_id,order_unit_id) JOIN core.order_header o ON o.tenant_id=r.tenant_id AND o.order_id=r.order_id JOIN core.sku k ON k.tenant_id=u.tenant_id AND k.sku_id=u.sku_id JOIN core.spu p ON p.tenant_id=k.tenant_id AND p.spu_id=k.spu_id WHERE r.tenant_id=101 GROUP BY 1,2 ORDER BY 3 DESC LIMIT 35;
-- name: june_channel_contribution
WITH ledger AS (
 SELECT tenant_id,order_unit_id,amount_cent revenue,0::bigint cost FROM core.revenue_entry
 WHERE recognized_at>='2025-06-01T00:00:00+08' AND recognized_at<'2025-07-01T00:00:00+08'
 UNION ALL
 SELECT tenant_id,order_unit_id,0::bigint,amount_cent FROM core.cost_entry
 WHERE recognized_at>='2025-06-01T00:00:00+08' AND recognized_at<'2025-07-01T00:00:00+08')
SELECT ch.channel_name,count(DISTINCT l.order_unit_id) recognized_units,
 sum(l.revenue)/100.0 revenue_yuan,sum(l.cost)/100.0 cost_yuan,
 sum(l.revenue-l.cost)/100.0 gross_profit_yuan
 FROM ledger l JOIN core.order_unit u USING(tenant_id,order_unit_id)
 JOIN core.order_header o USING(tenant_id,order_id) JOIN core.channel ch USING(tenant_id,channel_id)
 WHERE l.tenant_id=101 GROUP BY 1 ORDER BY 1;
-- name: store_opening_comparison
SELECT s.site_name,s.opened_on,to_char(o.order_date,'YYYY') AS year_key,count(*) orders,sum(o.payable_cent)/100.0 payable_yuan FROM core.order_header o JOIN core.site s ON s.tenant_id=o.tenant_id AND s.site_id=o.selling_site_id WHERE o.tenant_id=101 GROUP BY 1,2,3 ORDER BY 1,3;
-- name: late_report_revisions
SELECT report_version,count(*) cells,sum(submitted_orders) submitted,sum(paid_amount_cent)/100.0 paid_yuan FROM core.channel_product_daily WHERE tenant_id=101 AND report_date='2025-09-28' GROUP BY 1 ORDER BY 1;
-- name: declared_interest_purchase
SELECT count(*) identified_lines,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM core.spu_sport ps JOIN core.sport sport USING(tenant_id,sport_id) WHERE ps.tenant_id=p.tenant_id AND ps.spu_id=p.spu_id AND c.attributes->'declared_sports' ? sport.sport_name)) matching_interest_lines FROM core.order_line l JOIN core.order_header o USING(tenant_id,order_id) JOIN core.customer c USING(tenant_id,customer_id) JOIN core.sku k USING(tenant_id,sku_id) JOIN core.spu p USING(tenant_id,spu_id) WHERE o.tenant_id=101 AND NOT(o.ordered_at>='2025-11-10T10:00:00+08' AND o.ordered_at<'2025-11-10T11:30:00+08');
-- name: variant_demand
SELECT k.size_system,k.size_value,count(*) order_lines FROM core.order_line l JOIN core.sku k USING(tenant_id,sku_id) JOIN core.order_header o USING(tenant_id,order_id) WHERE l.tenant_id=101 AND k.size_system IN('EU','ALPHA') AND NOT(o.ordered_at>='2025-11-10T10:00:00+08' AND o.ordered_at<'2025-11-10T11:30:00+08') GROUP BY 1,2 ORDER BY 1,2;
-- name: campaign_channel_funnel
WITH ads AS (SELECT tenant_id,campaign_id,sum(impressions) impressions,sum(clicks) clicks,sum(spend_cent) spend FROM core.campaign_daily GROUP BY 1,2), touches AS (SELECT tenant_id,campaign_id,count(*) sessions FROM core.web_session WHERE campaign_id IS NOT NULL GROUP BY 1,2)
SELECT c.acquisition_source,ch.channel_name,count(*) campaigns,sum(a.impressions) impressions,sum(a.clicks) clicks,sum(a.spend)/100.0 spend_yuan,sum(coalesce(t.sessions,0)) owned_sessions FROM core.campaign c JOIN core.channel ch ON ch.tenant_id=c.tenant_id AND ch.channel_id=c.target_channel_id LEFT JOIN ads a ON a.tenant_id=c.tenant_id AND a.campaign_id=c.campaign_id LEFT JOIN touches t ON t.tenant_id=c.tenant_id AND t.campaign_id=c.campaign_id WHERE c.tenant_id=101 GROUP BY 1,2 ORDER BY 1,2;
-- name: customer_id_residue_diagnostic
SELECT customer_id%10 id_residue,count(*) members,count(DISTINCT home_geo_id) home_cities,count(DISTINCT attributes->'declared_sports') interest_profiles,count(DISTINCT age_band) age_bands FROM core.customer WHERE tenant_id=101 GROUP BY 1 ORDER BY 1;
