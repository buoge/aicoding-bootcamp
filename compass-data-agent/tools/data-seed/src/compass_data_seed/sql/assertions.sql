-- Each query returns a violation count. These queries derive truth from independent facts.
-- name: order_line_amounts
SELECT count(*) FROM core.order_header h LEFT JOIN (SELECT tenant_id,order_id,sum(gross_cent) gross,sum(discount_cent) discount,sum(net_cent) net FROM core.order_line GROUP BY 1,2) l USING(tenant_id,order_id) WHERE (h.gross_cent,h.discount_cent,h.payable_cent) IS DISTINCT FROM (l.gross,l.discount,l.net);
-- name: line_unit_amounts
SELECT count(*) FROM core.order_line l LEFT JOIN (SELECT tenant_id,order_line_id,count(*) qty,sum(gross_cent) gross,sum(discount_cent) discount,sum(net_cent) net FROM core.order_unit GROUP BY 1,2) u USING(tenant_id,order_line_id) WHERE (l.quantity,l.gross_cent,l.discount_cent,l.net_cent) IS DISTINCT FROM (u.qty,u.gross,u.discount,u.net);
-- name: discount_conservation
SELECT count(*) FROM core.order_unit u LEFT JOIN (SELECT tenant_id,order_unit_id,sum(discount_cent) discount FROM core.discount_allocation GROUP BY 1,2) d USING(tenant_id,order_unit_id) WHERE u.discount_cent<>coalesce(d.discount,0);
-- name: order_quotas
SELECT count(*) FROM core.tenant t LEFT JOIN (SELECT tenant_id,count(*) n FROM core.order_header GROUP BY 1) o USING(tenant_id) WHERE t.order_quota IS DISTINCT FROM o.n;
-- name: payment_overcollection
SELECT count(*) FROM (SELECT tenant_id,order_id,sum(amount_cent) amount FROM core.payment WHERE status='SUCCEEDED' GROUP BY 1,2) p JOIN core.order_header o USING(tenant_id,order_id) WHERE p.amount>o.payable_cent;
-- name: refund_cash_limit
SELECT count(*) FROM (SELECT tenant_id,payment_id,sum(amount_cent) amount FROM core.refund WHERE status='SUCCEEDED' GROUP BY 1,2) r JOIN core.payment p USING(tenant_id,payment_id) WHERE p.status<>'SUCCEEDED' OR r.amount>p.amount_cent;
-- name: refund_unit_allocations
SELECT count(*) FROM core.refund r LEFT JOIN (SELECT tenant_id,refund_id,sum(amount_cent) amount FROM core.refund_allocation GROUP BY 1,2) a USING(tenant_id,refund_id) WHERE r.amount_cent IS DISTINCT FROM a.amount;
-- name: refund_units_limit
SELECT count(*) FROM (SELECT tenant_id,order_unit_id,sum(amount_cent) amount FROM core.refund_allocation GROUP BY 1,2) r JOIN core.order_unit u USING(tenant_id,order_unit_id) WHERE r.amount>u.net_cent;
-- name: refund_basis
SELECT count(*) FROM core.refund_allocation a JOIN core.refund r USING(tenant_id,refund_id) WHERE NOT EXISTS(SELECT 1 FROM core.return_event e WHERE e.tenant_id=a.tenant_id AND e.order_unit_id=a.order_unit_id AND e.event_type='ACCEPTED' AND e.event_at<=r.attempted_at) AND NOT EXISTS(SELECT 1 FROM core.order_unit_event e WHERE e.tenant_id=a.tenant_id AND e.order_unit_id=a.order_unit_id AND e.event_type='CANCELLED' AND e.event_at<=r.attempted_at);
-- name: revenue_amount_and_event
SELECT count(*) FROM core.revenue_entry r JOIN core.order_unit u USING(tenant_id,order_unit_id) LEFT JOIN core.shipment_event s ON s.tenant_id=r.tenant_id AND s.shipment_event_id=r.shipment_event_id LEFT JOIN core.return_event t ON t.tenant_id=r.tenant_id AND t.return_event_id=r.return_event_id WHERE r.amount_cent<>u.net_cent*r.quantity_delta OR (r.entry_type='DELIVERY' AND (s.event_type<>'DELIVERED' OR s.event_at<>r.recognized_at OR s.available_at>r.available_at)) OR (r.entry_type='RETURN_ACCEPTED' AND (t.event_type<>'ACCEPTED' OR t.event_at<>r.recognized_at OR t.available_at>r.available_at));
-- name: cost_amount_and_event
SELECT count(*) FROM core.cost_entry c JOIN core.inventory_lot l USING(tenant_id,lot_id) LEFT JOIN core.shipment_event s ON s.tenant_id=c.tenant_id AND s.shipment_event_id=c.shipment_event_id LEFT JOIN core.return_event t ON t.tenant_id=c.tenant_id AND t.return_event_id=c.return_event_id WHERE c.amount_cent<>l.unit_cost_cent*(CASE WHEN c.entry_type='DELIVERY' THEN 1 ELSE -1 END) OR (c.entry_type='DELIVERY' AND (s.event_type<>'DELIVERED' OR s.event_at<>c.recognized_at)) OR (c.entry_type='RESTOCK' AND (t.event_type<>'RESTOCKED' OR t.event_at<>c.recognized_at));
-- name: complete_delivery_accounting
SELECT count(*) FROM core.order_unit_event e WHERE e.event_type='DELIVERED' AND (NOT EXISTS(SELECT 1 FROM core.revenue_entry r WHERE r.tenant_id=e.tenant_id AND r.order_unit_id=e.order_unit_id AND r.entry_type='DELIVERY') OR NOT EXISTS(SELECT 1 FROM core.cost_entry c WHERE c.tenant_id=e.tenant_id AND c.order_unit_id=e.order_unit_id AND c.entry_type='DELIVERY'));
-- name: inventory_prefix_nonnegative
SELECT count(*) FROM (SELECT sum(sellable_delta) OVER w s,sum(quarantine_delta) OVER w q,sum(reserved_delta) OVER w r,sum(in_transit_delta) OVER w t,sum(damaged_delta) OVER w d FROM core.inventory_movement WINDOW w AS (PARTITION BY tenant_id,site_id,sku_id ORDER BY event_at,event_seq ROWS UNBOUNDED PRECEDING)) x WHERE least(s,q,r,t,d)<0 OR r>s;
-- name: lot_prefix_nonnegative
SELECT count(*) FROM (SELECT sum(sellable_delta) OVER w s,sum(reserved_delta) OVER w r FROM core.inventory_movement WHERE lot_id IS NOT NULL WINDOW w AS (PARTITION BY tenant_id,lot_id ORDER BY event_at,event_seq ROWS UNBOUNDED PRECEDING)) x WHERE s<0 OR r<0 OR r>s;
-- name: movement_chronology
SELECT count(*) FROM (SELECT event_at,lag(event_at) OVER(PARTITION BY tenant_id ORDER BY event_seq) prev FROM core.inventory_movement) x WHERE event_at<prev;
-- name: transfer_closure
SELECT count(*) FROM core.inventory_document d JOIN core.inventory_document_line l USING(tenant_id,inventory_doc_id) LEFT JOIN (SELECT tenant_id,inventory_doc_line_id,sum(sellable_delta) s,sum(in_transit_delta) t,count(*) n FROM core.inventory_movement GROUP BY 1,2) m USING(tenant_id,inventory_doc_line_id) WHERE d.doc_type='TRANSFER' AND (m.s<>0 OR m.t<>0 OR m.n<>3);
-- name: inherited_lot_cost
SELECT count(*) FROM core.inventory_lot l JOIN core.inventory_lot p ON p.tenant_id=l.tenant_id AND p.lot_id=l.parent_lot_id WHERE l.unit_cost_cent<>p.unit_cost_cent OR l.received_at<p.received_at;
-- name: historic_identity
SELECT count(*) FROM core.order_header o LEFT JOIN core.customer_identity_link l ON l.tenant_id=o.tenant_id AND l.identity_id=o.identity_id WHERE o.customer_id IS NOT NULL AND (l.customer_id IS DISTINCT FROM o.customer_id OR l.linked_at>o.ordered_at OR l.available_at>o.available_at);
-- name: price_validity
SELECT count(*) FROM core.order_line l JOIN core.order_header o USING(tenant_id,order_id) JOIN core.price_period p USING(tenant_id,price_id) WHERE o.ordered_at<p.valid_from OR o.ordered_at>=p.valid_to OR l.list_unit_cent<>p.list_price_cent OR p.available_at>o.ordered_at;
-- name: tail_has_no_new_orders
SELECT count(*) FROM core.order_header o CROSS JOIN ops.dataset_release r WHERE o.order_date<r.order_start OR o.order_date>=r.order_end_exclusive;
-- name: paid_before_shipping
SELECT count(*) FROM core.shipment_item s JOIN core.order_header o USING(tenant_id,order_id) WHERE coalesce((SELECT sum(p.amount_cent) FROM core.payment p WHERE p.tenant_id=s.tenant_id AND p.order_id=s.order_id AND p.status='SUCCEEDED' AND p.attempted_at<=s.shipped_at),0)<>o.payable_cent;
-- name: payment_before_deadline
SELECT count(*) FROM core.payment p JOIN core.order_header o USING(tenant_id,order_id) WHERE p.attempted_at<o.ordered_at OR p.attempted_at>=o.payment_deadline;
-- name: owned_channel_tracking
SELECT count(*) FROM core.web_session s JOIN core.channel c USING(tenant_id,channel_id) WHERE NOT c.has_user_events OR c.channel_type<>'OWNED';
-- name: checkout_order_relation
SELECT count(*) FROM core.behavior_event b JOIN core.web_session s USING(tenant_id,session_id) JOIN core.order_header o USING(tenant_id,order_id) WHERE b.event_type='CHECKOUT_SUBMITTED' AND (s.channel_id<>o.channel_id OR s.identity_id IS DISTINCT FROM o.identity_id OR b.event_at<>o.ordered_at OR b.available_at<o.available_at);
-- name: experiment_assignment_window
SELECT count(*) FROM core.experiment_assignment a JOIN core.experiment_definition d USING(tenant_id,experiment_id) JOIN core.customer c ON c.tenant_id=a.tenant_id AND c.customer_id=a.unit_id WHERE a.assigned_at<d.starts_at OR a.assigned_at>=d.ends_at OR c.available_at>a.assigned_at;
-- name: experiment_exposure_causality
SELECT count(*) FROM core.experiment_exposure e JOIN core.experiment_assignment a USING(tenant_id,experiment_id,unit_id) WHERE e.exposed_at<a.assigned_at OR e.available_at<a.available_at;
-- name: experiment_disjoint_members
SELECT count(*) FROM (SELECT tenant_id,unit_id FROM core.experiment_assignment GROUP BY 1,2 HAVING count(*)>1) x;
-- name: attribution_observability
SELECT count(*) FROM core.order_attribution a JOIN core.order_header o USING(tenant_id,order_id) LEFT JOIN core.web_session s USING(tenant_id,session_id) WHERE a.evidence_type='OWNED_TOUCH' AND (s.identity_id<>o.identity_id OR s.channel_id<>o.channel_id OR a.touch_at>o.ordered_at OR a.touch_at<o.ordered_at-interval '7 days');
-- name: report_nonzero_coverage
SELECT count(*) FROM core.order_line l JOIN core.order_header o USING(tenant_id,order_id) WHERE NOT EXISTS(SELECT 1 FROM core.channel_product_daily d WHERE d.tenant_id=o.tenant_id AND d.report_date=o.order_date AND d.channel_id=o.channel_id AND d.sku_id=l.sku_id AND d.region_id=o.region_id);
-- name: report_latest_paid_conservation
SELECT count(*) FROM (SELECT tenant_id,sum(paid_amount_cent) amount FROM (SELECT DISTINCT ON (tenant_id,report_date,channel_id,sku_id,region_id) * FROM core.channel_product_daily ORDER BY tenant_id,report_date,channel_id,sku_id,region_id,report_version DESC) d GROUP BY 1) d JOIN (SELECT tenant_id,sum(amount_cent) amount FROM core.payment WHERE status='SUCCEEDED' GROUP BY 1) p USING(tenant_id) WHERE d.amount<>p.amount;
-- name: single_release
SELECT CASE WHEN (SELECT count(*) FROM ops.dataset_release)=1 THEN 0 ELSE 1 END;
