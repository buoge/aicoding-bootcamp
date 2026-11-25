export type SchemaColumn = {
  name: string;
  type: string;
  nullable: boolean;
  description: string;
};

export type SchemaRelation = {
  name: string;
  from: string;
  columns: string[];
  to: string;
  references: string[];
  kind?: "foreign-key" | "logical";
  cardinality?: { optional: boolean; unique: boolean };
};

export type SchemaTable = {
  name: string;
  domain: string;
  description: string;
  columns: SchemaColumn[];
  primaryKey: string[];
  uniqueKeys: string[][];
  phase?: string;
  constraints?: string;
  rationale?: string;
};

export type SchemaDomain = {
  id: string;
  label: string;
  title: string;
  description: string;
  rationale?: string;
  boundary?: string;
};

export type DatabaseSchema = {
  domains: SchemaDomain[];
  tables: SchemaTable[];
  relations: SchemaRelation[];
  overview?: { source: string; notes: string[] };
};

export type BusinessSchema = DatabaseSchema;

// The SQL and TECH_DESIGN remain canonical. Only navigation copy lives here.
export const schemaDomains: SchemaDomain[] = [
  {
    id: "organization",
    label: "组织渠道",
    title: "组织、区域与渠道",
    description: "企业、组织、地理、仓店与渠道，定义整条业务链的经营坐标。",
  },
  {
    id: "product",
    label: "商品价格",
    title: "商品、经营范围与价格",
    description: "从品牌、品类与 SPU 到 SKU，连接上架、经营范围和有效期价格。",
  },
  {
    id: "customer",
    label: "会员身份",
    title: "会员与渠道身份",
    description: "会员与渠道身份独立建模，绑定关系保留当时可知的身份信息。",
  },
  {
    id: "trade",
    label: "交易支付",
    title: "交易、支付与退款",
    description: "订单头、商品行与逻辑单件，贯穿优惠分摊、支付尝试和现金退款。",
  },
  {
    id: "fulfillment",
    label: "履约售后",
    title: "履约与售后",
    description: "包裹与单件关联实际库存批次；交付、退货、验收和收件地址均可追溯。",
  },
  {
    id: "inventory",
    label: "库存供应",
    title: "库存与供应流转",
    description: "从采购计划、到货修订到批次流水，重建锁库、调拨、实物与估值。",
  },
  {
    id: "finance",
    label: "财务目标",
    title: "财务经营与目标",
    description: "收入、原批次成本、订单费用与月目标，分别保留确认和冲回依据。",
  },
  {
    id: "marketing",
    label: "营销实验",
    title: "营销、流量与实验",
    description: "活动、流量、归因与实验，包含价格曝光、干预队列和未转化样本。",
  },
  {
    id: "operations",
    label: "生产权限",
    title: "业务生产与源侧权限",
    description: "发布、采集、生成与完整度记录，以及数据库登录身份和区域授权。",
  },
];

const nodeId = (name: string) => name.replaceAll(".", "_");

export function columnKeys(table: SchemaTable, column: string, relations: SchemaRelation[]) {
  return [
    table.primaryKey.includes(column) ? "PK" : "",
    relations.some(
      (relation) =>
        relation.kind !== "logical" &&
        relation.from === table.name &&
        relation.columns.includes(column),
    )
      ? "FK"
      : "",
    relations.some(
      (relation) =>
        relation.kind === "logical" &&
        relation.from === table.name &&
        relation.columns.includes(column),
    )
      ? "REF"
      : "",
    table.uniqueKeys.some((key) => key.includes(column)) ? "UK" : "",
  ].filter(Boolean);
}

/** Every relation is drawn in its child table's domain, including logical references. */
export function buildDomainDiagram(schema: DatabaseSchema, domainId: string, allFields = true) {
  const owned = schema.tables.filter((table) => table.domain === domainId);
  const ownedNames = new Set(owned.map((table) => table.name));
  const relations = schema.relations.filter((relation) => ownedNames.has(relation.from));
  const references = new Set(relations.map((relation) => relation.to));
  const tables = schema.tables.filter(
    (table) => ownedNames.has(table.name) || references.has(table.name),
  );
  const lines = ["erDiagram", "    direction LR"];
  for (const table of tables) {
    const external = !ownedNames.has(table.name);
    const referencedColumns = relations
      .filter((relation) => relation.to === table.name)
      .flatMap((relation) => relation.references);
    lines.push(`    ${nodeId(table.name)}["${table.name}${external ? " · 外域" : ""}"] {`);
    for (const column of table.columns) {
      const keys = columnKeys(table, column.name, schema.relations);
      if (
        external
          ? !table.primaryKey.includes(column.name) && !referencedColumns.includes(column.name)
          : !allFields && !keys.includes("PK") && !keys.includes("FK") && !keys.includes("REF")
      )
        continue;
      const type = column.type.replace(/\([^)]*,[^)]*\)/, "").replaceAll(" ", "_");
      const detail = `${column.type !== type ? `${column.type} · ` : ""}${column.nullable ? "可空" : "必填"}${keys.includes("REF") ? " · REF" : ""}`;
      const mermaidKeys = keys.filter((key) => key !== "REF");
      lines.push(
        `        ${type} ${column.name}${mermaidKeys.length ? ` ${mermaidKeys.join(", ")}` : ""} "${detail}"`,
      );
    }
    lines.push("    }");
  }
  for (const relation of relations) {
    const child = owned.find((table) => table.name === relation.from)!;
    const optional =
      relation.cardinality?.optional ??
      relation.columns.some(
        (name) => child.columns.find((column) => column.name === name)!.nullable,
      );
    const unique =
      relation.cardinality?.unique ??
      [child.primaryKey, ...child.uniqueKeys].some((key) =>
        key.every((name) => relation.columns.includes(name)),
      );
    const identifying =
      relation.kind !== "logical" &&
      relation.columns.every((name) => child.primaryKey.includes(name));
    lines.push(
      `    ${nodeId(relation.to)} ${optional ? "|o" : "||"}${identifying ? "--" : ".."}${unique ? "o|" : "o{"} ${nodeId(relation.from)} : "${relation.kind === "logical" ? "REF " : ""}${relation.columns.join(", ")}"`,
    );
  }
  lines.push("    classDef external fill:#f1f3ee,stroke:#8d9b90,color:#58675e");
  for (const table of tables.filter((table) => !ownedNames.has(table.name))) {
    lines.push(`    class ${nodeId(table.name)} external`);
  }
  return {
    source: lines.join("\n"),
    tableCount: owned.length,
    referenceCount: tables.length - owned.length,
    relationCount: relations.length,
  };
}
