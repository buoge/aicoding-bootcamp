import {
  PAGE_CATALOG,
  matchPage,
  pageUrl,
  safeReturnPath,
  type PageScope,
  type PageSpec,
} from "../../../../lib/page-catalog";
import type {
  PageData,
  PagePayload,
  SessionView,
  NavigationEntry,
} from "../../../../contracts/page";
import type { Actor, AuditEntry, PageQuery } from "../../../platform/application-types";
import type { AccessContext } from "./ports";
import { reject } from "../../../platform/errors";
import {
  allowed,
  allowedWorkspaceIds,
  effectivePermissions,
  mayOpenAggregate,
  requirePermission,
  type CurrentAccess,
} from "../domain/access-policy";
import {
  PERMISSION_CATALOG,
  DEFAULT_TEMPLATES,
  PERMISSION_CATALOG_VERSION,
} from "../domain/permissions";
import { listAudit, generateAuditCsv, type AuditFilter, type AuditStore } from "../../audit/public";
import type { NotificationStore } from "../../notifications/public";

export type QueryContext = AccessContext & { audit: AuditStore; notifications: NotificationStore };
type Dependencies = { context: QueryContext; digest(value: string): string; newId(): string };
const firstPage: PageQuery = { page: 1, limit: 100, q: "", sort: "name" };

