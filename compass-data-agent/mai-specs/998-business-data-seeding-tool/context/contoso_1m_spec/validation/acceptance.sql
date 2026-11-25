-- Read-only release gates. Execute each SELECT and fail publication if violations != 0.
-- Run as a controlled validation owner over the full release; business RLS roles would hide defects.
-- These are database checks. File manifests, checkpoints, scenario contrasts, snapshot replay and access attacks have separate gates.

-- H01: 精确订单配额
SELECT count(*)::bigint AS violations FROM
 (VALUES (101::smallint,900000::bigint),(102::smallint,50000::bigint),(103::smallint,50000::bigint)) q(tenant_id,n)
 FULL JOIN (SELECT tenant_id,count(*) n FROM core.order_header GROUP BY tenant_id) a USING(tenant_id)
 WHERE q.n IS DISTINCT FROM a.n;

-- H02: 订单日期与唯一活动发布版本
SELECT (SELECT count(*) FROM core.order_header WHERE order_date < DATE '2023-01-01' OR order_date >= DATE '2026-01-01')
 + CASE WHEN (SELECT count(*) FROM ops.dataset_release)=1 THEN 0 ELSE 1 END AS violations;

-- H03: 订单头与订单行数量金额守恒
SELECT count(*)::bigint violations FROM core.order_header h LEFT JOIN
 (SELECT tenant_id,order_id,count(*) n,sum(gross_cent) gross,sum(discount_cent) discount,sum(net_cent) net
 FROM core.order_line GROUP BY tenant_id,order_id) l USING(tenant_id,order_id)
 WHERE l.n IS NULL OR h.gross_cent<>l.gross OR h.discount_cent<>l.discount OR h.payable_cent<>l.net;

-- H04: 逻辑单件与行金额数量守恒
SELECT count(*)::bigint violations FROM core.order_line l LEFT JOIN
 (SELECT tenant_id,order_line_id,count(*) n,min(unit_no) mn,max(unit_no) mx,sum(gross_cent) gross,sum(discount_cent) discount,sum(net_cent) net
 FROM core.order_unit GROUP BY tenant_id,order_line_id) u USING(tenant_id,order_line_id)
 WHERE u.n IS NULL OR l.quantity<>u.n OR u.mn<>1 OR u.mx<>u.n OR l.gross_cent<>u.gross OR l.discount_cent<>u.discount OR l.net_cent<>u.net;

-- H05: 优惠核销分摊与单件优惠一致
SELECT count(*)::bigint violations FROM core.order_unit u LEFT JOIN
 (SELECT tenant_id,order_unit_id,sum(discount_cent) d FROM core.discount_allocation GROUP BY tenant_id,order_unit_id) a USING(tenant_id,order_unit_id)
 WHERE u.discount_cent<>coalesce(a.d,0);

-- H06: 成功扣款不超过应付额
SELECT count(*)::bigint violations FROM core.order_header h JOIN
 (SELECT tenant_id,order_id,sum(amount_cent) paid FROM core.payment WHERE status='SUCCEEDED' GROUP BY tenant_id,order_id) p USING(tenant_id,order_id)
 WHERE p.paid>h.payable_cent;

-- H07: 每个出库单件必须预先足额收款
SELECT count(*)::bigint violations FROM core.shipment_item s JOIN core.order_header h USING(tenant_id,order_id)
 WHERE coalesce((SELECT sum(p.amount_cent) FROM core.payment p WHERE p.tenant_id=s.tenant_id AND p.order_id=s.order_id AND p.status='SUCCEEDED' AND p.attempted_at<=s.shipped_at),0)<>h.payable_cent;

-- H08: 退款只能引用成功支付且不能超额
SELECT count(*)::bigint violations FROM core.payment p JOIN
 (SELECT tenant_id,payment_id,sum(amount_cent) r FROM core.refund WHERE status='SUCCEEDED' GROUP BY tenant_id,payment_id) r USING(tenant_id,payment_id)
 WHERE p.status<>'SUCCEEDED' OR r.r>p.amount_cent;

-- H09: 每次退款分配和等于退款额
SELECT count(*)::bigint violations FROM core.refund r LEFT JOIN
 (SELECT tenant_id,refund_id,sum(amount_cent) amount FROM core.refund_allocation GROUP BY tenant_id,refund_id) a USING(tenant_id,refund_id)
 WHERE r.amount_cent IS DISTINCT FROM a.amount;

