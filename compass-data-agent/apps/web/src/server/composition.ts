import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { withTransaction, type TransactionMode, type SqlClient } from "./platform/db";
import { authConfiguration } from "./platform/config";
import { ApplicationError } from "./platform/errors";
import { bindIdentity, tokenHash } from "./modules/identity/infrastructure/pg-identity";
import { bindAccess } from "./modules/access/infrastructure/pg-access";
import { bindAudit } from "./modules/audit/pg-store";
import { bindNotifications } from "./modules/notifications/pg-store";
import { createIdentityService } from "./modules/identity/public";
import { createAccessService } from "./modules/access/public";
import { createQueryService } from "./modules/access/application/query-service";
import { verifyPassword, DUMMY_PASSWORD_HASH } from "./modules/identity/infrastructure/password";
import { createLoginLimiter } from "./modules/identity/infrastructure/login-limit";
import type { IdentityContext } from "./modules/identity/public";
import type { AuditEntry } from "./platform/application-types";

const limiter = createLoginLimiter();
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function bind(client: SqlClient) {
  const identity = bindIdentity(client);
  return {
    identity,
    access: bindAccess(client),
    audit: bindAudit(client),
    notifications: bindNotifications(
      client,
      async (id) => (await identity.profile(id)).preferences.authorizationNotifications !== false,
    ),
  };
}
async function recordFailure(action: string, error: unknown, actorUserId?: string) {
  const denied =
    error instanceof ApplicationError &&
    ["forbidden", "unauthenticated", "not_found"].includes(error.code);
  try {
    await withTransaction("command", async (client) => {
      const id = randomUUID();
      const entry: AuditEntry = {
        id,
        eventKey: id,
        actorUserId: actorUserId ?? null,
        tenantId: null,
        workspaceId: null,
        action,
        targetType: "request",
        targetId: null,
        outcome: denied ? "denied" : "failed",
        safeSummary: { code: error instanceof ApplicationError ? error.code : "unavailable" },
      };
      await bindAudit(client).append(entry);
    });
  } catch {
    console.error("Web safety event could not be persisted.");
  }
}
const identityDependencies = {
  acquireLogin: (name: string) => limiter.acquire(name),
  verifyPassword,
  dummyHash: DUMMY_PASSWORD_HASH,
  newId: randomUUID,
  newToken: () => randomBytes(32).toString("base64url"),
  hashToken: tokenHash,
  ttlSeconds: () => authConfiguration().ttl,
  resolveRedirect: (token: string, path?: string) =>
    withTransaction("query", (client) =>
      createQueryService({ context: bind(client), digest, newId: randomUUID }).resolveRedirect(
        token,
        path,
      ),
    ),
  validateContext: (token: string, tenantId: string, workspaceId?: string) =>
    withTransaction("query", (client) =>
      createQueryService({ context: bind(client), digest, newId: randomUUID }).validateContext(
        token,
        tenantId,
        workspaceId,
      ),
    ),
  recordFailure,
};
export const authentication = createIdentityService({
  ...identityDependencies,
  query: <T>(work: (ctx: IdentityContext) => Promise<T>) =>
    withTransaction("query", (client) => work(bind(client))),
  command: <T>(work: (ctx: IdentityContext) => Promise<T>) =>
    withTransaction("command", (client) => work(bind(client))),
});

function bindUseCases(client: SqlClient) {
  const context = bind(client);
  const direct = {
    query: async <T>(work: (ctx: typeof context) => Promise<T>) => work(context),
    command: async <T>(work: (ctx: typeof context) => Promise<T>) => work(context),
  };
  const queries = createQueryService({ context, digest, newId: randomUUID });
  return {
    identity: createIdentityService({
      ...identityDependencies,
      ...direct,
      resolveRedirect: queries.resolveRedirect,
      validateContext: queries.validateContext,
    }),
    access: createAccessService({ ...direct, newId: randomUUID }),
    queries,
  };
}
export type WebUseCases = ReturnType<typeof bindUseCases>;

/** One request owns one connection and snapshot. Revision is read before that transaction commits. */
export async function execute<T>(
  token: string,
  mode: TransactionMode,
  work: (useCases: WebUseCases) => Promise<T>,
): Promise<{ value: T; viewRevision: string }> {
  let actorUserId: string | undefined;
  try {
    return await withTransaction(mode, async (client) => {
      const actor = await bindIdentity(client).requireActor(token);
      actorUserId = actor.userId;
      const services = bindUseCases(client);
      const value = await work(services);
      const viewRevision = await services.queries.snapshotRevision(actor);
      return { value, viewRevision };
    });
  } catch (error) {
    await recordFailure(`web.${mode}`, error, actorUserId);
    throw error;
  }
}

export async function ready() {
  authConfiguration();
  return withTransaction("query", async (client) => {
    const { rows } = await client.query<{ name: string }>(
      "SELECT name FROM web_meta.pgmigrations ORDER BY id",
    );
    if (
      rows.length !== 2 ||
      rows[0].name !== "0001_web_foundation" ||
      rows[1].name !== "0002_readable_routes"
    )
      throw new ApplicationError("unavailable", "数据库版本不可用。");
    return { status: "ready" as const };
  });
}