export function createQueryService({ context: ctx, digest, newId }: Dependencies) {
  async function accessFor(token: string, tenantId: string) {
    const actor = await ctx.identity.requireActor(token);
    return { actor, access: await ctx.access.current(actor, tenantId) };
  }
  async function revision(actor: Actor) {
    return digest(
      JSON.stringify([
        "v2-readable-routes",
        actor.userId,
        actor.sessionId,
        actor.isPlatformAdmin,
        PERMISSION_CATALOG_VERSION,
        await ctx.access.activeTenantVersions(actor.userId),
      ]),
    );
  }
  function mayOpen(
    page: PageSpec,
    actor: Actor,
    access: CurrentAccess | null,
    scope: PageScope,
  ): boolean {
    if (page.scopeKind === "self") return true;
    if (page.scopeKind === "platform") return actor.isPlatformAdmin;
    if (!access || !scope.tenantId || (page.scopeKind === "workspace" && !scope.workspaceId))
      return false;
    if (
      page.id === "organization-workspaces" &&
      !mayOpenAggregate(access, "workspaces.read") &&
      !allowed(access, "settings.read", { tenantId: scope.tenantId })
    )
      return false;
    const actions = [page.permission, page.readPermission].filter(
      (p): p is NonNullable<typeof p> => !!p,
    );
    return actions.every((action) =>
      page.aggregate
        ? mayOpenAggregate(access, action)
        : allowed(access, action, {
            tenantId: scope.tenantId!,
            ...(page.scopeKind === "workspace" ? { workspaceId: scope.workspaceId } : {}),
          }),
    );
  }
  async function session(token: string, scope: PageScope = {}): Promise<SessionView> {
    const actor = await ctx.identity.requireActor(token);
    const user = await ctx.identity.profile(actor.userId);
    let access: CurrentAccess | null = null;
    let tenant: SessionView["tenant"] = null;
    let workspace: SessionView["workspace"] = null;
    if (scope.tenantId) {
      access = await ctx.access.current(actor, scope.tenantId);
      const t = await ctx.access.tenant(scope.tenantId);
      tenant = { id: t.id, slug: t.slug, name: t.name };
      if (scope.workspaceId) {
        const w = await ctx.access.workspace(scope.tenantId, scope.workspaceId);
        if (
          !effectivePermissions(access, {
            tenantId: scope.tenantId,
            workspaceId: scope.workspaceId,
          }).length
        )
          reject("forbidden");
        workspace = { id: w.id, slug: w.slug, name: w.name, status: w.status };
      }
    } else if (scope.workspaceId) reject("validation_failed");
    const navigation: NavigationEntry[] = PAGE_CATALOG.flatMap((page) => {
      const href = pageUrl(page, {
        ...scope,
        tenantSlug: tenant?.slug,
        workspaceSlug: workspace?.slug,
      });
      return href && mayOpen(page, actor, access, scope) ? [{ ...page, href }] : [];
    });
    return {
      user,
      sessionId: actor.sessionId,
      isPlatformAdmin: actor.isPlatformAdmin,
      expiresAt: actor.expiresAt,
      viewRevision: await revision(actor),
      authzVersion: access?.authzVersion ?? null,
      capabilities: access
        ? effectivePermissions(access, {
            tenantId: access.tenantId,
            workspaceId: scope.workspaceId,
          })
        : [],
      tenantCapabilities: access ? effectivePermissions(access, { tenantId: access.tenantId }) : [],
      navigation,
      scope,
      tenant,
      workspace,
    };
  }
  async function validateContext(token: string, tenantId: string, workspaceId?: string) {
    const value = await session(token, { tenantId, workspaceId });
    if (workspaceId && !value.capabilities.length) reject("forbidden");
  }
  async function routeScope(token: string, scope: PageScope): Promise<PageScope> {
    await ctx.identity.requireActor(token);
    return scope.tenantId ? ctx.access.resolveRoute(scope.tenantId, scope.workspaceId) : {};
  }
  async function resolveRedirect(token: string, returnPath?: string): Promise<string> {
    const valid = safeReturnPath(returnPath);
    if (valid) {
      const matched = matchPage(new URL(valid, "https://compass.invalid").pathname)!;
      try {
        const value = await session(token, await routeScope(token, matched.scope));
        const entry = value.navigation.find((p) => p.id === matched.page.id);
        if (entry) return entry.href + new URL(valid, "https://compass.invalid").search;
      } catch (error) {
        if (!["forbidden", "not_found"].includes((error as { code: string }).code)) throw error;
      }
    }
    const actor = await ctx.identity.requireActor(token);
    if (actor.isPlatformAdmin) return "/platform/tenants";
    const user = await ctx.identity.profile(actor.userId);
    const tenants = await ctx.access.tenants(actor, firstPage);
    const preferred = user.preferences.lastTenantId;
    const chosen = tenants.items.find((t) => t.id === preferred) ?? tenants.items[0];
    if (!chosen) return "/access";
    const access = await ctx.access.current(actor, chosen.id);
    const spaces = await ctx.access.workspaces(
      chosen.id,
      allowedWorkspaceIds(access, ["workspaces.read"]),
      firstPage,
    );
    const space =
      spaces.items.find((w) => w.id === user.preferences.lastWorkspaceId) ?? spaces.items[0];
    const scope = { tenantId: chosen.id, workspaceId: space?.id };
    if (!space && access.role === "admin") return `/t/${chosen.slug}/admin/organization/workspaces`;
    const view = await session(token, scope);
    return (
      view.navigation.find((p) => p.scopeKind === "workspace" || p.scopeKind === "tenant")?.href ??
      "/settings/profile"
    );
  }
  async function audit(token: string, tenantId: string | undefined, filter: AuditFilter) {
    const actor = await ctx.identity.requireActor(token);
    if (!tenantId) return listAudit(ctx.audit, { userId: actor.userId }, filter);
    const access = await ctx.access.current(actor, tenantId);
    const ids = allowedWorkspaceIds(access, ["audit.read"]);
    if (ids !== null && !ids.length) reject("forbidden");
    if (filter.workspaceId) {
      await ctx.access.workspace(tenantId, filter.workspaceId);
      requirePermission(access, "audit.read", { tenantId, workspaceId: filter.workspaceId });
    }
    return listAudit(ctx.audit, { tenantId, workspaceIds: ids }, filter);
  }
  async function overview(token: string, tenantId: string, workspaceId?: string) {
    const { access } = await accessFor(token, tenantId);
    if (!mayOpenAggregate(access, "overview.read")) reject("forbidden");
    if (workspaceId) {
      await ctx.access.workspace(tenantId, workspaceId);
      requirePermission(access, "overview.read", { tenantId, workspaceId });
    }
    const permitted = allowedWorkspaceIds(access, ["overview.read", "workspaces.read"]);
    const ids = workspaceId
      ? permitted === null || permitted.includes(workspaceId)
        ? [workspaceId]
        : []
      : permitted;
    const spaceCount =
      ids !== null && !ids.length
        ? null
        : (await ctx.access.workspaces(tenantId, ids, { ...firstPage, limit: 1 })).total;
    const memberCount = allowed(access, "members.read", { tenantId })
      ? (await ctx.access.members(tenantId, { ...firstPage, limit: 1 })).total
      : null;
    const recent = mayOpenAggregate(access, "audit.read")
      ? (await audit(token, tenantId, { limit: 5, workspaceId })).items
      : [];
    return { workspaceCount: spaceCount, memberCount, recent };
  }
  return {
    session,
    async sessionForRoute(token: string, scope: PageScope) {
      return session(token, await routeScope(token, scope));
    },
    validateContext,
    resolveRedirect,
    audit,
    overview,
    async viewRevision(token: string) {
      return revision(await ctx.identity.requireActor(token));
    },
    // Composition may finish a self-session revocation using its already authenticated actor.
    snapshotRevision: revision,
    async catalog(token: string, tenantId: string) {
      const { access } = await accessFor(token, tenantId);
      requirePermission(access, "roles.read", { tenantId });
      return {
        catalog: PERMISSION_CATALOG,
        templates: DEFAULT_TEMPLATES,
        version: PERMISSION_CATALOG_VERSION,
      };
    },
    async identityStatus(token: string, tenantId: string) {
      const { access } = await accessFor(token, tenantId);
      requirePermission(access, "module.admin.organization", { tenantId });
      return {
        mode: "local" as const,
        description: "本地账号登录，受管创建与重置密码。企业 SSO 和服务身份将在后续版本提供。",
      };
    },
    async securityPolicy(token: string, tenantId: string) {
      const { access } = await accessFor(token, tenantId);
      if (!mayOpenAggregate(access, "module.admin.security")) reject("forbidden");
      return {
        mode: "local" as const,
        catalogVersion: PERMISSION_CATALOG_VERSION,
        description: "会话固定到期；权限按当前成员配置核验。",
      };
    },
    async notifications(token: string, query: PageQuery, read?: boolean) {
      return ctx.notifications.list((await ctx.identity.requireActor(token)).userId, query, read);
    },
    async markNotificationRead(token: string, id: string) {
      const userId = await ctx.identity.locateSessionUser(token);
      if (!userId) reject("unauthenticated");
      await ctx.identity.lockUsers([userId]);
      await ctx.identity.requireActor(token, true);
      if (!(await ctx.notifications.markRead(userId, id))) reject("not_found");
    },
    async exportAudit(token: string, tenantId: string, filter: AuditFilter) {
      const { actor, access } = await accessFor(token, tenantId);
      const ids = allowedWorkspaceIds(access, ["audit.read", "audit.export"]);
      if (ids !== null && !ids.length) reject("forbidden");
      if (filter.workspaceId) {
        await ctx.access.workspace(tenantId, filter.workspaceId);
        requirePermission(access, "audit.read", { tenantId, workspaceId: filter.workspaceId });
        requirePermission(access, "audit.export", { tenantId, workspaceId: filter.workspaceId });
      }
      const result = await generateAuditCsv(ctx.audit, { tenantId, workspaceIds: ids }, filter);
      const id = newId();
      const entry: AuditEntry = {
        id,
        eventKey: id,
        actorUserId: actor.userId,
        tenantId,
        workspaceId: filter.workspaceId ?? null,
        action: "audit.export",
        targetType: "audit",
        targetId: null,
        outcome: "generated",
        safeSummary: { rows: result.count, bytes: result.bytes },
      };
      await ctx.audit.append(entry);
      return result.csv;
    },
    async setContext(
      token: string,
      input: { tenantId: string; workspaceId?: string; returnPageId?: string },
    ) {
      const userId = await ctx.identity.locateSessionUser(token);
      if (!userId) reject("unauthenticated");
      await ctx.identity.lockUsers([userId]);
      const actor = await ctx.identity.requireActor(token, true);
      const tenant = await ctx.access.tenant(input.tenantId, true);
      if (tenant.status !== "active") reject("not_found");
      const view = await session(token, input);
      const profile = await ctx.identity.profile(userId);
      await ctx.identity.updateProfile(
        userId,
        {
          preferences: { lastTenantId: input.tenantId, lastWorkspaceId: input.workspaceId ?? null },
        },
        profile.version,
      );
      const id = newId();
      await ctx.audit.append({
        id,
        eventKey: id,
        actorUserId: actor.userId,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId ?? null,
        action: "context.changed",
        targetType: "tenant",
        targetId: input.tenantId,
        outcome: "success",
        safeSummary: {},
      });
      return {
        redirectTo:
          view.navigation.find((p) => p.id === input.returnPageId)?.href ??
          view.navigation.find((p) => p.scopeKind === "workspace" || p.scopeKind === "tenant")
            ?.href ??
          "/settings/profile",
      };
    },
    async search(token: string, scope: PageScope, q: string, limit: number) {
      const view = await session(token, scope);
      const needle = q.toLocaleLowerCase();
      const results: { id: string; title: string; href: string; kind: string }[] = view.navigation
        .filter(
          (p) =>
            p.title.toLocaleLowerCase().includes(needle) ||
            p.sectionTitle.toLocaleLowerCase().includes(needle),
        )
        .map((p) => ({ id: p.id, title: p.title, href: p.href, kind: "page" }));
      if (scope.tenantId) {
        const { access } = await accessFor(token, scope.tenantId);
        const query = { page: 1, limit: Math.min(limit, 20), q, sort: "name" as const };
        const spaces = await ctx.access.workspaces(
          scope.tenantId,
          allowedWorkspaceIds(access, ["workspaces.read"]),
          query,
        );
        results.push(
          ...spaces.items.map((w) => ({
            id: w.id,
            title: w.name,
            href: `/workspaces?tenantId=${scope.tenantId}`,
            kind: "workspace",
          })),
        );
        if (
          allowed(access, "members.read", { tenantId: scope.tenantId }) &&
          allowed(access, "module.admin.organization", { tenantId: scope.tenantId })
        ) {
          const members = await ctx.access.members(scope.tenantId, query);
          results.push(
            ...members.items.map((m) => ({
              id: m.id,
              title: m.displayName,
              href: `/t/${view.tenant!.slug}/admin/organization/members?q=${encodeURIComponent(m.loginName)}`,
              kind: "member",
            })),
          );
        }
      }
      return { items: results.slice(0, limit) };
    },
    async page(
      token: string,
      path: string,
      query: PageQuery,
      auditFilter: AuditFilter,
      selectedTenantId?: string,
    ): Promise<PagePayload> {
      const match = matchPage(path);
      if (!match) reject("not_found");
      match.scope = await routeScope(token, match.scope);
      const pageScope = { ...match.scope };
      if (pageScope.tenantId && !pageScope.workspaceId) {
        const actor = await ctx.identity.requireActor(token);
        const access = await ctx.access.current(actor, pageScope.tenantId);
        const spaces = await ctx.access.workspaces(
          pageScope.tenantId,
          allowedWorkspaceIds(access, ["workspaces.read"]),
          firstPage,
        );
        const preferences = (await ctx.identity.profile(actor.userId)).preferences;
        pageScope.workspaceId =
          spaces.items.find((w) => w.id === preferences.lastWorkspaceId)?.id ?? spaces.items[0]?.id;
      }
      const view = await session(token, pageScope);
      if (!view.navigation.some((p) => p.id === match.page.id)) reject("forbidden");
      const pageData: PageData = {};
      const actor = await ctx.identity.requireActor(token);
      const tenantId = match.scope.tenantId;
      switch (match.page.id) {
        case "profile":
          pageData.profile = view.user;
          break;
        case "sessions":
          pageData.sessions = await ctx.identity.sessions(actor.userId, query);
          pageData.audit = await audit(token, undefined, auditFilter);
          break;
        case "notifications":
          pageData.profile = view.user;
          pageData.notifications = await ctx.notifications.list(actor.userId, query);
          break;
        case "platform-tenants":
          pageData.tenants = await ctx.access.tenants(actor, query, true);
          break;
        case "workspaces":
        case "access": {
          pageData.tenants = await ctx.access.tenants(actor, query);
          const chosen = selectedTenantId ?? pageData.tenants.items[0]?.id;
          if (chosen) {
            const access = await ctx.access.current(actor, chosen);
            pageData.workspaces = await ctx.access.workspaces(
              chosen,
              allowedWorkspaceIds(access, ["workspaces.read"]),
              query,
            );
          }
          break;
        }
        case "organization-members":
          pageData.members = await ctx.access.members(tenantId!, query);
          break;
        case "organization-roles":
          pageData.catalog = PERMISSION_CATALOG;
          pageData.templates = DEFAULT_TEMPLATES;
          if (view.tenantCapabilities.includes("members.read"))
            pageData.members = await ctx.access.members(tenantId!, query);
          break;
        case "organization-workspaces": {
          const access = await ctx.access.current(actor, tenantId!);
          if (view.tenantCapabilities.includes("settings.read"))
            pageData.settings = await ctx.access.tenant(tenantId!);
          if (mayOpenAggregate(access, "workspaces.read"))
            pageData.workspaces = await ctx.access.workspaces(
              tenantId!,
              allowedWorkspaceIds(access, ["workspaces.read"]),
              query,
            );
          break;
        }
        case "admin-overview":
          pageData.overview = await overview(token, tenantId!);
          break;
        case "security-audit": {
          pageData.audit = await audit(token, tenantId!, auditFilter);
          const access = await ctx.access.current(actor, tenantId!);
          const exportIds = allowedWorkspaceIds(access, ["audit.read", "audit.export"]);
          pageData.canExportAudit = exportIds === null || exportIds.length > 0;
          break;
        }
      }
      return { page: match.page, session: view, pageData, query, viewKey: path };
    },
  };
}
