import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import pg from "pg";
import { manage } from "../../scripts/db-manage.mjs";
vi.mock("server-only", () => ({}));
import { handleWebRequest } from "../../src/server/http/handler";
import { closeDatabase } from "../../src/server/platform/db";
import { encodePassword } from "../../src/server/modules/identity/infrastructure/password";

const fid = (n: number) => `99500000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const password = "test-only-995-password";
const origin = "http://127.0.0.1:3000";
let owner: pg.Client;
type BrowserSession = { cookie: string; csrf: string; sessionId: string };
async function request(path: string, method = "GET", body?: unknown, session?: BrowserSession) {
  return handleWebRequest(
    new Request(`${origin}/api/web/v1/${path}`, {
      method,
      headers: {
        ...(session ? { cookie: session.cookie, "x-csrf-token": session.csrf } : {}),
        ...(method !== "GET"
          ? { origin, "content-type": "application/json", "sec-fetch-site": "same-origin" }
          : {}),
      },
      ...(method !== "GET" ? { body: JSON.stringify(body ?? {}) } : {}),
    }),
  );
}
async function login(name: string, secret = password): Promise<BrowserSession> {
  const response = await request("auth/login", "POST", { loginName: name, password: secret });
  expect(response.status, await response.clone().text()).toBe(200);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const result = await handleWebRequest(
    new Request(`${origin}/api/web/v1/session`, { headers: { cookie } }),
  );
  expect(result.status, await result.clone().text()).toBe(200);
  const view = await result.json();
  return { cookie, csrf: view.csrfToken, sessionId: view.sessionId };
}
let admin: BrowserSession, analyst: BrowserSession, platform: BrowserSession;
beforeAll(async () => {
  const runtime = process.env.WEB_TEST_DATABASE_URL;
  const management = process.env.WEB_TEST_MIGRATION_DATABASE_URL;
  if (!runtime || !management)
    throw new Error(
      "Explicit WEB_TEST_DATABASE_URL and WEB_TEST_MIGRATION_DATABASE_URL required; tests never use development databases.",
    );
  for (const value of [runtime, management])
    if (!/^\/compass_web_test_[a-z0-9_]+$/.test(new URL(value).pathname))
      throw new Error("Refusing non-test database");
  process.env.WEB_DATABASE_URL = runtime;
  process.env.WEB_PUBLIC_ORIGIN = origin;
  process.env.WEB_AUTH_ALLOW_LOCAL_HTTP = "true";
  owner = new pg.Client({ connectionString: management });
  await owner.connect();
  await owner.query("SET ROLE compass_web_owner");
  await owner.query(
    "TRUNCATE web.notification,web.audit_event,web.workspace_member,web.tenant_member,web.workspace,web.tenant,web.web_session,web.app_user",
  );
  const encoded = await encodePassword(password);
  for (const [n, name] of [
    [1, "test.platform"],
    [2, "test.admin"],
    [3, "test.analyst"],
    [4, "test.other"],
  ] as const)
    await owner.query(
      "INSERT INTO web.app_user(id,login_name,password_hash,display_name,is_platform_admin) VALUES($1,$2,$3,$2,$4)",
      [fid(n), name, encoded, n === 1],
    );
  await owner.query(
    "INSERT INTO web.tenant(id,name,timezone) VALUES($1,'Alpha','Asia/Shanghai'),($2,'Beta','UTC')",
    [fid(10), fid(11)],
  );
  await owner.query(
    "INSERT INTO web.workspace(id,tenant_id,name) VALUES($1,$3,'Space A'),($2,$3,'Space B')",
    [fid(20), fid(21), fid(10)],
  );
  await owner.query(
    "INSERT INTO web.tenant_member(id,tenant_id,user_id,role_key) VALUES($1,$4,$6,'admin'),($2,$4,$7,'member'),($3,$5,$8,'admin')",
    [fid(30), fid(31), fid(32), fid(10), fid(11), fid(2), fid(3), fid(4)],
  );
  await owner.query(
    "INSERT INTO web.workspace_member(id,tenant_id,workspace_id,tenant_member_id,role_key,permission_keys) VALUES($1,$3,$4,$6,'analyst',$7),($2,$3,$5,$6,'analyst',$7)",
    [fid(40), fid(41), fid(10), fid(20), fid(21), fid(31), ["module.analysis", "workspaces.read"]],
  );
  admin = await login("test.admin");
  analyst = await login("test.analyst");
  platform = await login("test.platform");
});
afterAll(async () => {
  await closeDatabase();
  await owner?.end();
});
describe("Web foundation on real PostgreSQL", () => {
  it("rolls back business rows when audit or notification insertion fails", async () => {
    const id = randomUUID();
    await owner.query(
      `CREATE FUNCTION web.test_reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='workspace.created' THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_reject_event BEFORE INSERT ON web.audit_event FOR EACH ROW EXECUTE FUNCTION web.test_reject_event()`,
    );
    try {
      const response = await request(
        `tenants/${fid(10)}/workspaces`,
        "POST",
        { id, name: "must rollback", description: "" },
        admin,
      );
      expect(response.status).toBe(503);
      expect((await owner.query("SELECT id FROM web.workspace WHERE id=$1", [id])).rowCount).toBe(
        0,
      );
      expect(
        (await owner.query("SELECT id FROM web.audit_event WHERE target_id=$1", [id])).rowCount,
      ).toBe(0);
    } finally {
      await owner.query(
        "DROP TRIGGER test_reject_event ON web.audit_event; DROP FUNCTION web.test_reject_event()",
      );
    }
    await owner.query(
      `CREATE FUNCTION web.test_reject_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected notification failure'; END $$; CREATE TRIGGER test_reject_notice BEFORE INSERT ON web.notification FOR EACH ROW EXECUTE FUNCTION web.test_reject_notice()`,
    );
    try {
      const response = await request(
        `tenants/${fid(10)}/members`,
        "POST",
        { id, loginName: "test.other", roleKey: "member", permissionKeys: [] },
        admin,
      );
      expect(response.status).toBe(503);
      expect(
        (await owner.query("SELECT id FROM web.tenant_member WHERE id=$1", [id])).rowCount,
      ).toBe(0);
      expect(
        (await owner.query("SELECT id FROM web.audit_event WHERE target_id=$1", [id])).rowCount,
      ).toBe(0);
    } finally {
      await owner.query(
        "DROP TRIGGER test_reject_notice ON web.notification; DROP FUNCTION web.test_reject_notice()",
      );
    }
  });
  it("returns no CSV when the generated audit fails at COMMIT", async () => {
    await owner.query(
      `CREATE FUNCTION web.test_deferred_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='audit.export' THEN RAISE EXCEPTION 'injected commit failure'; END IF; RETURN NEW; END $$; CREATE CONSTRAINT TRIGGER test_deferred_audit AFTER INSERT ON web.audit_event DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION web.test_deferred_audit()`,
    );
    try {
      const response = await request(`tenants/${fid(10)}/audit/export`, "POST", {}, admin);
      expect(response.status).toBe(503);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(
        (await owner.query("SELECT id FROM web.audit_event WHERE action='audit.export'")).rowCount,
      ).toBe(0);
    } finally {
      await owner.query(
        "DROP TRIGGER test_deferred_audit ON web.audit_event; DROP FUNCTION web.test_deferred_audit()",
      );
    }
  });
  it("keeps platform privileges separate, filters before counting, and rejects forged fields", async () => {
    expect((await request(`tenants/${fid(10)}/members`, "GET", undefined, platform)).status).toBe(
      404,
    );
    expect((await request(`tenants/${fid(11)}/members`, "GET", undefined, admin)).status).toBe(404);
    expect((await request(`tenants/${fid(10)}/members`, "GET", undefined, analyst)).status).toBe(
      403,
    );
    const spaces = await request(
      `tenants/${fid(10)}/workspaces?limit=1`,
      "GET",
      undefined,
      analyst,
    );
    expect(await spaces.json()).toMatchObject({ total: 2, items: [{ tenantId: fid(10) }] });
    expect(
      (await request("me", "PATCH", { isPlatformAdmin: true, expectedVersion: "1" }, analyst))
        .status,
    ).toBe(422);
    const raw = await request("me", "GET", undefined, admin);
    expect(await raw.text()).not.toMatch(/password|token_hash|isPlatformAdmin/);
    expect(raw.headers.get("cache-control")).toBe("private, no-store");
  });
  it("rejects foreign-origin and invalid CSRF writes", async () => {
    const response = await handleWebRequest(
      new Request(`${origin}/api/web/v1/me`, {
        method: "PATCH",
        headers: {
          cookie: admin.cookie,
          origin: "https://other.invalid",
          "content-type": "application/json",
          "x-csrf-token": admin.csrf,
        },
        body: '{"displayName":"forged","expectedVersion":"1"}',
      }),
    );
    expect(response.status).toBe(403);
    expect(
      (
        await request(
          "me",
          "PATCH",
          { displayName: "forged", expectedVersion: "1" },
          { ...admin, csrf: "wrong" },
        )
      ).status,
    ).toBe(403);
  });
  it("creates atomically, rejects duplicate stable IDs, and guards versions/last administrators", async () => {
    const id = randomUUID();
    const input = { id, name: "New space", description: "" };
    expect((await request(`tenants/${fid(10)}/workspaces`, "POST", input, admin)).status).toBe(201);
    expect((await request(`tenants/${fid(10)}/workspaces`, "POST", input, admin)).status).toBe(409);
    expect(
      (
        await request(
          `tenants/${fid(10)}/workspaces/${id}`,
          "PATCH",
          { name: "newer", expectedVersion: "9" },
          admin,
        )
      ).status,
    ).toBe(409);
    const member = await (
      await request(`tenants/${fid(10)}/members/${fid(30)}`, "GET", undefined, admin)
    ).json();
    const disabled = await request(
      `tenants/${fid(10)}/members/${fid(30)}`,
      "PATCH",
      {
        status: "disabled",
        expectedVersion: member.version,
        expectedAuthzVersion: member.authzVersion,
      },
      admin,
    );
    expect(disabled.status, await disabled.clone().text()).toBe(409);
    const { rows } = await owner.query(
      "SELECT (SELECT count(*) FROM web.workspace WHERE id=$1)::int AS records,(SELECT count(*) FROM web.audit_event WHERE target_id=$1 AND action='workspace.created')::int AS events",
      [id],
    );
    expect(rows[0]).toEqual({ records: 1, events: 1 });
  });
  it("changes the view revision on a 200 partial revocation and rejects stale authorization versions", async () => {
    const path = `session?tenantId=${fid(10)}&workspaceId=${fid(20)}&pageId=analysis-new`;
    const before = await (await request(path, "GET", undefined, analyst)).json();
    const permsPath = `tenants/${fid(10)}/workspaces/${fid(21)}/members/${fid(41)}/permissions`;
    const permissions = await (await request(permsPath, "GET", undefined, admin)).json();
    const body = {
      permissionKeys: [],
      expectedVersion: permissions.version,
      expectedAuthzVersion: permissions.authzVersion,
    };
    const saved = await request(permsPath, "PUT", body, admin);
    expect(saved.status, await saved.clone().text()).toBe(200);
    const afterResponse = await request(path, "GET", undefined, analyst);
    expect(afterResponse.status).toBe(200);
    const after = await afterResponse.json();
    expect(after.viewRevision).not.toBe(before.viewRevision);
    expect((await request(`tenants/${fid(10)}/workspaces`, "GET", undefined, analyst)).status).toBe(
      200,
    );
    expect(
      (await (await request(`tenants/${fid(10)}/workspaces`, "GET", undefined, analyst)).json())
        .total,
    ).toBe(1);
    expect((await request(permsPath, "PUT", body, admin)).status).toBe(409);
    expect(
      (
        await request(
          `session?tenantId=${fid(10)}&workspaceId=${fid(21)}&pageId=analysis-new`,
          "GET",
          undefined,
          analyst,
        )
      ).status,
    ).toBe(403);
  });
  it("commits CSV generated audit before returning bytes; rejects reserved grants and invalid cursors", async () => {
    const response = await request(`tenants/${fid(10)}/audit/export`, "POST", {}, admin);
    expect(response.status, await response.clone().text()).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    const result = await owner.query(
      "SELECT count(*)::int AS n FROM web.audit_event WHERE action='audit.export' AND outcome='generated'",
    );
    expect(result.rows[0].n).toBe(1);
    expect(
      (await request(`tenants/${fid(10)}/audit?cursor=invalid`, "GET", undefined, admin)).status,
    ).toBe(422);
    const path = `tenants/${fid(10)}/members/${fid(31)}/permissions`;
    const perm = await (await request(path, "GET", undefined, admin)).json();
    expect(
      (
        await request(
          path,
          "PUT",
          {
            permissionKeys: ["members.write"],
            expectedVersion: perm.version,
            expectedAuthzVersion: perm.authzVersion,
          },
          admin,
        )
      ).status,
    ).toBe(422);
    const runtime = new pg.Client({ connectionString: process.env.WEB_TEST_DATABASE_URL });
    await runtime.connect();
    try {
      await expect(runtime.query("DELETE FROM web.audit_event")).rejects.toMatchObject({
        code: "42501",
      });
      await expect(
        runtime.query("UPDATE web.app_user SET is_platform_admin=true"),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await runtime.end();
    }
  });
  it("revokes the current session successfully without rolling it back", async () => {
    const session = await login("test.other");
    expect((await request(`me/sessions/${session.sessionId}`, "DELETE", {}, session)).status).toBe(
      204,
    );
    expect((await request("session", "GET", undefined, session)).status).toBe(401);
    expect((await request("auth/logout", "POST", {}, session)).status).toBe(204);
  });
  it("serializes competing administrator demotions and preserves a live administrator", async () => {
    const added = randomUUID();
    await owner.query(
      "INSERT INTO web.tenant_member(id,tenant_id,user_id,role_key) VALUES($1,$2,$3,'admin')",
      [added, fid(10), fid(4)],
    );
    const other = await login("test.other");
    const first = await (
      await request(`tenants/${fid(10)}/members/${fid(30)}`, "GET", undefined, admin)
    ).json();
    const second = await (
      await request(`tenants/${fid(10)}/members/${added}`, "GET", undefined, other)
    ).json();
    try {
      const responses = await Promise.all([
        request(
          `tenants/${fid(10)}/members/${fid(30)}`,
          "PATCH",
          {
            roleKey: "member",
            permissionKeys: [],
            expectedVersion: first.version,
            expectedAuthzVersion: first.authzVersion,
          },
          admin,
        ),
        request(
          `tenants/${fid(10)}/members/${added}`,
          "PATCH",
          {
            roleKey: "member",
            permissionKeys: [],
            expectedVersion: second.version,
            expectedAuthzVersion: second.authzVersion,
          },
          other,
        ),
      ]);
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(
        (
          await owner.query(
            "SELECT count(*)::int n FROM web.tenant_member WHERE tenant_id=$1 AND role_key='admin' AND status='active'",
            [fid(10)],
          )
        ).rows[0].n,
      ).toBe(1);
    } finally {
      await owner.query(
        "UPDATE web.tenant_member SET role_key='admin',version=version+1 WHERE id=$1",
        [fid(30)],
      );
      await owner.query("DELETE FROM web.tenant_member WHERE id=$1", [added]);
      await owner.query("UPDATE web.tenant SET authz_version=authz_version+1 WHERE id=$1", [
        fid(10),
      ]);
    }
  });
  it("enforces inherited grants, same-scope audit export, empty grants, and notification idempotence", async () => {
    await owner.query(
      "UPDATE web.tenant_member SET permission_keys=ARRAY['module.reports','audit.read'] WHERE id=$1",
      [fid(31)],
    );
    await owner.query(
      "UPDATE web.workspace_member SET permission_keys=ARRAY['workspaces.read','audit.export'] WHERE id=$1",
      [fid(40)],
    );
    await owner.query(
      "INSERT INTO web.audit_event(id,event_key,tenant_id,workspace_id,action,target_type,outcome) VALUES($1::uuid,$1::uuid::text,$2,$3,'test.scope.a','workspace','success'),($4::uuid,$4::uuid::text,$2,$5,'test.scope.b','workspace','success')",
      [randomUUID(), fid(10), fid(20), randomUUID(), fid(21)],
    );
    const permissions = await (
      await request(
        `tenants/${fid(10)}/workspaces/${fid(20)}/members/${fid(40)}/permissions`,
        "GET",
        undefined,
        admin,
      )
    ).json();
    expect(permissions.inheritedPermissionKeys).toContain("module.reports");
    expect(permissions.effectivePermissionKeys).toContain("module.reports");
    const csv = await request(`tenants/${fid(10)}/audit/export`, "POST", {}, analyst);
    expect(csv.status).toBe(200);
    const content = await csv.text();
    expect(content).toContain("test.scope.a");
    expect(content).not.toContain("test.scope.b");
    const path = `tenants/${fid(10)}/members/${fid(31)}/permissions`;
    const before = await (await request(path, "GET", undefined, admin)).json();
    const body = {
      permissionKeys: [],
      expectedVersion: before.version,
      expectedAuthzVersion: before.authzVersion,
    };
    expect((await request(path, "PUT", body, admin)).status).toBe(200);
    const count = (
      await owner.query("SELECT count(*)::int n FROM web.notification WHERE recipient_user_id=$1", [
        fid(3),
      ])
    ).rows[0].n;
    expect((await request(path, "PUT", body, admin)).status).toBe(409);
    expect(
      (
        await owner.query(
          "SELECT count(*)::int n FROM web.notification WHERE recipient_user_id=$1",
          [fid(3)],
        )
      ).rows[0].n,
    ).toBe(count);
    expect(
      (
        await request(
          `session?tenantId=${fid(10)}&workspaceId=${fid(20)}&pageId=reports-all`,
          "GET",
          undefined,
          analyst,
        )
      ).status,
    ).toBe(403);
    expect((await request(`tenants/${fid(10)}/audit/export`, "POST", {}, analyst)).status).toBe(
      403,
    );
  });
  it("bounds exports and preserves formula-like values safely", async () => {
    await owner.query(
      "INSERT INTO web.audit_event(id,event_key,tenant_id,action,target_type,outcome) VALUES($1::uuid,$1::uuid::text,$2,'=SUM(1,2)','workspace','success')",
      [randomUUID(), fid(10)],
    );
    const escaped = await request(
      `tenants/${fid(10)}/audit/export`,
      "POST",
      { action: "=SUM(1,2)" },
      admin,
    );
    expect(escaped.status).toBe(200);
    expect(await escaped.text()).toContain("'=SUM(1,2)");
    await owner.query(
      "INSERT INTO web.audit_event(id,event_key,tenant_id,action,target_type,outcome) SELECT gen_random_uuid(),gen_random_uuid()::text,$1,'test.limit','workspace','success' FROM generate_series(1,10001)",
      [fid(10)],
    );
    const response = await request(
      `tenants/${fid(10)}/audit/export`,
      "POST",
      { action: "test.limit" },
      admin,
    );
    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toContain("application/json");
    await owner.query("DELETE FROM web.audit_event WHERE action='test.limit'");
    const started = performance.now();
    const page = await request(`tenants/${fid(10)}/audit?limit=2`, "GET", undefined, admin);
    const result = await page.json();
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeTruthy();
    const next = await (
      await request(
        `tenants/${fid(10)}/audit?limit=2&cursor=${result.nextCursor}`,
        "GET",
        undefined,
        admin,
      )
    ).json();
    expect(next.items.map((item: { id: string }) => item.id)).not.toContain(result.items[0].id);
    console.info(`Audit cursor pages observed in ${Math.round(performance.now() - started)} ms`);
    expect(
      (await request(`tenants/${fid(10)}/members?limit=101`, "GET", undefined, admin)).status,
    ).toBe(422);
  });
  it("persists settings and read notifications across login, and rejects expired sessions and bad credentials", async () => {
    const path = `tenants/${fid(10)}/settings`;
    const settings = await (await request(path, "GET", undefined, admin)).json();
    const patch = { timezone: "UTC", expectedVersion: settings.version };
    expect((await request(path, "PATCH", patch, admin)).status).toBe(200);
    expect((await request(path, "PATCH", patch, admin)).status).toBe(409);
    expect((await (await request(path, "GET", undefined, admin)).json()).timezone).toBe("UTC");
    expect((await request(path, "PATCH", patch, analyst)).status).toBe(403);
    const notices = await (
      await request("me/notifications?read=false", "GET", undefined, analyst)
    ).json();
    expect(notices.items.length).toBeGreaterThan(0);
    const noticeId = notices.items[0].id;
    expect(
      (await request(`me/notifications/${noticeId}`, "PATCH", { read: true }, admin)).status,
    ).toBe(404);
    expect(
      (await request(`me/notifications/${noticeId}`, "PATCH", { read: true }, analyst)).status,
    ).toBe(204);
    expect(
      (await request(`me/notifications/${noticeId}`, "PATCH", { read: true }, analyst)).status,
    ).toBe(204);
    const fresh = await login("test.analyst");
    const read = await (
      await request("me/notifications?read=true", "GET", undefined, fresh)
    ).json();
    expect(read.items.some((item: { id: string }) => item.id === noticeId)).toBe(true);
    const expired = await login("test.other");
    await owner.query(
      "UPDATE web.web_session SET expires_at=now()-interval '1 second',created_at=now()-interval '1 hour' WHERE id=$1",
      [expired.sessionId],
    );
    expect((await request("session", "GET", undefined, expired)).status).toBe(401);
    const wrong = await request("auth/login", "POST", {
      loginName: "test.other",
      password: "incorrect-password",
    });
    const missing = await request("auth/login", "POST", {
      loginName: "unknown.995",
      password: "incorrect-password",
    });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    const wrongError = (await wrong.json()).error;
    const missingError = (await missing.json()).error;
    expect(wrongError.code).toBe(missingError.code);
    expect(wrongError.message).toBe(missingError.message);
    expect(wrongError.requestId).not.toBe(missingError.requestId);
    const redirect = await request("auth/login", "POST", {
      loginName: "test.other",
      password,
      returnPath: "https://external.invalid/",
    });
    expect(redirect.status).toBe(200);
    const tenant = (await owner.query("SELECT slug FROM web.tenant WHERE id=$1", [fid(11)]))
      .rows[0];
    expect((await redirect.json()).redirectTo).toBe(
      `/t/${tenant.slug}/admin/organization/workspaces`,
    );
  });
  it("resets passwords against concurrent login, revokes sessions, and guards managed administrator removal", async () => {
    const url = process.env.WEB_TEST_MIGRATION_DATABASE_URL;
    await expect(
      manage({ url, action: "set-status", loginName: "test.admin", status: "disabled" }),
    ).rejects.toThrow(/last active tenant/);
    await expect(
      manage({
        url,
        action: "set-platform-admin",
        loginName: "test.platform",
        platformAdmin: false,
      }),
    ).rejects.toThrow(/last active platform/);
    const secret = "replacement-only-995-password";
    const [oldLogin] = await Promise.all([
      request("auth/login", "POST", { loginName: "test.analyst", password }),
      manage({ url, action: "reset-password", loginName: "test.analyst", password: secret }),
    ]);
    expect([200, 401]).toContain(oldLogin.status);
    expect((await request("session", "GET", undefined, analyst)).status).toBe(401);
    if (oldLogin.ok) {
      const cookie = oldLogin.headers.get("set-cookie")!.split(";")[0];
      expect(
        (
          await handleWebRequest(
            new Request(`${origin}/api/web/v1/session`, { headers: { cookie } }),
          )
        ).status,
      ).toBe(401);
    }
    expect(
      (await request("auth/login", "POST", { loginName: "test.analyst", password })).status,
    ).toBe(401);
    const fresh = await login("test.analyst", secret);
    const audit = await (
      await request("me/audit?action=user.reset-password", "GET", undefined, fresh)
    ).json();
    expect(audit.items).toHaveLength(1);
    expect(audit.items[0].targetId).toBe(fid(3));
    await manage({ url, action: "set-status", loginName: "test.analyst", status: "disabled" });
    expect((await request("session", "GET", undefined, fresh)).status).toBe(401);
  });
});
