import { schemaDomains } from "../src/lib/business-schema.ts";

// Parse the deliberately constrained canonical DDL, never a database or arbitrary SQL.
// New syntax or unassigned tables must fail preparation rather than disappear from the UI.
export function parseBusinessSchema(sql, design) {
  const ownership = new Map();
  for (const [index, section] of [
    ...design.matchAll(/^### 3\.\d+ .+\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm),
  ].entries()) {
    if (!schemaDomains[index]) throw new Error("Unregistered business domain");
    for (const match of section[1].matchAll(/^\| `((?:core|ops|sec)\.\w+)` \|/gm)) {
      ownership.set(match[1], schemaDomains[index].id);
    }
  }
  // Approved additions in TECH_DESIGN §10.13 / §11.10, grouped by business responsibility.
  for (const [name, domain] of Object.entries({
    "core.order_delivery_address": "fulfillment",
    "core.store_operating_day": "organization",
    "core.price_exposure": "marketing",
    "core.campaign_attribution_daily": "marketing",
    "core.intervention_definition": "marketing",
    "core.intervention_cohort": "marketing",
    "core.procurement_revision": "inventory",
    "ops.asset_period_status": "operations",
  }))
    ownership.set(name, domain);

  const comments = new Map(
    [...sql.matchAll(/COMMENT ON (?:TABLE|COLUMN) ([\w.]+) IS '((?:[^']|'')*)';/g)].map((match) => [
      match[1],
      match[2].replaceAll("''", "'"),
    ]),
  );
  const names = (value) => value.split(",").map((name) => name.trim());
  const tables = [...sql.matchAll(/CREATE TABLE ([\w.]+) \(\n([\s\S]*?)\n\);/g)].map((match) => {
    const [, name, body] = match;
    const domain = ownership.get(name);
    if (!domain) throw new Error(`Assign a domain to ${name}`);
    const primaryKey = names(body.match(/PRIMARY KEY \(([^)]+)\)/)?.[1] ?? "");
    const columns = body.split("\n").flatMap((line) => {
      const column = line.match(
        /^\s+([a-z][a-z_0-9]*)\s+([a-z]+(?:\([\d, ]+\))?(?:\[\])?)(.*?),?$/,
      );
      if (!column) {
        if (!/^\s*(?:PRIMARY KEY|UNIQUE|CHECK|$)/.test(line))
          throw new Error(`Unsupported DDL: ${name}: ${line}`);
        return [];
      }
      if (!/^(?:\s+NOT NULL)?(?:\s+DEFAULT\s+.+)?$/.test(column[3]))
        throw new Error(`Unsupported column definition: ${name}: ${line}`);
      return [
        {
          name: column[1],
          type: column[2],
          nullable: !column[3].includes("NOT NULL") && !primaryKey.includes(column[1]),
          description: comments.get(`${name}.${column[1]}`) ?? "",
        },
      ];
    });
    if (
      !columns.length ||
      !primaryKey.every((key) => columns.some((column) => column.name === key))
    )
      throw new Error(`Invalid table: ${name}`);
    return {
      name,
      domain,
      description: comments.get(name) ?? "",
      columns,
      primaryKey,
      uniqueKeys: [...body.matchAll(/UNIQUE \(([^)]+)\)/g)].map((key) => names(key[1])),
    };
  });
  if (tables.length !== [...sql.matchAll(/CREATE TABLE /g)].length)
    throw new Error("Unparsed CREATE TABLE");
  const relations = [
    ...sql.matchAll(
      /ALTER TABLE ([\w.]+) ADD CONSTRAINT (\w+) FOREIGN KEY \(([^)]+)\) REFERENCES ([\w.]+) \(([^)]+)\)/g,
    ),
  ].map(([, from, name, columns, to, references]) => ({
    name,
    from,
    columns: names(columns),
    to,
    references: names(references),
  }));
  if (relations.length !== [...sql.matchAll(/FOREIGN KEY /g)].length)
    throw new Error("Unparsed foreign key");
  for (const relation of relations) {
    for (const [name, columns] of [
      [relation.from, relation.columns],
      [relation.to, relation.references],
    ]) {
      const table = tables.find((table) => table.name === name);
      if (!table || !columns.every((name) => table.columns.some((column) => column.name === name)))
        throw new Error(`Invalid FK: ${relation.name}`);
    }
    if (relation.columns.length !== relation.references.length)
      throw new Error(`Invalid FK arity: ${relation.name}`);
  }
  if (schemaDomains.some((domain) => !tables.some((table) => table.domain === domain.id)))
    throw new Error("Empty business domain");
  return { domains: schemaDomains, tables, relations };
}