-- H10: 单件累计成功退款不超原净额
SELECT count(*)::bigint violations FROM core.order_unit u JOIN
 (SELECT a.tenant_id,a.order_unit_id,sum(a.amount_cent) amount FROM core.refund_allocation a JOIN core.refund r USING(tenant_id,refund_id)
 WHERE r.status='SUCCEEDED' GROUP BY a.tenant_id,a.order_unit_id) a USING(tenant_id,order_unit_id)
 WHERE a.amount>u.net_cent;

-- H11: 退款具备同单件有效业务原因
SELECT count(*)::bigint violations FROM core.refund r JOIN core.refund_allocation a USING(tenant_id,refund_id)
 WHERE r.status='SUCCEEDED' AND (
 (r.refund_type='RETURN' AND NOT EXISTS(SELECT 1 FROM core.return_event e WHERE e.tenant_id=a.tenant_id AND e.order_unit_id=a.order_unit_id AND e.event_type='ACCEPTED' AND e.event_at<=r.attempted_at))
 OR (r.refund_type='CANCEL' AND NOT EXISTS(SELECT 1 FROM core.order_unit_event e WHERE e.tenant_id=a.tenant_id AND e.order_unit_id=a.order_unit_id AND e.event_type='CANCELLED' AND e.event_at<=r.attempted_at)));

-- H12: 每包裹物流关键事件幂等
SELECT count(*)::bigint violations FROM (SELECT tenant_id,shipment_id,event_type FROM core.shipment_event
 GROUP BY tenant_id,shipment_id,event_type HAVING count(*)>1) x;

-- H13: 收入交付来源及金额时间一致
SELECT count(*)::bigint violations FROM core.revenue_entry r JOIN core.order_unit u USING(tenant_id,order_unit_id)
 LEFT JOIN core.shipment_item i ON i.tenant_id=r.tenant_id AND i.order_unit_id=r.order_unit_id
 LEFT JOIN core.shipment_event e ON e.tenant_id=r.tenant_id AND e.shipment_event_id=r.shipment_event_id
 WHERE r.entry_type='DELIVERY' AND (i.shipment_id IS NULL OR e.shipment_id IS DISTINCT FROM i.shipment_id OR e.event_type<>'DELIVERED' OR r.amount_cent<>u.net_cent OR r.recognized_at<>e.event_at OR r.available_at<greatest(e.available_at,u.available_at,i.available_at));

-- H14: 收入冲减来源及原单位净额一致
SELECT count(*)::bigint violations FROM core.revenue_entry r JOIN core.order_unit u USING(tenant_id,order_unit_id)
 LEFT JOIN core.return_event e ON e.tenant_id=r.tenant_id AND e.return_event_id=r.return_event_id
 WHERE r.entry_type='RETURN_ACCEPTED' AND (e.order_unit_id IS DISTINCT FROM r.order_unit_id OR e.event_type<>'ACCEPTED' OR r.amount_cent<>-u.net_cent OR r.recognized_at<>e.event_at OR r.available_at<greatest(e.available_at,u.available_at));

-- H15: 每个已交付单件恰有正向收入和成本
SELECT count(*)::bigint violations FROM core.shipment_item i JOIN core.shipment_event e USING(tenant_id,shipment_id)
 WHERE e.event_type='DELIVERED' AND (
 NOT EXISTS(SELECT 1 FROM core.revenue_entry r WHERE r.tenant_id=i.tenant_id AND r.order_unit_id=i.order_unit_id AND r.entry_type='DELIVERY') OR
 NOT EXISTS(SELECT 1 FROM core.cost_entry c WHERE c.tenant_id=i.tenant_id AND c.order_unit_id=i.order_unit_id AND c.entry_type='DELIVERY'));

