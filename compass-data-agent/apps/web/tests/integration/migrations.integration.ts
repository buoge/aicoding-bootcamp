import { afterAll, beforeAll, it, expect } from "vitest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { provision } from "../../scripts/db-provision.mjs";
import { migrate } from "../../scripts/db-migrate.mjs";
import { loadRevision, revisions, connectManaged } from "../../scripts/db-common.mjs";
import { writeSql } from "../../scripts/db-sql.mjs";
import { manage } from "../../scripts/db-manage.mjs";
let admin: pg.Client;
let adminUrl: URL;
const databases: string[] = [];
const suffix = randomUUID().slice(0, 8);
let runtimeUrl: URL, managementUrl: URL;
beforeAll(async () => {
  const adminValue = process.env.WEB_TEST_ADMIN_URL,
    runtimeValue = process.env.WEB_TEST_DATABASE_URL,
    migrationValue = process.env.WEB_TEST_MIGRATION_DATABASE_URL;
  if (!adminValue || !runtimeValue || !migrationValue)
    throw new Error(
      "Explicit WEB_TEST_ADMIN_URL and dedicated Web test credentials required for migration acceptance.",
    );
  adminUrl = new URL(adminValue);
  runtimeUrl = new URL(runtimeValue);
  managementUrl = new URL(migrationValue);
  if (
    !/^\/compass_web_test_[a-z0-9_]+$/.test(runtimeUrl.pathname) ||
    runtimeUrl.host !== adminUrl.host ||
    managementUrl.host !== adminUrl.host
  )
    throw new Error("Test database targets must share an explicit cluster");
  admin = new pg.Client({ connectionString: adminUrl.href });
  await admin.connect();
});
afterAll(async () => {
  if (admin) {
    for (const db of databases) await admin.query(`DROP DATABASE "${db}" WITH (FORCE)`);
    await admin.end();
  }
});
async function target(name: string) {
  const db = `compass_web_test_${suffix}_${name}`;
  databases.push(db);
  const migration = new URL(managementUrl),
    runtime = new URL(runtimeUrl);
  migration.pathname = runtime.pathname = `/${db}`;
  process.env.WEB_PROVISION_DATABASE_URL = adminUrl.href;
  process.env.WEB_MIGRATION_DATABASE_URL = migration.href;
  process.env.WEB_DATABASE_URL = runtime.href;
  await provision();
  return migration.href;
}
async function schema(url: string) {
  const client = await connectManaged(url);
  try {
    return {
      columns: (
        await client.query(
          "SELECT table_schema,table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema IN ('web','web_meta') ORDER BY table_schema,table_name,ordinal_position",
        )
      ).rows,
      constraints: (
        await client.query(
          "SELECT n.nspname,c.relname,t.conname,pg_get_constraintdef(t.oid) AS definition FROM pg_constraint t JOIN pg_class c ON c.oid=t.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('web','web_meta') ORDER BY n.nspname,c.relname,t.conname",
        )
      ).rows,
      indexes: (
        await client.query(
          "SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname IN ('web','web_meta') ORDER BY schemaname,tablename,indexname",
        )
      ).rows,
      grants: (
        await client.query(
          "SELECT table_schema,table_name,grantee,privilege_type FROM information_schema.table_privileges WHERE table_schema IN ('web','web_meta') ORDER BY table_schema,table_name,grantee,privilege_type",
        )
      ).rows,
      columnGrants: (
        await client.query(
          "SELECT table_schema,table_name,column_name,grantee,privilege_type FROM information_schema.column_privileges WHERE table_schema IN ('web','web_meta') ORDER BY table_schema,table_name,column_name,grantee,privilege_type",
        )
      ).rows,
      ledger: (await client.query("SELECT name FROM web_meta.pgmigrations ORDER BY id")).rows,
    };
  } finally {
    await client.end();
  }
}
it("installs native and complete SQL identically, preserves data on replay, and rejects drift", async () => {
  await writeSql(true);
  const native = await target("native"),
    sql = await target("sql"),
    unknown = await target("unknown");
  expect((await Promise.all([migrate({ url: native }), migrate({ url: native })])).sort()).toEqual([
    "already_applied",
    "applied",
  ]);
  expect(await migrate({ mode: "sql", from: "empty", url: sql })).toBe("applied");
  expect(await schema(native)).toEqual(await schema(sql));
  const client = await connectManaged(native);
  try {
    const id = randomUUID();
    await client.query(
      "INSERT INTO web.app_user(id,login_name,password_hash,display_name) VALUES($1,'persist.test','fixture-only','Preserved')",
      [id],
    );
    expect(await migrate({ url: native })).toBe("already_applied");
    expect(await migrate({ mode: "sql", url: sql })).toBe("already_applied");
    expect(
      (await client.query("SELECT display_name FROM web.app_user WHERE id=$1", [id])).rows[0]
        .display_name,
    ).toBe("Preserved");
    await client.query("UPDATE web_meta.migration_source SET sha256=repeat('0',64)");
    await expect(migrate({ url: native })).rejects.toThrow(/checksum/);
    for (const id of revisions)
      await client.query("UPDATE web_meta.migration_source SET sha256=$1 WHERE revision=$2", [
        (await loadRevision(id)).sha256,
        id,
      ]);
  } finally {
    await client.end();
  }
  await expect(migrate({ url: unknown, from: "0001_web_foundation" })).rejects.toThrow(/starting/);
  const other = await connectManaged(unknown);
  try {
    await other.query("CREATE VIEW public.unexpected AS SELECT 1 AS n");
    await expect(migrate({ url: unknown })).rejects.toThrow(/Unknown/);
  } finally {
    await other.end();
  }
  await expect(migrate({ url: adminUrl.href })).rejects.toThrow(/Unregistered/);
}, 30000);

