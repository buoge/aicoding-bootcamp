#!/usr/bin/env node
/**
 * Independent SQL verifier for the eight-order fixture.
 * Usage: node run_golden_fixture.mjs [fixture.json] [report.json]
 * Uses a locally installed @electric-sql/pglite package first; this workspace's
 * known test installation is the fallback. Optional explicit override:
 * PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite
 * CONTOSO_PGLITE_MODULE is also accepted for compatibility.
 * This is a normalized validation schema, not a canonical 63-table loader.
 * Business calculations below are SQL, independent of the dataset generator.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(process.argv[2] ?? `${here}/golden_fixture.json`);
const reportPath = resolve(process.argv[3] ?? `${here}/golden_fixture_report.json`);
const require = createRequire(import.meta.url);
const configuredModule = process.env.CONTOSO_PGLITE_MODULE ?? process.env.PGLITE_MODULE;
const dependencyPath = configuredModule ?? '/tmp/contoso-spec-validation/node_modules/@electric-sql/pglite/dist/index.js';
const moduleUrl = dependencyPath.startsWith('file:') ? dependencyPath : pathToFileURL(configuredModule ? require.resolve(dependencyPath) : dependencyPath).href;
const fixtureText = await readFile(fixturePath, 'utf8');
const fixture = JSON.parse(fixtureText);
const report = {
  verifier_version: '1.0.0',
  fixture_name: fixture.name,
  fixture_version: fixture.fixture_version,
  fixture_sha256: createHash('sha256').update(fixtureText).digest('hex'),
  executed_at: new Date().toISOString(),
  scope: 'Independent normalized fixture schema: financial arithmetic, integer allocation, callback idempotency, five inventory buckets, business time and knowledge time.',
  canonical_schema_loaded: false,
  limitations: [
    'Does not load or certify the complete canonical 63-table schema, canonical FK constraints, RLS, or million-order generation.',
    'The fixture contains no internal transfer or purchase-in-transit event; the transit bucket is checked at zero, not through a nontrivial transfer lifecycle.',
    'Does not validate statistical realism, production query performance, or all natural-language questions.',
  ],
  checks: [],
  passed: false,
};
let db;

function printable(value) {
  if (typeof value === 'bigint') return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(value) : value.toString();
  if (Array.isArray(value)) return value.map(printable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, printable(v)]));
  return value;
}

function numericEqual(actual, expected) {
  try { return BigInt(actual) === BigInt(expected); } catch { return actual === expected; }
}

function compare(id, actual, expected, context = {}) {
  const fields = Object.entries(expected).map(([field, expectedValue]) => ({
    field, expected: expectedValue, actual: printable(actual[field]), passed: numericEqual(actual[field], expectedValue),
  }));
  const check = { id, ...context, fields, passed: fields.every(f => f.passed) };
  report.checks.push(check);
  return check;
}

async function insertRows(table, declarations, columns, rows) {
  // Identifiers/declarations are fixed in this source. Only JSON data is parameterized.
  await db.query(`INSERT INTO validation_fixture.${table} (${columns.join(',')})
    SELECT ${columns.join(',')} FROM jsonb_to_recordset($1::jsonb) AS x(${declarations});`, [JSON.stringify(rows)]);
}

const financialSql = `
WITH visible_ledger AS (
  SELECT * FROM validation_fixture.financial_ledger
  WHERE tenant_id=$3 AND occurred_at<$1::timestamptz AND available_at<$2::timestamptz
), visible_cash AS (
  SELECT * FROM validation_fixture.cash_ledger
  WHERE tenant_id=$3 AND occurred_at<$1::timestamptz AND available_at<$2::timestamptz
), deliveries AS (
  SELECT order_id, count(DISTINCT unit_id) AS delivered
  FROM visible_ledger WHERE entry_type='UNIT_DELIVERED' GROUP BY order_id
), cancellations AS (
  SELECT order_id, count(DISTINCT unit_id) AS cancelled
  FROM validation_fixture.raw_event
  WHERE tenant_id=$3 AND event_type='UNIT_CANCELLED'
    AND occurred_at<$1::timestamptz AND available_at<$2::timestamptz GROUP BY order_id
), quantities AS (
  SELECT u.order_id, count(*) AS units FROM validation_fixture.order_unit u
  JOIN validation_fixture.order_header o USING(tenant_id,order_id)
  WHERE u.tenant_id=$3 AND o.ordered_at<$1::timestamptz AND o.available_at<$2::timestamptz
  GROUP BY u.order_id
)
SELECT
  (SELECT COALESCE(sum(amount_cent) FILTER(WHERE entry_type='CAPTURE'),0)::text FROM visible_cash) AS captured_cent,
  (SELECT (-COALESCE(sum(amount_cent) FILTER(WHERE entry_type='REFUND'),0))::text FROM visible_cash) AS refunded_cent,
  (SELECT COALESCE(sum(amount_cent),0)::text FROM visible_cash) AS net_cash_cent,
  COALESCE(sum(revenue_cent) FILTER(WHERE entry_type='UNIT_DELIVERED'),0)::text AS delivery_sales_cent,
  (-COALESCE(sum(revenue_cent) FILTER(WHERE entry_type='RETURN_ACCEPTED'),0))::text AS return_sales_cent,
  COALESCE(sum(revenue_cent),0)::text AS net_sales_cent,
  COALESCE(sum(cogs_cent) FILTER(WHERE entry_type='UNIT_DELIVERED'),0)::text AS delivery_cogs_cent,
  (-COALESCE(sum(cogs_cent) FILTER(WHERE entry_type='RETURN_RESTOCKED'),0))::text AS restock_cogs_reversal_cent,
  COALESCE(sum(cogs_cent),0)::text AS net_cogs_cent,
  COALESCE(sum(revenue_cent-cogs_cent),0)::text AS gross_profit_cent,
  (SELECT count(*)::text FROM validation_fixture.order_header
    WHERE tenant_id=$3 AND ordered_at<$1::timestamptz AND available_at<$2::timestamptz) AS orders_created,
  (SELECT count(DISTINCT order_id)::text FROM visible_cash WHERE entry_type='CAPTURE') AS orders_ever_paid,
  (SELECT count(*)::text FROM deliveries) AS orders_with_visible_delivery,
  (SELECT count(*)::text FROM quantities q JOIN deliveries d USING(order_id)
    LEFT JOIN cancellations c USING(order_id)
    WHERE d.delivered>0 AND d.delivered+COALESCE(c.cancelled,0)=q.units) AS orders_fully_delivered,
  count(*) FILTER(WHERE entry_type='UNIT_DELIVERED')::text AS delivered_units,
  count(*) FILTER(WHERE entry_type='RETURN_ACCEPTED')::text AS accepted_return_units
FROM visible_ledger;`;

const inventorySql = `
WITH balances AS (
  SELECT sku_id, site_id,
    sum(sellable_delta) AS sellable_qty, sum(reserved_delta) AS reserved_qty,
    sum(quarantine_delta) AS quarantine_qty, sum(damaged_delta) AS damaged_qty,
    sum(in_transit_delta) AS in_transit_qty
  FROM validation_fixture.raw_event
  WHERE tenant_id=$3 AND is_inventory
    AND occurred_at<$1::timestamptz AND available_at<$2::timestamptz
  GROUP BY sku_id,site_id
)
SELECT s.sku_id,s.site_id,
  COALESCE(b.sellable_qty,0)::text AS sellable_qty,
  COALESCE(b.reserved_qty,0)::text AS reserved_qty,
  (COALESCE(b.sellable_qty,0)-COALESCE(b.reserved_qty,0))::text AS available_qty,
  COALESCE(b.quarantine_qty,0)::text AS quarantine_qty,
  COALESCE(b.damaged_qty,0)::text AS damaged_qty,
  COALESCE(b.in_transit_qty,0)::text AS in_transit_qty,
  (COALESCE(b.sellable_qty,0)+COALESCE(b.quarantine_qty,0)+COALESCE(b.damaged_qty,0))::text AS physical_on_site_qty
FROM validation_fixture.inventory_scope s LEFT JOIN balances b USING(sku_id,site_id)
WHERE s.tenant_id=$3 ORDER BY s.sku_id,s.site_id;`;

try {
  let pgliteModule;
  if (configuredModule) {
    pgliteModule = await import(moduleUrl);
  } else {
    try {
      pgliteModule = await import('@electric-sql/pglite');
    } catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
      pgliteModule = await import(moduleUrl);
    }
  }
  const { PGlite } = pgliteModule;
  db = new PGlite();
  report.engine = (await db.query('SELECT version() AS version;')).rows[0].version;
  await db.exec(`
    SET TIME ZONE 'UTC';
    CREATE SCHEMA validation_fixture;
    CREATE TABLE validation_fixture.order_header (
      tenant_id integer, order_id bigint, ordered_at timestamptz, available_at timestamptz,
      gross_cent bigint, discount_cent bigint, payable_cent bigint, PRIMARY KEY(tenant_id,order_id));
    CREATE TABLE validation_fixture.order_unit (
      tenant_id integer, unit_id bigint, order_id bigint, sku_id bigint, unit_no integer,
      gross_cent bigint, discount_cent bigint, net_cent bigint, available_at timestamptz,
      PRIMARY KEY(tenant_id,unit_id), FOREIGN KEY(tenant_id,order_id) REFERENCES validation_fixture.order_header);
    CREATE TABLE validation_fixture.inventory_lot (
      tenant_id integer, lot_id bigint, sku_id bigint, site_id bigint,
      unit_cost_cent bigint, available_at timestamptz, PRIMARY KEY(tenant_id,lot_id));
    CREATE TABLE validation_fixture.inventory_scope (
      tenant_id integer, sku_id bigint, site_id bigint, PRIMARY KEY(tenant_id,sku_id,site_id));
    CREATE TABLE validation_fixture.raw_event (
      tenant_id integer, event_id text, event_type text, order_id bigint, unit_id bigint,
      sku_id bigint, site_id bigint, payment_id bigint, refund_id bigint, return_id bigint,
      return_item_id bigint, lot_id bigint, original_lot_id bigint, amount_cent bigint,
      occurred_at timestamptz, available_at timestamptz, is_inventory boolean,
      sellable_delta integer, reserved_delta integer, quarantine_delta integer,
      damaged_delta integer, in_transit_delta integer, PRIMARY KEY(tenant_id,event_id));
  `);
  await insertRows('order_header', 'tenant_id integer,order_id bigint,ordered_at timestamptz,available_at timestamptz,gross_cent bigint,discount_cent bigint,payable_cent bigint',
    ['tenant_id','order_id','ordered_at','available_at','gross_cent','discount_cent','payable_cent'], fixture.orders);
  const orderIndex = new Map(fixture.orders.map(o => [o.order_id,o]));
  const unitRows = fixture.order_units.map(u => ({ ...u, tenant_id: fixture.tenant_id, available_at: u.available_at ?? orderIndex.get(u.order_id).available_at }));
  await insertRows('order_unit','tenant_id integer,unit_id bigint,order_id bigint,sku_id bigint,unit_no integer,gross_cent bigint,discount_cent bigint,net_cent bigint,available_at timestamptz',
    ['tenant_id','unit_id','order_id','sku_id','unit_no','gross_cent','discount_cent','net_cent','available_at'],unitRows);
  await insertRows('inventory_lot','tenant_id integer,lot_id bigint,sku_id bigint,site_id bigint,unit_cost_cent bigint,available_at timestamptz',
    ['tenant_id','lot_id','sku_id','site_id','unit_cost_cent','available_at'],fixture.inventory_lots.map(l => ({...l,tenant_id:fixture.tenant_id})));
  await insertRows('inventory_scope','tenant_id integer,sku_id bigint,site_id bigint',
    ['tenant_id','sku_id','site_id'],fixture.initial_inventory.map(s => ({tenant_id:fixture.tenant_id,sku_id:s.sku_id,site_id:s.site_id})));
  const eventRows = fixture.events.map(e => ({
    ...e,event_type:e.type,is_inventory:e.inventory_delta!==null,
    sellable_delta:e.inventory_delta?.sellable??0,reserved_delta:e.inventory_delta?.reserved??0,
    quarantine_delta:e.inventory_delta?.quarantine??0,damaged_delta:e.inventory_delta?.damaged??0,
    in_transit_delta:e.inventory_delta?.in_transit??0,
  }));
  const eventColumns=['tenant_id','event_id','event_type','order_id','unit_id','sku_id','site_id','payment_id','refund_id','return_id','return_item_id','lot_id','original_lot_id','amount_cent','occurred_at','available_at','is_inventory','sellable_delta','reserved_delta','quarantine_delta','damaged_delta','in_transit_delta'];
  await insertRows('raw_event', 'tenant_id integer,event_id text,event_type text,order_id bigint,unit_id bigint,sku_id bigint,site_id bigint,payment_id bigint,refund_id bigint,return_id bigint,return_item_id bigint,lot_id bigint,original_lot_id bigint,amount_cent bigint,occurred_at timestamptz,available_at timestamptz,is_inventory boolean,sellable_delta integer,reserved_delta integer,quarantine_delta integer,damaged_delta integer,in_transit_delta integer',eventColumns,eventRows);

  await db.exec(`
    CREATE VIEW validation_fixture.cash_ledger AS
    WITH captures AS (
      SELECT DISTINCT ON (tenant_id,payment_id) tenant_id,event_id,payment_id,order_id,amount_cent,occurred_at,available_at
      FROM validation_fixture.raw_event WHERE event_type='PAYMENT_SUCCEEDED'
      ORDER BY tenant_id,payment_id,available_at,event_id
    ), refunds AS (
      SELECT DISTINCT ON (tenant_id,refund_id) tenant_id,event_id,refund_id,order_id,amount_cent,occurred_at,available_at
      FROM validation_fixture.raw_event WHERE event_type='REFUND_SUCCEEDED'
      ORDER BY tenant_id,refund_id,available_at,event_id
    )
    SELECT c.tenant_id,c.event_id,'CAPTURE'::text AS entry_type,c.order_id,c.amount_cent,c.occurred_at,
      greatest(c.available_at,o.available_at) AS available_at
    FROM captures c JOIN validation_fixture.order_header o USING(tenant_id,order_id)
    UNION ALL
    SELECT r.tenant_id,r.event_id,'REFUND',r.order_id,-r.amount_cent,r.occurred_at,
      greatest(r.available_at,o.available_at)
    FROM refunds r JOIN validation_fixture.order_header o USING(tenant_id,order_id);

    CREATE VIEW validation_fixture.financial_ledger AS
    SELECT e.tenant_id,e.event_id,e.event_type AS entry_type,e.order_id,e.unit_id,e.occurred_at,
      greatest(e.available_at,u.available_at,o.available_at,sh.available_at,l.available_at,d.available_at,a.available_at) AS available_at,
      CASE e.event_type WHEN 'UNIT_DELIVERED' THEN u.net_cent WHEN 'RETURN_ACCEPTED' THEN -u.net_cent ELSE 0::bigint END AS revenue_cent,
      CASE e.event_type WHEN 'UNIT_DELIVERED' THEN l.unit_cost_cent WHEN 'RETURN_RESTOCKED' THEN -l.unit_cost_cent ELSE 0::bigint END AS cogs_cent
    FROM validation_fixture.raw_event e
    JOIN validation_fixture.order_unit u ON u.tenant_id=e.tenant_id AND u.unit_id=e.unit_id AND u.order_id=e.order_id
    JOIN validation_fixture.order_header o ON o.tenant_id=u.tenant_id AND o.order_id=u.order_id
    JOIN validation_fixture.raw_event sh ON sh.tenant_id=e.tenant_id AND sh.unit_id=e.unit_id AND sh.event_type='UNIT_SHIPPED'
    JOIN validation_fixture.inventory_lot l ON l.tenant_id=sh.tenant_id AND l.lot_id=sh.lot_id AND l.sku_id=u.sku_id
    JOIN validation_fixture.raw_event d ON d.tenant_id=e.tenant_id AND d.unit_id=e.unit_id AND d.event_type='UNIT_DELIVERED'
    LEFT JOIN validation_fixture.raw_event a ON e.event_type='RETURN_RESTOCKED'
      AND a.tenant_id=e.tenant_id AND a.return_item_id=e.return_item_id AND a.event_type='RETURN_ACCEPTED'
    WHERE e.event_type IN ('UNIT_DELIVERED','RETURN_ACCEPTED','RETURN_RESTOCKED');
  `);

  const inputChecks = [
    ['ALLOCATION_CONSERVATION', `SELECT count(*)::text AS violations FROM (
       SELECT o.order_id FROM validation_fixture.order_header o JOIN validation_fixture.order_unit u USING(tenant_id,order_id)
       GROUP BY o.order_id,o.gross_cent,o.discount_cent,o.payable_cent
       HAVING sum(u.gross_cent)<>o.gross_cent OR sum(u.discount_cent)<>o.discount_cent OR sum(u.net_cent)<>o.payable_cent
       UNION ALL SELECT order_id FROM validation_fixture.order_unit WHERE net_cent<>gross_cent-discount_cent OR net_cent<0
     ) q;`],
    ['CALLBACK_IDEMPOTENCY_CONTENT', `SELECT count(*)::text AS violations FROM (
       SELECT tenant_id,payment_id FROM validation_fixture.raw_event WHERE event_type='PAYMENT_SUCCEEDED'
       GROUP BY tenant_id,payment_id HAVING count(DISTINCT (order_id,amount_cent,occurred_at))<>1
     ) q;`],
    ['NO_FUTURE_AVAILABILITY', `SELECT count(*)::text AS violations FROM validation_fixture.raw_event WHERE available_at<occurred_at;`],
    ['ONE_EVENT_PER_UNIT_PHASE', `SELECT count(*)::text AS violations FROM (
       SELECT tenant_id,unit_id,event_type FROM validation_fixture.raw_event
       WHERE event_type IN ('UNIT_SHIPPED','UNIT_DELIVERED','RETURN_ACCEPTED','RETURN_RESTOCKED','RETURN_DAMAGED')
       GROUP BY tenant_id,unit_id,event_type HAVING count(*)<>1
     ) q;`],
    ['RECOGNITION_SOURCE_AND_AMOUNT', `SELECT count(*)::text AS violations
      FROM validation_fixture.raw_event e LEFT JOIN validation_fixture.order_unit u USING(tenant_id,unit_id)
      LEFT JOIN validation_fixture.raw_event sh ON sh.tenant_id=e.tenant_id AND sh.unit_id=e.unit_id AND sh.event_type='UNIT_SHIPPED'
      LEFT JOIN validation_fixture.raw_event d ON d.tenant_id=e.tenant_id AND d.unit_id=e.unit_id AND d.event_type='UNIT_DELIVERED'
      LEFT JOIN validation_fixture.raw_event a ON a.tenant_id=e.tenant_id AND a.unit_id=e.unit_id AND a.event_type='RETURN_ACCEPTED'
      WHERE e.event_type IN ('UNIT_DELIVERED','RETURN_ACCEPTED','RETURN_RESTOCKED') AND
       (u.unit_id IS NULL OR e.order_id<>u.order_id OR sh.event_id IS NULL OR sh.occurred_at>e.occurred_at
        OR (e.event_type IN ('UNIT_DELIVERED','RETURN_ACCEPTED') AND e.amount_cent<>u.net_cent)
        OR (e.event_type<>'UNIT_DELIVERED' AND (d.event_id IS NULL OR d.occurred_at>e.occurred_at))
        OR (e.event_type='RETURN_RESTOCKED' AND (a.event_id IS NULL OR a.occurred_at>e.occurred_at)));`],
    ['REFUND_PER_PAYMENT_CAP', `WITH p AS (
       SELECT tenant_id,payment_id,max(amount_cent) AS captured FROM validation_fixture.raw_event
       WHERE event_type='PAYMENT_SUCCEEDED' GROUP BY tenant_id,payment_id
     ), r AS (
       SELECT tenant_id,payment_id,sum(amount_cent) AS refunded FROM
        (SELECT DISTINCT ON (tenant_id,refund_id) * FROM validation_fixture.raw_event WHERE event_type='REFUND_SUCCEEDED'
          ORDER BY tenant_id,refund_id,available_at,event_id) x GROUP BY tenant_id,payment_id
     ) SELECT count(*)::text AS violations FROM r LEFT JOIN p USING(tenant_id,payment_id)
       WHERE p.payment_id IS NULL OR r.refunded>p.captured;`],
    ['INVENTORY_PREFIX_VALID', `WITH balances AS (
       SELECT *,sum(sellable_delta) OVER w AS sellable,sum(reserved_delta) OVER w AS reserved,
        sum(quarantine_delta) OVER w AS quarantine,sum(damaged_delta) OVER w AS damaged,sum(in_transit_delta) OVER w AS transit
       FROM validation_fixture.raw_event WHERE is_inventory
       WINDOW w AS (PARTITION BY tenant_id,site_id,sku_id ORDER BY occurred_at,event_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
     ) SELECT count(*)::text AS violations FROM balances
       WHERE sellable<0 OR reserved<0 OR reserved>sellable OR quarantine<0 OR damaged<0 OR transit<0;`],
    ['DAMAGE_DOES_NOT_REVERSE_COGS', `SELECT count(*)::text AS violations
       FROM validation_fixture.raw_event d JOIN validation_fixture.financial_ledger f USING(tenant_id,unit_id)
       WHERE d.event_type='RETURN_DAMAGED' AND f.entry_type='RETURN_RESTOCKED';`],
  ];
  for (const [id,sql] of inputChecks) compare(id,(await db.query(sql)).rows[0],{violations:0});

  compare('FIXTURE_CARDINALITY',(await db.query(`SELECT
    (SELECT count(*)::text FROM validation_fixture.order_header) AS orders,
    (SELECT count(*)::text FROM validation_fixture.order_unit) AS units,
    (SELECT count(*)::text FROM validation_fixture.raw_event WHERE event_type='PAYMENT_SUCCEEDED') AS raw_success_callbacks,
    (SELECT count(*)::text FROM validation_fixture.cash_ledger WHERE entry_type='CAPTURE') AS deduplicated_success_payments;`)).rows[0],
    {orders:8,units:11,raw_success_callbacks:8,deduplicated_success_payments:7});

  for (const cutoff of fixture.cutoffs) {
    const business = cutoff.business_as_of ?? cutoff.business_before;
    const knowledge = cutoff.knowledge_as_of ?? cutoff.knowledge_before;
    const context = {business_as_of:business,knowledge_as_of:knowledge,reference_time:cutoff.reference_time};
    compare(`${cutoff.id}_FINANCIAL`,(await db.query(financialSql,[business,knowledge,fixture.tenant_id])).rows[0],cutoff.expected,context);
    const inventory = (await db.query(inventorySql,[business,knowledge,fixture.tenant_id])).rows;
    for (const expected of cutoff.inventory_by_sku) {
      const actual=inventory.find(r => numericEqual(r.sku_id,expected.sku_id)&&numericEqual(r.site_id,expected.site_id));
      if (!actual) throw new Error(`Missing inventory spine row ${cutoff.id}/${expected.sku_id}/${expected.site_id}`);
      const expectedNumeric=Object.fromEntries(Object.entries(expected).filter(([key]) => key!=='sku_ref'));
      compare(`${cutoff.id}_SKU_${expected.sku_id}`,actual,expectedNumeric,context);
    }
    // Totals are also aggregated inside SQL, independent of JS aggregation.
    const totalSql=`WITH inventory AS (${inventorySql.replace(/;\s*$/,'')}) SELECT
      sum(sellable_qty::bigint)::text AS sellable_qty,sum(reserved_qty::bigint)::text AS reserved_qty,
      sum(available_qty::bigint)::text AS available_qty,sum(quarantine_qty::bigint)::text AS quarantine_qty,
      sum(damaged_qty::bigint)::text AS damaged_qty,sum(in_transit_qty::bigint)::text AS in_transit_qty,
      sum(physical_on_site_qty::bigint)::text AS physical_on_site_qty FROM inventory;`;
    compare(`${cutoff.id}_INVENTORY_TOTAL`,(await db.query(totalSql,[business,knowledge,fixture.tenant_id])).rows[0],cutoff.inventory_expected,context);
  }

  for (const period of fixture.period_gold) {
    const knowledge=period.knowledge_as_of??period.knowledge_before;
    const actual=(await db.query(`WITH f AS (
        SELECT * FROM validation_fixture.financial_ledger WHERE tenant_id=$4
        AND occurred_at>=$1::timestamptz AND occurred_at<$2::timestamptz AND available_at<$3::timestamptz
      ) SELECT COALESCE(sum(revenue_cent),0)::text AS net_sales_cent,COALESCE(sum(cogs_cent),0)::text AS net_cogs_cent,
        COALESCE(sum(revenue_cent-cogs_cent),0)::text AS gross_profit_cent,
        (SELECT -COALESCE(sum(amount_cent),0) FROM validation_fixture.cash_ledger WHERE tenant_id=$4
          AND entry_type='REFUND' AND occurred_at>=$1::timestamptz AND occurred_at<$2::timestamptz
          AND available_at<$3::timestamptz)::text AS refund_cash_cent FROM f;`,
      [period.period_start,period.period_end,knowledge,fixture.tenant_id])).rows[0];
    const expected=Object.fromEntries(['net_sales_cent','net_cogs_cent','gross_profit_cent','refund_cash_cent'].filter(k => k in period).map(k=>[k,period[k]]));
    compare(period.id,actual,expected,{period_start:period.period_start,business_as_of:period.business_as_of,knowledge_as_of:knowledge,reference_time:period.reference_time});
  }

  for (const expected of fixture.order_gold) {
    const cutoff=fixture.cutoffs.find(c=>c.id===expected.cutoff_id);
    const actual=(await db.query(`WITH f AS (
        SELECT * FROM validation_fixture.financial_ledger WHERE tenant_id=$4 AND order_id=$3
          AND occurred_at<$1::timestamptz AND available_at<$2::timestamptz
      ) SELECT COALESCE(sum(revenue_cent),0)::text AS net_sales_cent,COALESCE(sum(cogs_cent),0)::text AS net_cogs_cent,
        COALESCE(sum(revenue_cent-cogs_cent),0)::text AS gross_profit_cent,
        (SELECT COALESCE(sum(amount_cent),0) FROM validation_fixture.cash_ledger WHERE tenant_id=$4 AND order_id=$3
          AND occurred_at<$1::timestamptz AND available_at<$2::timestamptz)::text AS net_cash_cent FROM f;`,
      [cutoff.business_as_of,cutoff.knowledge_as_of,expected.order_id,fixture.tenant_id])).rows[0];
    compare(`ORDER_${expected.order_id}_${expected.cutoff_id}`,actual,Object.fromEntries(['net_sales_cent','net_cogs_cent','gross_profit_cent','net_cash_cent'].map(k=>[k,expected[k]])));
  }

  for (const [ref,expectedValues] of Object.entries(fixture.unit_allocation_gold)) {
    const order=fixture.orders.find(o=>o.order_ref===ref);
    const rows=(await db.query('SELECT net_cent::text AS net_cent FROM validation_fixture.order_unit WHERE tenant_id=$1 AND order_id=$2 ORDER BY unit_no;',[fixture.tenant_id,order.order_id])).rows;
    compare(`${ref}_UNIT_ALLOCATION`,Object.fromEntries(rows.map((r,i)=>[`unit_${i+1}`,r.net_cent])),Object.fromEntries(expectedValues.map((n,i)=>[`unit_${i+1}`,n])));
  }

  report.passed=report.checks.every(c=>c.passed);
  report.summary={checks:report.checks.length,passed:report.checks.filter(c=>c.passed).length,failed:report.checks.filter(c=>!c.passed).length,field_comparisons:report.checks.reduce((n,c)=>n+c.fields.length,0)};
} catch (error) {
  report.passed=false;
  report.error={name:error.name,message:error.message};
  process.exitCode=1;
} finally {
  if (db) await db.close();
  await mkdir(dirname(reportPath),{recursive:true});
  await writeFile(reportPath,JSON.stringify(printable(report),null,2)+'\n');
}
if (!report.passed) process.exitCode=1;
console.log(JSON.stringify({passed:report.passed,report_path:reportPath,summary:report.summary??null,error:report.error??null}));