-- H16: 成本必须沿袭同单件原出库批次与事件
SELECT count(*)::bigint violations FROM core.cost_entry c
 LEFT JOIN core.shipment_item i ON i.tenant_id=c.tenant_id AND i.order_unit_id=c.order_unit_id
 LEFT JOIN core.inventory_lot l ON l.tenant_id=i.tenant_id AND l.lot_id=i.lot_id
 LEFT JOIN core.shipment_event s ON s.tenant_id=c.tenant_id AND s.shipment_event_id=c.shipment_event_id
 LEFT JOIN core.return_event r ON r.tenant_id=c.tenant_id AND r.return_event_id=c.return_event_id
 WHERE c.lot_id IS DISTINCT FROM i.lot_id OR
 (c.entry_type='DELIVERY' AND (c.amount_cent IS DISTINCT FROM l.unit_cost_cent OR s.shipment_id IS DISTINCT FROM i.shipment_id OR s.event_type<>'DELIVERED' OR c.recognized_at<>s.event_at OR c.available_at<greatest(s.available_at,l.available_at,i.available_at))) OR
 (c.entry_type='RESTOCK' AND (c.amount_cent IS DISTINCT FROM -l.unit_cost_cent OR r.order_unit_id IS DISTINCT FROM c.order_unit_id OR r.event_type<>'RESTOCKED' OR c.recognized_at<>r.event_at OR c.available_at<greatest(r.available_at,l.available_at)));

-- H17: 接受退货前必须已经交付
SELECT count(*)::bigint violations FROM core.return_event r WHERE r.event_type='ACCEPTED' AND NOT EXISTS
 (SELECT 1 FROM core.shipment_item i JOIN core.shipment_event e USING(tenant_id,shipment_id)
 WHERE i.tenant_id=r.tenant_id AND i.order_unit_id=r.order_unit_id AND e.event_type='DELIVERED' AND e.event_at<=r.event_at);

-- H18: 退货接受与可售回库都有且仅有相应分录
SELECT count(*)::bigint violations FROM core.return_event e WHERE
 (e.event_type='ACCEPTED' AND NOT EXISTS(SELECT 1 FROM core.revenue_entry r WHERE r.tenant_id=e.tenant_id AND r.return_event_id=e.return_event_id AND r.entry_type='RETURN_ACCEPTED')) OR
 (e.event_type='RESTOCKED' AND NOT EXISTS(SELECT 1 FROM core.cost_entry c WHERE c.tenant_id=e.tenant_id AND c.return_event_id=e.return_event_id AND c.entry_type='RESTOCK'));

-- H19: 退货回库沿袭原SKU原成本实际地点
SELECT count(*)::bigint violations FROM core.return_event e JOIN core.shipment_item i ON i.tenant_id=e.tenant_id AND i.order_unit_id=e.order_unit_id
 JOIN core.inventory_lot old ON old.tenant_id=i.tenant_id AND old.lot_id=i.lot_id
 LEFT JOIN core.inventory_lot n ON n.tenant_id=e.tenant_id AND n.lot_id=e.restocked_lot_id
 WHERE e.event_type='RESTOCKED' AND (n.lot_id IS NULL OR n.parent_lot_id IS DISTINCT FROM i.lot_id OR n.sku_id<>i.sku_id OR n.site_id IS DISTINCT FROM e.site_id OR n.unit_cost_cent<>old.unit_cost_cent OR n.origin_type<>'RETURN');

-- H20: 调拨或退货新批次成本不重抽
SELECT count(*)::bigint violations FROM core.inventory_lot n LEFT JOIN core.inventory_lot p ON p.tenant_id=n.tenant_id AND p.lot_id=n.parent_lot_id
 WHERE n.origin_type IN ('TRANSFER','RETURN') AND (p.lot_id IS NULL OR p.sku_id<>n.sku_id OR p.unit_cost_cent<>n.unit_cost_cent);

-- H21: 库存每次原子提交后全部桶非负
WITH tx AS (SELECT tenant_id,site_id,sku_id,business_txn_id,min(event_at) at,min(event_seq) seq,
 sum(sellable_delta) s,sum(quarantine_delta) q,sum(damaged_delta) d,sum(reserved_delta) r,sum(in_transit_delta) t
 FROM core.inventory_movement GROUP BY tenant_id,site_id,sku_id,business_txn_id), b AS
 (SELECT *,sum(s) OVER w bs,sum(q) OVER w bq,sum(d) OVER w bd,sum(r) OVER w br,sum(t) OVER w bt
 FROM tx WINDOW w AS (PARTITION BY tenant_id,site_id,sku_id ORDER BY at,seq,business_txn_id ROWS UNBOUNDED PRECEDING))
 SELECT count(*)::bigint violations FROM b WHERE bs<0 OR bq<0 OR bd<0 OR br<0 OR bt<0 OR br>bs;

