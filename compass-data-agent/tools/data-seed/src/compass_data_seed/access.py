"Source-side privileges and real-login verification, bound to session_user."

import secrets

import psycopg
from psycopg import sql

from .importer import connection_info
from .namespace import mapped
from .schema import tables

COST_TABLES = {"core.cost_period", "core.cost_entry", "core.inventory_valuation_snapshot"}
IDENTITY_TABLES = {"core.customer_identity", "core.customer_identity_link"}
MARKETING_TABLES = {
    "core.price_exposure",
    "core.campaign_attribution_daily",
    "core.intervention_definition",
    "core.intervention_cohort",
    "ops.asset_period_status",
    "core.tenant",
    "core.geo_area",
    "core.channel",
    "core.calendar",
    "core.brand",
    "core.category",
    "core.sport",
    "core.spu",
    "core.spu_sport",
    "core.sku",
    "core.campaign",
    "core.campaign_daily",
    "core.promotion",
    "core.channel_product_daily",
    "core.web_session",
    "core.behavior_event",
    "core.order_attribution",
    "core.experiment_definition",
    "core.experiment_assignment",
    "core.experiment_exposure",
}
PROFILES = {
    "a_all": (101, True, False, "EXEC"),
    "a_east": (101, False, False, "REGION"),
    "a_marketing": (101, True, False, "MARKETING"),
    "a_finance": (101, True, True, "ANALYST"),
    "b_east": (102, False, False, "REGION"),
}


def deploy_access(config, record, persist):
    accounts = {
        key: dict(
            role=record.get("role_prefix", record["database"]) + "_" + key,
            password=secrets.token_urlsafe(32),
        )
        for key in PROFILES
    }
    record["accounts"] = accounts
    persist(record)
    with psycopg.connect(connection_info(config), autocommit=True) as admin:
        for key in PROFILES:
            role = record.get("role_prefix", record["database"]) + "_" + key
            password = accounts[key]["password"]
            admin.execute(
                sql.SQL(
                    "CREATE ROLE {} LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB "
                    "NOCREATEROLE NOINHERIT NOBYPASSRLS"
                ).format(sql.Identifier(role), sql.Literal(password))
            )
            admin.execute(
                sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(
                    sql.Identifier(record["database"]), sql.Identifier(role)
                )
            )
            accounts[key] = dict(role=role, password=password)
    with psycopg.connect(connection_info(config, record["database"])) as raw:
        conn = mapped(raw, record)
        schemas = sql.SQL(",").join(
            sql.Identifier(s)
            for s in ([record["schema"]] if record.get("schema") else ["core", "ops", "sec"])
        )
        conn.execute(sql.SQL("REVOKE ALL ON SCHEMA {} FROM PUBLIC").format(schemas))
        conn.execute(sql.SQL("REVOKE ALL ON ALL TABLES IN SCHEMA {} FROM PUBLIC").format(schemas))
        conn.execute(
            "CREATE FUNCTION sec.allowed(t smallint,r bigint) RETURNS boolean "
            "LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog "
            "AS $$\n           SELECT EXISTS(SELECT 1 FROM sec.principal p "
            "WHERE p.db_role=session_user AND p.tenant_id=t AND (r IS NULL OR "
            "p.all_regions OR EXISTS(SELECT 1 FROM sec.principal_region pr "
            "WHERE pr.db_role=p.db_role AND pr.tenant_id=t AND "
            "pr.region_id=r))) $$"
        )
        conn.execute("REVOKE ALL ON FUNCTION sec.allowed(smallint,bigint) FROM PUBLIC")
        for key, (tenant, all_regions, cost, persona) in PROFILES.items():
            role = accounts[key]["role"]
            conn.execute(
                "INSERT INTO sec.principal VALUES(%s,%s,%s,%s,%s)",
                (role, tenant, persona, all_regions, cost),
            )
            if not all_regions:
                conn.execute("INSERT INTO sec.principal_region VALUES(%s,%s,1)", (role, tenant))
            conn.execute(
                sql.SQL("GRANT USAGE ON SCHEMA {} TO {}").format(schemas, sql.Identifier(role))
            )
            conn.execute(
                sql.SQL("GRANT EXECUTE ON FUNCTION sec.allowed(smallint,bigint) TO {}").format(
                    sql.Identifier(role)
                )
            )
            for table, cols in tables().items():
                if not table.startswith("core.") and table not in {
                    "ops.source_watermark",
                    "ops.asset_period_status",
                }:
                    continue
                if not all_regions and table == "core.campaign_attribution_daily":
                    continue
                if table in IDENTITY_TABLES or table in COST_TABLES and not cost:
                    continue
                if key == "a_marketing" and table not in MARKETING_TABLES:
                    continue
                permitted = [
                    c
                    for c in cols
                    if not (c == "unit_cost_cent" and not cost)
                    and c not in {"external_user_token", "recipient_name", "address_line"}
                ]
                conn.execute(
                    sql.SQL("GRANT SELECT ({}) ON {} TO {}").format(
                        sql.SQL(",").join(map(sql.Identifier, permitted)),
                        sql.Identifier(*table.split(".")),
                        sql.Identifier(role),
                    )
                )
        for table, cols in tables().items():
            if not table.startswith("core.") and table not in {
                "ops.source_watermark",
                "ops.asset_period_status",
            }:
                continue
            if "tenant_id" not in cols:
                continue
            region = sql.Identifier("region_id") if "region_id" in cols else sql.SQL("NULL::bigint")
            conn.execute(
                sql.SQL("ALTER TABLE {} ENABLE ROW LEVEL SECURITY").format(
                    sql.Identifier(*table.split("."))
                )
            )
            conn.execute(
                sql.SQL("ALTER TABLE {} FORCE ROW LEVEL SECURITY").format(
                    sql.Identifier(*table.split("."))
                )
            )
            conn.execute(
                sql.SQL(
                    "CREATE POLICY source_scope ON {} FOR SELECT USING(sec.allowed(tenant_id,{}))"
                ).format(sql.Identifier(*table.split(".")), region)
            )
    return accounts


