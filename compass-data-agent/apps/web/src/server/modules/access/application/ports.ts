import type {
  Actor,
  AuditWriter,
  NotificationWriter,
  PageQuery,
  ListPage,
} from "../../../platform/application-types";
import type { IdentityStore } from "../../identity/public";
import type {
  TenantDto,
  WorkspaceDto,
  MemberDto,
  BindingDto,
  PermissionsDto,
} from "../../../../contracts/web";
import type { CurrentAccess } from "../domain/access-policy";
import type { Permission, TenantRole, WorkspaceRole } from "../domain/permissions";

export type TenantMemberState = MemberDto & { permissionKeys: Permission[] };
export type BindingState = BindingDto & { tenantId: string; permissionKeys: Permission[] };
export interface AccessStore {
  resolveRoute(
    tenant: string,
    workspace?: string,
  ): Promise<{ tenantId: string; workspaceId?: string }>;
  current(actor: Actor, tenantId: string): Promise<CurrentAccess>;
  activeTenantVersions(userId: string): Promise<{ tenantId: string; authzVersion: string }[]>;
  tenant(id: string, lock?: boolean): Promise<TenantDto>;
  tenants(actor: Actor, query: PageQuery, platform?: boolean): Promise<ListPage<TenantDto>>;
  createTenant(input: {
    id: string;
    name: string;
    slug?: string;
    timezone: string;
    memberId: string;
    adminUserId: string;
  }): Promise<TenantDto>;
  updateTenant(
    id: string,
    patch: { name?: string; status?: string; timezone?: string },
    version: string,
  ): Promise<TenantDto>;
  incrementAuthz(tenantId: string): Promise<string>;
  workspace(tenantId: string, id: string, lock?: boolean): Promise<WorkspaceDto>;
  workspaces(
    tenantId: string,
    ids: string[] | null,
    query: PageQuery,
  ): Promise<ListPage<WorkspaceDto>>;
  createWorkspace(
    tenantId: string,
    input: { id: string; name: string; slug?: string; description: string },
  ): Promise<WorkspaceDto>;
  updateWorkspace(
    tenantId: string,
    id: string,
    patch: { name?: string; description?: string; status?: string },
    version: string,
  ): Promise<WorkspaceDto>;
  memberUser(tenantId: string, memberId: string): Promise<string | null>;
  member(tenantId: string, id: string, lock?: boolean): Promise<TenantMemberState>;
  members(tenantId: string, query: PageQuery): Promise<ListPage<MemberDto>>;
  createMember(
    tenantId: string,
    input: { id: string; userId: string; roleKey: TenantRole; permissionKeys: Permission[] },
  ): Promise<TenantMemberState>;
  updateMember(
    tenantId: string,
    id: string,
    patch: { roleKey: TenantRole; status: string; permissionKeys: Permission[] },
    version: string,
  ): Promise<TenantMemberState>;
  countActiveAdmins(tenantId: string): Promise<number>;
  binding(tenantId: string, workspaceId: string, id: string, lock?: boolean): Promise<BindingState>;
  bindings(tenantId: string, workspaceId: string, query: PageQuery): Promise<ListPage<BindingDto>>;
  createBinding(
    tenantId: string,
    workspaceId: string,
    input: {
      id: string;
      tenantMemberId: string;
      roleKey: WorkspaceRole;
      permissionKeys: Permission[];
    },
  ): Promise<BindingState>;
  updateBinding(
    tenantId: string,
    workspaceId: string,
    id: string,
    patch: { roleKey: WorkspaceRole; permissionKeys: Permission[] },
    version: string,
  ): Promise<BindingState>;
  deleteBinding(tenantId: string, workspaceId: string, id: string, version: string): Promise<void>;
  memberPermissions(
    tenantId: string,
    memberId: string,
    workspaceId?: string,
    bindingId?: string,
  ): Promise<PermissionsDto>;
}
export type AccessContext = {
  identity: IdentityStore;
  access: AccessStore;
  audit: AuditWriter;
  notifications: NotificationWriter;
};