-- H22: 库存桶模板与业务动作一致
SELECT count(*)::bigint violations FROM core.inventory_movement WHERE NOT (
 (movement_type IN ('OPENING','RECEIPT','TRANSFER_IN','RTO_RECEIPT') AND sellable_delta>0 AND quarantine_delta=0 AND damaged_delta=0 AND reserved_delta=0 AND in_transit_delta=0) OR
 (movement_type='RESERVE' AND sellable_delta=0 AND reserved_delta>0 AND quarantine_delta=0 AND damaged_delta=0 AND in_transit_delta=0) OR
 (movement_type='RELEASE' AND sellable_delta=0 AND reserved_delta<0 AND quarantine_delta=0 AND damaged_delta=0 AND in_transit_delta=0) OR
 (movement_type='SHIP' AND sellable_delta=-1 AND reserved_delta=-1 AND quarantine_delta=0 AND damaged_delta=0 AND in_transit_delta=0) OR
 (movement_type='RETURN_RECEIVE' AND sellable_delta=0 AND quarantine_delta=1 AND reserved_delta=0 AND damaged_delta=0 AND in_transit_delta=0) OR
 (movement_type='RESTOCK' AND sellable_delta=1 AND quarantine_delta=-1 AND damaged_delta=0 AND reserved_delta=0 AND in_transit_delta=0) OR
 (movement_type='DAMAGE' AND sellable_delta=0 AND quarantine_delta=-1 AND damaged_delta=1 AND reserved_delta=0 AND in_transit_delta=0) OR
 (movement_type='SCRAP' AND sellable_delta=0 AND quarantine_delta=0 AND damaged_delta<0 AND reserved_delta=0 AND in_transit_delta=0) OR
 (movement_type='TRANSFER_OUT' AND sellable_delta<0 AND quarantine_delta=0 AND damaged_delta=0 AND reserved_delta=0 AND in_transit_delta=0) OR
 (movement_type='TRANSIT_IN' AND sellable_delta=0 AND quarantine_delta=0 AND damaged_delta=0 AND reserved_delta=0 AND in_transit_delta>0) OR
 (movement_type='TRANSIT_OUT' AND sellable_delta=0 AND quarantine_delta=0 AND damaged_delta=0 AND reserved_delta=0 AND in_transit_delta<0));

-- H23: 库存多态来源键存在且使用正确来源域
SELECT count(*)::bigint violations FROM core.inventory_movement m WHERE
 (source_kind='UNIT_EVENT' AND NOT EXISTS(SELECT 1 FROM core.order_unit_event e WHERE e.tenant_id=m.tenant_id AND e.unit_event_id=m.source_event_id AND e.order_unit_id=m.order_unit_id)) OR
 (source_kind='SHIPMENT_EVENT' AND NOT EXISTS(SELECT 1 FROM core.shipment_event e JOIN core.shipment_item i USING(tenant_id,shipment_id) WHERE e.tenant_id=m.tenant_id AND e.shipment_event_id=m.source_event_id AND i.order_unit_id=m.order_unit_id AND i.sku_id=m.sku_id AND i.from_site_id=m.site_id)) OR
 (source_kind='RETURN_EVENT' AND NOT EXISTS(SELECT 1 FROM core.return_event e WHERE e.tenant_id=m.tenant_id AND e.return_event_id=m.source_event_id AND e.order_unit_id=m.order_unit_id AND e.return_item_id=m.return_item_id AND e.site_id=m.site_id)) OR
 (source_kind='DOCUMENT_LINE' AND NOT EXISTS(SELECT 1 FROM core.inventory_document_line d WHERE d.tenant_id=m.tenant_id AND d.inventory_doc_line_id=m.source_event_id AND d.inventory_doc_line_id=m.inventory_doc_line_id AND d.sku_id=m.sku_id));

-- H24: 出库库存与履约单件原批次完全一致
SELECT count(*)::bigint violations FROM core.shipment_item i LEFT JOIN core.inventory_movement m
 ON m.tenant_id=i.tenant_id AND m.order_unit_id=i.order_unit_id AND m.movement_type='SHIP'
 WHERE m.movement_id IS NULL OR m.lot_id IS DISTINCT FROM i.lot_id OR m.site_id<>i.from_site_id OR m.sku_id<>i.sku_id OR m.event_at<>i.shipped_at;

