-- PostgreSQL 17. Run after 01_schema.sql as a trusted database administrator.
-- This file implements authorization, not historical AsOf materialization.
-- No login credentials or business principals are provisioned by this file.
-- Agent clients receive a tool API; only the trusted query broker holds logins.

BEGIN;

DO $roles$
DECLARE
    role_name text;
BEGIN
    FOREACH role_name IN ARRAY ARRAY[
        'contoso_business_ro',
        'contoso_customer_full_ro',
        'contoso_security_owner',
        'contoso_customer_view_owner'
    ] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('CREATE ROLE %I NOLOGIN', role_name);
        END IF;
        EXECUTE format(
            'ALTER ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
            role_name
        );
    END LOOP;
END
$roles$;

ALTER ROLE contoso_business_ro INHERIT;
ALTER ROLE contoso_customer_full_ro INHERIT;
ALTER ROLE contoso_security_owner NOINHERIT;
ALTER ROLE contoso_customer_view_owner NOINHERIT;
GRANT contoso_business_ro TO contoso_customer_full_ro;

CREATE SCHEMA IF NOT EXISTS api;

-- Source schemas are never writable through a governed business role.
REVOKE ALL ON SCHEMA core, ops, eval, sec, api
    FROM PUBLIC, contoso_business_ro, contoso_customer_full_ro,
         contoso_security_owner, contoso_customer_view_owner;
GRANT USAGE ON SCHEMA core, sec, api TO contoso_business_ro;
GRANT USAGE ON SCHEMA core, sec, api TO contoso_customer_view_owner;
GRANT USAGE, CREATE ON SCHEMA sec, api TO contoso_security_owner;
GRANT CREATE ON SCHEMA api TO contoso_customer_view_owner;
GRANT USAGE ON SCHEMA ops TO contoso_security_owner;

REVOKE ALL ON ALL TABLES IN SCHEMA core, ops, eval, sec, api
    FROM PUBLIC, contoso_business_ro, contoso_customer_full_ro,
         contoso_security_owner, contoso_customer_view_owner;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA core, ops, eval, sec, api
    FROM PUBLIC, contoso_business_ro, contoso_customer_full_ro,
         contoso_security_owner, contoso_customer_view_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sec, api
    FROM PUBLIC, contoso_business_ro, contoso_customer_full_ro,
         contoso_customer_view_owner;

-- Table-level REVOKE does not substitute for removing old column grants.
DO $column_grants$
DECLARE
    rel record;
BEGIN
    FOR rel IN
        SELECT n.nspname, c.relname,
               string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum) AS columns_sql
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname IN ('core', 'ops', 'eval', 'sec', 'api')
          AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND a.attnum > 0 AND NOT a.attisdropped
        GROUP BY n.nspname, c.relname
    LOOP
        EXECUTE format(
            'REVOKE ALL (%s) ON %I.%I FROM PUBLIC, contoso_business_ro, contoso_customer_full_ro, contoso_security_owner, contoso_customer_view_owner',
            rel.columns_sql, rel.nspname, rel.relname
        );
    END LOOP;
END
$column_grants$;

-- These defaults apply to objects subsequently created by the deploying role.
-- Other future object owners must install the same defaults explicitly.
ALTER DEFAULT PRIVILEGES IN SCHEMA core, ops, eval, sec, api
    REVOKE ALL ON TABLES FROM PUBLIC, contoso_business_ro, contoso_customer_full_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA sec, api
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

GRANT SELECT ON sec.principal, sec.principal_region TO contoso_security_owner;
GRANT SELECT ON ops.source_watermark TO contoso_security_owner;

-- SECURITY DEFINER changes current_user, but not the authenticated session_user.
-- All lookup tables are schema-qualified; no caller-controlled GUC is consulted.
CREATE OR REPLACE FUNCTION sec.is_authenticated()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, sec
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM sec.principal p
        WHERE p.db_role = session_user::text
    );
$function$;

CREATE OR REPLACE FUNCTION sec.allowed_tenant(target_tenant smallint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, sec
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM sec.principal p
        WHERE p.db_role = session_user::text
          AND p.tenant_id = target_tenant
    );