def verify_access(config, record, accounts):
    checks = {}

    def denied(conn, key, query):
        try:
            with conn.transaction():
                conn.execute(query).fetchall()
        except psycopg.errors.InsufficientPrivilege:
            checks[key] = True
        else:
            checks[key] = False

    for key, account in accounts.items():
        with psycopg.connect(
            connection_info(
                config, record["database"], user=account["role"], password=account["password"]
            ),
            autocommit=True,
        ) as raw:
            conn = mapped(raw, record)
            tenant, all_regions, cost, _ = PROFILES[key]
            table = "core.campaign_daily" if key == "a_marketing" else "core.order_header"
            checks[key + "_positive"] = conn.execute(
                sql.SQL("SELECT count(*)>0 FROM {}").format(sql.Identifier(*table.split(".")))
            ).fetchall()[0][0]
            checks[key + "_tenant"] = conn.execute(
                sql.SQL("SELECT count(*)=0 FROM {} WHERE tenant_id<>%s").format(
                    sql.Identifier(*table.split("."))
                ),
                (tenant,),
            ).fetchall()[0][0]
            if not all_regions:
                checks[key + "_region"] = conn.execute(
                    "SELECT count(*)=0 FROM core.order_header WHERE region_id<>1"
                ).fetchall()[0][0]
            checks[key + "_price_tenant"] = conn.execute(
                "SELECT count(*)=0 FROM core.price_exposure WHERE tenant_id<>%s", (tenant,)
            ).fetchall()[0][0]
            checks[key + "_readiness_tenant"] = conn.execute(
                "SELECT count(*)=0 FROM ops.asset_period_status WHERE tenant_id<>%s", (tenant,)
            ).fetchall()[0][0]
            if all_regions:
                checks[key + "_platform_scope"] = conn.execute(
                    "SELECT count(*)=0 FROM core.campaign_attribution_daily WHERE tenant_id<>%s",
                    (tenant,),
                ).fetchall()[0][0]
            else:
                denied(
                    conn, key + "_platform_scope", "SELECT * FROM core.campaign_attribution_daily"
                )
                checks[key + "_price_region"] = conn.execute(
                    "SELECT count(*)=0 FROM core.price_exposure WHERE region_id<>1"
                ).fetchall()[0][0]
            denied(conn, key + "_write", "DELETE FROM core.order_header")
            denied(conn, key + "_private", "SELECT * FROM sec.principal")
            denied(conn, key + "_control", "SELECT * FROM ops.dataset_release")
            denied(conn, key + "_identity", "SELECT * FROM core.customer_identity_link")
            denied(
                conn,
                key + "_set_role",
                sql.SQL("SET ROLE {}").format(sql.Identifier(record["loader"])),
            )
            denied(
                conn,
                key + "_address",
                "SELECT address_line,recipient_name FROM core.order_delivery_address LIMIT 1",
            )
            if record.get("schema"):
                # Bypass logical mapping to prove source accounts cannot read the old version.
                denied(raw, key + "_old_schema", "SELECT * FROM core.order_header LIMIT 1")
            conn.execute("SET app.tenant_id='103'")
            checks[key + "_session_binding"] = conn.execute(
                sql.SQL("SELECT count(*)=0 FROM {} WHERE tenant_id<>%s").format(
                    sql.Identifier(*table.split("."))
                ),
                (tenant,),
            ).fetchall()[0][0]
            if cost:
                checks[key + "_cost"] = conn.execute(
                    "SELECT count(*)>0 FROM core.cost_entry"
                ).fetchall()[0][0]
            else:
                denied(conn, key + "_cost", "SELECT unit_cost_cent FROM core.inventory_lot LIMIT 1")
    if not all(checks.values()):
        raise ValueError(
            f"Source access validation failed: {[k for k, v in checks.items() if not v]}"
        )
    return checks
