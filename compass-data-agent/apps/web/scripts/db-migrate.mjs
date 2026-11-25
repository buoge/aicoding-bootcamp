import { runner } from "node-pg-migrate";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import {
  revision,
  revisions,
  loadRevision,
  migrationDirectory,
  databaseRoot,
  withMigrationLock,
  inspectVersion,
  sourceRecordSql,
  cli,
} from "./db-common.mjs";
import { writeSql } from "./db-sql.mjs";

/** @param {{mode?: string, from?: string, to?: string, url?: string}} [options] */
export async function migrate({ mode = "native", from, to = revision, url } = {}) {
  if (
    !revisions.includes(to) ||
    (from !== undefined && from !== "empty" && !revisions.includes(from))
  )
    throw new Error("Unsupported migration range");
  const sources = await Promise.all(revisions.map((id) => loadRevision(id)));
  await writeSql(true);
  return withMigrationLock(async (client) => {
    const current = await inspectVersion(client);
    if (revisions.indexOf(current) > revisions.indexOf(to))
      throw new Error("Downgrades are not supported");
    if (current === to) return "already_applied";
    if (from !== undefined && current !== from) throw new Error("Unexpected starting revision");
    try {
      if (mode === "sql") {
        // A known empty native ledger can remain after an interrupted first migration.
        // SQL bootstrap deliberately requires a wholly empty target; retry that target natively.
        await client.query(
          await readFile(
            new URL(
              `sql/${current === "empty" && to === revision ? "bootstrap.sql" : `upgrades/${current}__${to}.sql`}`,
              databaseRoot,
            ),
            "utf8",
          ),
        );
      } else {
        await runner({
          dbClient: client,
          dir: migrationDirectory,
          direction: "up",
          count: revisions.indexOf(to) - revisions.indexOf(current),
          migrationsSchema: "web_meta",
          migrationsTable: "pgmigrations",
          createMigrationsSchema: true,
          singleTransaction: true,
          noLock: true,
          checkOrder: true,
          log: () => {},
          logger: { info() {}, warn() {}, error() {}, debug() {} },
          migrationLoaderStrategies: [
            {
              extensions: [".sql"],
              loader: async (paths) => {
                if (
                  paths.length !== sources.length ||
                  sources.some((source) => !paths.includes(source.path))
                )
                  throw new Error("Unexpected migration sources");
                return sources.map((source) => ({
                  id: source.id,
                  filePaths: [source.path],
                  actions: {
                    up(pgm) {
                      pgm.sql(source.up);
                      pgm.sql(sourceRecordSql(source));
                    },
                    down: false,
                  },
                }));
              },
            },
          ],
        });
      }
      if ((await inspectVersion(client)) !== to)
        throw new Error("Target revision verification failed");
      return "applied";
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  }, url);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  cli(async () => {
    const args = process.argv.slice(2);
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!["--to", "--from", "--mode"].includes(args[i]) || !args[i + 1])
        throw new Error("Use --to, --from or --mode");
      options[args[i].slice(2)] = args[i + 1];
    }
    if (options.mode && !["native", "sql"].includes(options.mode))
      throw new Error("Invalid migration mode");
    console.log(await migrate(options));
  });
