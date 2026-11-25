import { systemSchemaDomains } from "../src/lib/system-schema.ts";

const plain = (text) => text.replaceAll("**", "").replaceAll("`", "").trim();
const fail = (message) => {
  throw new Error(`Invalid system design: ${message}`);
};

// Read only the canonical document's deliberately constrained module format.
// Any unparsed table/field/relation fails asset preparation instead of shrinking the model.
export function parseSystemSchema(design) {
  const modules = [
    ...design.matchAll(
      /^### 2\.([1-9]\d*) 模块 ([A-Z])：([^\n]+)\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm,
    ),
  ];
  if (modules.length !== systemSchemaDomains.length) fail("domain count");
  const tables = [];
  const relations = [];
  const domains = [];
  const declaredFks = new Set();
  const declaredRefs = new Map();
  const uniqueNames = new Set();
  const externalNames = new Set();
  for (const [index, match] of modules.entries()) {
    const [, number, letter, title, body] = match;
    if (Number(number) !== index + 1 || letter !== String.fromCharCode(65 + index))
      fail("domain order");
    const sectionText = (label) => {
      const value = body.match(new RegExp(`\\*\\*${label}：\\*\\*([^\\n]+)`))?.[1];
      if (!value) fail(`${letter} missing ${label}`);
      return plain(value);
    };
    const domain = {
      ...systemSchemaDomains[index],
      title,
      description: sectionText("本域回答"),
      rationale: sectionText("为什么这样设计"),
      boundary: sectionText("边界"),
    };
    domains.push(domain);
    const sources = [...body.matchAll(/```mermaid\n([\s\S]*?)\n```/g)];
    if (sources.length !== 1 || !sources[0][1].includes("erDiagram")) fail(`${letter} ER block`);
    const source = sources[0][1];
    const definitions = new Map();
    let rest = source.replace(/^[\s\S]*?erDiagram\s*\n/, "").replace(/^\s*direction LR\s*$/m, "");
    rest = rest.replace(/^    (\w+) \{\n([\s\S]*?)^    \}/gm, (_, name, fields) => {
      if (definitions.has(name)) fail(`duplicate entity ${name}`);
      definitions.set(name, fields);
      return "";
    });
    const ownership = new Set();
    for (const line of body.split("\n").filter((line) => /^\|\s*`\w+`\s*\|/.test(line))) {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      if (cells.length !== 5 || !/^M[0-5]$/.test(cells[2])) fail(`${letter} table row`);
      const name = cells[0].replaceAll("`", "");
      if (uniqueNames.has(name) || !definitions.has(name)) fail(`table ${name}`);
      uniqueNames.add(name);
      ownership.add(name);
      const primaryKey = [];
      const columns = definitions
        .get(name)
        .trim()
        .split("\n")
        .map((line) => {
          const column = line.trim().match(/^(\w+) (\w+)(?: (PK(?:, FK)?|FK))?(?: "([^"]+)")?$/);
          if (!column) fail(`field ${name}: ${line}`);
          const [, type, field, keys, annotation] = column;
          const reference = annotation?.match(
            /^(?:NULL; )?REF (?:memory\.)?(\w+)(?:; internal composite keys)?$/,
          );
          const unnamedReference = annotation === "REF" || annotation === "REF; NULL";
          if (annotation && annotation !== "NULL" && !reference && !unnamedReference)
            fail(`field ${name}: ${line}`);
          if (reference || unnamedReference) {
            if (keys?.includes("FK")) fail(`logical reference marked FK: ${name}.${field}`);
            declaredRefs.set(`${name}.${field}`, reference?.[1] ?? null);
          }
          if (keys?.includes("PK")) primaryKey.push(field);
          if (keys?.includes("FK")) declaredFks.add(`${name}.${field}`);
          return {
            name: field,
            type,
            nullable:
              annotation === "NULL" ||
              annotation === "REF; NULL" ||
              Boolean(annotation?.startsWith("NULL; ")),
            description: reference ? `REF ${reference[1]}` : unnamedReference ? "REF" : "",
          };
        });
      if (!primaryKey.length || new Set(columns.map((c) => c.name)).size !== columns.length)
        fail(`keys/columns ${name}`);
      const scoped = columns.some((c) => c.name === "tenant_id");
      const uniqueKeys = [];
      for (const key of cells[3].matchAll(/U\(([^)]+)\)/g)) {
        // Conditional uniqueness stays in the full prose constraints; do not call it global UK.
        const clauseStart = cells[3].lastIndexOf("；", key.index) + 1;
        const clauseEnd = cells[3].indexOf("；", key.index);
        const clause = cells[3].slice(clauseStart, clauseEnd < 0 ? undefined : clauseEnd);
        if (/活跃|WHERE|当前 U/.test(clause)) continue;
        const names = key[1].split(",").map((s) => s.trim());
        if (!names.every((n) => /^[a-z_]+$/.test(n))) continue;
        if (!names.every((n) => columns.some((c) => c.name === n))) fail(`unique key ${name}`);
        uniqueKeys.push([...new Set([...(scoped ? ["tenant_id"] : []), ...names])]);
      }
      tables.push({
        name,
        domain: domain.id,
        description: plain(cells[1]),
        columns,
        primaryKey,
        uniqueKeys,
        phase: cells[2],
        constraints: plain(cells[3]),
        rationale: plain(cells[4]),
      });
    }
    if (!ownership.size) fail(`${letter} empty domain`);
    for (const [name, fields] of definitions) {
      if (!ownership.has(name)) {
        if (
          !fields
            .trim()
            .split("\n")
            .every((line) => /^\s+\w+ \w+ PK "外域(?:逻辑)?引用"$/.test(`    ${line.trim()}`))
        )
          fail(`unowned entity ${name}`);
        externalNames.add(name);
      }
    }
    rest = rest.replace(
      /^    (\w+) (\|\||\|o)(--|\.\.)(o\{|o\|) (\w+) : "(REF )?(\w+)"$/gm,
      (_, to, parent, connector, child, from, logical, column) => {
        if (!ownership.has(from) || !definitions.has(to)) fail(`relation ${from}.${column}`);
        if ((connector === "..") !== Boolean(logical)) fail(`relation kind ${from}.${column}`);
        relations.push({
          name: `${from}_${column}`,
          from,
          to,
          columns: [column],
          references: ["id"],
          kind: logical ? "logical" : "foreign-key",
          cardinality: { optional: parent === "|o", unique: child === "o|" },
        });
        return "";
      },
    );
    if (rest.trim()) fail(`${letter} unsupported ER syntax: ${rest.trim()}`);
  }
  if ([...externalNames].some((name) => !uniqueNames.has(name))) fail("unknown external entity");
  const parsedFks = new Set();
  const parsedRefs = new Set();
  for (const relation of relations) {
    const child = tables.find((t) => t.name === relation.from);
    const parent = tables.find((t) => t.name === relation.to);
    const column = relation.columns[0];
    const key = `${relation.from}.${column}`;
    if (
      !parent ||
      !child.columns.some((c) => c.name === column) ||
      parsedFks.has(key) ||
      parsedRefs.has(key)
    )
      fail(`FK ${key}`);
    if (relation.kind === "logical") {
      if (
        !declaredRefs.has(key) ||
        (declaredRefs.get(key) !== null && declaredRefs.get(key) !== relation.to)
      )
        fail(`logical reference ${key}`);
      // Short REF annotations take the target from their explicitly declared ER edge.
      const field = child.columns.find((column) => column.name === relation.columns[0]);
      field.description = `REF ${relation.to}`;
      parsedRefs.add(key);
    } else {
      parsedFks.add(key);
    }
    if (child.name === "tenant" && column === "active_config_snapshot_id") {
      relation.columns = ["id", column];
      relation.references = ["tenant_id", "id"];
    } else if (parent.columns.some((c) => c.name === "tenant_id")) {
      relation.columns = ["tenant_id", column];
      relation.references = ["tenant_id", "id"];
    }
    if (
      !relation.columns.every((n) => child.columns.some((c) => c.name === n)) ||
      !relation.references.every((n) => parent.columns.some((c) => c.name === n))
    )
      fail(`composite FK ${key}`);
  }
  if (parsedFks.size !== declaredFks.size || [...declaredFks].some((key) => !parsedFks.has(key)))
    fail("field/relationship coverage");
  if (
    parsedRefs.size !== declaredRefs.size ||
    [...declaredRefs.keys()].some((key) => !parsedRefs.has(key))
  )
    fail("logical field/relationship coverage");
  const overviewSection = design.match(/^### 1\.3 [^\n]+\n([\s\S]*?)(?=^### )/m)?.[1];
  const source = overviewSection?.match(/```mermaid\n([\s\S]*?)\n```/)?.[1];
  const notesSection = design.match(/^### 2\.0 [^\n]+\n([\s\S]*?)(?=<a id="domain-a")/m)?.[1];
  if (!source || !notesSection) fail("overview/common constraints");
  const notes = notesSection
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => plain(line.slice(2)));
  if (!notes.length) fail("common constraints");
  return { domains, tables, relations, overview: { source, notes } };
}