$function$;

CREATE OR REPLACE FUNCTION sec.allowed_region(target_tenant smallint, target_region bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, sec
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM sec.principal p
        WHERE p.db_role = session_user::text
          AND p.tenant_id = target_tenant
          AND (
              p.all_regions
              OR EXISTS (
                  SELECT 1 FROM sec.principal_region r
                  WHERE r.db_role = p.db_role
                    AND r.tenant_id = p.tenant_id
                    AND r.region_id = target_region
              )
          )
    );
$function$;

CREATE OR REPLACE FUNCTION sec.allowed_cost(target_tenant smallint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, sec
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM sec.principal p
        WHERE p.db_role = session_user::text
          AND p.tenant_id = target_tenant
          AND p.can_view_cost
    );
$function$;

CREATE OR REPLACE FUNCTION sec.allowed_full_customer(target_tenant smallint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, sec
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM sec.principal p
        WHERE p.db_role = session_user::text
          AND p.tenant_id = target_tenant
          AND p.all_regions
    );
$function$;

ALTER FUNCTION sec.is_authenticated() OWNER TO contoso_security_owner;
ALTER FUNCTION sec.allowed_tenant(smallint) OWNER TO contoso_security_owner;
ALTER FUNCTION sec.allowed_region(smallint, bigint) OWNER TO contoso_security_owner;
ALTER FUNCTION sec.allowed_cost(smallint) OWNER TO contoso_security_owner;
ALTER FUNCTION sec.allowed_full_customer(smallint) OWNER TO contoso_security_owner;

