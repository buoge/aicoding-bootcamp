-- name: same_region_store_story
WITH x AS (
 SELECT extract(year FROM r.recognized_at AT TIME ZONE 'Asia/Shanghai') y,
        sum(r.amount_cent) all_sales,
        sum(r.amount_cent) FILTER(WHERE o.selling_site_id IN(1,6)) same_sales
 FROM core.revenue_entry r JOIN core.order_unit u USING(tenant_id,order_unit_id)
 JOIN core.order_header o USING(tenant_id,order_id)
 WHERE r.tenant_id=101 AND o.selling_site_id IN(1,5,6)
 AND r.recognized_at>='2023-01-01T00:00:00+08' AND r.recognized_at<'2025-01-01T00:00:00+08'
 GROUP BY 1)
SELECT (NOT EXISTS(SELECT 1 FROM x a JOIN x b ON a.y=2023 AND b.y=2024
 WHERE b.all_sales>a.all_sales AND b.same_sales<a.same_sales))::int;
-- name: procurement_delay_and_transfer
SELECT (NOT EXISTS(SELECT 1 FROM core.procurement_revision v
 JOIN core.inventory_document_line l USING(tenant_id,inventory_doc_line_id)
 JOIN core.inventory_document d USING(tenant_id,inventory_doc_id)
 JOIN core.inventory_movement m USING(tenant_id,inventory_doc_line_id)
 WHERE v.tenant_id=101 AND d.to_site_id=7 AND m.movement_type='RECEIPT'
 AND d.planned_at='2025-09-06T00:00:00+08' AND m.event_at='2025-09-16T00:00:00+08'))::int
 + (NOT EXISTS(SELECT 1 FROM core.inventory_document WHERE tenant_id=101
 AND doc_type='TRANSFER' AND from_site_id=8 AND to_site_id=7
 AND created_at='2025-09-12T00:00:00+08'))::int;
-- name: readiness_as_of
SELECT (NOT EXISTS(SELECT 1 FROM ops.asset_period_status WHERE tenant_id=101
 AND period_start='2025-09-28' AND status='PARTIAL'
 AND available_at<='2025-09-30T00:00:00+08'))::int
 + (EXISTS(SELECT 1 FROM ops.asset_period_status WHERE tenant_id=101
 AND period_start='2025-09-28' AND status='COMPLETE'
 AND available_at<'2025-10-02T00:00:00+08'))::int;
-- name: readiness_visible_detail_versions
SELECT count(*) FROM ops.asset_period_status s
WHERE s.asset_id='core.channel_product_daily' AND s.last_visible_report_version IS NOT NULL
AND (SELECT coalesce(bool_or(d.report_version<>s.last_visible_report_version),true)
 FROM (
  SELECT DISTINCT ON(channel_id,sku_id,region_id) report_version
  FROM core.channel_product_daily d
  WHERE d.tenant_id=s.tenant_id AND d.report_date=s.period_start
    AND d.available_at<=s.observed_at
  ORDER BY channel_id,sku_id,region_id,d.available_at DESC,d.report_version DESC
 ) d);
-- name: price_cohort_and_exposure
SELECT ((SELECT count(*) FROM core.intervention_cohort WHERE tenant_id=101)<>2000)::int
 + (EXISTS(SELECT 1 FROM core.intervention_cohort c JOIN core.intervention_definition d
 USING(tenant_id,intervention_id) WHERE c.available_at>=d.starts_at))::int
 + (EXISTS(SELECT 1 FROM core.price_exposure e JOIN core.price_period p USING(tenant_id,price_id)
 WHERE e.sku_id<>p.sku_id OR e.channel_id<>p.channel_id OR e.viewed_at<p.valid_from
 OR e.viewed_at>=p.valid_to OR e.shown_list_cent<>p.list_price_cent))::int
 + (NOT EXISTS(SELECT 1 FROM core.price_exposure e WHERE e.identity_id IS NULL))::int;
