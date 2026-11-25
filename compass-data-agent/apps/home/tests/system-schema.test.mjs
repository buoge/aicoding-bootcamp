import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { parseSystemSchema } from "../scripts/system-schema.mjs";
import { buildDomainDiagram, columnKeys } from "../src/lib/business-schema.ts";

const distributed = new URL("../reference/design/data-model.md", import.meta.url);
const source = existsSync(distributed)
  ? distributed
  : new URL(
      "../../../mai-specs/999-compass-product-course-landing-app/design/data-model.md",
      import.meta.url,
    );
const design = readFileSync(source, "utf8");
const schema = parseSystemSchema(design);

test("the system explorer preserves all 12 domains, 94 tables, 1091 fields and 344 references", () => {
  assert.equal(schema.domains.length, 12);
  assert.equal(schema.tables.length, 94);
  assert.equal(new Set(schema.tables.map((table) => table.name)).size, 94);
  assert.equal(
    schema.tables.reduce((sum, table) => sum + table.columns.length, 0),
    1091,
  );
  assert.equal(schema.relations.length, 344);
  assert.equal(schema.relations.filter((relation) => relation.kind === "logical").length, 180);
  assert.equal(schema.tables.filter((table) => table.phase === "M0").length, 30);
  assert.match(schema.overview.source, /flowchart TB/);
  assert.ok(schema.overview.notes.some((note) => note.includes("复合外键")));
  let edges = 0;
  for (const domain of schema.domains) {
    assert.ok(domain.rationale && domain.boundary);
    const diagram = buildDomainDiagram(schema, domain.id);
    edges += diagram.relationCount;
    assert.equal(diagram.relationCount, buildDomainDiagram(schema, domain.id, false).relationCount);
    for (const table of schema.tables.filter((table) => table.domain === domain.id)) {
      assert.ok(table.constraints && table.rationale);
      assert.ok(diagram.source.includes(`["${table.name}"]`));
      for (const column of table.columns)
        assert.ok(diagram.source.includes(` ${column.name}`), `${table.name}.${column.name}`);
    }
  }
  assert.equal(edges, 344);
});

test("system references retain composite tenancy, global identity and explicit cardinality", () => {
  const reference = (from, name) =>
    schema.relations.find((relation) => relation.name === `${from}_${name}`);
  assert.deepEqual(reference("tenant", "active_config_snapshot_id").columns, [
    "id",
    "active_config_snapshot_id",
  ]);
  assert.deepEqual(reference("tenant", "active_config_snapshot_id").references, [
    "tenant_id",
    "id",
  ]);
  assert.deepEqual(reference("membership", "principal_id").columns, ["principal_id"]);
  assert.deepEqual(reference("message", "reply_to_id").columns, ["tenant_id", "reply_to_id"]);
  assert.deepEqual(reference("query_execution", "attempt_id").cardinality, {
    optional: false,
    unique: true,
  });
  assert.match(
    buildDomainDiagram(schema, "evidence").source,
    /attempt \|\|\.\.o\| query_execution/,
  );
  assert.match(buildDomainDiagram(schema, "conversation").source, /message \|o\.\.o\{ message/);
  // A partial unique index on active events must not be advertised as an unconditional UK.
  assert.deepEqual(schema.tables.find((table) => table.name === "anomaly_event").uniqueKeys, []);
});

test("cross-service memory references remain logical while memory-internal keys stay physical", () => {
  const record = schema.tables.find((table) => table.name === "memory_record");
  const version = schema.tables.find((table) => table.name === "memory_version");
  assert.deepEqual(columnKeys(record, "owner_member_id", schema.relations), ["REF"]);
  assert.ok(columnKeys(version, "memory_record_id", schema.relations).includes("FK"));
  const diagram = buildDomainDiagram(schema, "memory", false).source;
  assert.match(diagram, /membership \|\|\.\.o\{ memory_record : "REF tenant_id, owner_member_id"/);
  assert.match(diagram, /uuid owner_member_id "必填 · REF"/);
  assert.doesNotMatch(diagram, /owner_member_id FK/);
  assert.throws(
    () =>
      parseSystemSchema(
        design.replace('membership ||..o{ memory_record : "REF owner_member_id"', ""),
      ),
    /logical field\/relationship coverage/,
  );
  assert.throws(
    () =>
      parseSystemSchema(design.replace("REF memory.memory_record", "REF memory.memory_version")),
    /logical reference resource_grant.memory_record_id/,
  );
  assert.throws(
    () =>
      parseSystemSchema(
        design.replace(
          'uuid owner_member_id "REF membership"',
          'uuid owner_member_id FK "REF membership"',
        ),
      ),
    /logical reference marked FK/,
  );
});

test("design drift cannot silently omit fields, tables or FK links from the published explorer", () => {
  assert.throws(
    () =>
      parseSystemSchema(
        design.replace(
          'uuid active_config_snapshot_id "REF; NULL"',
          'uuid[] active_config_snapshot_id "REF; NULL"',
        ),
      ),
    /Invalid system design: field/,
  );
  assert.throws(
    () =>
      parseSystemSchema(
        design.replace(
          'config_snapshot |o..o| tenant : "REF active_config_snapshot_id"',
          'config_snapshot |o..o| tenant : "REF missing_id"',
        ),
      ),
    /Invalid system design: FK/,
  );
  assert.throws(
    () => parseSystemSchema(design.replace(/^    tenant \|\|--o\{ membership : "tenant_id"$/m, "")),
    /field\/relationship coverage/,
  );
  assert.throws(
    () => parseSystemSchema(design.replace(/^\|\s*`membership`\s*\|.*\n/m, "")),
    /unowned entity/,
  );
  assert.throws(
    () => parseSystemSchema(design.replace("### 2.12 模块 L：", "### 2.13 模块 M：")),
    /domain order/,
  );
});

test("Markdown table alignment does not change the system model", () => {
  const compact = design.replace(/^\|[ \t]*`(\w+)`[ \t]*\|/gm, "| `$1` |");
  assert.deepEqual(parseSystemSchema(compact), schema);
});
