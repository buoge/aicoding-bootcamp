import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { readFileSync } from "node:fs";
import { PAGE_CATALOG, pageUrl } from "../../src/lib/page-catalog";
import { DEFAULT_TEMPLATES } from "../../src/contracts/authorization";
const fid = (n: number) => `99500000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tenantId = fid(10),
  workspaceId = fid(20),
  scope = { tenantId, workspaceId };
const origin = `http://127.0.0.1:${process.env.WEB_TEST_PORT ?? 3010}`;
const password = process.env.WEB_TEST_PASSWORD ?? "teaching-995-only-password";
let owner: pg.Client;
test.beforeAll(async () => {
  const connectionString = process.env.WEB_TEST_MIGRATION_DATABASE_URL;
  if (
    !connectionString ||
    !/^\/compass_web_test_[a-z0-9_]+$/.test(new URL(connectionString).pathname)
  )
    throw new Error("Dedicated test migration database required");
  owner = new pg.Client({ connectionString });
  await owner.connect();
  await owner.query("SET ROLE compass_web_owner");
});
test.beforeEach(async () => {
  await owner.query(
    "UPDATE web.workspace_member SET role_key='analyst',permission_keys=$2,version=version+1 WHERE id=ANY($1::uuid[])",
    [[fid(40), fid(41)], DEFAULT_TEMPLATES.analyst],
  );
  await owner.query(
    "UPDATE web.app_user SET preferences='{}'::jsonb,version=version+1 WHERE id IN ($1,$2)",
    [fid(2), fid(3)],
  );
  await owner.query("UPDATE web.tenant SET authz_version=authz_version+1 WHERE id=$1", [tenantId]);
});
test.afterAll(async () => {
  await owner?.end();
});
async function login(context: BrowserContext, name = "admin") {
  const send = () =>
    context.request.post("/api/web/v1/auth/login", {
      headers: { origin },
      data: { loginName: `teaching.${name}`, password },
    });
  let response = await send();
  // The growing browser suite shares fixture accounts and respects the real 10/minute limit.
  if (response.status() === 429) {
    test.setTimeout(test.info().timeout + 65000);
    await expect
      .poll(
        async () => {
          response = await send();
          return response.status();
        },
        { timeout: 65000, intervals: [5000] },
      )
      .not.toBe(429);
  }
  expect(response.status(), await response.text()).toBe(200);
}
async function active(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-protected-root]")).toBeVisible();
}
async function revokeB() {
  await owner.query("BEGIN");
  try {
    await owner.query(
      "UPDATE web.workspace_member SET permission_keys='{}',version=version+1 WHERE id=$1",
      [fid(41)],
    );
    await owner.query("UPDATE web.tenant SET authz_version=authz_version+1 WHERE id=$1", [
      tenantId,
    ]);
    await owner.query("COMMIT");
  } catch (e) {
    await owner.query("ROLLBACK");
    throw e;
  }
}

