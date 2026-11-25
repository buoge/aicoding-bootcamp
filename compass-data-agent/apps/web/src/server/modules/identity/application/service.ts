import { reject, assertVersion } from "../../../platform/errors";
import type {
  Actor,
  AuditEntry,
  PageQuery,
  Preferences,
  Transactions,
} from "../../../platform/application-types";
import type { IdentityContext } from "./ports";
import { normalizeLoginName } from "../domain/session";

type Dependencies = Transactions<IdentityContext> & {
  acquireLogin(login: string): () => void;
  verifyPassword(password: string, encoded: string): Promise<boolean>;
  dummyHash: string;
  newId(): string;
  newToken(): string;
  hashToken(token: string): Uint8Array;
  ttlSeconds(): number;
  resolveRedirect(token: string, path?: string): Promise<string>;
  validateContext(token: string, tenantId: string, workspaceId?: string): Promise<void>;
  recordFailure(action: string, error: unknown, actorUserId?: string): Promise<void>;
};
function event(
  deps: Dependencies,
  actorId: string | null,
  action: string,
  target: string,
  summary: AuditEntry["safeSummary"] = {},
): AuditEntry {
  const id = deps.newId();
  return {
    id,
    eventKey: id,
    actorUserId: actorId,
    tenantId: null,
    workspaceId: null,
    action,
    targetType: "identity",
    targetId: target,
    outcome: "success",
    safeSummary: summary,
  };
}
export function createIdentityService(deps: Dependencies) {
  async function lockedActor(context: IdentityContext, token: string): Promise<Actor> {
    const userId = await context.identity.locateSessionUser(token);
    if (!userId) reject("unauthenticated");
    await context.identity.lockUsers([userId]);
    return context.identity.requireActor(token, true);
  }
  return {
    async login(input: {
      loginName: string;
      password: string;
      returnPath?: string;
      oldToken: string;
      deviceLabel: string;
    }) {
      const login = normalizeLoginName(input.loginName);
      const release = deps.acquireLogin(login);
      let verifiedId: string | undefined;
      try {
        const user = await deps.query(({ identity }) => identity.findByLogin(login));
        const valid = await deps.verifyPassword(
          input.password,
          user?.passwordHash ?? deps.dummyHash,
        );
        if (!user || !valid || user.status !== "active")
          reject("unauthenticated", "账号或密码不正确，或账号暂不可用。");
        verifiedId = user.id;
        const token = deps.newToken();
        const id = deps.newId();
        const expiresAt = new Date(Date.now() + deps.ttlSeconds() * 1000);
        await deps.command(async (ctx) => {
          await ctx.identity.lockUsers([user.id]);
          const current = await ctx.identity.user(user.id);
          if (current.status !== "active" || current.passwordHash !== user.passwordHash)
            reject("unauthenticated", "账号或密码不正确，或账号暂不可用。");
          if ((await ctx.identity.locateSessionUser(input.oldToken)) === user.id) {
            // Expired sessions are harmless; a live browser session is explicitly replaced.
            let previous: Actor | null = null;
            try {
              previous = await ctx.identity.requireActor(input.oldToken, true);
            } catch (error) {
              if ((error as { code?: string }).code !== "unauthenticated") throw error;
            }
            if (previous && (await ctx.identity.revokeSession(user.id, previous.sessionId))) {
              const revoked = event(deps, user.id, "session.replaced", previous.sessionId);
              await ctx.audit.append(revoked);
              await ctx.notifications.add(revoked, user.id, true);
            }
          }
          await ctx.identity.createSession({
            id,
            userId: user.id,
            tokenHash: deps.hashToken(token),
            expiresAt,
            deviceLabel: input.deviceLabel,
          });
          await ctx.audit.append(event(deps, user.id, "auth.login", id));
        });
        return {
          token,
          expiresAt: expiresAt.toISOString(),
          redirectTo: await deps.resolveRedirect(token, input.returnPath),
        };
      } catch (error) {
        await deps.recordFailure("auth.login", error, verifiedId);
        throw error;
      } finally {
        release();
      }
    },
    async logout(token: string) {
      await deps.command(async (ctx) => {
        const userId = await ctx.identity.locateSessionUser(token);
        if (!userId) return;
        await ctx.identity.lockUsers([userId]);
        let actor: Actor;
        try {
          actor = await ctx.identity.requireActor(token, true);
        } catch (error) {
          if ((error as { code?: string }).code === "unauthenticated") return;
          throw error;
        }
        if (await ctx.identity.revokeSession(userId, actor.sessionId))
          await ctx.audit.append(event(deps, userId, "auth.logout", actor.sessionId));
      });
    },
    profile(token: string) {
      return deps.query(async (ctx) =>
        ctx.identity.profile((await ctx.identity.requireActor(token)).userId),
      );
    },
    sessions(token: string, query: PageQuery) {
      return deps.query(async (ctx) =>
        ctx.identity.sessions((await ctx.identity.requireActor(token)).userId, query),
      );
    },
    async revokeSession(token: string, id: string) {
      await deps.command(async (ctx) => {
        const actor = await lockedActor(ctx, token);
        if (await ctx.identity.revokeSession(actor.userId, id)) {
          const entry = event(deps, actor.userId, "session.revoked", id);
          await ctx.audit.append(entry);
          await ctx.notifications.add(entry, actor.userId, true);
        }
      });
    },
    async updateProfile(
      token: string,
      input: { displayName?: string; preferences?: Preferences; expectedVersion: string },
    ) {
      const pref = input.preferences;
      if (pref?.lastWorkspaceId && !pref.lastTenantId) reject("validation_failed");
      if (pref?.lastTenantId)
        await deps.validateContext(token, pref.lastTenantId, pref.lastWorkspaceId ?? undefined);
      return deps.command(async (ctx) => {
        const actor = await lockedActor(ctx, token);
        assertVersion((await ctx.identity.profile(actor.userId)).version, input.expectedVersion);
        const saved = await ctx.identity.updateProfile(
          actor.userId,
          { displayName: input.displayName, preferences: pref },
          input.expectedVersion,
        );
        await ctx.audit.append(
          event(deps, actor.userId, "profile.updated", actor.userId, {
            fields: [
              input.displayName !== undefined ? "displayName" : "",
              pref ? "preferences" : "",
            ].filter(Boolean),
          }),
        );
        return { resourceId: saved.id, version: saved.version };
      });
    },
  };
}