-- H25: 价格有效期与下单价格快照一致
SELECT count(*)::bigint violations FROM core.order_line l JOIN core.order_header h USING(tenant_id,order_id)
 JOIN core.price_period p USING(tenant_id,price_id)
 LEFT JOIN core.channel_listing c ON c.tenant_id=l.tenant_id AND c.listing_id=l.listing_id
 WHERE h.ordered_at<p.valid_from OR h.ordered_at>=p.valid_to OR p.available_at>h.ordered_at OR l.list_unit_cent<>p.list_price_cent
 OR (c.listing_id IS NOT NULL AND (h.ordered_at<c.valid_from OR h.ordered_at>=c.valid_to OR c.available_at>h.ordered_at));

-- H26: 价格区间不得重叠
SELECT count(*)::bigint violations FROM core.price_period a JOIN core.price_period b
 ON a.tenant_id=b.tenant_id AND a.sku_id=b.sku_id AND a.channel_id=b.channel_id AND a.price_id<b.price_id
 WHERE a.valid_from<b.valid_to AND b.valid_from<a.valid_to;

-- H27: 会员下单快照没有未来绑定
SELECT count(*)::bigint violations FROM core.order_header h WHERE h.customer_id IS NOT NULL AND NOT EXISTS
 (SELECT 1 FROM core.customer_identity_link l JOIN core.customer c USING(tenant_id,customer_id)
 WHERE l.tenant_id=h.tenant_id AND l.identity_id=h.identity_id AND l.customer_id=h.customer_id
 AND l.linked_at<=h.ordered_at AND l.available_at<=h.ordered_at AND c.joined_at<=h.ordered_at AND c.available_at<=h.ordered_at);

-- H28: 平台渠道不伪造用户级行为
SELECT count(*)::bigint violations FROM core.web_session s JOIN core.channel c USING(tenant_id,channel_id)
 WHERE c.channel_type<>'OWNED' OR NOT c.has_user_events;

-- H29: 同源结算行为只能链接同渠道同身份订单
SELECT count(*)::bigint violations FROM core.behavior_event e JOIN core.web_session s USING(tenant_id,session_id)
 JOIN core.order_header h ON h.tenant_id=e.tenant_id AND h.order_id=e.order_id
 WHERE s.channel_id<>h.channel_id OR s.identity_id IS DISTINCT FROM h.identity_id OR e.event_at<>h.ordered_at;

-- H30: 单触点归因满足身份渠道窗口和可知证据
SELECT count(*)::bigint violations FROM core.order_attribution a JOIN core.order_header h USING(tenant_id,order_id)
 JOIN core.channel c ON c.tenant_id=h.tenant_id AND c.channel_id=h.channel_id
 LEFT JOIN core.web_session s ON s.tenant_id=a.tenant_id AND s.session_id=a.session_id
 WHERE (c.channel_type='PLATFORM' AND a.evidence_type<>'UNATTRIBUTABLE') OR
 (a.evidence_type='OWNED_TOUCH' AND (s.identity_id IS DISTINCT FROM h.identity_id OR s.channel_id<>h.channel_id OR s.campaign_id IS DISTINCT FROM a.campaign_id OR a.touch_at<>s.started_at OR a.touch_at>h.ordered_at OR a.touch_at<h.ordered_at-INTERVAL '7 days' OR s.available_at>h.ordered_at OR a.available_at<greatest(s.available_at,h.available_at)));

-- H31: 营业渠道与下单地点一致
SELECT count(*)::bigint violations FROM core.order_header h JOIN core.channel c USING(tenant_id,channel_id)
 LEFT JOIN core.site s ON s.tenant_id=h.tenant_id AND s.site_id=h.selling_site_id
 WHERE (c.channel_type='OFFLINE' AND (s.site_id IS NULL OR s.site_type='WAREHOUSE' OR h.region_id<>s.region_id OR h.order_date<s.opened_on OR h.order_date>=s.closed_on))
 OR (c.channel_type<>'OFFLINE' AND h.selling_site_id IS NOT NULL);

