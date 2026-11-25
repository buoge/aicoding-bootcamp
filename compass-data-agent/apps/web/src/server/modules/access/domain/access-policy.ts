import {
  PERMISSION_BY_ID,
  PERMISSION_IDS,
  type Permission,
  type TenantRole,
} from "./permissions.ts";
import { reject } from "../../../platform/errors.ts";

export type Scope = { tenantId: string; workspaceId?: string };
export type CurrentAccess = {
  tenantId: string;
  memberId: string;
  role: TenantRole;
  authzVersion: string;
  tenantPermissions: readonly Permission[];
  workspacePermissions: ReadonlyMap<string, readonly Permission[]>;
};

export function allowed(access: CurrentAccess, action: Permission, scope: Scope): boolean {
  const rule = PERMISSION_BY_ID.get(action);
  const kind = scope.workspaceId ? "workspace" : "tenant";
  if (!rule?.scopes.includes(kind) || scope.tenantId !== access.tenantId) return false;
  if (access.role === "admin") return true;
  if (!rule.personalGrantable) return false;
  return (
    access.tenantPermissions.includes(action) ||
    (!!scope.workspaceId && !!access.workspacePermissions.get(scope.workspaceId)?.includes(action))
  );
}

export function requirePermission(access: CurrentAccess, action: Permission, scope: Scope): void {
  if (!allowed(access, action, scope)) reject("forbidden");
}

export function mayOpenAggregate(access: CurrentAccess, action: Permission): boolean {
  return (
    allowed(access, action, { tenantId: access.tenantId }) ||
    [...access.workspacePermissions.keys()].some((workspaceId) =>
      allowed(access, action, { tenantId: access.tenantId, workspaceId }),
    )
  );
}

/** null means the whole tenant. A finite array never includes tenant-only events. */
export function allowedWorkspaceIds(
  access: CurrentAccess,
  actions: readonly Permission[],
): string[] | null {
  const tenantScope = { tenantId: access.tenantId };
  if (actions.every((action) => allowed(access, action, tenantScope))) return null;
  return [...access.workspacePermissions.keys()].filter((workspaceId) =>
    actions.every((action) => allowed(access, action, { ...tenantScope, workspaceId })),
  );
}

export function effectivePermissions(access: CurrentAccess, scope: Scope): Permission[] {
  return PERMISSION_IDS.filter((action) => allowed(access, action, scope));
}

export function requireRemainingAdministrator(count: number): void {
  if (count < 1) reject("conflict", "请先指定另一名有效管理员，再移除当前管理员权限。");
}
