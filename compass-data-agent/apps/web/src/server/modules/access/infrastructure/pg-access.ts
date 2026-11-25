import "server-only";
import type { SqlClient } from "../../../platform/db";
import type { Actor } from "../../../platform/application-types";
import { reject, assertVersion } from "../../../platform/errors";
import type { AccessStore, TenantMemberState, BindingState } from "../application/ports";
import type {
  TenantDto,
  WorkspaceDto,
  MemberDto,
  BindingDto,
  PermissionsDto,
} from "../../../../contracts/web";
import { effectivePermissions, type CurrentAccess } from "../domain/access-policy";
import { normalizePermissions, PERMISSION_BY_ID, type Permission } from "../domain/permissions";

const tenantColumns =
  'id,slug,name,status,timezone,version::text,authz_version::text AS "authzVersion"';
const workspaceColumns = 'id,slug,tenant_id AS "tenantId",name,description,status,version::text';
const memberColumns =
  'm.id,m.tenant_id AS "tenantId",m.user_id AS "userId",u.login_name AS "loginName",u.display_name AS "displayName",u.status AS "userStatus",m.role_key AS "roleKey",m.status,m.version::text,t.authz_version::text AS "authzVersion",m.permission_keys AS "permissionKeys"';
const bindingColumns =
  'b.id,b.tenant_id AS "tenantId",b.workspace_id AS "workspaceId",b.tenant_member_id AS "tenantMemberId",m.user_id AS "userId",u.login_name AS "loginName",u.display_name AS "displayName",b.role_key AS "roleKey",b.permission_keys AS "permissionKeys",b.version::text';
const searchPattern = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;
const publicMember = (value: TenantMemberState): MemberDto => ({
  id: value.id,
  tenantId: value.tenantId,
  userId: value.userId,
  loginName: value.loginName,
  displayName: value.displayName,
  userStatus: value.userStatus,
  roleKey: value.roleKey,
  status: value.status,
  version: value.version,
  authzVersion: value.authzVersion,
});
const publicBinding = (value: BindingState): BindingDto => ({
  id: value.id,
  workspaceId: value.workspaceId,
  tenantMemberId: value.tenantMemberId,
  userId: value.userId,
  loginName: value.loginName,
  displayName: value.displayName,
  roleKey: value.roleKey,
  version: value.version,
});

