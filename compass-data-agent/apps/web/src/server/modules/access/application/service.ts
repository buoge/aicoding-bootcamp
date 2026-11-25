import { assertVersion, reject } from "../../../platform/errors";
import type {
  Actor,
  AuditEntry,
  PageQuery,
  Transactions,
} from "../../../platform/application-types";
import type { AccessContext } from "./ports";
import {
  allowedWorkspaceIds,
  requirePermission,
  requireRemainingAdministrator,
} from "../domain/access-policy";
import {
  normalizePermissions,
  type Permission,
  type TenantRole,
  type WorkspaceRole,
} from "../domain/permissions";

type Dependencies = Transactions<AccessContext> & { newId(): string };
type VersionInput = { expectedVersion: string };
type AuthzVersionInput = VersionInput & { expectedAuthzVersion: string };
export function createAccessService(deps: Dependencies) {
  async function lockIdentity(ctx: AccessContext, token: string, targetUserId?: string | null) {
    const id = await ctx.identity.locateSessionUser(token);
    if (!id) reject("unauthenticated");
    await ctx.identity.lockUsers([id, ...(targetUserId ? [targetUserId] : [])]);
    return ctx.identity.requireActor(token, true);
  }
  async function lockTenant(
    ctx: AccessContext,
    token: string,
    tenantId: string,
    action: Permission,
    targetUserId?: string | null,
  ) {
    const actor = await lockIdentity(ctx, token, targetUserId);
    const tenant = await ctx.access.tenant(tenantId, true);
    if (tenant.status !== "active") reject("not_found");
    const access = await ctx.access.current(actor, tenantId);
    requirePermission(access, action, { tenantId });
    return { actor, tenant, access };
  }
  async function emit(
    ctx: AccessContext,
    actor: Actor,
    tenantId: string,
    action: string,
    targetId: string,
    version: string | null,
    recipient?: string,
    workspaceId?: string,
    summary: AuditEntry["safeSummary"] = {},
  ) {
    const id = deps.newId();
    const entry: AuditEntry = {
      id,
      eventKey: version ? `${action}:${targetId}:${version}` : id,
      actorUserId: actor.userId,
      tenantId,
      workspaceId: workspaceId ?? null,
      action,
      targetType: action.split(".")[0],
      targetId,
      outcome: "success",
      safeSummary: summary,
    };
    await ctx.audit.append(entry);
    if (recipient) await ctx.notifications.add(entry, recipient);
  }
  const mutation = (row: { id: string; version: string }) => ({
    resourceId: row.id,
    version: row.version,
  });
  async function readAccess(
    ctx: AccessContext,
    token: string,
    tenantId: string,
    action: Permission,
  ) {
    const actor = await ctx.identity.requireActor(token);
    const access = await ctx.access.current(actor, tenantId);
    requirePermission(access, action, { tenantId });
    return access;
  }
  return {
    tenants(token: string, query: PageQuery, platform = false) {
      return deps.query(async (ctx) => {
        const actor = await ctx.identity.requireActor(token);
        if (platform && !actor.isPlatformAdmin) reject("forbidden");
        return ctx.access.tenants(actor, query, platform);
      });
    },
    platformTenant(token: string, id: string) {
      return deps.query(async (ctx) => {
        if (!(await ctx.identity.requireActor(token)).isPlatformAdmin) reject("forbidden");
        return ctx.access.tenant(id);
      });
    },
    createTenant(
      token: string,
      input: {
        id: string;
        name: string;
        slug?: string;
        timezone: string;
        initialAdminLoginName: string;
      },
    ) {
      return deps.command(async (ctx) => {
        const target = await ctx.identity.findUserSummary(input.initialAdminLoginName);
        const actor = await lockIdentity(ctx, token, target?.id);
        if (!actor.isPlatformAdmin) reject("forbidden");
        if (!target || target.status !== "active")
          reject("validation_failed", "无法添加该账号。请核对登录名或联系平台管理员。");
        const currentTarget = await ctx.identity.findUserSummary(input.initialAdminLoginName);
        if (!currentTarget || currentTarget.status !== "active") reject("conflict");
        const saved = await ctx.access.createTenant({
          ...input,
          memberId: deps.newId(),
          adminUserId: target.id,
        });
        await emit(ctx, actor, saved.id, "tenant.created", saved.id, saved.version, target.id);
        return mutation(saved);
      });
    },
    patchPlatformTenant(
      token: string,
      id: string,
      input: VersionInput & { name?: string; status?: "active" | "disabled" },
    ) {
      return deps.command(async (ctx) => {
        const actor = await lockIdentity(ctx, token);
        if (!actor.isPlatformAdmin) reject("forbidden");
        const before = await ctx.access.tenant(id, true);
        assertVersion(before.version, input.expectedVersion);
        const saved = await ctx.access.updateTenant(id, input, input.expectedVersion);
        if (input.status !== undefined && input.status !== before.status)
          await ctx.access.incrementAuthz(id);
        await emit(ctx, actor, id, "tenant.updated", id, saved.version);
        return mutation(saved);
      });
    },
    settings(token: string, tenantId: string) {
      return deps.query(async (ctx) => {
        await readAccess(ctx, token, tenantId, "settings.read");
        return ctx.access.tenant(tenantId);
      });
    },
    patchSettings(
      token: string,
      tenantId: string,
      input: VersionInput & { name?: string; timezone?: string },
    ) {
      return deps.command(async (ctx) => {
        const { actor, tenant } = await lockTenant(ctx, token, tenantId, "settings.write");
        assertVersion(tenant.version, input.expectedVersion);
        const saved = await ctx.access.updateTenant(tenantId, input, input.expectedVersion);
        await emit(ctx, actor, tenantId, "settings.updated", tenantId, saved.version);
        return mutation(saved);
      });
    },
    workspaces(token: string, tenantId: string, query: PageQuery) {
      return deps.query(async (ctx) => {
        const access = await ctx.access.current(await ctx.identity.requireActor(token), tenantId);
        return ctx.access.workspaces(
          tenantId,
          allowedWorkspaceIds(access, ["workspaces.read"]),
          query,
        );
      });
    },
    workspace(token: string, tenantId: string, id: string) {
      return deps.query(async (ctx) => {
        const access = await ctx.access.current(await ctx.identity.requireActor(token), tenantId);
        const row = await ctx.access.workspace(tenantId, id);
        requirePermission(access, "workspaces.read", { tenantId, workspaceId: id });
        return row;
      });
    },
    createWorkspace(
      token: string,
      tenantId: string,
      input: { id: string; name: string; slug?: string; description: string },
    ) {
      return deps.command(async (ctx) => {
        const { actor } = await lockTenant(ctx, token, tenantId, "workspaces.write");
        const saved = await ctx.access.createWorkspace(tenantId, input);
        await ctx.access.incrementAuthz(tenantId);
        await emit(
          ctx,
          actor,
          tenantId,
          "workspace.created",
          saved.id,
          saved.version,
          undefined,
          saved.id,
        );
        return mutation(saved);
      });
    },
    patchWorkspace(
      token: string,
      tenantId: string,
      id: string,
      input: VersionInput & { name?: string; description?: string; status?: "active" | "archived" },
    ) {
      return deps.command(async (ctx) => {
        const { actor } = await lockTenant(ctx, token, tenantId, "workspaces.write");
        const before = await ctx.access.workspace(tenantId, id, true);
        assertVersion(before.version, input.expectedVersion);
        if (before.status === "archived" && input.status !== "active")
          reject("conflict", "请先恢复归档空间，再修改内容。");
        const saved = await ctx.access.updateWorkspace(tenantId, id, input, input.expectedVersion);
        if (input.status !== undefined && input.status !== before.status)
          await ctx.access.incrementAuthz(tenantId);
        await emit(ctx, actor, tenantId, "workspace.updated", id, saved.version, undefined, id);
        return mutation(saved);
      });
    },
    members(token: string, tenantId: string, query: PageQuery) {
      return deps.query(async (ctx) => {
        await readAccess(ctx, token, tenantId, "members.read");
        return ctx.access.members(tenantId, query);
      });
    },
    member(token: string, tenantId: string, id: string) {
      return deps.query(async (ctx) => {
        await readAccess(ctx, token, tenantId, "members.read");
        const row = await ctx.access.member(tenantId, id);
        return {
          id: row.id,
          tenantId: row.tenantId,
          userId: row.userId,
          loginName: row.loginName,
          displayName: row.displayName,
          userStatus: row.userStatus,
          roleKey: row.roleKey,
          status: row.status,
          version: row.version,
          authzVersion: row.authzVersion,
        };
      });
    },
    createMember(
      token: string,
      tenantId: string,
      input: { id: string; loginName: string; roleKey: TenantRole; permissionKeys: string[] },
    ) {
      return deps.command(async (ctx) => {
        const target = await ctx.identity.findUserSummary(input.loginName);
        const { actor } = await lockTenant(ctx, token, tenantId, "members.write", target?.id);
        const verified = await ctx.identity.findUserSummary(input.loginName);
        if (!verified || verified.status !== "active")
          reject("validation_failed", "无法添加该账号。请核对登录名或联系平台管理员。");
        if (input.roleKey === "admin" && input.permissionKeys.length) reject("validation_failed");
        const saved = await ctx.access.createMember(tenantId, {
          id: input.id,
          userId: verified.id,
          roleKey: input.roleKey,
          permissionKeys: normalizePermissions(input.permissionKeys, "tenant"),
        });
        await ctx.access.incrementAuthz(tenantId);
        await emit(ctx, actor, tenantId, "member.created", saved.id, saved.version, verified.id);
        return mutation(saved);
      });
    },
    patchMember(
      token: string,
      tenantId: string,
      id: string,
      input: AuthzVersionInput & {
        roleKey?: TenantRole;
        status?: "active" | "disabled";
        permissionKeys?: string[];
      },
    ) {
      return deps.command(async (ctx) => {
        const target = await ctx.access.memberUser(tenantId, id);
        const { actor, tenant } = await lockTenant(ctx, token, tenantId, "members.write", target);
        const before = await ctx.access.member(tenantId, id, true);
        assertVersion(before.version, input.expectedVersion);
        assertVersion(tenant.authzVersion, input.expectedAuthzVersion);
        const role = input.roleKey ?? before.roleKey;
        const status = input.status ?? before.status;
        if (input.status === "active" && before.userStatus !== "active")
          reject("conflict", "账号已停用，请联系平台管理员。");
        if (input.permissionKeys !== undefined && input.roleKey === undefined)
          reject("validation_failed");
        if (before.roleKey === "admin" && role === "member" && input.permissionKeys === undefined)
          reject("validation_failed", "降为普通成员时，请明确配置租户权限。");
        if (role === "admin" && input.permissionKeys?.length) reject("validation_failed");
        const keys =
          role === "admin"
            ? []
            : input.permissionKeys === undefined
              ? before.permissionKeys
              : normalizePermissions(input.permissionKeys, "tenant");
        const saved = await ctx.access.updateMember(
          tenantId,
          id,
          { roleKey: role, status, permissionKeys: keys },
          input.expectedVersion,
        );
        requireRemainingAdministrator(await ctx.access.countActiveAdmins(tenantId));
        await ctx.access.incrementAuthz(tenantId);
        await emit(
          ctx,
          actor,
          tenantId,
          "member.updated",
          id,
          saved.version,
          before.userId,
          undefined,
          {
            role,
            status,
            addedKeys: keys.filter((k) => !before.permissionKeys.includes(k)),
            removedKeys: before.permissionKeys.filter((k) => !keys.includes(k)),
          },
        );
        return mutation(saved);
      });
    },
    bindings(token: string, tenantId: string, workspaceId: string, query: PageQuery) {
      return deps.query(async (ctx) => {
        await readAccess(ctx, token, tenantId, "members.read");
        await ctx.access.workspace(tenantId, workspaceId);
        return ctx.access.bindings(tenantId, workspaceId, query);
      });
    },
    binding(token: string, tenantId: string, workspaceId: string, id: string) {
      return deps.query(async (ctx) => {
        await readAccess(ctx, token, tenantId, "members.read");
        const b = await ctx.access.binding(tenantId, workspaceId, id);
        return {
          id: b.id,
          workspaceId: b.workspaceId,
          tenantMemberId: b.tenantMemberId,
          userId: b.userId,
          loginName: b.loginName,
          displayName: b.displayName,
          roleKey: b.roleKey,
          version: b.version,
        };
      });
    },
    createBinding(
      token: string,
      tenantId: string,
      workspaceId: string,
      input: {
        id: string;
        tenantMemberId: string;
        roleKey: WorkspaceRole;
        permissionKeys: string[];
      },
    ) {
      return deps.command(async (ctx) => {
        const target = await ctx.access.memberUser(tenantId, input.tenantMemberId);
        const { actor } = await lockTenant(ctx, token, tenantId, "members.write", target);
        const member = await ctx.access.member(tenantId, input.tenantMemberId, true);
        const workspace = await ctx.access.workspace(tenantId, workspaceId, true);
        if (member.roleKey === "admin")
          reject("conflict", "管理员已有完整权限，请先调整成员资格。");
        if (
          member.status !== "active" ||
          member.userStatus !== "active" ||
          workspace.status !== "active"
        )
          reject("conflict", "成员和空间需处于启用状态。");
        const saved = await ctx.access.createBinding(tenantId, workspaceId, {
          ...input,
          permissionKeys: normalizePermissions(input.permissionKeys, "workspace"),
        });
        await ctx.access.incrementAuthz(tenantId);
        await emit(
          ctx,
          actor,
          tenantId,
          "assignment.created",
          saved.id,
          saved.version,
          member.userId,
          workspaceId,
        );
        return mutation(saved);
      });
    },
    patchBinding(
      token: string,
      tenantId: string,
      workspaceId: string,
      id: string,
      input: AuthzVersionInput & { roleKey: WorkspaceRole; permissionKeys: string[] },
    ) {
      return deps.command(async (ctx) => {
        const ref = await ctx.access.binding(tenantId, workspaceId, id);
        const { actor, tenant } = await lockTenant(
          ctx,
          token,
          tenantId,
          "members.write",
          ref.userId,
        );
        const member = await ctx.access.member(tenantId, ref.tenantMemberId, true);
        const before = await ctx.access.binding(tenantId, workspaceId, id, true);
        assertVersion(before.version, input.expectedVersion);
        assertVersion(tenant.authzVersion, input.expectedAuthzVersion);
        if (member.roleKey === "admin") reject("conflict", "请先调整管理员资格。");
        const keys = normalizePermissions(input.permissionKeys, "workspace");
        const saved = await ctx.access.updateBinding(
          tenantId,
          workspaceId,
          id,
          { roleKey: input.roleKey, permissionKeys: keys },
          input.expectedVersion,
        );
        await ctx.access.incrementAuthz(tenantId);
        await emit(
          ctx,
          actor,
          tenantId,
          "assignment.updated",
          id,
          saved.version,
          member.userId,
          workspaceId,
          {
            addedKeys: keys.filter((k) => !before.permissionKeys.includes(k)),
            removedKeys: before.permissionKeys.filter((k) => !keys.includes(k)),
          },
        );
        return mutation(saved);
      });
    },
    deleteBinding(
      token: string,
      tenantId: string,
      workspaceId: string,
      id: string,
      input: VersionInput,
    ) {
      return deps.command(async (ctx) => {
        const ref = await ctx.access.binding(tenantId, workspaceId, id);
        const { actor } = await lockTenant(ctx, token, tenantId, "members.write", ref.userId);
        const member = await ctx.access.member(tenantId, ref.tenantMemberId, true);
        if (member.roleKey === "admin") reject("conflict", "请先调整管理员资格。");
        const before = await ctx.access.binding(tenantId, workspaceId, id, true);
        assertVersion(before.version, input.expectedVersion);
        await ctx.access.deleteBinding(tenantId, workspaceId, id, input.expectedVersion);
        await ctx.access.incrementAuthz(tenantId);
        await emit(
          ctx,
          actor,
          tenantId,
          "assignment.deleted",
          id,
          null,
          before.userId,
          workspaceId,
        );
        return { resourceId: id, version: null };
      });
    },
    permissions(
      token: string,
      tenantId: string,
      memberId: string,
      workspaceId?: string,
      bindingId?: string,
    ) {
      return deps.query(async (ctx) => {
        await readAccess(ctx, token, tenantId, "members.write");
        return ctx.access.memberPermissions(tenantId, memberId, workspaceId, bindingId);
      });
    },
    replacePermissions(
      token: string,
      tenantId: string,
      memberId: string,
      input: AuthzVersionInput & { permissionKeys: string[] },
      workspaceId?: string,
      bindingId?: string,
    ) {
      return deps.command(async (ctx) => {
        const target = await ctx.access.memberUser(tenantId, memberId);
        const { actor, tenant } = await lockTenant(ctx, token, tenantId, "members.write", target);
        const member = await ctx.access.member(tenantId, memberId, true);
        const assignment =
          workspaceId && bindingId
            ? await ctx.access.binding(tenantId, workspaceId, bindingId, true)
            : null;
        if (assignment && assignment.tenantMemberId !== memberId) reject("not_found");
        const before = assignment ?? member;
        assertVersion(before.version, input.expectedVersion);
        assertVersion(tenant.authzVersion, input.expectedAuthzVersion);
        if (member.roleKey === "admin")
          reject("conflict", "管理员拥有完整权限，请先调整成员资格。");
        const keys = normalizePermissions(
          input.permissionKeys,
          workspaceId ? "workspace" : "tenant",
        );
        if (JSON.stringify([...before.permissionKeys].sort()) === JSON.stringify(keys))
          return ctx.access.memberPermissions(tenantId, memberId, workspaceId, bindingId);
        const saved = assignment
          ? await ctx.access.updateBinding(
              tenantId,
              workspaceId!,
              assignment.id,
              { roleKey: assignment.roleKey, permissionKeys: keys },
              input.expectedVersion,
            )
          : await ctx.access.updateMember(
              tenantId,
              memberId,
              { roleKey: member.roleKey, status: member.status, permissionKeys: keys },
              input.expectedVersion,
            );
        await ctx.access.incrementAuthz(tenantId);
        await emit(
          ctx,
          actor,
          tenantId,
          "permissions.updated",
          saved.id,
          saved.version,
          member.userId,
          workspaceId,
          {
            addedKeys: keys.filter((k) => !before.permissionKeys.includes(k)),
            removedKeys: before.permissionKeys.filter((k) => !keys.includes(k)),
          },
        );
        return ctx.access.memberPermissions(tenantId, memberId, workspaceId, bindingId);
      });
    },
  };
}
