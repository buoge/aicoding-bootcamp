-- name: joined_months
SELECT count(DISTINCT date_trunc('month',joined_at)) FROM core.customer WHERE tenant_id=101;
-- name: declared_interest_profiles
SELECT count(DISTINCT attributes->'declared_sports') FROM core.customer WHERE tenant_id=101;
-- name: launch_dates
SELECT count(DISTINCT launch_on) FROM core.spu WHERE tenant_id=101;
-- name: discontinued_products
SELECT count(*) FROM core.spu WHERE tenant_id=101 AND discontinue_on IS NOT NULL;
-- name: return_reasons
SELECT count(DISTINCT reason_code) FROM core.return_item WHERE tenant_id=101;
-- name: shipping_fee_values
SELECT count(DISTINCT amount_cent) FROM core.order_fee WHERE tenant_id=101 AND fee_type='OUTBOUND_LOGISTICS';
-- name: payment_methods
SELECT count(DISTINCT method) FROM core.payment WHERE tenant_id=101;
-- name: devices
SELECT count(DISTINCT device_type) FROM core.web_session WHERE tenant_id=101;
-- name: campaign_sources
SELECT count(DISTINCT acquisition_source) FROM core.campaign WHERE tenant_id=101;
-- name: unsubmitted_sessions
SELECT count(*) FROM core.web_session s WHERE tenant_id=101 AND NOT EXISTS(SELECT 1 FROM core.behavior_event e WHERE e.tenant_id=s.tenant_id AND e.session_id=s.session_id AND e.event_type='CHECKOUT_SUBMITTED');
-- name: price_change_share
SELECT avg((n>1)::int)::float8 FROM (SELECT sku_id,channel_id,count(*) n FROM core.price_period WHERE tenant_id=101 GROUP BY 1,2) t;
-- name: cost_change_share
SELECT avg((n>1)::int)::float8 FROM (SELECT sku_id,count(*) n FROM core.cost_period WHERE tenant_id=101 GROUP BY 1) t;
-- name: distinct_view_order_ratios
SELECT count(DISTINCT round(product_views::numeric/submitted_orders,2)) FROM core.channel_product_daily WHERE tenant_id=101 AND submitted_orders>0;
