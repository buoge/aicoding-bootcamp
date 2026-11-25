import "server-only";
import pg from "pg";
import { reject } from "../errors";

let pool: pg.Pool | undefined;
export function databasePool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.WEB_DATABASE_URL;
    if (!connectionString) reject("unavailable");
    pool = new pg.Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30_000,
    });
    pool.on("error", () => console.error("Web database idle connection failed."));
  }
  return pool;
}

export type TransactionMode = "query" | "command" | "export";
export async function withTransaction<T>(
  mode: TransactionMode,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const client = await databasePool().connect();
    let commitStarted = false;
    try {
      await client.query(
        mode === "query"
          ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"
          : mode === "export"
            ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE"
            : "BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE",
      );
      await client.query(
        "SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='3s'; SET LOCAL idle_in_transaction_session_timeout='15s'",
      );
      const result = await work(client);
      commitStarted = true;
      await client.query("COMMIT");
      return result;
    } catch (error) {
      const code = (error as { code?: string }).code;
      const rolledBack = await client.query("ROLLBACK").then(
        () => true,
        () => false,
      );
      if (!commitStarted && rolledBack && (code === "40001" || code === "40P01") && attempt < 2)
        continue;
      throw error;
    } finally {
      client.release();
    }
  }
}

export async function closeDatabase(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
export type SqlClient = Pick<pg.PoolClient, "query">;
