-- Use a restricted connection. Set explicit windows; money is in CNY cents.
-- S01/S02: delivered net revenue, with sale attribution; no mixing payment cash.
SELECT o.channel_id,o.region_id,sum(r.amount_cent) AS net_revenue_cent
FROM core.revenue_entry r JOIN core.order_unit u USING(tenant_id,order_unit_id)
JOIN core.order_header o USING(tenant_id,order_id)
WHERE r.recognized_at >= '2025-09-01T00:00:00+08'
  AND r.recognized_at < '2025-10-01T00:00:00+08'
  AND r.available_at <= '2026-04-01T00:00:00+08'
GROUP BY o.channel_id,o.region_id ORDER BY 1,2;

-- S08: intention to treat. Keep unconverted members; count distinct randomized units.
WITH results AS (
 SELECT a.tenant_id,a.experiment_id,a.unit_id,a.variant,
 EXISTS (SELECT 1 FROM core.order_header o JOIN core.payment p USING(tenant_id,order_id)
   WHERE o.tenant_id=a.tenant_id AND o.customer_id=a.unit_id AND o.channel_id=a.channel_id
   AND o.ordered_at>=a.assigned_at AND o.ordered_at<a.assigned_at+interval '7 days'
   AND p.status='SUCCEEDED' AND p.available_at<='2026-04-01T00:00:00+08') AS converted
 FROM core.experiment_assignment a)
SELECT experiment_id,variant,count(*) AS assigned,count(*) FILTER(WHERE converted) AS converted
FROM results GROUP BY 1,2 ORDER BY 1,2;
-- EXP2 is preregistered 50/50 but observed 80/20: SRM blocks default effectiveness inference.

-- S08 supplementary count: refunded members within 30 days; this is not the money guardrail.
-- The formal amount-ratio guardrail and customer-clustered confidence interval follow below.
-- The fixed reference time matures both 7-day primary and 30-day guardrail windows.
SELECT a.experiment_id,a.variant,count(*) AS assigned,
 count(*) FILTER(WHERE EXISTS(
   SELECT 1 FROM core.order_header o JOIN core.refund r USING(tenant_id,order_id)
   WHERE o.tenant_id=a.tenant_id AND o.customer_id=a.unit_id AND o.channel_id=a.channel_id
   AND o.ordered_at>=a.assigned_at AND o.ordered_at<a.assigned_at+interval '7 days'
   AND r.status='SUCCEEDED' AND r.attempted_at<a.assigned_at+interval '30 days'
   AND r.available_at<='2025-12-15T09:00:00+08')) AS refunded_members
FROM core.experiment_assignment a
WHERE a.assigned_at+interval '30 days'<='2025-12-15T09:00:00+08'
GROUP BY 1,2 ORDER BY 1,2;

-- S11: attempts per minute; exclude groups below 100 rather than treating them as healthy.
SELECT date_trunc('minute',p.attempted_at) AS minute_bucket,count(*) AS attempts,
 count(*) FILTER(WHERE p.status='SUCCEEDED') AS successes,
 CASE WHEN count(*)>=100 THEN count(*) FILTER(WHERE p.status='SUCCEEDED')::numeric/count(*) END AS success_rate
FROM core.payment p JOIN core.order_header o USING(tenant_id,order_id)
WHERE o.channel_id=4 AND p.attempted_at>='2025-11-10T10:00:00+08' AND p.attempted_at<'2025-11-10T11:30:00+08'
GROUP BY 1 ORDER BY 1;

-- S12: first delivered-purchase month, fixed filters, and explicit month ages.
-- Refunds do not erase a delivered purchase or subsequent delivered activity in this
-- event-based retention definition; net revenue/refund rate are separate guardrails.
-- Unknown members are excluded; never backfill identities learned after the order.
-- Change the two nullable filter values together for both cohort base and activity.
WITH params AS (SELECT timestamptz '2025-12-15T09:00:00+08' cutoff,
 NULL::bigint channel_filter,NULL::bigint region_filter),
 purchases AS (
 SELECT o.tenant_id,o.customer_id,
 date_trunc('month',r.recognized_at AT TIME ZONE 'Asia/Shanghai')::date AS activity_month
 FROM core.revenue_entry r JOIN core.order_unit u USING(tenant_id,order_unit_id)
 JOIN core.order_header o USING(tenant_id,order_id) CROSS JOIN params p
 WHERE o.customer_id IS NOT NULL AND r.entry_type='DELIVERY' AND r.available_at<=p.cutoff
 AND (p.channel_filter IS NULL OR o.channel_id=p.channel_filter)
 AND (p.region_filter IS NULL OR o.region_id=p.region_filter) GROUP BY 1,2,3),
 first_purchase AS (SELECT tenant_id,customer_id,min(activity_month) cohort FROM purchases GROUP BY 1,2),
 bases AS (SELECT tenant_id,cohort,count(*) denominator FROM first_purchase GROUP BY 1,2),
 activity AS (SELECT f.tenant_id,f.cohort,p.activity_month,count(DISTINCT p.customer_id) active
 FROM first_purchase f JOIN purchases p USING(tenant_id,customer_id) GROUP BY 1,2,3),
 cells AS (SELECT b.*,n.age,(b.cohort+make_interval(months=>n.age))::date AS activity_month
 FROM bases b CROSS JOIN generate_series(0,12) n(age))
