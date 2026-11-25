-- Independent hard constraints; each query returns a violation count.
-- name: concrete_product_names
SELECT count(*) FROM core.spu WHERE spu_name ~ '(商品|运动服饰|运动鞋履)[0-9]+[-/][0-9]+' OR length(spu_name)<6 OR NOT(attributes ?& ARRAY['product_type','material','family']);
-- name: legal_specs
SELECT count(*) FROM core.sku WHERE spec_attributes->>'size_system'<>size_system OR spec_attributes->>'size_value'<>size_value OR spec_attributes->>'color'<>color_code OR (spec_attributes->>'weight_grams')::int<>weight_grams OR (size_system='ALPHA' AND size_value NOT IN ('XS','S','M','L','XL','XXL'));
-- name: coherent_sport_tags
SELECT count(*) FROM core.spu p JOIN core.category c USING(tenant_id,category_id) JOIN core.spu_sport ps USING(tenant_id,spu_id) JOIN core.sport s USING(tenant_id,sport_id) WHERE c.parent_category_id=4 AND s.sport_name='游泳';
-- name: selling_lifecycle
SELECT count(*) FROM core.order_line l JOIN core.order_header o USING(tenant_id,order_id) JOIN core.sku k USING(tenant_id,sku_id) JOIN core.channel_listing c USING(tenant_id,listing_id) WHERE o.order_date<k.launch_on OR o.order_date>=k.discontinue_on OR o.ordered_at<c.valid_from OR o.ordered_at>=c.valid_to;
-- name: membership_chronology
SELECT count(*) FROM core.order_header o JOIN core.customer c USING(tenant_id,customer_id) JOIN core.customer_identity i USING(tenant_id,identity_id) WHERE o.ordered_at<c.joined_at OR o.ordered_at<i.first_seen_at;
-- name: identity_chronology
SELECT count(*) FROM core.order_header o JOIN core.customer_identity i USING(tenant_id,identity_id) WHERE o.ordered_at<i.first_seen_at;
-- name: valid_address_snapshot
SELECT count(*) FROM core.order_delivery_address a JOIN core.order_header o USING(tenant_id,order_id) JOIN core.geo_area d ON d.tenant_id=a.tenant_id AND d.geo_id=a.district_geo_id WHERE d.geo_level<>'DISTRICT' OR d.parent_geo_id<>o.demand_geo_id OR a.region_id<>d.region_id OR a.captured_at<>o.ordered_at OR a.address_line NOT LIKE '合成地址·%';
-- name: delivery_address_coverage
SELECT count(*) FROM core.order_header o LEFT JOIN core.order_delivery_address a USING(tenant_id,order_id) WHERE (o.channel_id<6 AND a.order_id IS NULL) OR (o.channel_id>=6 AND a.order_id IS NOT NULL);
-- name: size_return_applicability
SELECT count(*) FROM core.return_item r JOIN core.order_unit u USING(tenant_id,order_unit_id) JOIN core.sku k USING(tenant_id,sku_id) WHERE (r.reason_code='SIZE' AND k.size_system NOT IN ('ALPHA','EU','HEAD','FOOT')) OR length(r.reason_description)<8;
-- name: cost_version_binding
SELECT count(*) FROM core.inventory_lot l JOIN core.cost_period c USING(tenant_id,cost_id) WHERE l.received_at<c.valid_from OR l.received_at>=c.valid_to OR l.unit_cost_cent<>c.unit_cost_cent;
-- name: price_interval_overlap
SELECT count(*) FROM (SELECT valid_from,lag(valid_to) OVER(PARTITION BY tenant_id,sku_id,channel_id ORDER BY valid_from) prev FROM core.price_period) t WHERE valid_from<prev;
-- name: cost_interval_overlap
SELECT count(*) FROM (SELECT valid_from,lag(valid_to) OVER(PARTITION BY tenant_id,sku_id ORDER BY valid_from) prev FROM core.cost_period) t WHERE valid_from<prev;
-- name: geographic_hierarchy
SELECT count(*) FROM core.geo_area c LEFT JOIN core.geo_area p ON p.tenant_id=c.tenant_id AND p.geo_id=c.parent_geo_id WHERE (c.geo_level<>'REGION' AND (p.geo_id IS NULL OR c.region_id<>p.region_id)) OR (c.geo_level='PROVINCE' AND p.geo_level<>'REGION') OR (c.geo_level='CITY' AND p.geo_level<>'PROVINCE') OR (c.geo_level='DISTRICT' AND p.geo_level<>'CITY');
-- name: campaign_touch_channel
SELECT count(*) FROM core.web_session s JOIN core.campaign c USING(tenant_id,campaign_id) WHERE s.channel_id<>c.target_channel_id OR s.started_at<c.starts_at OR s.started_at>=c.ends_at;
-- name: search_text_contract
SELECT count(*) FROM core.behavior_event WHERE (event_type='SEARCH' AND coalesce(length(search_query),0)<3) OR (event_type<>'SEARCH' AND search_query IS NOT NULL);
-- name: funnel_conservation
SELECT count(*) FROM core.channel_product_daily WHERE product_views<product_visitors OR product_visitors<add_cart_users;
-- name: offline_hours
SELECT count(*) FROM core.order_header WHERE channel_id>=6 AND extract(hour FROM ordered_at AT TIME ZONE 'Asia/Shanghai') NOT BETWEEN 10 AND 20;
-- name: owned_traffic_replay
WITH events AS(SELECT b.tenant_id,(b.event_at AT TIME ZONE 'Asia/Shanghai')::date AS event_date,s.channel_id,b.sku_id,s.region_id,count(*) FILTER(WHERE b.event_type='PRODUCT_VIEW') pv,count(DISTINCT coalesce('I'||s.identity_id::text,'A'||s.anonymous_token)) FILTER(WHERE b.event_type='PRODUCT_VIEW') uv,count(DISTINCT coalesce('I'||s.identity_id::text,'A'||s.anonymous_token)) FILTER(WHERE b.event_type='ADD_CART') carts FROM core.behavior_event b JOIN core.web_session s USING(tenant_id,session_id) GROUP BY 1,2,3,4,5), latest AS(SELECT DISTINCT ON(tenant_id,report_date,channel_id,sku_id,region_id) * FROM core.channel_product_daily WHERE channel_id IN(4,5) ORDER BY tenant_id,report_date,channel_id,sku_id,region_id,report_version DESC) SELECT count(*) FROM latest d LEFT JOIN events e ON (d.tenant_id,d.report_date,d.channel_id,d.sku_id,d.region_id)=(e.tenant_id,e.event_date,e.channel_id,e.sku_id,e.region_id) WHERE (d.product_views,d.product_visitors,d.add_cart_users) IS DISTINCT FROM (coalesce(e.pv,0),coalesce(e.uv,0),coalesce(e.carts,0));

-- name: legal_ball_size_and_pack_weight
SELECT count(*) FROM core.sku k JOIN core.spu p USING(tenant_id,spu_id)
WHERE (p.attributes->>'family'='football' AND k.size_value NOT IN('2号','3号','4号','5号'))
 OR (p.attributes->>'family'='basketball' AND k.size_value NOT IN('6号','7号'))
 OR (k.size_system='PACK' AND (k.weight_grams IS DISTINCT FROM
   (k.spec_attributes->>'unit_weight_grams')::numeric*(k.spec_attributes->>'pack_units')::numeric))
 OR (p.attributes->>'family'='tennis_ball' AND
   coalesce((k.spec_attributes->>'unit_weight_grams')::numeric,0) NOT BETWEEN 56 AND 59)
 OR (p.attributes->>'family'='shuttlecock' AND
   coalesce((k.spec_attributes->>'unit_weight_grams')::numeric,0) NOT BETWEEN 5 AND 6);