test("local login, complete registered pages, and SPA navigation with a persistent shell", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await page.goto(`/t/${tenantId}/w/${workspaceId}/reports`);
  await expect(page).toHaveURL(/\/login\?/);
  await page.getByLabel("登录名", { exact: true }).fill("teaching.admin");
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录 Compass" }).click();
  await expect(page).toHaveURL(/\/w\/zongbu\/reports$/);
  await expect(page.locator("[data-protected-root]")).toBeVisible();
  let futureRequests = 0;
  page.on("request", (request) => {
    if (/\/api\/(reports|boards|memory|files|runs)/.test(request.url())) futureRequests++;
  });
  const pages = PAGE_CATALOG.filter((p) => p.scopeKind !== "platform");
  for (const spec of pages) {
    const path = pageUrl(spec, scope)!;
    await active(page, path);
    const sidebarTitle =
      spec.section === "analysis"
        ? "Compass分析空间"
        : spec.section === "admin-overview" || spec.path.startsWith("admin/")
          ? "管理与治理"
          : spec.sectionTitle;
    await expect(page.locator(".secondary-sidebar .secondary-brand")).toHaveText(sidebarTitle);
    await expect(page.locator(".secondary-section-title")).toHaveCount(0);
    await expect(page.locator("#main-content")).toContainText(
      spec.scopeKind === "tenant" && spec.section.startsWith("admin")
        ? spec.sectionTitle
        : spec.title,
    );
  }
  expect(futureRequests).toBe(0);
  await active(page, `/t/${tenantId}/w/${workspaceId}/analysis`);
  let documentRequests = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest()) documentRequests++;
  });
  await page.evaluate(() => {
    Reflect.set(window, "spaRail", document.querySelector(".primary-rail"));
    Reflect.set(window, "spaTopbar", document.querySelector(".topbar"));
    Reflect.set(window, "spaWasHidden", false);
    const observer = new MutationObserver(() => {
      const rail = Reflect.get(window, "spaRail") as HTMLElement;
      if (!rail.isConnected || rail.closest<HTMLElement>("[data-protected-root]")?.hidden)
        Reflect.set(window, "spaWasHidden", true);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"],
    });
  });
  await page.getByRole("link", { name: "报告空间", exact: true }).click();
  await expect(page).toHaveURL(/\/w\/zongbu\/reports$/);
  await expect(page.locator("#main-content h1")).toHaveText("全部产物");
  await expect(page.locator("#main-content")).toHaveAttribute("aria-busy", "false");
  await page.goBack();
  await expect(page.locator("#main-content h1")).toHaveText("新建分析");
  await page.goForward();
  await expect(page.locator("#main-content h1")).toHaveText("全部产物");
  await expect(page.locator("#main-content")).toHaveAttribute("aria-busy", "false");
  expect(documentRequests).toBe(0);
  expect(
    await page.evaluate(
      () =>
        Reflect.get(window, "spaRail") === document.querySelector(".primary-rail") &&
        Reflect.get(window, "spaTopbar") === document.querySelector(".topbar") &&
        Reflect.get(window, "spaWasHidden") === false,
    ),
  ).toBe(true);
  expect((await context.request.get("/api/web/v1/files")).status()).toBe(404);
  expect((await context.request.get("/demo")).status()).toBe(404);
});