SELECT c.tenant_id,c.cohort,c.age,c.activity_month,c.denominator,
 CASE WHEN c.activity_month+interval '1 month'<=p.cutoff AT TIME ZONE 'Asia/Shanghai'
 THEN coalesce(a.active,0) END active,
 CASE WHEN c.denominator>=100 AND c.activity_month+interval '1 month'<=p.cutoff AT TIME ZONE 'Asia/Shanghai'
 THEN coalesce(a.active,0)::numeric/c.denominator END retention,
 CASE WHEN c.activity_month+interval '1 month'>p.cutoff AT TIME ZONE 'Asia/Shanghai' THEN 'IMMATURE'
 WHEN c.denominator<100 THEN 'INSUFFICIENT_SAMPLE' ELSE 'MATURE' END sample_status
FROM cells c CROSS JOIN params p LEFT JOIN activity a USING(tenant_id,cohort,activity_month)
ORDER BY 1,2,3;

-- S04: independently reproduce cash basis without multiplying payment/refund rows in a join.
WITH cash AS (SELECT tenant_id,order_id,amount_cent FROM core.payment WHERE status='SUCCEEDED'
 UNION ALL SELECT tenant_id,order_id,-amount_cent FROM core.refund WHERE status='SUCCEEDED')
SELECT sum(c.amount_cent) cash_cent FROM cash c JOIN core.order_header o USING(tenant_id,order_id)
WHERE o.order_date>='2025-09-01' AND o.order_date<'2025-10-01';

-- Source completeness, real zero, and empty set are separate inputs.
SELECT * FROM ops.source_watermark WHERE source_system='OMS' AND observed_at IN ('2025-09-29T00:00:00+08','2025-09-30T00:00:00+08');
SELECT count(*) FROM core.order_header WHERE order_date='2026-02-01';
SELECT count(*) FROM core.channel_product_daily WHERE submitted_orders=0 AND paid_amount_cent=0;

-- Diagnostic profile: all-region vs fixed same-store revenue, including return postings.
WITH revenue AS (
 SELECT o.selling_site_id,extract(year FROM r.recognized_at AT TIME ZONE 'Asia/Shanghai') AS report_year,
 sum(r.amount_cent) net_cent FROM core.revenue_entry r
 JOIN core.order_unit u USING(tenant_id,order_unit_id) JOIN core.order_header o USING(tenant_id,order_id)
 WHERE r.tenant_id=101 AND o.selling_site_id IN(1,5,6)
 AND r.recognized_at>='2023-01-01T00:00:00+08' AND r.recognized_at<'2025-01-01T00:00:00+08'
 GROUP BY 1,2)
SELECT report_year,sum(net_cent)/100.0 all_stores_yuan,
 sum(net_cent) FILTER(WHERE selling_site_id IN(1,6))/100.0 same_stores_yuan,
 coalesce(sum(net_cent) FILTER(WHERE selling_site_id=5),0)/100.0 new_store_yuan
FROM revenue GROUP BY 1 ORDER BY 1;

-- Readiness is asset/business-period specific; choose the last statement actually available.
SELECT DISTINCT ON(tenant_id,asset_id,period_start,period_end) *
FROM ops.asset_period_status WHERE tenant_id=101 AND period_start='2025-09-28'
 AND available_at<='2025-09-30T00:00:00+08'
ORDER BY tenant_id,asset_id,period_start,period_end,observed_at DESC;

-- Price study: fixed eligible cohort and zero-buying members remain in every week.
WITH weeks AS (SELECT generate_series(-12,7) week),
payments AS(SELECT tenant_id,order_id,sum(amount_cent) paid FROM core.payment
 WHERE status='SUCCEEDED' AND available_at<='2026-04-01T00:00:00+08' GROUP BY 1,2),
