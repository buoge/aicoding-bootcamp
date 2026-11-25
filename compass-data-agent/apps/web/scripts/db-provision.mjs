import pg from "pg";
import { fileURLToPath } from "node:url";
import { connectionUrl, databaseMarker, identifier, literal, cli } from "./db-common.mjs";

export async function provision() {
  const admin = new URL(connectionUrl("WEB_PROVISION_DATABASE_URL"));
  const migration = new URL(connectionUrl("WEB_MIGRATION_DATABASE_URL"));
  const runtime = new URL(connectionUrl("WEB_DATABASE_URL"));
  if (!["127.0.0.1", "localhost", "postgres", "[::1]"].includes(admin.hostname))
    throw new Error("Provision is limited to local teaching deployments");
  if (
    migration.username !== "compass_web_migrator" ||
    runtime.username !== "compass_web_runtime" ||
    migration.pathname !== runtime.pathname ||
    migration.host !== runtime.host ||
    admin.host !== runtime.host
  )
    throw new Error("Inconsistent Web provisioning targets/roles");
  if (!migration.password || !runtime.password)
    throw new Error("Explicit local role passwords required");
  const client = new pg.Client({ connectionString: admin.href });
  await client.connect();
  const name = migration.pathname.slice(1);
  try {
    await client.query("SELECT pg_advisory_lock(995000::bigint)");
    for (const [role, password] of [
      ["compass_web_owner", null],
      ["compass_web_migrator", decodeURIComponent(migration.password)],
      ["compass_web_runtime", decodeURIComponent(runtime.password)],
    ]) {
      const { rows } = await client.query(
        "SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=$1",
        [role],
      );
      if (rows.length) {
        if (
          rows[0].marker !== databaseMarker ||
          rows[0].rolsuper ||
          rows[0].rolcreaterole ||
          rows[0].rolcreatedb ||
          rows[0].rolbypassrls
        )
          throw new Error("Refusing an unknown or privileged existing role");
      } else {
        await client.query(
          `CREATE ROLE ${identifier(role)} ${password === null ? "NOLOGIN" : `LOGIN PASSWORD ${literal(password)}`} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
        );
        await client.query(`COMMENT ON ROLE ${identifier(role)} IS ${literal(databaseMarker)}`);
      }
    }
    await client.query("GRANT compass_web_owner TO compass_web_migrator");
    const { rows } = await client.query(
      "SELECT shobj_description(oid,'pg_database') AS marker,pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1",
      [name],
    );
    if (rows.length && (rows[0].marker !== databaseMarker || rows[0].owner !== "compass_web_owner"))
      throw new Error("Refusing an unknown existing database");
    if (!rows.length) {
      await client.query(`CREATE DATABASE ${identifier(name)} OWNER compass_web_owner`);
      await client.query(`COMMENT ON DATABASE ${identifier(name)} IS ${literal(databaseMarker)}`);
      await client.query(`REVOKE ALL ON DATABASE ${identifier(name)} FROM PUBLIC`);
      await client.query(
        `GRANT CONNECT ON DATABASE ${identifier(name)} TO compass_web_migrator,compass_web_runtime`,
      );
    }
    return rows.length ? "already_provisioned" : "provisioned";
  } finally {
    await client.end();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  cli(async () => {
    if (process.argv.length !== 2)
      throw new Error("Provision accepts configuration through WEB_* environment only");
    console.log(await provision());
  });