REVOKE ALL ON FUNCTION sec.is_authenticated(), sec.allowed_tenant(smallint),
    sec.allowed_region(smallint, bigint), sec.allowed_cost(smallint),
    sec.allowed_full_customer(smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sec.is_authenticated(), sec.allowed_tenant(smallint),
    sec.allowed_region(smallint, bigint), sec.allowed_cost(smallint),
    sec.allowed_full_customer(smallint)
    TO contoso_business_ro, contoso_customer_view_owner;

-- The source contract's region_id describes data lineage. Security intentionally
-- exposes site as a tenant-wide reference dimension, while stock remains scoped.
-- Every core table is explicitly classified; unknown additions abort deployment.
DO $policies$
DECLARE
    asset record;
    rel record;
    guard_sql text;
    handled_names text[] := ARRAY[]::text[];
BEGIN
    FOR asset IN
        SELECT * FROM (VALUES
            ('tenant',                       'TENANT',        false),
            ('geo_area',                     'TENANT',        false),
            ('org_unit',                     'TENANT',        false),
            ('site',                         'TENANT',        false),
            ('channel',                      'TENANT',        false),
            ('brand',                        'TENANT',        false),
            ('category',                     'TENANT',        false),
            ('sport',                        'TENANT',        false),
            ('spu',                          'TENANT',        false),
            ('spu_sport',                    'TENANT',        false),
            ('sku',                          'TENANT',        false),
            ('channel_listing',              'TENANT',        false),
            ('assortment',                   'SITE_REGION',   false),
            ('price_period',                 'TENANT',        false),
            ('cost_period',                  'TENANT',        true),
            ('customer',                     'CUSTOMER_FULL', false),
            ('customer_identity',            'CUSTOMER_FULL', false),
            ('customer_identity_link',       'CUSTOMER_FULL', false),
            ('calendar',                     'PUBLIC_DATE',   false),
            ('campaign',                     'TENANT',        false),
            ('promotion',                    'TENANT',        false),
            ('order_header',                 'SALES_REGION',  false),
            ('order_line',                   'SALES_REGION',  false),
            ('order_unit',                   'SALES_REGION',  false),
            ('order_status_event',           'SALES_REGION',  false),
            ('discount_allocation',          'SALES_REGION',  false),
            ('payment',                      'SALES_REGION',  false),
            ('refund',                       'SALES_REGION',  false),
            ('refund_allocation',            'SALES_REGION',  false),
            ('inventory_lot',                'SITE_REGION',   true),
            ('shipment',                     'SALES_REGION',  false),
            ('shipment_item',                'SALES_REGION',  false),
            ('shipment_event',               'SALES_REGION',  false),
            ('return_header',                'SALES_REGION',  false),
            ('return_item',                  'SALES_REGION',  false),
            ('return_event',                 'SALES_REGION',  false),
            ('inventory_document',           'SITE_REGION',   false),
            ('inventory_document_line',      'SITE_REGION',   false),
            ('inventory_movement',           'SITE_REGION',   false),
            ('inventory_snapshot',           'SITE_REGION',   false),
            ('inventory_valuation_snapshot', 'SITE_REGION',   true),
            ('revenue_entry',                'SALES_REGION',  false),
            ('cost_entry',                   'SALES_REGION',  true),
            ('order_fee',                    'SALES_REGION',  true),
            ('order_unit_event',             'SALES_REGION',  false),
            ('stock_allocation_attempt',     'SALES_REGION',  false),
            ('web_session',                  'SALES_REGION',  false),
            ('behavior_event',               'SALES_REGION',  false),
            ('campaign_daily',               'SALES_REGION',  false),
            ('channel_product_daily',        'SALES_REGION',  false),
            ('store_traffic_daily',          'SITE_REGION',   false),
            ('order_attribution',            'SALES_REGION',  false),
            ('target_monthly',               'SALES_REGION',  false)
        ) AS classified(table_name, scope_mode, cost_protected)
    LOOP
        IF pg_catalog.to_regclass(format('core.%I', asset.table_name)) IS NULL THEN
            RAISE EXCEPTION 'Security classification references missing table core.%', asset.table_name;
        END IF;
        handled_names := array_append(handled_names, asset.table_name);
        EXECUTE format('ALTER TABLE core.%I ENABLE ROW LEVEL SECURITY', asset.table_name);
        EXECUTE format('ALTER TABLE core.%I FORCE ROW LEVEL SECURITY', asset.table_name);

        CASE asset.scope_mode
            WHEN 'PUBLIC_DATE' THEN guard_sql := 'sec.is_authenticated()';
            WHEN 'TENANT' THEN guard_sql := 'sec.allowed_tenant(tenant_id)';
            WHEN 'CUSTOMER_FULL' THEN guard_sql := 'sec.allowed_full_customer(tenant_id)';
            ELSE guard_sql := 'sec.allowed_region(tenant_id, region_id)';
        END CASE;
        IF asset.cost_protected THEN
            guard_sql := '(' || guard_sql || ') AND sec.allowed_cost(tenant_id)';
        END IF;

        EXECUTE format('DROP POLICY IF EXISTS contoso_select_allow ON core.%I', asset.table_name);
        EXECUTE format('DROP POLICY IF EXISTS contoso_select_guard ON core.%I', asset.table_name);
        EXECUTE format('DROP POLICY IF EXISTS contoso_no_insert ON core.%I', asset.table_name);
        EXECUTE format('DROP POLICY IF EXISTS contoso_no_update ON core.%I', asset.table_name);
        EXECUTE format('DROP POLICY IF EXISTS contoso_no_delete ON core.%I', asset.table_name);

        IF asset.scope_mode = 'CUSTOMER_FULL' THEN
            GRANT USAGE ON SCHEMA core TO contoso_customer_full_ro;
            EXECUTE format('GRANT SELECT ON core.%I TO contoso_customer_full_ro', asset.table_name);
            EXECUTE format(
                'CREATE POLICY contoso_select_allow ON core.%I AS PERMISSIVE FOR SELECT TO contoso_customer_full_ro USING (true)',
                asset.table_name
            );
            -- The customer view owner receives its own narrower policy below.
            EXECUTE format(
                'CREATE POLICY contoso_select_guard ON core.%I AS RESTRICTIVE FOR SELECT TO contoso_business_ro USING (%s)',
                asset.table_name, guard_sql
            );
        ELSE
            EXECUTE format('GRANT SELECT ON core.%I TO contoso_business_ro', asset.table_name);
            EXECUTE format(
                'CREATE POLICY contoso_select_allow ON core.%I AS PERMISSIVE FOR SELECT TO contoso_business_ro USING (true)',
                asset.table_name
            );
            -- Restrictive guards cannot be broadened by an old permissive policy.
            EXECUTE format(
                'CREATE POLICY contoso_select_guard ON core.%I AS RESTRICTIVE FOR SELECT TO contoso_business_ro, contoso_customer_view_owner USING (%s)',
                asset.table_name, guard_sql
            );
        END IF;

        -- Defense against accidental inherited row-DML grants. TRUNCATE and
        -- ownership are checked separately; neither is controlled by RLS.
        EXECUTE format(
            'CREATE POLICY contoso_no_insert ON core.%I AS RESTRICTIVE FOR INSERT TO contoso_business_ro, contoso_customer_view_owner WITH CHECK (false)',
            asset.table_name
        );
        EXECUTE format(
            'CREATE POLICY contoso_no_update ON core.%I AS RESTRICTIVE FOR UPDATE TO contoso_business_ro, contoso_customer_view_owner USING (false) WITH CHECK (false)',
            asset.table_name
        );
        EXECUTE format(
            'CREATE POLICY contoso_no_delete ON core.%I AS RESTRICTIVE FOR DELETE TO contoso_business_ro, contoso_customer_view_owner USING (false)',
            asset.table_name
        );
    END LOOP;

    FOR rel IN
        SELECT c.relname FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'core' AND c.relkind IN ('r', 'p')
          AND NOT (c.relname = ANY (handled_names))
    LOOP
        RAISE EXCEPTION 'Unclassified core table: %. Update the security contract before granting access.', rel.relname;
    END LOOP;
END
$policies$;

-- Region users do not receive SELECT on any customer or identity source table.
-- A separate NOLOGIN view owner sees only customers attached to RLS-visible
-- orders. It does not receive customer_identity or customer_identity_link access.
GRANT SELECT ON core.order_header, core.customer TO contoso_customer_view_owner;
DROP POLICY IF EXISTS contoso_profile_order_allow ON core.order_header;
CREATE POLICY contoso_profile_order_allow ON core.order_header
    AS PERMISSIVE FOR SELECT TO contoso_customer_view_owner USING (true);

DROP POLICY IF EXISTS contoso_profile_customer_allow ON core.customer;
CREATE POLICY contoso_profile_customer_allow ON core.customer
    AS PERMISSIVE FOR SELECT TO contoso_customer_view_owner USING (true);
DROP POLICY IF EXISTS contoso_profile_customer_guard ON core.customer;
CREATE POLICY contoso_profile_customer_guard ON core.customer
    AS RESTRICTIVE FOR SELECT TO contoso_customer_view_owner
    USING (
        sec.allowed_tenant(tenant_id)
        AND EXISTS (
            SELECT 1 FROM core.order_header o
            WHERE o.tenant_id = customer.tenant_id
              AND o.customer_id = customer.customer_id
        )
    );

CREATE OR REPLACE VIEW api.customer_profile_for_orders
    WITH (security_barrier = true, security_invoker = false)
AS
    SELECT tenant_id, customer_id, segment_code, age_band
    FROM core.customer;
ALTER VIEW api.customer_profile_for_orders OWNER TO contoso_customer_view_owner;
GRANT SELECT ON api.customer_profile_for_orders TO contoso_business_ro;
COMMENT ON VIEW api.customer_profile_for_orders IS
    'Tenant/region-safe coarse customer profile for customers attached to authorized orders. No identity token, member code, address, or automatic historical AsOf guarantee.';

-- Whitelisted metadata only. Source paths, seeds, batches, errors, and eval
-- answers are excluded. Historical cutoff selection is the future broker's job.
CREATE OR REPLACE VIEW api.source_status
    WITH (security_barrier = true, security_invoker = false)
AS
    SELECT w.tenant_id, w.source_system, w.observed_at, w.complete_through,
           w.expected_batches, w.arrived_batches, w.status
    FROM ops.source_watermark w
    WHERE EXISTS (
        SELECT 1 FROM sec.principal p
        WHERE p.db_role = session_user::text AND p.tenant_id = w.tenant_id
    );
ALTER VIEW api.source_status OWNER TO contoso_security_owner;
GRANT SELECT ON api.source_status TO contoso_business_ro;
COMMENT ON VIEW api.source_status IS
    'Tenant-only whitelist of source watermarks; missing batch IDs and all ops/eval details remain private. The broker must select the proper knowledge cutoff.';

CREATE OR REPLACE VIEW api.access_context
    WITH (security_barrier = true, security_invoker = false)
AS
    SELECT p.tenant_id, p.persona, p.all_regions, p.can_view_cost,
           ARRAY(
               SELECT r.region_id FROM sec.principal_region r
               WHERE r.db_role = p.db_role AND r.tenant_id = p.tenant_id
               ORDER BY r.region_id
           ) AS granted_region_ids
    FROM sec.principal p
    WHERE p.db_role = session_user::text;
ALTER VIEW api.access_context OWNER TO contoso_security_owner;
GRANT SELECT ON api.access_context TO contoso_business_ro;
COMMENT ON VIEW api.access_context IS
    'Authenticated session_user authorization context; request parameters and mutable GUCs cannot select another principal.';

-- Validate governed roles that already exist. Provisioning new logins must run
-- the same checks; deployment cannot constrain an administrator's later grants.
DO $role_checks$
DECLARE
    governed record;
    rel record;
BEGIN
    FOR governed IN
        WITH RECURSIVE members(oid) AS (
            SELECT oid FROM pg_catalog.pg_roles
            WHERE rolname IN ('contoso_business_ro', 'contoso_customer_full_ro')
            UNION
            SELECT m.member FROM pg_catalog.pg_auth_members m
            JOIN members parent_role ON parent_role.oid = m.roleid
        )
        SELECT DISTINCT r.* FROM members
        JOIN pg_catalog.pg_roles r ON r.oid = members.oid
    LOOP
        IF governed.rolsuper OR governed.rolbypassrls OR governed.rolcreaterole
           OR governed.rolcreatedb OR governed.rolreplication THEN
            RAISE EXCEPTION 'Business role % has administrative/bypass attributes', governed.rolname;
        END IF;
        IF pg_catalog.pg_has_role(governed.oid, 'contoso_security_owner', 'MEMBER')
           OR pg_catalog.pg_has_role(governed.oid, 'contoso_customer_view_owner', 'MEMBER') THEN
            RAISE EXCEPTION 'Business role % can assume a trusted helper owner', governed.rolname;
        END IF;
        FOR rel IN
            SELECT c.oid, c.relowner, n.nspname, c.relname
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname IN ('core', 'ops', 'eval', 'sec')
              AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
        LOOP
            IF pg_catalog.pg_has_role(governed.oid, rel.relowner, 'MEMBER') THEN
                RAISE EXCEPTION 'Business role % can assume owner of %.%',
                    governed.rolname, rel.nspname, rel.relname;
            END IF;
            IF pg_catalog.has_table_privilege(governed.oid, rel.oid, 'TRUNCATE,TRIGGER,REFERENCES') THEN
                RAISE EXCEPTION 'Business role % has non-read privileges on %.%',
                    governed.rolname, rel.nspname, rel.relname;
            END IF;
            IF rel.nspname IN ('ops', 'eval', 'sec')
               AND pg_catalog.has_table_privilege(governed.oid, rel.oid, 'SELECT,INSERT,UPDATE,DELETE') THEN
                RAISE EXCEPTION 'Business role % has private-source privileges on %.%',
                    governed.rolname, rel.nspname, rel.relname;
            END IF;
        END LOOP;
    END LOOP;
END
$role_checks$;

COMMIT;

-- Deliberately absent: a mutable SET app.tenant_id policy, time-travel GUCs,
-- automatic login/password provisioning, grants on eval/ops source tables,
-- GRANT SELECT ON ALL TABLES defaults, and an unimplemented asof schema.