member_weeks AS (
 SELECT c.customer_id,c.cohort_group,w.week,count(o.order_id) FILTER(WHERE p.paid>0) paid_orders,
 coalesce(sum(p.paid),0) paid_cent
 FROM core.intervention_cohort c CROSS JOIN weeks w
 JOIN core.intervention_definition d USING(tenant_id,intervention_id)
 LEFT JOIN core.order_header o ON o.tenant_id=c.tenant_id AND o.customer_id=c.customer_id
 AND o.ordered_at>=d.starts_at+make_interval(days=>7*w.week)
 AND o.ordered_at<d.starts_at+make_interval(days=>7*(w.week+1))
 LEFT JOIN payments p ON p.tenant_id=o.tenant_id AND p.order_id=o.order_id
 WHERE c.tenant_id=101 GROUP BY 1,2,3)
SELECT cohort_group,week,count(*) eligible,count(*) FILTER(WHERE paid_orders=0) no_paid_order,
 sum(paid_orders) paid_orders,sum(paid_cent)/100.0 paid_yuan FROM member_weeks GROUP BY 1,2 ORDER BY 1,2;

-- Platform ROI is attributed net cash / complete cohort spend, not causal incremental profit.
WITH spend AS (SELECT tenant_id,campaign_id,report_date,sum(spend_cent) spend_cent
 FROM core.campaign_daily WHERE report_version=1 GROUP BY 1,2,3)
SELECT c.campaign_name,a.cohort_date,a.report_version,a.coverage_status,a.new_buyer_definition,
 s.spend_cent/100.0 spend_yuan,a.attributed_paid_cent/100.0 paid_yuan,
 a.attributed_refund_cent/100.0 refund_yuan,
 (a.attributed_paid_cent-a.attributed_refund_cent)::numeric/nullif(s.spend_cent,0) attributed_net_cash_roas
FROM spend s JOIN core.campaign c USING(tenant_id,campaign_id)
LEFT JOIN core.campaign_attribution_daily a ON a.tenant_id=s.tenant_id AND a.campaign_id=s.campaign_id
 AND a.cohort_date=s.report_date WHERE s.tenant_id=101 AND s.report_date BETWEEN '2025-06-01' AND '2025-06-20'
ORDER BY c.campaign_id,s.report_date,a.report_version;

-- S08 formal money guardrail: ITT, assignment-based 7/30-day windows, all assigned members.
-- Delta-method ratio variance clusters by customer; cents are not independent samples.
-- Fixed 50/50 experiments use chi-square(1) > 10.827566 for SRM alpha=.001.
WITH members AS (
 SELECT a.*,d.outcome_window_days,d.guardrail_window_days,
        timestamptz '2026-04-01T00:00:00+08' cutoff
 FROM core.experiment_assignment a JOIN core.experiment_definition d
 USING(tenant_id,experiment_id)
 WHERE a.tenant_id=101 AND a.available_at<='2026-04-01T00:00:00+08'
 AND d.available_at<='2026-04-01T00:00:00+08'
), outcomes AS (
 SELECT a.experiment_id,a.variant,a.unit_id,
 a.assigned_at+make_interval(days=>a.guardrail_window_days)>a.cutoff immature,
 coalesce(sum(p.paid),0)::numeric paid,coalesce(sum(r.refunded),0)::numeric refunded
 FROM members a LEFT JOIN core.order_header o ON o.tenant_id=a.tenant_id
 AND o.customer_id=a.unit_id AND o.channel_id=a.channel_id
 AND o.ordered_at>=a.assigned_at
 AND o.ordered_at<a.assigned_at+make_interval(days=>a.outcome_window_days)
 AND o.available_at<=a.cutoff
 CROSS JOIN LATERAL (
  SELECT coalesce(sum(p.amount_cent),0) paid FROM core.payment p
  WHERE p.tenant_id=o.tenant_id AND p.order_id=o.order_id AND p.status='SUCCEEDED'
  AND p.attempted_at>=a.assigned_at
  AND p.attempted_at<a.assigned_at+make_interval(days=>a.outcome_window_days)
  AND p.available_at<=a.cutoff
 ) p
 CROSS JOIN LATERAL (
  SELECT coalesce(sum(r.amount_cent),0) refunded FROM core.refund r
  WHERE r.tenant_id=o.tenant_id AND r.order_id=o.order_id AND r.status='SUCCEEDED'
  AND r.attempted_at>=a.assigned_at
  AND r.attempted_at<a.assigned_at+make_interval(days=>a.guardrail_window_days)
  AND r.available_at<=a.cutoff AND p.paid>0
 ) r
 GROUP BY 1,2,3,4
), rates AS (
 SELECT experiment_id,variant,count(*)::numeric n,bool_or(immature) immature,
 avg((paid>0)::int) conversion,sum(paid) paid_cent,sum(refunded) refund_cent,
 sum(refunded)/nullif(sum(paid),0) refund_rate
 FROM outcomes GROUP BY 1,2
), stats AS (
 SELECT r.*,r.n/nullif(r.n-1,0)*sum(power(o.refunded-r.refund_rate*o.paid,2))
 /nullif(power(r.paid_cent,2),0) refund_variance
 FROM rates r JOIN outcomes o USING(experiment_id,variant)
 GROUP BY r.experiment_id,r.variant,r.n,r.immature,r.conversion,r.paid_cent,r.refund_cent,r.refund_rate
), effects AS (
 SELECT a.experiment_id,a.n assigned_a,b.n assigned_b,a.immature OR b.immature immature,
 a.paid_cent paid_a,b.paid_cent paid_b,a.refund_rate refund_rate_a,b.refund_rate refund_rate_b,
 power(a.n-b.n,2)/(a.n+b.n) srm_chi_square,
 b.conversion-a.conversion conversion_difference,
 sqrt(a.conversion*(1-a.conversion)/a.n+b.conversion*(1-b.conversion)/b.n) conversion_se,
 b.refund_rate-a.refund_rate refund_difference,
 sqrt(a.refund_variance+b.refund_variance) refund_se
 FROM stats a JOIN stats b USING(experiment_id) WHERE a.variant='A' AND b.variant='B'
)
SELECT experiment_id,assigned_a,assigned_b,srm_chi_square,
 100*conversion_difference conversion_difference_pp,
 100*(conversion_difference-1.96*conversion_se) conversion_ci_lower_pp,
 100*(conversion_difference+1.96*conversion_se) conversion_ci_upper_pp,
 100*refund_rate_a refund_rate_a_pct,100*refund_rate_b refund_rate_b_pct,
 100*refund_difference refund_difference_pp,
 100*(refund_difference-1.96*refund_se) refund_ci_lower_pp,
 100*(refund_difference+1.96*refund_se) refund_ci_upper_pp,
 CASE WHEN immature THEN 'IMMATURE'
 WHEN least(assigned_a,assigned_b)<100 OR least(paid_a,paid_b)=0 THEN 'INSUFFICIENT_SAMPLE'
 WHEN srm_chi_square>10.827566 THEN 'SRM_INVALID'
 WHEN conversion_difference-1.96*conversion_se>0 AND refund_difference+1.96*refund_se<=0.03
 THEN 'ADOPT' ELSE 'HOLD' END decision