-- H32: 失败锁库不能残留成功预留
SELECT count(*)::bigint violations FROM core.order_status_event e WHERE e.status='CANCELLED' AND e.reason_code='STOCK_LOCK_FAILED' AND (
 NOT EXISTS(SELECT 1 FROM core.stock_allocation_attempt a WHERE a.tenant_id=e.tenant_id AND a.order_id=e.order_id AND a.outcome='INSUFFICIENT') OR
 EXISTS(SELECT 1 FROM core.order_unit u JOIN core.inventory_movement m USING(tenant_id,order_unit_id) WHERE u.tenant_id=e.tenant_id AND u.order_id=e.order_id AND m.movement_type='RESERVE'));

-- H33: 未交付退回原仓不生成售后收入或成本冲回
SELECT count(*)::bigint violations FROM core.shipment_event e JOIN core.shipment_item i USING(tenant_id,shipment_id)
 WHERE e.event_type='RETURNED_TO_ORIGIN' AND (
 EXISTS(SELECT 1 FROM core.revenue_entry r WHERE r.tenant_id=i.tenant_id AND r.order_unit_id=i.order_unit_id) OR
 EXISTS(SELECT 1 FROM core.cost_entry c WHERE c.tenant_id=i.tenant_id AND c.order_unit_id=i.order_unit_id));

-- H34: 快照的业务日末与知识截止边界正确
SELECT count(*)::bigint violations FROM core.inventory_snapshot
 WHERE as_of<((snapshot_date+1)::timestamp AT TIME ZONE 'Asia/Shanghai') OR available_at<as_of;

-- H35: 费用冲回引用正费用且累计不得超过原金额
SELECT count(*)::bigint violations FROM core.order_fee f JOIN
 (SELECT tenant_id,reversal_of_fee_id,min(fee_type) min_type,max(fee_type) max_type,-sum(amount_cent) reversal
 FROM core.order_fee WHERE reversal_of_fee_id IS NOT NULL GROUP BY tenant_id,reversal_of_fee_id) r
 ON r.tenant_id=f.tenant_id AND r.reversal_of_fee_id=f.fee_id
 WHERE f.amount_cent<=0 OR r.reversal>f.amount_cent OR r.min_type<>f.fee_type OR r.max_type<>f.fee_type;

-- H36: 费用发生来源属于本单且不晚于确认时点
SELECT count(*)::bigint violations FROM core.order_fee f WHERE
 (f.source_event_kind='PAYMENT' AND NOT EXISTS(SELECT 1 FROM core.payment p WHERE p.tenant_id=f.tenant_id AND p.payment_id=f.source_event_id AND p.order_id=f.order_id AND p.status='SUCCEEDED' AND p.attempted_at<=f.recognized_at AND p.available_at<=f.available_at)) OR
 (f.source_event_kind='SHIPMENT' AND NOT EXISTS(SELECT 1 FROM core.shipment_event e WHERE e.tenant_id=f.tenant_id AND e.shipment_event_id=f.source_event_id AND e.order_id=f.order_id AND e.event_at<=f.recognized_at AND e.available_at<=f.available_at)) OR
 (f.source_event_kind='RETURN' AND NOT EXISTS(SELECT 1 FROM core.return_event e JOIN core.return_item i USING(tenant_id,return_item_id) WHERE e.tenant_id=f.tenant_id AND e.return_event_id=f.source_event_id AND i.order_id=f.order_id AND e.event_at<=f.recognized_at AND e.available_at<=f.available_at)) OR
 (f.source_event_kind='REFUND' AND NOT EXISTS(SELECT 1 FROM core.refund r WHERE r.tenant_id=f.tenant_id AND r.refund_id=f.source_event_id AND r.order_id=f.order_id AND r.status='SUCCEEDED' AND r.attempted_at<=f.recognized_at AND r.available_at<=f.available_at));

