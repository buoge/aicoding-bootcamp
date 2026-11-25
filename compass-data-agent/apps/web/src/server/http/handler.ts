import "server-only";
import { z } from "zod";
import * as dto from "../../contracts/web";
import {
  sessionSchema,
  scopeSchema,
  auditPageSchema,
  catalogSchema,
  overviewSchema,
} from "../../contracts/page-schema";
import { PAGE_CATALOG } from "../../lib/page-catalog";
import { authentication, execute, type WebUseCases } from "../composition";
import { reject } from "../platform/errors";
import {
  tokenFromCookie,
  csrfToken,
  requireCsrf,
  requireSameOrigin,
  sessionCookie,
  clearSessionCookie,
} from "./security";
import { errorResponse, jsonResponse, privateHeaders, readJson } from "./responses";
import type { TransactionMode } from "../platform/db";

const empty = z.strictObject({});
const redirectDto = z.strictObject({ redirectTo: z.string().startsWith("/") });
const sessionQuery = scopeSchema.extend({ pageId: z.string().max(80).optional() });
const identityStatusDto = z.strictObject({ mode: z.literal("local"), description: z.string() });
const policyDto = identityStatusDto.extend({ catalogVersion: z.string() });
function queryValues(url: URL) {
  const values: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (Object.hasOwn(values, key)) reject("validation_failed");
    values[key] = value;
  }
  return values;
}

