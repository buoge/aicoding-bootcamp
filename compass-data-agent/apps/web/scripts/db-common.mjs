import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const revisions = ["0001_web_foundation", "0002_readable_routes"];
export const revision = revisions.at(-1);
export const databaseRoot = new URL("../db/main/", import.meta.url);
export const migrationDirectory = fileURLToPath(new URL("migrations/", databaseRoot));
export const lockKey = "995001";
export const databaseMarker = "compass:web/main";
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
export const identifier = (value) => `"${String(value).replaceAll('"', '""')}"`;

export async function loadRevision(id = revision) {
  if (!revisions.includes(id)) throw new Error("Unknown migration revision");
  const path = new URL(`migrations/${id}.sql`, databaseRoot);
  const bytes = await readFile(path);
  const text = bytes.toString("utf8");
  const segments = text.split(/^-- (?:Up|Down) Migration\s*$/m);
  if (
    segments.length !== 3 ||
    !text.includes("-- Up Migration") ||
    !text.includes("-- Down Migration")
  )
    throw new Error("Invalid migration markers");
  return { id, path: fileURLToPath(path), sha256: hash(bytes), up: segments[1].trim() };
}

export function connectionUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("PostgreSQL URL required");
  if (
    name !== "WEB_PROVISION_DATABASE_URL" &&
    !/^\/compass_web(?:_[a-z0-9_]+)?$/.test(url.pathname)
  )
    throw new Error("Refusing a non-Web database target");
  return value;
}

export async function connectManaged(url = connectionUrl("WEB_MIGRATION_DATABASE_URL")) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const {
      rows: [db],
    } = await client.query(
      "SELECT current_database() AS name, shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname=current_database()",
    );
    if (!/^compass_web(?:_[a-z0-9_]+)?$/.test(db.name) || db.marker !== databaseMarker)
      throw new Error("Unregistered Web database target");
    await client.query("SET ROLE compass_web_owner");
    await client.query(
      "SET lock_timeout='5s'; SET statement_timeout='30s'; SET search_path=web,pg_catalog",
    );
    return client;
  } catch (error) {
    await client.end();
    throw error;
  }
}

export async function withMigrationLock(work, url) {
  const client = await connectManaged(url);
  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [lockKey]);
    return await work(client);
  } finally {
    await client.end();
  }
}

export async function inspectVersion(client) {
  const unexpected =
    await client.query(`SELECT nspname FROM pg_namespace WHERE nspname NOT IN ('public','web','web_meta','information_schema') AND nspname NOT LIKE 'pg_%'
    UNION ALL SELECT n.nspname||'.'||c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','web','web_meta') AND c.relkind IN ('v','m','f')
    UNION ALL SELECT n.nspname||'.'||p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','web','web_meta')`);
  if (unexpected.rows.length) throw new Error("Unknown database objects; refusing migration");
  const { rows: tables } = await client.query(
    "SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,tablename",
  );
  const names = tables.map((t) => `${t.schemaname}.${t.tablename}`);
  if (names.length === 0) return "empty";
  if (names.length === 1 && names[0] === "web_meta.pgmigrations") {
    const { rows } = await client.query("SELECT * FROM web_meta.pgmigrations");
    const { rows: columns } = await client.query(
      "SELECT column_name,udt_name FROM information_schema.columns WHERE table_schema='web_meta' AND table_name='pgmigrations' ORDER BY ordinal_position",
    );
    if (
      rows.length === 0 &&
      JSON.stringify(columns) ===
        JSON.stringify([
          { column_name: "id", udt_name: "int4" },
          { column_name: "name", udt_name: "varchar" },
          { column_name: "run_on", udt_name: "timestamp" },
        ])
    )
      return "empty";
  }
  const expected = [
    "app_user",
    "audit_event",
    "notification",
    "tenant",
    "tenant_member",
    "web_session",
    "workspace",
    "workspace_member",
  ]
    .map((n) => `web.${n}`)
    .concat(["web_meta.migration_source", "web_meta.pgmigrations"])
    .sort();
  if (JSON.stringify(names) !== JSON.stringify(expected))
    throw new Error("Unknown database objects; refusing migration");
  const { rows: ledger } = await client.query("SELECT name FROM web_meta.pgmigrations ORDER BY id");
  const { rows: sources } = await client.query(
    "SELECT revision,sha256 FROM web_meta.migration_source ORDER BY revision",
  );
  if (!ledger.length || ledger.length > revisions.length || sources.length !== ledger.length)
    throw new Error("Migration history or source checksum mismatch");
  for (let i = 0; i < ledger.length; i++) {
    const source = await loadRevision(revisions[i]);
    if (
      ledger[i].name !== source.id ||
      sources[i].revision !== source.id ||
      sources[i].sha256 !== source.sha256
    )
      throw new Error("Migration history or source checksum mismatch");
  }
  return ledger.at(-1).name;
}

export function sourceRecordSql(source) {
  return `INSERT INTO web_meta.migration_source(revision,sha256) VALUES (${literal(source.id)},${literal(source.sha256)});`;
}

export function cli(main) {
  main().catch((error) => {
    // Database exceptions can include statements/credentials; print only approved local errors.
    console.error(
      error.code
        ? `Web database operation failed (${error.code}).`
        : String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]"),
    );
    process.exitCode = 1;
  });
}
