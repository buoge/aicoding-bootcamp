import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { parseBusinessSchema } from "../scripts/business-schema.mjs";
import { buildDomainDiagram } from "../src/lib/business-schema.ts";

const distributed = new URL("../reference/business-data/", import.meta.url);
const source = existsSync(distributed)
  ? distributed
  : new URL("../../../mai-specs/998-business-data-seeding-tool/design/", import.meta.url);
const sql = readFileSync(new URL("business-schema.sql", source), "utf8");
const design = readFileSync(new URL("TECH_DESIGN.md", source), "utf8");
const schema = parseBusinessSchema(sql, design);

test("the domain explorer covers the current approved 71-table schema and every FK", () => {
  assert.equal(schema.tables.length, 71);
  assert.equal(
    schema.tables.reduce((total, table) => total + table.columns.length, 0),
    748,
  );
  assert.equal(schema.relations.length, 247);
  assert.equal(schema.domains.length, 9);
  assert.equal(new Set(schema.tables.map((table) => table.name)).size, 71);
  let relations = 0;
  for (const domain of schema.domains) {
    const diagram = buildDomainDiagram(schema, domain.id);
    relations += diagram.relationCount;
    for (const table of schema.tables.filter((table) => table.domain === domain.id)) {
      assert.ok(diagram.source.includes(`["${table.name}"]`), table.name);
      for (const column of table.columns)
        assert.ok(diagram.source.includes(` ${column.name}`), `${table.name}.${column.name}`);
    }
  }
  assert.equal(relations, schema.relations.length);
});

test("nullable composite keys, one-to-one and self references keep their cardinality", () => {
  const fulfillment = buildDomainDiagram(schema, "fulfillment").source;
  assert.match(
    fulfillment,
    /core_order_header \|\|\.\.o\| core_order_delivery_address : "tenant_id, order_id, region_id"/,
  );
  const organization = buildDomainDiagram(schema, "organization").source;
  assert.match(organization, /core_geo_area \|o\.\.o\{ core_geo_area : "tenant_id, parent_geo_id"/);
  assert.ok(organization.includes('ops_dataset_release["ops.dataset_release · 外域"]'));
  assert.ok(organization.includes('core_calendar["core.calendar"]'));
  assert.equal(
    schema.tables
      .find((table) => table.name === "core.tenant")
      .columns.find((column) => column.name === "currency").type,
    "char(3)",
  );
});

test("key-only view retains all relationships; later additions have an explicit domain", () => {
  for (const domain of schema.domains) {
    const full = buildDomainDiagram(schema, domain.id);
    const keys = buildDomainDiagram(schema, domain.id, false);
    assert.equal(full.relationCount, keys.relationCount);
    assert.equal(full.referenceCount, keys.referenceCount);
  }
  for (const [name, domain] of [
    ["core.order_delivery_address", "fulfillment"],
    ["core.procurement_revision", "inventory"],
    ["ops.asset_period_status", "operations"],
    ["core.intervention_cohort", "marketing"],
    ["core.store_operating_day", "organization"],
  ]) {
    assert.equal(schema.tables.find((table) => table.name === name)?.domain, domain);
  }
});

test("unmapped tables and unparsed SQL fail preparation instead of silently losing data", () => {
  assert.throws(
    () =>
      parseBusinessSchema(
        `${sql}\nCREATE TABLE core.unassigned (\n    id bigint NOT NULL,\n    PRIMARY KEY (id)\n);`,
        design,
      ),
    /Assign a domain/,
  );
  assert.throws(
    () =>
      parseBusinessSchema(sql.replace("tenant_id smallint", "tenant_id double precision"), design),
    /Invalid|Unsupported/,
  );
  assert.throws(
    () =>
      parseBusinessSchema(
        sql.replace(
          "REFERENCES core.site (tenant_id, site_id)",
          "REFERENCES core.site (tenant_id, missing_id)",
        ),
        design,
      ),
    /Invalid FK/,
  );
});