export function bindAccess(client: SqlClient): AccessStore {
  async function tenant(id: string, lock = false): Promise<TenantDto> {
    const { rows } = await client.query<TenantDto>(
      `SELECT ${tenantColumns} FROM web.tenant WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
      [id],
    );
    if (!rows[0]) reject("not_found");
    return rows[0];
  }
  async function workspace(tenantId: string, id: string, lock = false): Promise<WorkspaceDto> {
    const { rows } = await client.query<WorkspaceDto>(
      `SELECT ${workspaceColumns} FROM web.workspace WHERE tenant_id=$1 AND id=$2${lock ? " FOR UPDATE" : ""}`,
      [tenantId, id],
    );
    if (!rows[0]) reject("not_found");
    return rows[0];
  }
  async function member(tenantId: string, id: string, lock = false): Promise<TenantMemberState> {
    const { rows } = await client.query<TenantMemberState>(
      `SELECT ${memberColumns} FROM web.tenant_member m JOIN web.app_user u ON u.id=m.user_id JOIN web.tenant t ON t.id=m.tenant_id WHERE m.tenant_id=$1 AND m.id=$2${lock ? " FOR UPDATE OF m" : ""}`,
      [tenantId, id],
    );
    if (!rows[0]) reject("not_found");
    return rows[0];
  }
  async function binding(
    tenantId: string,
    workspaceId: string,
    id: string,
    lock = false,
  ): Promise<BindingState> {
    const { rows } = await client.query<BindingState>(
      `SELECT ${bindingColumns} FROM web.workspace_member b JOIN web.tenant_member m ON m.tenant_id=b.tenant_id AND m.id=b.tenant_member_id JOIN web.app_user u ON u.id=m.user_id WHERE b.tenant_id=$1 AND b.workspace_id=$2 AND b.id=$3${lock ? " FOR UPDATE OF b" : ""}`,
      [tenantId, workspaceId, id],
    );
    if (!rows[0]) reject("not_found");
    return rows[0];
  }
  async function current(actor: Actor, tenantId: string): Promise<CurrentAccess> {
    const { rows } = await client.query<{
      id: string;
      role_key: "admin" | "member";
      permission_keys: Permission[];
      authz_version: string;
    }>(
      "SELECT m.id,m.role_key,m.permission_keys,t.authz_version::text FROM web.tenant_member m JOIN web.tenant t ON t.id=m.tenant_id WHERE m.user_id=$1 AND m.tenant_id=$2 AND m.status='active' AND t.status='active'",
      [actor.userId, tenantId],
    );
    const row = rows[0];
    if (!row) reject("not_found");
    const assigned = await client.query<{ workspace_id: string; permission_keys: Permission[] }>(
      "SELECT workspace_id,permission_keys FROM web.workspace_member WHERE tenant_id=$1 AND tenant_member_id=$2",
      [tenantId, row.id],
    );
    return {
      tenantId,
      memberId: row.id,
      role: row.role_key,
      authzVersion: row.authz_version,
      tenantPermissions: row.permission_keys,
      workspacePermissions: new Map(assigned.rows.map((r) => [r.workspace_id, r.permission_keys])),
    };
  }
  return {
    current,
    tenant,
    workspace,
    member,
    binding,
    async activeTenantVersions(userId) {
      const { rows } = await client.query<{ tenantId: string; authzVersion: string }>(
        `SELECT t.id AS "tenantId",t.authz_version::text AS "authzVersion" FROM web.tenant t JOIN web.tenant_member m ON m.tenant_id=t.id WHERE m.user_id=$1 AND m.status='active' AND t.status='active' ORDER BY t.id`,
        [userId],
      );
      return rows;
    },
    async resolveRoute(tenantRef, workspaceRef) {
      const tenants = await client.query<{ id: string }>(
        "SELECT id FROM web.tenant WHERE id::text=$1 OR slug=$1",
        [tenantRef],
      );
      const tenantId = tenants.rows[0]?.id;
      if (!tenantId) reject("not_found");
      if (!workspaceRef) return { tenantId };
      const spaces = await client.query<{ id: string }>(
        "SELECT id FROM web.workspace WHERE tenant_id=$1 AND (id::text=$2 OR slug=$2)",
        [tenantId, workspaceRef],
      );
      const workspaceId = spaces.rows[0]?.id;
      if (!workspaceId) reject("not_found");
      return { tenantId, workspaceId };
    },
    async tenants(actor, query, platform = false) {
      const where = `name ILIKE $2 ESCAPE '\\' AND ($3::boolean OR (status='active' AND EXISTS (SELECT 1 FROM web.tenant_member m WHERE m.tenant_id=t.id AND m.user_id=$1 AND m.status='active')))`;
      const args = [actor.userId, searchPattern(query.q), platform];
      const count = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM web.tenant t WHERE ${where}`,
        args,
      );
      const { rows } = await client.query<TenantDto>(
        `SELECT ${tenantColumns} FROM web.tenant t WHERE ${where} ORDER BY ${query.sort === "createdAt" ? "created_at DESC" : "name"},id LIMIT $4 OFFSET $5`,
        [...args, query.limit, (query.page - 1) * query.limit],
      );
      return { items: rows, total: count.rows[0].total, page: query.page, limit: query.limit };
    },
    async createTenant(input) {
      await client.query(
        "INSERT INTO web.tenant(id,name,timezone,slug) VALUES($1,$2,$3,COALESCE($4,'tenant-'||left(replace(gen_random_uuid()::text,'-',''),12)))",
        [input.id, input.name, input.timezone, input.slug ?? null],
      );
      await client.query(
        "INSERT INTO web.tenant_member(id,tenant_id,user_id,role_key) VALUES($1,$2,$3,'admin')",
        [input.memberId, input.id, input.adminUserId],
      );
      return tenant(input.id);
    },
    async updateTenant(id, patch, version) {
      const result = await client.query(
        "UPDATE web.tenant SET name=COALESCE($2,name),status=COALESCE($3,status),timezone=COALESCE($4,timezone),version=version+1,updated_at=now() WHERE id=$1 AND version=$5::bigint RETURNING id",
        [id, patch.name ?? null, patch.status ?? null, patch.timezone ?? null, version],
      );
      if (!result.rowCount) {
        assertVersion((await tenant(id)).version, version);
        reject("conflict");
      }
      return tenant(id);
    },
    async incrementAuthz(tenantId) {
      const { rows } = await client.query<{ version: string }>(
        "UPDATE web.tenant SET authz_version=authz_version+1 WHERE id=$1 RETURNING authz_version::text AS version",
        [tenantId],
      );
      return rows[0].version;
    },
    async workspaces(tenantId, ids, query) {
      const where =
        "tenant_id=$1 AND ($2::uuid[] IS NULL OR id=ANY($2::uuid[])) AND name ILIKE $3 ESCAPE '\\'";
      const args = [tenantId, ids, searchPattern(query.q)];
      const count = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM web.workspace WHERE ${where}`,
        args,
      );
      const { rows } = await client.query<WorkspaceDto>(
        `SELECT ${workspaceColumns} FROM web.workspace WHERE ${where} ORDER BY ${query.sort === "createdAt" ? "created_at DESC" : "name"},id LIMIT $4 OFFSET $5`,
        [...args, query.limit, (query.page - 1) * query.limit],
      );
      return { items: rows, total: count.rows[0].total, page: query.page, limit: query.limit };
    },
    async createWorkspace(tenantId, input) {
      await client.query(
        "INSERT INTO web.workspace(id,tenant_id,name,description,slug) VALUES($1,$2,$3,$4,COALESCE($5,'space-'||left(replace(gen_random_uuid()::text,'-',''),12)))",
        [input.id, tenantId, input.name, input.description, input.slug ?? null],
      );
      return workspace(tenantId, input.id);
    },
    async updateWorkspace(tenantId, id, patch, version) {
      const result = await client.query(
        "UPDATE web.workspace SET name=COALESCE($3,name),description=COALESCE($4,description),status=COALESCE($5,status),version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND version=$6::bigint RETURNING id",
        [
          tenantId,
          id,
          patch.name ?? null,
          patch.description ?? null,
          patch.status ?? null,
          version,
        ],
      );
      if (!result.rowCount) {
        assertVersion((await workspace(tenantId, id)).version, version);
        reject("conflict");
      }
      return workspace(tenantId, id);
    },
    async memberUser(tenantId, memberId) {
      const { rows } = await client.query<{ user_id: string }>(
        "SELECT user_id FROM web.tenant_member WHERE tenant_id=$1 AND id=$2",
        [tenantId, memberId],
      );
      return rows[0]?.user_id ?? null;
    },
    async members(tenantId, query) {
      const where =
        "m.tenant_id=$1 AND (u.display_name ILIKE $2 ESCAPE '\\' OR u.login_name ILIKE $2 ESCAPE '\\')";
      const joins =
        "web.tenant_member m JOIN web.app_user u ON u.id=m.user_id JOIN web.tenant t ON t.id=m.tenant_id";
      const args = [tenantId, searchPattern(query.q)];
      const count = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM ${joins} WHERE ${where}`,
        args,
      );
      const { rows } = await client.query<TenantMemberState>(
        `SELECT ${memberColumns} FROM ${joins} WHERE ${where} ORDER BY ${query.sort === "createdAt" ? "m.created_at DESC" : "u.display_name"},m.id LIMIT $3 OFFSET $4`,
        [...args, query.limit, (query.page - 1) * query.limit],
      );
      return {
        items: rows.map(publicMember),
        total: count.rows[0].total,
        page: query.page,
        limit: query.limit,
      };
    },
    async createMember(tenantId, input) {
      await client.query(
        "INSERT INTO web.tenant_member(id,tenant_id,user_id,role_key,permission_keys) VALUES($1,$2,$3,$4,$5::text[])",
        [input.id, tenantId, input.userId, input.roleKey, input.permissionKeys],
      );
      return member(tenantId, input.id);
    },
    async updateMember(tenantId, id, patch, version) {
      const result = await client.query(
        "UPDATE web.tenant_member SET role_key=$3,status=$4,permission_keys=$5::text[],version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND version=$6::bigint RETURNING id",
        [tenantId, id, patch.roleKey, patch.status, patch.permissionKeys, version],
      );
      if (!result.rowCount) {
        assertVersion((await member(tenantId, id)).version, version);
        reject("conflict");
      }
      return member(tenantId, id);
    },
    async countActiveAdmins(tenantId) {
      const { rows } = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM web.tenant_member m JOIN web.app_user u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.role_key='admin' AND m.status='active' AND u.status='active'",
        [tenantId],
      );
      return rows[0].count;
    },
    async bindings(tenantId, workspaceId, query) {
      const joins =
        "web.workspace_member b JOIN web.tenant_member m ON m.id=b.tenant_member_id AND m.tenant_id=b.tenant_id JOIN web.app_user u ON u.id=m.user_id";
      const where =
        "b.tenant_id=$1 AND b.workspace_id=$2 AND (u.display_name ILIKE $3 ESCAPE '\\' OR u.login_name ILIKE $3 ESCAPE '\\')";
      const args = [tenantId, workspaceId, searchPattern(query.q)];
      const count = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM ${joins} WHERE ${where}`,
        args,
      );
      const { rows } = await client.query<BindingState>(
        `SELECT ${bindingColumns} FROM ${joins} WHERE ${where} ORDER BY u.display_name,b.id LIMIT $4 OFFSET $5`,
        [...args, query.limit, (query.page - 1) * query.limit],
      );
      return {
        items: rows.map(publicBinding),
        total: count.rows[0].total,
        page: query.page,
        limit: query.limit,
      };
    },
    async createBinding(tenantId, workspaceId, input) {
      await client.query(
        "INSERT INTO web.workspace_member(id,tenant_id,workspace_id,tenant_member_id,role_key,permission_keys) VALUES($1,$2,$3,$4,$5,$6::text[])",
        [
          input.id,
          tenantId,
          workspaceId,
          input.tenantMemberId,
          input.roleKey,
          input.permissionKeys,
        ],
      );
      return binding(tenantId, workspaceId, input.id);
    },
    async updateBinding(tenantId, workspaceId, id, patch, version) {
      const result = await client.query(
        "UPDATE web.workspace_member SET role_key=$4,permission_keys=$5::text[],version=version+1,updated_at=now() WHERE tenant_id=$1 AND workspace_id=$2 AND id=$3 AND version=$6::bigint RETURNING id",
        [tenantId, workspaceId, id, patch.roleKey, patch.permissionKeys, version],
      );
      if (!result.rowCount) {
        assertVersion((await binding(tenantId, workspaceId, id)).version, version);
        reject("conflict");
      }
      return binding(tenantId, workspaceId, id);
    },
    async deleteBinding(tenantId, workspaceId, id, version) {
      const result = await client.query(
        "DELETE FROM web.workspace_member WHERE tenant_id=$1 AND workspace_id=$2 AND id=$3 AND version=$4::bigint",
        [tenantId, workspaceId, id, version],
      );
      if (!result.rowCount) reject("conflict");
    },
    async memberPermissions(tenantId, memberId, workspaceId, bindingId): Promise<PermissionsDto> {
      const target = await member(tenantId, memberId);
      const t = await tenant(tenantId);
      const assignment =
        workspaceId && bindingId ? await binding(tenantId, workspaceId, bindingId) : null;
      if (assignment && assignment.tenantMemberId !== memberId) reject("not_found");
      const scope = { tenantId, ...(workspaceId ? { workspaceId } : {}) };
      const active =
        target.status === "active" && target.userStatus === "active" && t.status === "active";
      const inherited = workspaceId
        ? normalizePermissions(target.permissionKeys, "tenant").filter((key) =>
            PERMISSION_BY_ID.get(key)?.scopes.includes("workspace"),
          )
        : [];
      const access: CurrentAccess = {
        tenantId,
        memberId,
        role: target.roleKey,
        authzVersion: t.authzVersion,
        tenantPermissions: target.permissionKeys,
        workspacePermissions: new Map(
          assignment ? [[workspaceId!, assignment.permissionKeys]] : [],
        ),
      };
      const spaceStatus = workspaceId ? (await workspace(tenantId, workspaceId)).status : "active";
      return {
        targetMemberId: memberId,
        targetStatus: active ? spaceStatus : "disabled",
        scope,
        templateKey: assignment?.roleKey ?? target.roleKey,
        directPermissionKeys: assignment?.permissionKeys ?? target.permissionKeys,
        inheritedPermissionKeys: inherited,
        effectivePermissionKeys: active ? effectivePermissions(access, scope) : [],
        editable: target.roleKey !== "admin",
        version: assignment?.version ?? target.version,
        authzVersion: t.authzVersion,
      };
    },
  };
}
