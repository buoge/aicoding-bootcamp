import { z } from "zod";
import { PERMISSION_IDS } from "./authorization";

export const uuid = z.uuid();
export const routeSlug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9-]{1,31}$/, "请输入 2–32 位小写字母、数字或连字符，以字母开头。");
export const version = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n);
export const name = z.string().trim().min(1).max(80);
export const loginName = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{2,63}$/);
export const permissionKeys = z.array(z.enum(PERMISSION_IDS)).max(PERMISSION_IDS.length);
export const timezone = z
  .string()
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "请输入有效时区。");
export const preferences = z.strictObject({
  sidebarPinned: z.boolean().optional(),
  pageSize: z.union([z.literal(20), z.literal(50), z.literal(100)]).optional(),
  lastTenantId: uuid.nullable().optional(),
  lastWorkspaceId: uuid.nullable().optional(),
  authorizationNotifications: z.boolean().optional(),
});
export const loginInput = z.strictObject({
  loginName,
  password: z.string().max(512),
  returnPath: z.string().max(2048).optional(),
});
export const profilePatch = z
  .strictObject({
    displayName: name.optional(),
    preferences: preferences.optional(),
    expectedVersion: version,
  })
  .refine((v) => v.displayName !== undefined || v.preferences !== undefined);
export const createTenant = z.strictObject({
  id: uuid,
  slug: routeSlug.optional(),
  name,
  timezone,
  initialAdminLoginName: loginName,
});
export const patchTenant = z
  .strictObject({
    name: name.optional(),
    status: z.enum(["active", "disabled"]).optional(),
    expectedVersion: version,
  })
  .refine((v) => v.name !== undefined || v.status !== undefined);
export const patchSettings = z
  .strictObject({ name: name.optional(), timezone: timezone.optional(), expectedVersion: version })
  .refine((v) => v.name !== undefined || v.timezone !== undefined);
export const createWorkspace = z.strictObject({
  id: uuid,
  slug: routeSlug.optional(),
  name,
  description: z.string().max(500).default(""),
});
export const patchWorkspace = z
  .strictObject({
    name: name.optional(),
    description: z.string().max(500).optional(),
    status: z.enum(["active", "archived"]).optional(),
    expectedVersion: version,
  })
  .refine((v) => v.name !== undefined || v.description !== undefined || v.status !== undefined);
export const createMember = z.strictObject({
  id: uuid,
  loginName,
  roleKey: z.enum(["admin", "member"]),
  permissionKeys,
});
export const patchMember = z
  .strictObject({
    roleKey: z.enum(["admin", "member"]).optional(),
    status: z.enum(["active", "disabled"]).optional(),
    permissionKeys: permissionKeys.optional(),
    expectedVersion: version,
    expectedAuthzVersion: version,
  })
  .refine(
    (v) =>
      (v.roleKey !== undefined || v.status !== undefined) &&
      (v.permissionKeys === undefined || v.roleKey !== undefined),
  );
export const createWorkspaceMember = z.strictObject({
  id: uuid,
  tenantMemberId: uuid,
  roleKey: z.enum(["analyst", "viewer", "auditor"]),
  permissionKeys,
});
export const patchWorkspaceMember = z.strictObject({
  roleKey: z.enum(["analyst", "viewer", "auditor"]),
  permissionKeys,
  expectedVersion: version,
  expectedAuthzVersion: version,
});
export const replacePermissions = z.strictObject({
  permissionKeys,
  expectedVersion: version,
  expectedAuthzVersion: version,
});
export const deleteVersion = z.strictObject({ expectedVersion: version });
export const contextInput = z.strictObject({
  tenantId: uuid,
  workspaceId: uuid.optional(),
  returnPageId: z.string().max(80).optional(),
});
export const pageQuery = z.strictObject({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(80).default(""),
  sort: z.enum(["name", "createdAt"]).default("name"),
});
export const auditFilter = z.strictObject({
  action: z.string().max(80).optional(),
  actor: uuid.optional(),
  workspaceId: uuid.optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PageQuery = z.infer<typeof pageQuery>;
export type AuditFilter = z.infer<typeof auditFilter>;
export type Preferences = z.infer<typeof preferences>;
export const mutationResult = z.strictObject({ resourceId: uuid, version: version.nullable() });
export type MutationResult = z.infer<typeof mutationResult>;
export const tenantDto = z.strictObject({
  id: uuid,
  slug: routeSlug,
  name: z.string(),
  status: z.enum(["active", "disabled"]),
  timezone: z.string(),
  version,
  authzVersion: version,
});
export const workspaceDto = z.strictObject({
  id: uuid,
  slug: routeSlug,
  tenantId: uuid,
  name: z.string(),
  description: z.string(),
  status: z.enum(["active", "archived"]),
  version,
});
export const memberDto = z.strictObject({
  id: uuid,
  tenantId: uuid,
  userId: uuid,
  loginName: z.string(),
  displayName: z.string(),
  roleKey: z.enum(["admin", "member"]),
  status: z.enum(["active", "disabled"]),
  userStatus: z.enum(["active", "disabled"]),
  version,
  authzVersion: version,
});
export const bindingDto = z.strictObject({
  id: uuid,
  tenantMemberId: uuid,
  workspaceId: uuid,
  userId: uuid,
  loginName: z.string(),
  displayName: z.string(),
  roleKey: z.enum(["analyst", "viewer", "auditor"]),
  version,
});
export const profileDto = z.strictObject({
  id: uuid,
  loginName: z.string(),
  displayName: z.string(),
  preferences,
  version,
});
export const sessionDto = z.strictObject({
  id: uuid,
  deviceLabel: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
});
export const auditDto = z.strictObject({
  id: uuid,
  actorUserId: uuid.nullable(),
  tenantId: uuid.nullable(),
  workspaceId: uuid.nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: uuid.nullable(),
  outcome: z.enum(["success", "denied", "failed", "generated"]),
  safeSummary: z.record(z.string(), z.json()),
  occurredAt: z.string(),
});
export const notificationDto = z.strictObject({
  id: uuid,
  tenantId: uuid.nullable(),
  kind: z.string(),
  safePayload: z.record(z.string(), z.json()),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export function listPage<T extends z.ZodType>(item: T) {
  return z.strictObject({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int(),
    limit: z.number().int(),
  });
}
export const permissionsDto = z.strictObject({
  targetMemberId: uuid,
  targetStatus: z.string(),
  scope: z.strictObject({ tenantId: uuid, workspaceId: uuid.optional() }),
  templateKey: z.string(),
  directPermissionKeys: permissionKeys,
  inheritedPermissionKeys: z.array(z.enum(PERMISSION_IDS)),
  effectivePermissionKeys: z.array(z.enum(PERMISSION_IDS)),
  editable: z.boolean(),
  version,
  authzVersion: version,
});
export type TenantDto = z.infer<typeof tenantDto>;
export type WorkspaceDto = z.infer<typeof workspaceDto>;
export type MemberDto = z.infer<typeof memberDto>;
export type BindingDto = z.infer<typeof bindingDto>;
export type ProfileDto = z.infer<typeof profileDto>;
export type SessionDto = z.infer<typeof sessionDto>;
export type AuditDto = z.infer<typeof auditDto>;
export type NotificationDto = z.infer<typeof notificationDto>;
export type PermissionsDto = z.infer<typeof permissionsDto>;
export type ListPage<T> = { items: T[]; total: number; page: number; limit: number };