function postgresTool(tool: string, url: string, input?: Buffer): Buffer {
  const connection = new URL(url),
    container = process.env.WEB_TEST_PG_CONTAINER;
  const env = {
    PGHOST: container ? "127.0.0.1" : connection.hostname,
    PGPORT: container ? "5432" : connection.port || "5432",
    PGUSER: decodeURIComponent(connection.username),
    PGPASSWORD: decodeURIComponent(connection.password),
    PGDATABASE: connection.pathname.slice(1),
  };
  const args =
    tool === "pg_dump"
      ? ["--format=custom"]
      : [
          "--exit-on-error",
          "--no-owner",
          "--role=compass_web_owner",
          `--dbname=${connection.pathname.slice(1)}`,
        ];
  const result = container
    ? spawnSync(
        "docker",
        [
          "exec",
          "-i",
          ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
          container,
          tool,
          ...args,
        ],
        { input, maxBuffer: 20 * 1024 * 1024 },
      )
    : spawnSync(tool, args, {
        env: { ...process.env, ...env },
        input,
        maxBuffer: 20 * 1024 * 1024,
      });
  if (result.status !== 0)
    throw new Error(
      `${tool} failed; install PostgreSQL 17 tools or set WEB_TEST_PG_CONTAINER to the dedicated test cluster container.`,
    );
  return result.stdout;
}
it("restores representative data and permissions into a new database, then invalidates restored sessions", async () => {
  const source = await target("backup"),
    destination = await target("restore");
  await migrate({ url: source });
  const created = await manage({
    action: "create-user",
    loginName: "restore.admin",
    displayName: "Restored Admin",
    platformAdmin: true,
    password: "restore-test-password",
    url: source,
  });
  const client = await connectManaged(source);
  try {
    await client.query(
      "INSERT INTO web.web_session(id,user_id,token_hash,device_label,expires_at) VALUES($1,$2,$3,'Restore fixture',now()+interval '1 hour')",
      [randomUUID(), created.id, Buffer.alloc(32, 1)],
    );
  } finally {
    await client.end();
  }
  const dump = postgresTool("pg_dump", source);
  expect(dump.byteLength).toBeGreaterThan(1000);
  postgresTool("pg_restore", destination, dump);
  expect(await schema(destination)).toEqual(await schema(source));
  expect(await migrate({ url: destination })).toBe("already_applied");
  const restored = await connectManaged(destination);
  try {
    expect(
      (await restored.query("SELECT display_name FROM web.app_user WHERE id=$1", [created.id]))
        .rows[0].display_name,
    ).toBe("Restored Admin");
    expect(
      (
        await restored.query(
          "SELECT count(*)::int AS n FROM web.web_session WHERE revoked_at IS NULL",
        )
      ).rows[0].n,
    ).toBe(1);
    await restored.query(
      "BEGIN; UPDATE web.web_session SET revoked_at=now() WHERE revoked_at IS NULL; COMMIT",
    );
    expect(
      (
        await restored.query(
          "SELECT count(*)::int AS n FROM web.web_session WHERE revoked_at IS NULL",
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await restored.end();
  }
}, 30000);

it("upgrades v1 through native and incremental SQL while retaining IDs and enforcing scoped slugs", async () => {
  const urls = [await target("upgrade_native"), await target("upgrade_sql")];
  for (const [index, url] of urls.entries()) {
    await migrate({ url, to: "0001_web_foundation" });
    const client = await connectManaged(url);
    try {
      await client.query(
        "INSERT INTO web.tenant(id,name,timezone) VALUES('99500000-0000-4000-8000-000000000010','远山零售','UTC'),('99500000-0000-4000-8000-000000000011','星河商贸','UTC')",
      );
      await client.query(
        "INSERT INTO web.workspace(id,tenant_id,name) VALUES('99500000-0000-4000-8000-000000000021','99500000-0000-4000-8000-000000000010','华东区域')",
      );
      await migrate({ url, from: "0001_web_foundation", mode: index ? "sql" : "native" });
      expect(
        (await client.query("SELECT slug FROM web.tenant ORDER BY id")).rows.map((row) => row.slug),
      ).toEqual(["yuanshan", "xinghe"]);
      expect((await client.query("SELECT slug FROM web.workspace")).rows[0].slug).toBe("huadong");
      await expect(
        client.query(
          "INSERT INTO web.tenant(id,name,timezone,slug) VALUES(gen_random_uuid(),'Duplicate','UTC','yuanshan')",
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await expect(
        client.query(
          "INSERT INTO web.workspace(id,tenant_id,name,slug) VALUES(gen_random_uuid(),'99500000-0000-4000-8000-000000000010','Duplicate','huadong')",
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await client.query(
        "INSERT INTO web.workspace(id,tenant_id,name,slug) VALUES(gen_random_uuid(),'99500000-0000-4000-8000-000000000011','Other tenant','huadong')",
      );
      await expect(
        client.query("UPDATE web.tenant SET slug='../invalid' WHERE slug='xinghe'"),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.end();
    }
  }
  expect(await schema(urls[0])).toEqual(await schema(urls[1]));
}, 30000);