-- B01: core.channel_listing 采集到达一致
SELECT count(*)::bigint violations FROM core.channel_listing a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B02: core.assortment 采集到达一致
SELECT count(*)::bigint violations FROM core.assortment a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B03: core.price_period 采集到达一致
SELECT count(*)::bigint violations FROM core.price_period a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B04: core.cost_period 采集到达一致
SELECT count(*)::bigint violations FROM core.cost_period a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B05: core.customer 采集到达一致
SELECT count(*)::bigint violations FROM core.customer a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B06: core.customer_identity 采集到达一致
SELECT count(*)::bigint violations FROM core.customer_identity a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B07: core.campaign 采集到达一致
SELECT count(*)::bigint violations FROM core.campaign a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B08: core.promotion 采集到达一致
SELECT count(*)::bigint violations FROM core.promotion a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B09: core.order_header 采集到达一致
SELECT count(*)::bigint violations FROM core.order_header a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B10: core.order_line 采集到达一致
SELECT count(*)::bigint violations FROM core.order_line a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B11: core.order_unit 采集到达一致
SELECT count(*)::bigint violations FROM core.order_unit a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B12: core.order_status_event 采集到达一致
SELECT count(*)::bigint violations FROM core.order_status_event a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B13: core.discount_allocation 采集到达一致
SELECT count(*)::bigint violations FROM core.discount_allocation a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B14: core.payment 采集到达一致
SELECT count(*)::bigint violations FROM core.payment a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B15: core.refund 采集到达一致
SELECT count(*)::bigint violations FROM core.refund a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B16: core.refund_allocation 采集到达一致
SELECT count(*)::bigint violations FROM core.refund_allocation a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B17: core.inventory_lot 采集到达一致
SELECT count(*)::bigint violations FROM core.inventory_lot a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B18: core.shipment 采集到达一致
SELECT count(*)::bigint violations FROM core.shipment a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B19: core.shipment_item 采集到达一致
SELECT count(*)::bigint violations FROM core.shipment_item a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B20: core.shipment_event 采集到达一致
SELECT count(*)::bigint violations FROM core.shipment_event a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B21: core.return_header 采集到达一致
SELECT count(*)::bigint violations FROM core.return_header a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B22: core.return_item 采集到达一致
SELECT count(*)::bigint violations FROM core.return_item a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B23: core.return_event 采集到达一致
SELECT count(*)::bigint violations FROM core.return_event a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B24: core.inventory_document 采集到达一致
SELECT count(*)::bigint violations FROM core.inventory_document a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B25: core.inventory_document_line 采集到达一致
SELECT count(*)::bigint violations FROM core.inventory_document_line a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B26: core.inventory_movement 采集到达一致
SELECT count(*)::bigint violations FROM core.inventory_movement a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B27: core.inventory_snapshot 采集到达一致
SELECT count(*)::bigint violations FROM core.inventory_snapshot a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B28: core.revenue_entry 采集到达一致
SELECT count(*)::bigint violations FROM core.revenue_entry a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B29: core.cost_entry 采集到达一致
SELECT count(*)::bigint violations FROM core.cost_entry a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B30: core.order_fee 采集到达一致
SELECT count(*)::bigint violations FROM core.order_fee a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B31: core.order_unit_event 采集到达一致
SELECT count(*)::bigint violations FROM core.order_unit_event a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B32: core.web_session 采集到达一致
SELECT count(*)::bigint violations FROM core.web_session a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B33: core.behavior_event 采集到达一致
SELECT count(*)::bigint violations FROM core.behavior_event a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B34: core.campaign_daily 采集到达一致
SELECT count(*)::bigint violations FROM core.campaign_daily a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B35: core.channel_product_daily 采集到达一致
SELECT count(*)::bigint violations FROM core.channel_product_daily a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B36: core.store_traffic_daily 采集到达一致
SELECT count(*)::bigint violations FROM core.store_traffic_daily a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B37: core.order_attribution 采集到达一致
SELECT count(*)::bigint violations FROM core.order_attribution a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B38: core.target_monthly 采集到达一致
SELECT count(*)::bigint violations FROM core.target_monthly a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B39: core.customer_identity_link 采集到达一致
SELECT count(*)::bigint violations FROM core.customer_identity_link a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B40: core.stock_allocation_attempt 采集到达一致
SELECT count(*)::bigint violations FROM core.stock_allocation_attempt a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';

-- B41: core.inventory_valuation_snapshot 采集到达一致
SELECT count(*)::bigint violations FROM core.inventory_valuation_snapshot a JOIN ops.ingestion_batch b
 ON b.tenant_id=a.tenant_id AND b.batch_id=a.load_batch_id
 WHERE a.available_at<b.received_at OR b.status='FAILED';