test("edits profile, searches, and opens the shared personal permission editor", async ({
  page,
  context,
}) => {
  await login(context);
  await active(page, "/settings/profile");
  await page.getByRole("button", { name: "编辑资料" }).click();
  await page.getByLabel("显示名", { exact: true }).fill("租户管理员 · 已更新");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-protected-root]")).toBeVisible();
  await expect(page.locator("dd").first()).toHaveText("租户管理员 · 已更新");
  await active(page, `/t/${tenantId}/admin/organization/members`);
  await page
    .getByRole("row")
    .filter({ hasText: "teaching.analyst" })
    .getByRole("button", { name: "配置权限" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("直接授予");
  await expect(page.getByLabel("配置范围")).toBeVisible();
  await page.getByLabel("配置范围").selectOption(workspaceId);
  await expect(page.getByRole("dialog")).toContainText("租户继承 · 只读");
  await page.getByRole("button", { name: "清空本范围" }).click();
  await page.getByRole("button", { name: "核对变更" }).click();
  await expect(page.getByRole("dialog")).toContainText("移除：");
  await page.getByRole("button", { name: "确认保存" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-protected-root]")).toBeVisible();
  const result = await owner.query("SELECT permission_keys FROM web.workspace_member WHERE id=$1", [
    fid(40),
  ]);
  expect(result.rows[0].permission_keys).toEqual([]);
  await page.keyboard.press("Meta+k");
  await page.getByLabel("搜索关键词").fill("成员");
  await expect(page.locator(".search-results a").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("initial RSC stays hidden when the initial session probe fails", async ({ page, context }) => {
  await login(context);
  await page.route("**/api/web/v1/session?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":{"code":"unavailable"}}',
    }),
  );
  await page.goto(`/t/${tenantId}/admin/organization/members`);
  await expect(page.getByText("暂时无法确认页面访问权限。", { exact: true })).toBeVisible();
  await expect(page.locator("[data-protected-root]")).toBeHidden();
  await expect(page.locator(".table-wrap")).toHaveCount(0);
});

test("a 200 partial revocation retires old data even when new document loading fails", async ({
  page,
  context,
}) => {
  await page.clock.install();
  await login(context, "analyst");
  const path = `/t/${tenantId}/w/${workspaceId}/analysis`;
  await active(page, path);
  const old = await (
    await context.request.get(
      `/api/web/v1/session?tenantId=${tenantId}&workspaceId=${workspaceId}&pageId=analysis-new`,
    )
  ).json();
  await revokeB();
  const current = await context.request.get(
    `/api/web/v1/session?tenantId=${tenantId}&workspaceId=${workspaceId}&pageId=analysis-new`,
  );
  expect(current.status()).toBe(200);
  expect((await current.json()).viewRevision).not.toBe(old.viewRevision);
  await page.route(`**${path}`, (route) =>
    route.request().isNavigationRequest() ? route.abort() : route.continue(),
  );
  await page.clock.fastForward(15001);
  await expect(page.locator("[data-protected-root]")).not.toBeVisible();
  await expect(page.locator(".module-placeholder")).toHaveCount(0);
});

test("late search responses cannot restore data after identity invalidation", async ({
  page,
  context,
}) => {
  await login(context);
  await active(page, `/t/${tenantId}/admin/organization/members`);
  let release!: () => void;
  const deferred = new Promise<void>((resolve) => (release = resolve));
  let entered!: () => void;
  const started = new Promise<void>((resolve) => (entered = resolve));
  await page.route("**/api/web/v1/search?**", async (route) => {
    const response = await route.fetch();
    entered();
    await deferred;
    await route.fulfill({ response });
  });
  await page.keyboard.press("Meta+k");
  await page.getByLabel("搜索关键词").fill("成员");
  await started;
  await page.route("**/t/**", (route) =>
    route.request().isNavigationRequest() ? route.abort() : route.continue(),
  );
  await page.evaluate(() => {
    const channel = new BroadcastChannel("compass-identity");
    channel.postMessage("changed");
    channel.close();
  });
  release();
  await expect(page.locator("[data-protected-root]")).not.toBeVisible();
  await expect(page.locator("[data-sensitive-portal]:visible")).toHaveCount(0);
});

test("offline state clears an unsaved permission draft and never reopens it", async ({
  page,
  context,
}) => {
  await login(context);
  await active(page, `/t/${tenantId}/admin/organization/members`);
  await page
    .getByRole("row")
    .filter({ hasText: "teaching.analyst" })
    .getByRole("button", { name: "配置权限" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("直接授予");
  await page.getByRole("checkbox").first().check();
  await context.setOffline(true);
  await expect(page.locator("[data-protected-root]")).toBeHidden();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await context.setOffline(false);
  await expect(page.locator("[data-protected-root]")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("prototype frame and mobile navigation remain usable at five viewport widths", async ({
  page,
  context,
}, testInfo) => {
  await login(context);
  for (const width of [1440, 900, 768, 390, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await active(page, `/t/${tenantId}/admin/organization/members`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 1440) {
      for (const title of [
        "控制总览",
        "数据与语义",
        "Agent 与能力",
        "运行与调度",
        "质量与发布",
        "安全与审计",
        "记忆与资产",
        "组织设置",
      ])
        await expect(
          page
            .getByRole("navigation", { name: "二级导航" })
            .getByRole("link", { name: title, exact: true }),
        ).toBeVisible();
    }
    if (width <= 900) {
      await page.getByRole("button", { name: "展开导航" }).click();
      await expect(page.getByRole("dialog", { name: "导航" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "展开导航" })).toBeFocused();
    }
    await page.screenshot({ path: testInfo.outputPath(`members-${width}.png`), fullPage: true });
  }
  for (const suffix of ["analysis", "reports", "boards/overview"]) {
    await active(page, `/t/${tenantId}/w/${workspaceId}/${suffix}`);
    await page.screenshot({
      path: testInfo.outputPath(`${suffix.replaceAll("/", "-")}-mobile.png`),
      fullPage: true,
    });
  }
});

test("a timed-out heartbeat and its late success cannot reopen protected content", async ({
  page,
  context,
}) => {
  await page.clock.install();
  await login(context);
  await active(page, `/t/${tenantId}/admin/organization/members`);
  let release!: () => void;
  const deferred = new Promise<void>((resolve) => (release = resolve));
  let entered!: () => void;
  const started = new Promise<void>((resolve) => (entered = resolve));
  await page.route("**/api/web/v1/session?**", async (route) => {
    const response = await route.fetch();
    entered();
    await deferred;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.clock.fastForward(15001);
  await started;
  await page.clock.fastForward(5001);
  await expect(page.locator("[data-protected-root]")).toBeHidden();
  release();
  await expect(page.locator(".table-wrap")).toHaveCount(0);
  await page.clock.fastForward(30000);
  await expect(page.locator("[data-protected-root]")).toBeHidden();
});

test("two tabs replace identity and history reloads without restoring the former member list", async ({
  page,
  context,
}) => {
  await login(context);
  const path = `/t/${tenantId}/admin/organization/members`;
  await active(page, path);
  const other = await context.newPage();
  await other.goto("/login");
  await other.getByLabel("登录名", { exact: true }).fill("teaching.outsider");
  await other.getByLabel("密码", { exact: true }).fill(password);
  await other.getByRole("button", { name: "登录 Compass" }).click();
  await expect(other.locator("[data-protected-root]")).toBeVisible();
  await page.bringToFront();
  await expect(page.getByText("teaching.analyst", { exact: true })).toHaveCount(0);
  await page.goto("/settings/profile");
  await page.goBack();
  await expect(page.getByText("teaching.analyst", { exact: true })).toHaveCount(0);
  expect((await context.request.get(`/api/web/v1/tenants/${tenantId}/members`)).status()).toBe(404);
});

test("applying a workspace template persists its source and the explicit personal grants", async ({
  page,
  context,
}) => {
  await login(context);
  await active(page, `/t/${tenantId}/admin/organization/members`);
  await page
    .getByRole("row")
    .filter({ hasText: "teaching.analyst" })
    .getByRole("button", { name: "配置权限" })
    .click();
  await page.getByLabel("配置范围").selectOption(workspaceId);
  await expect(page.getByRole("dialog")).toContainText("租户继承 · 只读");
  await page.getByLabel("使用默认模板").selectOption("auditor");
  await page.getByRole("button", { name: "填入草稿" }).click();
  await page.getByRole("button", { name: "核对变更" }).click();
  await page.getByRole("button", { name: "确认保存" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-protected-root]")).toBeVisible();
  const {
    rows: [saved],
  } = await owner.query("SELECT role_key,permission_keys FROM web.workspace_member WHERE id=$1", [
    fid(40),
  ]);
  expect(saved.role_key).toBe("auditor");
  expect(saved.permission_keys.sort()).toEqual([...DEFAULT_TEMPLATES.auditor].sort());
});

test("platform tenant creation and disable persist without granting access to tenant data", async ({
  page,
  context,
}) => {
  await login(context, "platform");
  await active(page, "/platform/tenants");
  const name = `浏览器验收租户 ${Date.now()}`;
  await page.getByRole("button", { name: "创建租户", exact: true }).click();
  await page.getByLabel("租户名称", { exact: true }).fill(name);
  await page.getByLabel(/^地址短标识/).fill(`browser-${Date.now()}`);
  await page.getByLabel(/^首管理员登录名/).fill("teaching.outsider");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();
  const {
    rows: [tenant],
  } = await owner.query("SELECT id FROM web.tenant WHERE name=$1", [name]);
  expect((await context.request.get(`/api/web/v1/tenants/${tenant.id}/members`)).status()).toBe(
    404,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "停用", exact: true }).click();
  await expect(row.getByRole("button", { name: "恢复", exact: true })).toBeVisible();
  expect(
    (await owner.query("SELECT status FROM web.tenant WHERE id=$1", [tenant.id])).rows[0].status,
  ).toBe("disabled");
});

test("sidebar pinning persists and cancelling navigation preserves a permission draft", async ({
  page,
  context,
}) => {
  await login(context);
  const path = `/t/${tenantId}/admin/organization/members`;
  await active(page, path);
  let releaseSave!: () => void;
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.route("**/api/web/v1/me", async (route) => {
    if (route.request().method() === "PATCH") await saveGate;
    await route.continue();
  });
  await page.getByRole("button", { name: "收起侧栏", exact: true }).click();
  await expect(page.getByRole("button", { name: "收起侧栏", exact: true })).toBeDisabled();
  releaseSave();
  await expect(page.locator(".application")).toHaveClass(/sidebar-collapsed/);
  await expect(page.locator("[data-protected-root]")).toBeVisible();
  await page.getByRole("link", { name: "报告空间", exact: true }).hover();
  await expect(
    page.locator(".secondary-sidebar").getByRole("link", { name: "全部产物", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "固定侧栏", exact: true }).click();
  await expect(page.locator("[data-protected-root]")).toBeVisible();
  await expect(page.getByRole("button", { name: "收起侧栏", exact: true })).toBeVisible();
  const profile = await (await context.request.get("/api/web/v1/me")).json();
  expect(profile.preferences.sidebarPinned).toBe(true);
  await expect(page).toHaveURL(/\/reports$/);
  await active(page, path);
  await page
    .getByRole("row")
    .filter({ hasText: "teaching.analyst" })
    .getByRole("button", { name: "配置权限" })
    .click();
  await page.getByRole("checkbox").first().check();
  const dialog = page.waitForEvent("dialog");
  // The modal traps user focus; exercise the real AppLink guard programmatically.
  const navigating = page.evaluate(() => {
    document.querySelector<HTMLAnchorElement>("a.context-switch")!.click();
  });
  const confirmation = await dialog;
  expect(confirmation.type()).toBe("confirm");
  await confirmation.dismiss();
  await navigating;
  await expect(page).toHaveURL(
    new RegExp(`${path.replace(tenantId, "yuanshan").replace(workspaceId, "zongbu")}$`),
  );
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("workspace switches, navigation and GET filters retain the application frame", async ({
  page,
  context,
}) => {
  await login(context);
  await active(page, `/t/${tenantId}/w/${workspaceId}/analysis`);
  let documents = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest()) documents++;
  });
  await page.evaluate(() =>
    Reflect.set(window, "retainedRail", document.querySelector(".primary-rail")),
  );
  await page.locator("a.context-switch").click();
  await expect(page.locator(".workspace-card")).toHaveCount(2);
  await page
    .locator(".workspace-card")
    .filter({ hasText: "华东区域" })
    .getByRole("button", { name: "进入空间" })
    .click();
  await expect(page).toHaveURL(/\/w\/huadong\//);
  await expect(page.locator("a.context-switch")).toHaveText("华东区域");
  await page.getByRole("link", { name: "管理与治理", exact: true }).click();
  await page.getByRole("link", { name: "组织设置", exact: true }).click();
  await expect(page.locator("#main-content")).toHaveAttribute("aria-busy", "false");
  await page.locator('input[name="q"]').fill("teaching.analyst");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page).toHaveURL(/q=teaching\.analyst/);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("teaching.analyst");
  expect(documents).toBe(0);
  expect(
    await page.evaluate(
      () => Reflect.get(window, "retainedRail") === document.querySelector(".primary-rail"),
    ),
  ).toBe(true);
});

test("a response from the previous page cannot retire a new SPA page", async ({
  page,
  context,
}) => {
  await login(context);
  await active(page, `/t/${tenantId}/admin/organization/members`);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route("**/api/web/v1/search?**", async (route) => {
    const response = await route.fetch();
    entered();
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.keyboard.press("Meta+k");
  await page.getByLabel("搜索关键词").fill("成员");
  await started;
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "报告空间", exact: true }).click();
  await expect(page.locator("#main-content h1")).toHaveText("全部产物");
  release();
  await expect(page.locator("[data-protected-root]")).toBeVisible();
  await expect(page.locator(".search-results")).toHaveCount(0);
  await page.getByRole("link", { name: "插件", exact: true }).click();
  await expect(page.locator("#main-content h1")).toHaveText("全部插件");
});

test("SPA history revalidates cached content after workspace access is removed", async ({
  page,
  context,
}) => {
  await login(context, "analyst");
  await active(page, `/t/${tenantId}/w/${fid(21)}/analysis`);
  await page.getByRole("link", { name: "报告空间", exact: true }).click();
  await expect(page.locator("#main-content h1")).toHaveText("全部产物");
  await revokeB();
  await page.goBack();
  await expect(page.locator("[data-protected-root]")).toBeHidden();
  await expect(page.locator(".module-placeholder")).toHaveCount(0);
  expect(
    (
      await context.request.get(
        `/api/web/v1/session?tenantId=${tenantId}&workspaceId=${fid(21)}&pageId=analysis-new`,
      )
    ).status(),
  ).toBe(403);
});

test("a pending SPA page cannot reopen a retired application", async ({ page, context }) => {
  await login(context, "analyst");
  await active(page, `/t/${tenantId}/w/${workspaceId}/analysis`);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route("**/reports?**", async (route) => {
    const response = await route.fetch();
    entered();
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByRole("link", { name: "报告空间", exact: true }).click();
  await started;
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.locator("[data-protected-root]")).toBeHidden();
  release();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.locator("[data-protected-root]")).toBeHidden();
  await expect(page.locator(".primary-rail")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "重新加载", exact: true })).toBeVisible();
});

test("an unknown product page clears the frame and can recover to workspaces", async ({
  page,
  context,
}) => {
  await login(context, "analyst");
  await page.goto(`/t/${tenantId}/unknown-page`);
  await expect(page.getByRole("heading", { name: "页面不存在" })).toBeVisible();
  await expect(page.locator(".primary-rail")).toHaveCount(0);
  await page.getByRole("button", { name: "选择工作空间" }).click();
  await expect(page.locator(".workspace-card")).toHaveCount(2);
  await expect(page.locator("[data-protected-root]")).toBeVisible();
});

test("analysis sidebar and composer follow the prototype interaction", async ({
  page,
  context,
}) => {
  await login(context, "analyst");
  await active(page, `/t/${tenantId}/w/${workspaceId}/analysis/conversations`);
  await expect(page).toHaveURL(/\/t\/yuanshan\/w\/zongbu\/analysis$/);
  await expect(page.locator(".secondary-brand span")).toHaveText("分析空间");
  for (const name of ["全部分析会话", "分析案例", "待我决定"])
    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "按主题", exact: true }).click();
  await expect(page.getByRole("button", { name: "按主题", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".conversation-list")).toHaveAttribute("data-group-by", "topic");
  await page.getByRole("button", { name: "上周经营表现", exact: true }).click();
  await expect(page.getByLabel("分析问题")).toHaveValue("上周经营表现");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "新建分析", exact: true }).click();
  await expect(page.getByLabel("分析问题")).toHaveValue("");
  await expect(page.getByRole("button", { name: "发送分析（待接入）" })).toBeDisabled();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByLabel("分析问题")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("readable routes preserve filters, support login return, and reject another tenant", async ({
  page,
  context,
}) => {
  await page.goto("/t/yuanshan/w/huadong/analysis");
  await expect(page).toHaveURL(/\/login\?/);
  await page.getByLabel("登录名", { exact: true }).fill("teaching.analyst");
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录 Compass" }).click();
  await expect(page).toHaveURL(/\/t\/yuanshan\/w\/huadong\/analysis$/);
  await expect(page.getByLabel("分析问题")).toBeVisible();
  await page.goto("/t/xinghe/w/dianshang/analysis");
  await expect(page.getByText("未找到可访问的记录。", { exact: true })).toBeVisible();
  await expect(page.getByLabel("分析问题")).toHaveCount(0);
  await page.goto("/t/yuanshan/w/dianshang/analysis");
  await expect(page.locator("[data-protected-root]")).toHaveCount(0);
  await login(context);
  await page.goto(`/t/${tenantId}/admin/organization/members?q=teaching.analyst`);
  await expect(page).toHaveURL(/\/t\/yuanshan\/admin\/organization\/members\?q=teaching\.analyst$/);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const links = await page
    .locator(".primary-rail a, .secondary-sidebar a")
    .evaluateAll((elements) => elements.map((element) => element.getAttribute("href")));
  expect(links.some((link) => link?.includes("99500000"))).toBe(false);
});

test("navigation icons match the canonical prototype and controls retain its density", async ({
  page,
  context,
}) => {
  await login(context);
  await active(page, `/t/${tenantId}/w/${workspaceId}/analysis`);
  const source = readFileSync(
    new URL(
      "../../../../mai-specs/999-compass-product-course-landing-app/design/prototype/core.js",
      import.meta.url,
    ),
    "utf8",
  );
  const groups = [
    ["报告空间", "folder", ["folder", "file", "chart", "database"]],
    ["插件", "code", ["grid", "book", "file", "spark", "file", "database"]],
    ["看板", "chart", ["grid", "chart", "database"]],
    [
      "管理与治理",
      "shield",
      ["chart", "database", "code", "play", "check", "shield", "book", "users"],
    ],
    ["定时任务", "clock", ["clock", "clock"]],
  ] as const;
  const geometry = (name: string) => source.match(new RegExp(`\\b${name}:'([^']+)'`))![1];
  for (const [label, icon, items] of groups) {
    const link = page.locator(".primary-rail").getByRole("link", { name: label, exact: true });
    await expect(link.locator("svg path")).toHaveAttribute("d", geometry(icon));
    await link.click();
    await expect(page.locator(".secondary-brand")).toHaveText(label);
    const rows = page.locator(".secondary-links .nav-item");
    await expect(rows).toHaveCount(items.length);
    for (const [index, name] of items.entries()) {
      await expect(rows.nth(index).locator("svg path")).toHaveAttribute("d", geometry(name));
      await expect(rows.nth(index).locator("svg")).toHaveCSS("width", "18px");
      await expect(rows.nth(index).locator("svg")).toHaveCSS("stroke-width", "1.6px");
    }
  }
  await expect(page.locator(".sidebar-create-button")).toHaveText("新建定时任务");
  await expect(page.locator(".sidebar-create-button")).toHaveCSS("height", "42px");
  const guide = page.locator(".primary-rail").getByRole("link", { name: "设计体系与体验指南" });
  await expect(guide.locator("svg path")).toHaveAttribute("d", geometry("grid"));
  const analysis = page.locator(".primary-rail").getByRole("link", { name: "分析", exact: true });
  await expect(analysis.locator("svg path")).toHaveAttribute("d", geometry("spark"));
  await analysis.click();
  await expect(page.locator(".secondary-brand")).toHaveText("Compass分析空间");
  await expect(page.locator(".new-analysis-button")).toHaveCSS("height", "42px");
  await expect(page.locator(".new-analysis-button")).toHaveCSS("font-size", "13px");
  await expect(page.locator(".new-analysis-button")).toHaveCSS("justify-content", "flex-start");
  await expect(page.locator(".conversation-order button").first()).toHaveCSS("height", "29px");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "展开导航" }).click();
  const drawer = page.getByRole("dialog", { name: "导航" });
  await expect(drawer.locator(".new-analysis-button")).toHaveCSS("height", "44px");
  await expect(drawer.locator(".conversation-order button").first()).toHaveCSS("height", "36px");
  await drawer.getByRole("button", { name: "关闭导航" }).click();
  await expect(page.getByRole("button", { name: "展开导航" })).toBeFocused();
});

test("floating navigation previews without routing and supports pointer, keyboard and tablet access", async ({
  page,
  context,
}) => {
  await login(context);
  await active(page, `/t/${tenantId}/w/${workspaceId}/admin/data/sources`);
  await page.getByRole("button", { name: "收起侧栏", exact: true }).click();
  await expect(page.locator(".application")).toHaveClass(/sidebar-collapsed/);
  const plugins = page.locator(".primary-rail").getByRole("link", { name: "插件", exact: true });
  const sidebar = page.locator("#secondary-sidebar");
  const url = page.url();
  await page.locator(".primary-rail").getByRole("link", { name: "设计体系与体验指南" }).hover();
  await expect(sidebar.locator(".secondary-brand")).toHaveText("体验指南");
  await expect(page.getByRole("navigation", { name: "管理页签" })).toBeVisible();
  expect(page.url()).toBe(url);
  await plugins.hover();
  await expect(sidebar).toBeVisible();
  await expect(sidebar.locator(".secondary-brand")).toHaveText("插件");
  expect(page.url()).toBe(url);
  await sidebar.getByRole("link", { name: "Skill", exact: true }).hover();
  await expect(sidebar).toBeVisible();
  await page.mouse.move(1200, 800);
  await expect(sidebar).toBeHidden();
  await plugins.focus();
  await expect(sidebar).toBeVisible();
  await page.keyboard.press("ArrowRight");
  expect(await sidebar.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(sidebar).toBeHidden();
  await expect(plugins).toBeFocused();
  await plugins.hover();
  await expect(sidebar).toBeVisible();
  await page.locator("#main-content").click({ position: { x: 400, y: 550 } });
  await expect(sidebar).toBeHidden();
  await plugins.focus();
  await expect(sidebar).toBeVisible();
  await page.getByRole("button", { name: "固定侧栏", exact: true }).click();
  await expect(page).toHaveURL(/\/plugins$/);
  await expect(page.locator(".application")).not.toHaveClass(/sidebar-collapsed/);
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(sidebar).toBeHidden();
  const reports = page
    .locator(".primary-rail")
    .getByRole("link", { name: "报告空间", exact: true });
  await reports.hover();
  await expect(sidebar).toBeVisible();
  await expect(sidebar.locator(".secondary-brand")).toHaveText("报告空间");
  await reports.click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(sidebar).toBeHidden();
  // The active primary item opens its collapsed submenu on a second click.
  await reports.click();
  await expect(sidebar).toBeVisible();
  await page.getByRole("button", { name: "关闭导航" }).click();
  await expect(sidebar).toBeHidden();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "展开导航" }).click();
  await expect(page.getByRole("dialog", { name: "导航" })).toBeVisible();
  await page
    .getByRole("dialog", { name: "导航" })
    .getByRole("button", { name: "个人菜单" })
    .click();
  await expect(page.getByRole("menuitem", { name: "退出登录" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "导航" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("dialog", { name: "导航" })).toHaveCount(0);
  await expect(sidebar).toBeVisible();
  await expect(sidebar.locator(".secondary-brand")).toHaveText("报告空间");
});
