import { z } from "zod";
import * as dto from "./web";
import { PERMISSION_IDS } from "./authorization";

export const pageSpecSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  section: z.string(),
  sectionTitle: z.string(),
  path: z.string(),
  scopeKind: z.enum(["tenant", "workspace", "self", "platform"]),
  permission: z.enum(PERMISSION_IDS).optional(),
  readPermission: z.enum(PERMISSION_IDS).optional(),
  aggregate: z.boolean().optional(),
  kind: z.enum(["placeholder", "implemented"]),
});
export const scopeSchema = z.strictObject({
  tenantId: dto.uuid.optional(),
  workspaceId: dto.uuid.optional(),
});
export const sessionSchema = z.strictObject({
  user: dto.profileDto,
  sessionId: dto.uuid,
  isPlatformAdmin: z.boolean(),
  expiresAt: z.string(),
  viewRevision: z.string().regex(/^[0-9a-f]{64}$/),
  authzVersion: dto.version.nullable(),
  capabilities: dto.permissionKeys,
  tenantCapabilities: dto.permissionKeys,
  navigation: z.array(pageSpecSchema.extend({ href: z.string().startsWith("/") })),
  scope: scopeSchema,
  tenant: z.strictObject({ id: dto.uuid, slug: dto.routeSlug, name: z.string() }).nullable(),
  workspace: z
    .strictObject({ id: dto.uuid, slug: dto.routeSlug, name: z.string(), status: z.string() })
    .nullable(),
});
export const auditPageSchema = z.strictObject({
  items: z.array(dto.auditDto),
  total: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
});
export const catalogEntrySchema = z.strictObject({
  id: z.enum(PERMISSION_IDS),
  label: z.string(),
  scopes: z.array(z.enum(["tenant", "workspace"])),
  personalGrantable: z.boolean(),
});
export const catalogSchema = z.strictObject({
  catalog: z.array(catalogEntrySchema),
  templates: z.record(z.string(), dto.permissionKeys),
  version: z.string(),
});
export const overviewSchema = z.strictObject({
  workspaceCount: z.number().nullable(),
  memberCount: z.number().nullable(),
  recent: z.array(dto.auditDto),
});
export const pagePayloadSchema = z.strictObject({
  page: pageSpecSchema,
  session: sessionSchema,
  query: dto.pageQuery,
  viewKey: z.string(),
  pageData: z.strictObject({
    profile: dto.profileDto.optional(),
    tenants: dto.listPage(dto.tenantDto).optional(),
    workspaces: dto.listPage(dto.workspaceDto).optional(),
    members: dto.listPage(dto.memberDto).optional(),
    bindings: dto.listPage(dto.bindingDto).optional(),
    settings: dto.tenantDto.optional(),
    sessions: dto.listPage(dto.sessionDto).optional(),
    audit: auditPageSchema.optional(),
    canExportAudit: z.boolean().optional(),
    notifications: dto.listPage(dto.notificationDto).optional(),
    overview: overviewSchema.optional(),
    catalog: z.array(catalogEntrySchema).optional(),
    templates: z.record(z.string(), dto.permissionKeys).optional(),
  }),
});