-- name: price_sixty_day_observation_coverage
SELECT (count(DISTINCT c.cohort_group)<>2)::int FROM core.intervention_cohort c
JOIN core.intervention_definition d USING(tenant_id,intervention_id)
JOIN core.price_exposure e ON e.tenant_id=c.tenant_id AND e.identity_id=c.identity_id
WHERE c.tenant_id=101 AND e.viewed_at>=d.starts_at+interval '56 days'
AND e.viewed_at<d.starts_at+interval '60 days';
-- name: experiment_shared_refunds
WITH groups AS (
 SELECT a.variant,count(r.refund_id) n FROM core.experiment_assignment a
 LEFT JOIN core.order_header o ON o.tenant_id=a.tenant_id AND o.customer_id=a.unit_id
 AND o.ordered_at>=a.assigned_at AND o.ordered_at<a.assigned_at+interval '7 days'
 LEFT JOIN core.refund r ON r.tenant_id=o.tenant_id AND r.order_id=o.order_id
 AND r.status='SUCCEEDED' AND r.attempted_at<a.assigned_at+interval '30 days'
 WHERE a.tenant_id=101 AND a.experiment_id=1 GROUP BY 1)
SELECT (count(*)<>2 OR min(n)=0)::int FROM groups;
-- name: platform_cohort_reports
SELECT (NOT EXISTS(SELECT 1 FROM core.campaign_attribution_daily
 WHERE tenant_id=101 AND channel_id=3 AND cohort_date BETWEEN '2025-06-01' AND '2025-06-20'
 AND attributed_paid_cent>0 AND report_version=2 AND attributed_refund_cent>0))::int
 + (EXISTS(SELECT 1 FROM core.campaign_attribution_daily a JOIN core.campaign_attribution_daily b
 USING(tenant_id,campaign_id,cohort_date) WHERE a.report_version=1 AND b.report_version=2
 AND (a.attributed_paid_cent IS DISTINCT FROM b.attributed_paid_cent
 OR a.new_buyer_count IS DISTINCT FROM b.new_buyer_count
 OR a.attributed_refund_cent>b.attributed_refund_cent)))::int;
-- name: ordinary_monitor_density
SELECT (count(*)>=1000)::int FROM core.order_header WHERE tenant_id=101
 AND ordered_at>='2025-11-10T10:00:00+08' AND ordered_at<'2025-11-10T11:30:00+08';
-- name: operating_day_coverage
SELECT count(*) FROM core.site s CROSS JOIN core.calendar c
 LEFT JOIN core.store_operating_day d ON d.tenant_id=s.tenant_id AND d.site_id=s.site_id
 AND d.business_date=c.calendar_date
 WHERE s.site_type<>'WAREHOUSE' AND c.calendar_date>=greatest(s.opened_on,date '2023-01-01')
 AND c.calendar_date<'2026-01-01' AND d.site_id IS NULL;
-- name: experiment_after_sales_boundaries
WITH orders AS (
 SELECT o.tenant_id,o.order_id,a.assigned_at FROM core.experiment_assignment a
 JOIN core.order_header o ON o.tenant_id=a.tenant_id AND o.customer_id=a.unit_id
 AND o.channel_id=a.channel_id AND o.ordered_at>=a.assigned_at
 AND o.ordered_at<a.assigned_at+interval '7 days'
 WHERE a.tenant_id=101 AND a.experiment_id=1),
 cash AS (
 SELECT o.tenant_id,o.order_id,sum(p.amount_cent) paid FROM orders o
 JOIN core.payment p USING(tenant_id,order_id) WHERE p.status='SUCCEEDED' GROUP BY 1,2),
 refunds AS (
 SELECT o.tenant_id,o.order_id,sum(r.amount_cent) refunded FROM orders o
 JOIN core.refund r USING(tenant_id,order_id) WHERE r.status='SUCCEEDED'
 AND r.attempted_at<o.assigned_at+interval '30 days' GROUP BY 1,2)
SELECT (NOT EXISTS(SELECT 1 FROM cash c JOIN refunds r USING(tenant_id,order_id)
 WHERE r.refunded>0 AND r.refunded<c.paid))::int
 + (NOT EXISTS(SELECT 1 FROM orders o JOIN core.return_header h USING(tenant_id,order_id)
 JOIN core.return_item i USING(tenant_id,return_id)
 JOIN core.return_event e USING(tenant_id,return_item_id) WHERE e.event_type='REJECTED'))::int;
