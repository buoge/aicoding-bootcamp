-- PostgreSQL 17 reference metrics. Run after 01_schema.sql and 02_security.sql.
-- Every function is STABLE, SECURITY INVOKER, and read-only.
-- The caller's actual session_user must be mapped in sec.principal.
-- The trusted broker, not the Agent, supplies the explicit time parameters.
-- These functions do not implement a complete AsOf broker or snapshot schema.
-- All knowledge cutoffs are EXCLUSIVE: available_at < knowledge_cutoff.

BEGIN;

CREATE SCHEMA IF NOT EXISTS mart;
REVOKE ALL ON SCHEMA mart FROM PUBLIC, contoso_business_ro, contoso_customer_full_ro;
GRANT USAGE ON SCHEMA mart TO contoso_business_ro;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mart
    FROM PUBLIC, contoso_business_ro, contoso_customer_full_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA mart REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE OR REPLACE FUNCTION mart.sales_daily(
    business_start timestamptz,
    business_end timestamptz,
    knowledge_cutoff timestamptz
)
RETURNS TABLE (
    business_date date,
    tenant_id smallint,
    channel_id bigint,
    region_id bigint,
    delivery_revenue_cent bigint,
    return_revenue_cent bigint,
    net_sales_cent bigint,
    cogs_cent bigint,
    gross_profit_cent bigint,
    operating_fees_cent bigint,
    observed_ad_spend_cent bigint,
    ad_spend_cent bigint,
    contribution_cent bigint,
    cost_visible boolean,
    ads_complete boolean,
    expected_ad_reports bigint,
    visible_ad_reports bigint
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, core, sec
AS $function$
BEGIN
    IF NOT sec.is_authenticated() THEN
        RAISE EXCEPTION 'No business principal for authenticated session_user' USING ERRCODE = '42501';
    END IF;
    IF business_start IS NULL OR business_end IS NULL OR knowledge_cutoff IS NULL
       OR NOT isfinite(business_start) OR NOT isfinite(business_end)
       OR NOT isfinite(knowledge_cutoff) OR business_start >= business_end THEN
        RAISE EXCEPTION 'Require finite non-null start < end and knowledge cutoff' USING ERRCODE = '22023';
    END IF;
    IF (business_start AT TIME ZONE 'Asia/Shanghai')::time <> time '00:00:00'
       OR (business_end AT TIME ZONE 'Asia/Shanghai')::time <> time '00:00:00' THEN
        RAISE EXCEPTION 'sales_daily requires Asia/Shanghai midnight day boundaries' USING ERRCODE = '22023';
    END IF;
    IF knowledge_cutoff < business_end THEN
        RAISE EXCEPTION 'sales_daily requires knowledge_cutoff >= business_end' USING ERRCODE = '22023';
    END IF;
    -- The v1 reporting universe is observable and enumerable: each published
    -- active campaign has ONE target channel and daily reports for EVERY region
    -- in that tenant (including explicit zero reports for non-targeted regions).
    IF EXISTS (
        SELECT 1 FROM core.campaign c
        WHERE c.available_at < knowledge_cutoff
          AND c.starts_at < business_end AND c.ends_at > business_start
          AND c.target_channel_id IS NULL
    ) THEN
        RAISE EXCEPTION 'Active campaign without target_channel_id: expected daily ad-report grain is undefined'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH days AS (
        SELECT d.local_day::date AS business_date,
               d.local_day AT TIME ZONE 'Asia/Shanghai' AS day_start,
               (d.local_day + interval '1 day') AT TIME ZONE 'Asia/Shanghai' AS day_end
        FROM generate_series(
            (business_start AT TIME ZONE 'Asia/Shanghai')::timestamp,
            (business_end AT TIME ZONE 'Asia/Shanghai')::timestamp - interval '1 day',
            interval '1 day'
        ) AS d(local_day)
    ), revenue AS (
        SELECT (r.recognized_at AT TIME ZONE 'Asia/Shanghai')::date AS business_date,
               r.tenant_id, h.channel_id, h.region_id,
               COALESCE(sum(r.amount_cent) FILTER (WHERE r.entry_type = 'DELIVERY'), 0)::bigint AS delivery_cent,
               COALESCE(sum(r.amount_cent) FILTER (WHERE r.entry_type = 'RETURN_ACCEPTED'), 0)::bigint AS return_cent,
               sum(r.amount_cent)::bigint AS net_cent
        FROM core.revenue_entry r
        JOIN core.order_unit u
          ON u.tenant_id = r.tenant_id AND u.order_unit_id = r.order_unit_id
         AND u.region_id = r.region_id AND u.available_at < knowledge_cutoff
        JOIN core.order_header h
          ON h.tenant_id = u.tenant_id AND h.order_id = u.order_id
         AND h.region_id = u.region_id
         AND h.available_at < knowledge_cutoff AND h.ordered_at < business_end
        WHERE r.recognized_at >= business_start AND r.recognized_at < business_end
          AND r.available_at < knowledge_cutoff
        GROUP BY 1, 2, 3, 4
    ), costs AS (
        SELECT (c.recognized_at AT TIME ZONE 'Asia/Shanghai')::date AS business_date,
               c.tenant_id, h.channel_id, h.region_id,
               sum(c.amount_cent)::bigint AS cogs_cent
        FROM core.cost_entry c
        JOIN core.order_unit u
          ON u.tenant_id = c.tenant_id AND u.order_unit_id = c.order_unit_id
         AND u.region_id = c.region_id AND u.available_at < knowledge_cutoff
        JOIN core.order_header h
          ON h.tenant_id = u.tenant_id AND h.order_id = u.order_id
         AND h.region_id = u.region_id
         AND h.available_at < knowledge_cutoff AND h.ordered_at < business_end
        WHERE c.recognized_at >= business_start AND c.recognized_at < business_end
          AND c.available_at < knowledge_cutoff
        GROUP BY 1, 2, 3, 4
    ), fees AS (
        SELECT (f.recognized_at AT TIME ZONE 'Asia/Shanghai')::date AS business_date,
               f.tenant_id, h.channel_id, h.region_id,
               sum(f.amount_cent)::bigint AS fees_cent
        FROM core.order_fee f
        JOIN core.order_header h
          ON h.tenant_id = f.tenant_id AND h.order_id = f.order_id
         AND h.region_id = f.region_id
         AND h.available_at < knowledge_cutoff AND h.ordered_at < business_end
        LEFT JOIN core.order_unit u
          ON u.tenant_id = f.tenant_id AND u.order_unit_id = f.order_unit_id
         AND u.order_id = f.order_id AND u.region_id = f.region_id
         AND u.available_at < knowledge_cutoff
        WHERE f.recognized_at >= business_start AND f.recognized_at < business_end
          AND f.available_at < knowledge_cutoff
          AND (f.order_unit_id IS NULL OR u.order_unit_id IS NOT NULL)
        GROUP BY 1, 2, 3, 4
    ), expected_ads AS (
        SELECT d.business_date, c.tenant_id, c.target_channel_id AS channel_id,
               g.geo_id AS region_id, c.campaign_id
        FROM days d
        JOIN core.campaign c
          ON c.starts_at < d.day_end AND c.ends_at > d.day_start
         AND c.available_at < knowledge_cutoff
        JOIN core.geo_area g
          ON g.tenant_id = c.tenant_id AND g.geo_level = 'REGION'
         AND sec.allowed_region(g.tenant_id, g.geo_id)
    ), expected_ads_by_day AS (
        SELECT e.business_date, e.tenant_id, e.channel_id, e.region_id,
               count(*)::bigint AS expected_reports
        FROM expected_ads e
        GROUP BY 1, 2, 3, 4
    ), ads_ranked AS (
        SELECT a.*,
               row_number() OVER (
                   PARTITION BY a.tenant_id, a.report_date, a.campaign_id, a.channel_id, a.region_id
                   ORDER BY a.report_version DESC, a.source_updated_at DESC, a.available_at DESC
               ) AS visible_rank
        FROM core.campaign_daily a
        WHERE a.report_date >= (business_start AT TIME ZONE 'Asia/Shanghai')::date
          AND a.report_date < (business_end AT TIME ZONE 'Asia/Shanghai')::date
          AND a.source_updated_at < knowledge_cutoff
          AND a.available_at < knowledge_cutoff
    ), ads AS (
        SELECT a.report_date AS business_date, a.tenant_id, a.channel_id, a.region_id,
               sum(a.spend_cent)::bigint AS observed_spend_cent,
               count(*)::bigint AS visible_reports,
               count(*) FILTER (WHERE e.campaign_id IS NOT NULL)::bigint AS matched_reports,
               count(*) FILTER (WHERE e.campaign_id IS NULL)::bigint AS unexpected_reports
        FROM ads_ranked a
        LEFT JOIN expected_ads e
          ON e.tenant_id = a.tenant_id AND e.business_date = a.report_date
         AND e.channel_id = a.channel_id AND e.region_id = a.region_id
         AND e.campaign_id = a.campaign_id
        WHERE a.visible_rank = 1
        GROUP BY 1, 2, 3, 4
    ), keys AS (
        SELECT r.business_date, r.tenant_id, r.channel_id, r.region_id FROM revenue r
        UNION SELECT c.business_date, c.tenant_id, c.channel_id, c.region_id FROM costs c
        UNION SELECT f.business_date, f.tenant_id, f.channel_id, f.region_id FROM fees f
        UNION SELECT a.business_date, a.tenant_id, a.channel_id, a.region_id FROM ads a
        UNION SELECT e.business_date, e.tenant_id, e.channel_id, e.region_id FROM expected_ads_by_day e
    ), combined AS (
        SELECT k.business_date, k.tenant_id, k.channel_id, k.region_id,
               COALESCE(r.delivery_cent, 0)::bigint AS delivery_cent,
               COALESCE(r.return_cent, 0)::bigint AS return_cent,
               COALESCE(r.net_cent, 0)::bigint AS net_cent,
               COALESCE(c.cogs_cent, 0)::bigint AS known_cogs_cent,
               COALESCE(f.fees_cent, 0)::bigint AS known_fees_cent,
               COALESCE(a.observed_spend_cent, 0)::bigint AS observed_spend_cent,
               sec.allowed_cost(k.tenant_id) AS cost_visible,
               (
                   COALESCE(e.expected_reports, 0) = COALESCE(a.matched_reports, 0)
                   AND COALESCE(a.unexpected_reports, 0) = 0
               ) AS ads_complete,
               COALESCE(e.expected_reports, 0)::bigint AS expected_reports,
               COALESCE(a.visible_reports, 0)::bigint AS visible_reports
        FROM keys k
        LEFT JOIN revenue r USING (business_date, tenant_id, channel_id, region_id)
        LEFT JOIN costs c USING (business_date, tenant_id, channel_id, region_id)
        LEFT JOIN fees f USING (business_date, tenant_id, channel_id, region_id)
        LEFT JOIN ads a USING (business_date, tenant_id, channel_id, region_id)
        LEFT JOIN expected_ads_by_day e USING (business_date, tenant_id, channel_id, region_id)
    )
    SELECT x.business_date, x.tenant_id, x.channel_id, x.region_id,
           x.delivery_cent, x.return_cent, x.net_cent,
           CASE WHEN x.cost_visible THEN x.known_cogs_cent ELSE NULL::bigint END,
           CASE WHEN x.cost_visible THEN x.net_cent - x.known_cogs_cent ELSE NULL::bigint END,
           CASE WHEN x.cost_visible THEN x.known_fees_cent ELSE NULL::bigint END,
           x.observed_spend_cent,
           CASE WHEN x.ads_complete THEN x.observed_spend_cent ELSE NULL::bigint END,
           CASE WHEN x.cost_visible AND x.ads_complete
                THEN x.net_cent - x.known_cogs_cent - x.known_fees_cent - x.observed_spend_cent
                ELSE NULL::bigint END,
           x.cost_visible, x.ads_complete, x.expected_reports, x.visible_reports
    FROM combined x
    ORDER BY x.business_date, x.tenant_id, x.channel_id, x.region_id;
END;
$function$;

COMMENT ON FUNCTION mart.sales_daily(timestamptz, timestamptz, timestamptz) IS
    'Shanghai full-day recognized sales, COGS, fees, and versioned ads by tenant/channel/sales region. Exclusive knowledge cutoff. Missing ad reports make ad_spend/contribution NULL; cost denial makes cost/profit fields NULL. Requires a trusted broker to bind parameters.';

CREATE OR REPLACE FUNCTION mart.cash_daily(
    business_start timestamptz,
    business_end timestamptz,
    knowledge_cutoff timestamptz
)
RETURNS TABLE (
    business_date date,
    tenant_id smallint,
    channel_id bigint,
    region_id bigint,
    paid_cash_cent bigint,
    refunded_cash_cent bigint,
    net_cash_cent bigint,
    successful_payment_attempts bigint,
    failed_payment_attempts bigint,
    successful_refund_attempts bigint,
    failed_refund_attempts bigint
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, core, sec
AS $function$
BEGIN
    IF NOT sec.is_authenticated() THEN
        RAISE EXCEPTION 'No business principal for authenticated session_user' USING ERRCODE = '42501';
    END IF;
    IF business_start IS NULL OR business_end IS NULL OR knowledge_cutoff IS NULL
       OR NOT isfinite(business_start) OR NOT isfinite(business_end)
       OR NOT isfinite(knowledge_cutoff) OR business_start >= business_end THEN
        RAISE EXCEPTION 'Require finite non-null start < end and knowledge cutoff' USING ERRCODE = '22023';
    END IF;
    IF (business_start AT TIME ZONE 'Asia/Shanghai')::time <> time '00:00:00'
       OR (business_end AT TIME ZONE 'Asia/Shanghai')::time <> time '00:00:00' THEN
        RAISE EXCEPTION 'cash_daily requires Asia/Shanghai midnight day boundaries' USING ERRCODE = '22023';
    END IF;
    IF knowledge_cutoff < business_end THEN
        RAISE EXCEPTION 'cash_daily requires knowledge_cutoff >= business_end' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH payments AS (
        SELECT (p.attempted_at AT TIME ZONE 'Asia/Shanghai')::date AS business_date,
               p.tenant_id, h.channel_id, h.region_id,
               COALESCE(sum(p.amount_cent) FILTER (WHERE p.status = 'SUCCEEDED'), 0)::bigint AS paid_cent,
               count(*) FILTER (WHERE p.status = 'SUCCEEDED')::bigint AS succeeded_count,
               count(*) FILTER (WHERE p.status = 'FAILED')::bigint AS failed_count
        FROM core.payment p
        JOIN core.order_header h
          ON h.tenant_id = p.tenant_id AND h.order_id = p.order_id AND h.region_id = p.region_id
         AND h.available_at < knowledge_cutoff AND h.ordered_at < business_end
        WHERE p.attempted_at >= business_start AND p.attempted_at < business_end
          AND p.available_at < knowledge_cutoff
        GROUP BY 1, 2, 3, 4
    ), refunds AS (
        SELECT (r.attempted_at AT TIME ZONE 'Asia/Shanghai')::date AS business_date,
               r.tenant_id, h.channel_id, h.region_id,
               COALESCE(sum(r.amount_cent) FILTER (WHERE r.status = 'SUCCEEDED'), 0)::bigint AS refunded_cent,
               count(*) FILTER (WHERE r.status = 'SUCCEEDED')::bigint AS succeeded_count,
               count(*) FILTER (WHERE r.status = 'FAILED')::bigint AS failed_count
        FROM core.refund r
        JOIN core.payment p
          ON p.tenant_id = r.tenant_id AND p.payment_id = r.payment_id
         AND p.order_id = r.order_id AND p.region_id = r.region_id
         AND p.status = 'SUCCEEDED' AND p.available_at < knowledge_cutoff
         AND p.attempted_at <= r.attempted_at
        JOIN core.order_header h
          ON h.tenant_id = r.tenant_id AND h.order_id = r.order_id AND h.region_id = r.region_id
         AND h.available_at < knowledge_cutoff AND h.ordered_at < business_end
        WHERE r.attempted_at >= business_start AND r.attempted_at < business_end
          AND r.available_at < knowledge_cutoff
        GROUP BY 1, 2, 3, 4
    ), keys AS (
        SELECT p.business_date, p.tenant_id, p.channel_id, p.region_id FROM payments p
        UNION SELECT r.business_date, r.tenant_id, r.channel_id, r.region_id FROM refunds r
    )
    SELECT k.business_date, k.tenant_id, k.channel_id, k.region_id,
           COALESCE(p.paid_cent, 0)::bigint,
           COALESCE(r.refunded_cent, 0)::bigint,
           (COALESCE(p.paid_cent, 0) - COALESCE(r.refunded_cent, 0))::bigint,
           COALESCE(p.succeeded_count, 0)::bigint,
           COALESCE(p.failed_count, 0)::bigint,
           COALESCE(r.succeeded_count, 0)::bigint,
           COALESCE(r.failed_count, 0)::bigint
    FROM keys k
    LEFT JOIN payments p USING (business_date, tenant_id, channel_id, region_id)
    LEFT JOIN refunds r USING (business_date, tenant_id, channel_id, region_id)
    ORDER BY k.business_date, k.tenant_id, k.channel_id, k.region_id;
END;
$function$;

COMMENT ON FUNCTION mart.cash_daily(timestamptz, timestamptz, timestamptz) IS
    'Shanghai full-day cash receipts/refunds using v1 instant-completion attempted_at, independently aggregated before joining. Attempt counts are not order counts. Exclusive knowledge cutoff; caller RLS remains active.';

CREATE OR REPLACE FUNCTION mart.order_state_at(
    business_cutoff timestamptz,
    knowledge_cutoff timestamptz
)
RETURNS TABLE (
    tenant_id smallint,
    order_id bigint,
    channel_id bigint,
    region_id bigint,
    ordered_at timestamptz,
    payable_cent bigint,
    state_code text,
    state_event_id bigint,
    state_event_at timestamptz,
    state_available_at timestamptz,
    state_event_seq integer
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, core, sec
AS $function$
BEGIN
    IF NOT sec.is_authenticated() THEN
        RAISE EXCEPTION 'No business principal for authenticated session_user' USING ERRCODE = '42501';
    END IF;
    IF business_cutoff IS NULL OR knowledge_cutoff IS NULL
       OR NOT isfinite(business_cutoff) OR NOT isfinite(knowledge_cutoff) THEN
        RAISE EXCEPTION 'Require finite non-null business and knowledge cutoffs' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT h.tenant_id, h.order_id, h.channel_id, h.region_id,
           h.ordered_at, h.payable_cent,
           COALESCE(s.status, 'UNKNOWN')::text,
           s.status_event_id, s.event_at, s.available_at, s.event_seq
    FROM core.order_header h
    LEFT JOIN LATERAL (
        SELECT e.status_event_id, e.status, e.event_at, e.available_at, e.event_seq
        FROM core.order_status_event e
        WHERE e.tenant_id = h.tenant_id AND e.order_id = h.order_id AND e.region_id = h.region_id
          AND e.event_at < business_cutoff AND e.available_at < knowledge_cutoff
        ORDER BY e.event_at DESC, e.event_seq DESC, e.status_event_id DESC
        LIMIT 1
    ) s ON true
    WHERE h.ordered_at < business_cutoff AND h.available_at < knowledge_cutoff
    ORDER BY h.tenant_id, h.order_id;
END;
$function$;

COMMENT ON FUNCTION mart.order_state_at(timestamptz, timestamptz) IS
    'Latest immutable order-status event before both exclusive clocks; visible header with no visible event is UNKNOWN. No mutable current-state field or NOW fallback. Requires trusted broker time binding.';

REVOKE ALL ON FUNCTION mart.sales_daily(timestamptz, timestamptz, timestamptz),
    mart.cash_daily(timestamptz, timestamptz, timestamptz),
    mart.order_state_at(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mart.sales_daily(timestamptz, timestamptz, timestamptz),
    mart.cash_daily(timestamptz, timestamptz, timestamptz),
    mart.order_state_at(timestamptz, timestamptz) TO contoso_business_ro;

COMMIT;