export async function handleWebRequest(request: Request): Promise<Response> {
  try {
    return await dispatchWebRequest(request);
  } catch (error) {
    return errorResponse(error);
  }
}
async function dispatchWebRequest(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const path = url.pathname.slice("/api/web/v1/".length).split("/");
    const route = path.join("/");
    const method = request.method;
    const token = tokenFromCookie(request.headers.get("cookie"));
    const writing = method !== "GET";
    if (writing) requireSameOrigin(request);
    const query = queryValues(url);
    if (route === "auth/login" && method === "POST") {
      empty.parse(query);
      const input = dto.loginInput.parse(await readJson(request));
      const result = await authentication.login({
        ...input,
        oldToken: token,
        deviceLabel: (request.headers.get("user-agent") ?? "浏览器")
          .replace(/[\u0000-\u001f]/g, "")
          .slice(0, 120),
      });
      const response = jsonResponse({ redirectTo: result.redirectTo }, undefined, 200, redirectDto);
      response.headers.set("Set-Cookie", sessionCookie(result.token, result.expiresAt));
      return response;
    }
    if (route === "auth/logout" && method === "POST") {
      empty.parse(query);
      empty.parse(await readJson(request));
      if (token) {
        // An expired cookie only needs clearing. A live session requires its CSRF proof.
        let live = false;
        try {
          await authentication.profile(token);
          live = true;
        } catch (error) {
          if ((error as { code?: string }).code !== "unauthenticated") throw error;
        }
        if (live) {
          requireCsrf(request, token);
          await authentication.logout(token);
        }
      }
      return new Response(null, {
        status: 204,
        headers: { ...privateHeaders, "Set-Cookie": clearSessionCookie() },
      });
    }
    if (writing) requireCsrf(request, token);
    const input = writing ? await readJson(request) : undefined;
    const run = async (
      work: (services: WebUseCases) => Promise<unknown>,
      schema?: z.ZodType,
      status = 200,
      mode: TransactionMode = writing ? "command" : "query",
    ) => {
      const result = await execute(token, mode, work);
      return status === 204
        ? new Response(null, {
            status,
            headers: { ...privateHeaders, "X-Compass-View-Revision": result.viewRevision },
          })
        : jsonResponse(result.value, result.viewRevision, status, schema);
    };
    if ((route === "session" || route === "navigation") && method === "GET") {
      const { pageId, ...scope } = sessionQuery.parse(query);
      if (scope.workspaceId && !scope.tenantId) reject("validation_failed");
      if (pageId) {
        const page = PAGE_CATALOG.find((p) => p.id === pageId);
        if (
          !page ||
          (page.scopeKind === "workspace" && (!scope.tenantId || !scope.workspaceId)) ||
          (page.scopeKind === "tenant" && !scope.tenantId) ||
          (["self", "platform"].includes(page.scopeKind) && (scope.tenantId || scope.workspaceId))
        )
          reject("validation_failed");
      }
      return run(
        async ({ queries }) => {
          const view = await queries.session(token, scope);
          if (pageId && !view.navigation.some((p) => p.id === pageId)) reject("forbidden");
          return { ...view, csrfToken: csrfToken(token) };
        },
        sessionSchema.extend({ csrfToken: z.string() }),
      );
    }
    if (route === "search" && method === "GET") {
      const value = scopeSchema
        .extend({
          q: z.string().trim().max(80).default(""),
          limit: z.coerce.number().int().min(1).max(20).default(20),
        })
        .parse(query);
      return run(
        ({ queries }) =>
          queries.search(
            token,
            { tenantId: value.tenantId, workspaceId: value.workspaceId },
            value.q,
            value.limit,
          ),
        z.strictObject({
          items: z.array(
            z.strictObject({
              id: z.string(),
              title: z.string(),
              href: z.string(),
              kind: z.string(),
            }),
          ),
        }),
      );
    }
    if (route === "context" && method === "POST") {
      empty.parse(query);
      const value = dto.contextInput.parse(input);
      return run(({ queries }) => queries.setContext(token, value), redirectDto);
    }
    if (route === "me") {
      empty.parse(query);
      if (method === "GET") return run(({ identity }) => identity.profile(token), dto.profileDto);
      if (method === "PATCH") {
        const value = dto.profilePatch.parse(input);
        return run(({ identity }) => identity.updateProfile(token, value), dto.mutationResult);
      }
    }
    if (route === "me/sessions" && method === "GET") {
      const value = dto.pageQuery.parse(query);
      return run(({ identity }) => identity.sessions(token, value), dto.listPage(dto.sessionDto));
    }
    if (path.length === 3 && path[0] === "me" && path[1] === "sessions" && method === "DELETE") {
      empty.parse(query);
      empty.parse(input);
      const id = dto.uuid.parse(path[2]);
      const result = await execute(token, "command", async ({ queries, identity }) => {
        const current = (await queries.session(token)).sessionId === id;
        await identity.revokeSession(token, id);
        return { current };
      });
      return new Response(null, {
        status: 204,
        headers: {
          ...privateHeaders,
          "X-Compass-View-Revision": result.viewRevision,
          ...(result.value.current ? { "Set-Cookie": clearSessionCookie() } : {}),
        },
      });
    }
    if (route === "me/audit" && method === "GET") {
      const value = dto.auditFilter.parse(query);
      return run(({ queries }) => queries.audit(token, undefined, value), auditPageSchema);
    }
    if (route === "me/notifications" && method === "GET") {
      const { read, ...value } = dto.pageQuery
        .extend({ read: z.enum(["true", "false"]).optional() })
        .parse(query);
      return run(
        ({ queries }) =>
          queries.notifications(token, value, read === undefined ? undefined : read === "true"),
        dto.listPage(dto.notificationDto),
      );
    }
    if (
      path.length === 3 &&
      path[0] === "me" &&
      path[1] === "notifications" &&
      method === "PATCH"
    ) {
      empty.parse(query);
      z.strictObject({ read: z.literal(true) }).parse(input);
      const id = dto.uuid.parse(path[2]);
      return run(({ queries }) => queries.markNotificationRead(token, id), undefined, 204);
    }
    if (route === "tenants" && method === "GET") {
      const value = dto.pageQuery.parse(query);
      return run(({ access }) => access.tenants(token, value), dto.listPage(dto.tenantDto));
    }
    if (route === "platform/tenants") {
      if (method === "GET") {
        const value = dto.pageQuery.parse(query);
        return run(({ access }) => access.tenants(token, value, true), dto.listPage(dto.tenantDto));
      }
      if (method === "POST") {
        empty.parse(query);
        const value = dto.createTenant.parse(input);
        return run(({ access }) => access.createTenant(token, value), dto.mutationResult, 201);
      }
    }
    if (path.length === 3 && path[0] === "platform" && path[1] === "tenants") {
      empty.parse(query);
      const id = dto.uuid.parse(path[2]);
      if (method === "GET")
        return run(({ access }) => access.platformTenant(token, id), dto.tenantDto);
      if (method === "PATCH") {
        const value = dto.patchTenant.parse(input);
        return run(
          ({ access }) => access.patchPlatformTenant(token, id, value),
          dto.mutationResult,
        );
      }
    }
    if (path[0] === "tenants" && path.length >= 3) {
      const tenantId = dto.uuid.parse(path[1]);
      const resource = path[2];
      if (path.length === 3) {
        if (resource === "settings") {
          empty.parse(query);
          if (method === "GET")
            return run(({ access }) => access.settings(token, tenantId), dto.tenantDto);
          if (method === "PATCH") {
            const value = dto.patchSettings.parse(input);
            return run(
              ({ access }) => access.patchSettings(token, tenantId, value),
              dto.mutationResult,
            );
          }
        }
        if (resource === "workspaces" || resource === "members") {
          if (method === "GET") {
            const value = dto.pageQuery.parse(query);
            return resource === "workspaces"
              ? run(
                  ({ access }) => access.workspaces(token, tenantId, value),
                  dto.listPage(dto.workspaceDto),
                )
              : run(
                  ({ access }) => access.members(token, tenantId, value),
                  dto.listPage(dto.memberDto),
                );
          }
          if (method === "POST") {
            empty.parse(query);
            if (resource === "workspaces") {
              const value = dto.createWorkspace.parse(input);
              return run(
                ({ access }) => access.createWorkspace(token, tenantId, value),
                dto.mutationResult,
                201,
              );
            }
            const value = dto.createMember.parse(input);
            return run(
              ({ access }) => access.createMember(token, tenantId, value),
              dto.mutationResult,
              201,
            );
          }
        }
        if (resource === "audit" && method === "GET") {
          const value = dto.auditFilter.parse(query);
          return run(({ queries }) => queries.audit(token, tenantId, value), auditPageSchema);
        }
        if (resource === "overview" && method === "GET") {
          const value = z.strictObject({ workspaceId: dto.uuid.optional() }).parse(query);
          return run(
            ({ queries }) => queries.overview(token, tenantId, value.workspaceId),
            overviewSchema,
          );
        }
        if (method === "GET") {
          empty.parse(query);
          if (resource === "roles" || resource === "permission-catalog")
            return run(({ queries }) => queries.catalog(token, tenantId), catalogSchema);
          if (resource === "identity-status")
            return run(({ queries }) => queries.identityStatus(token, tenantId), identityStatusDto);
          if (resource === "security-policy")
            return run(({ queries }) => queries.securityPolicy(token, tenantId), policyDto);
        }
      }
      if (path.length === 4 && resource === "audit" && path[3] === "export" && method === "POST") {
        empty.parse(query);
        const value = dto.auditFilter.omit({ cursor: true, limit: true }).parse(input);
        const result = await execute(token, "export", ({ queries }) =>
          queries.exportAudit(token, tenantId, { ...value, limit: 20 }),
        );
        return new Response(result.value, {
          headers: {
            ...privateHeaders,
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="compass-audit.csv"',
            "X-Compass-View-Revision": result.viewRevision,
          },
        });
      }
      if (["workspaces", "members"].includes(resource) && path.length >= 4) {
        const id = dto.uuid.parse(path[3]);
        if (path.length === 4) {
          empty.parse(query);
          if (method === "GET")
            return resource === "workspaces"
              ? run(({ access }) => access.workspace(token, tenantId, id), dto.workspaceDto)
              : run(({ access }) => access.member(token, tenantId, id), dto.memberDto);
          if (method === "PATCH") {
            if (resource === "workspaces") {
              const value = dto.patchWorkspace.parse(input);
              return run(
                ({ access }) => access.patchWorkspace(token, tenantId, id, value),
                dto.mutationResult,
              );
            }
            const value = dto.patchMember.parse(input);
            return run(
              ({ access }) => access.patchMember(token, tenantId, id, value),
              dto.mutationResult,
            );
          }
        }
        if (resource === "members" && path.length === 5 && path[4] === "permissions") {
          empty.parse(query);
          if (method === "GET")
            return run(({ access }) => access.permissions(token, tenantId, id), dto.permissionsDto);
          if (method === "PUT") {
            const value = dto.replacePermissions.parse(input);
            return run(
              ({ access }) => access.replacePermissions(token, tenantId, id, value),
              dto.permissionsDto,
            );
          }
        }
        if (resource === "workspaces" && path[4] === "members") {
          if (path.length === 5) {
            if (method === "GET") {
              const value = dto.pageQuery.parse(query);
              return run(
                ({ access }) => access.bindings(token, tenantId, id, value),
                dto.listPage(dto.bindingDto),
              );
            }
            if (method === "POST") {
              empty.parse(query);
              const value = dto.createWorkspaceMember.parse(input);
              return run(
                ({ access }) => access.createBinding(token, tenantId, id, value),
                dto.mutationResult,
                201,
              );
            }
          }
          if (path.length === 6 || (path.length === 7 && path[6] === "permissions")) {
            empty.parse(query);
            const bindingId = dto.uuid.parse(path[5]);
            if (path.length === 6) {
              if (method === "GET")
                return run(
                  ({ access }) => access.binding(token, tenantId, id, bindingId),
                  dto.bindingDto,
                );
              if (method === "PATCH") {
                const value = dto.patchWorkspaceMember.parse(input);
                return run(
                  ({ access }) => access.patchBinding(token, tenantId, id, bindingId, value),
                  dto.mutationResult,
                );
              }
              if (method === "DELETE") {
                const value = dto.deleteVersion.parse(input);
                return run(
                  ({ access }) => access.deleteBinding(token, tenantId, id, bindingId, value),
                  dto.mutationResult,
                );
              }
            } else if (method === "GET" || method === "PUT") {
              const value = method === "PUT" ? dto.replacePermissions.parse(input) : undefined;
              return run(async ({ access }) => {
                const binding = await access.binding(token, tenantId, id, bindingId);
                return value
                  ? access.replacePermissions(
                      token,
                      tenantId,
                      binding.tenantMemberId,
                      value,
                      id,
                      bindingId,
                    )
                  : access.permissions(token, tenantId, binding.tenantMemberId, id, bindingId);
              }, dto.permissionsDto);
            }
          }
        }
      }
    }
    reject("not_found");
  } catch (error) {
    return errorResponse(error);
  }
}