FROM effects ORDER BY experiment_id;

-- S05 registered traffic windows: fixed SKU universe launched by May 1, including later closures.
-- Visitor totals sum SKU/day/region cells and are NOT deduplicated channel UV.
-- Latest visible reports at the fixed mature cutoff; absent cells retain NULL, known zeros retain 0.
-- Report incomplete SKU coverage before decomposition; do not silently convert missing cells to zero.
-- Use these cells for product-mix/within-product decomposition. Price and media co-move.
WITH windows(phase,lo,hi) AS (
 VALUES ('before',date '2025-05-01',date '2025-05-21'),
        ('during',date '2025-06-01',date '2025-06-21'),
        ('after',date '2025-07-01',date '2025-07-21')
), universe AS (
 SELECT s.tenant_id,s.sku_id FROM core.sku s JOIN core.spu p USING(tenant_id,spu_id)
 WHERE s.tenant_id=101 AND p.launch_on<='2025-05-01'
), latest AS (
 SELECT DISTINCT ON(d.tenant_id,d.report_date,d.channel_id,d.sku_id,d.region_id) d.*
 FROM core.channel_product_daily d
 WHERE d.tenant_id=101 AND d.channel_id=3 AND d.available_at<='2026-04-01T00:00:00+08'
 AND d.report_date>='2025-05-01' AND d.report_date<'2025-07-21'
 ORDER BY d.tenant_id,d.report_date,d.channel_id,d.sku_id,d.region_id,
 d.available_at DESC,d.report_version DESC
), cells AS (
 SELECT w.phase,u.sku_id,count(d.sku_id) visible_report_cells,
 sum(d.product_visitors) product_visitor_cells,
 sum(d.submitted_orders) submitted_orders,sum(d.paid_orders) paid_orders
 FROM windows w CROSS JOIN universe u LEFT JOIN latest d
 ON d.tenant_id=u.tenant_id AND d.sku_id=u.sku_id AND d.report_date>=w.lo AND d.report_date<w.hi
 GROUP BY 1,2
)
SELECT *,product_visitor_cells/nullif(sum(product_visitor_cells) OVER(PARTITION BY phase),0)
 AS product_visitor_weight,paid_orders::numeric/nullif(product_visitor_cells,0) paid_conversion
FROM cells ORDER BY phase,sku_id;
