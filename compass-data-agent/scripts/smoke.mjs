import assert from "node:assert/strict";
import { existsSync } from "node:fs";
const local = process.argv.includes("--local");
if (!local && existsSync(".env")) process.loadEnvFile(".env");
const web = (!local && process.env.COMPASS_WEB_URL) || "http://127.0.0.1:3000";
const api = (!local && process.env.AGENT_API_URL) || "http://127.0.0.1:8000";
const appIndex = process.argv.indexOf("--apps");
const selected = appIndex < 0 ? null : process.argv[appIndex + 1]?.split(",");
if (
  appIndex >= 0 &&
  (!selected?.length ||
    selected.some((app) => !["home", "web", "agent", "memory", "worker"].includes(app)))
)
  throw new Error("--apps requires a comma-separated list of known apps.");
const full = selected
  ? selected.includes("web") && selected.includes("agent")
  : !process.argv.includes("--web");
if (selected ? selected.includes("web") : process.argv.includes("--web")) {
  for (const endpoint of ["healthz", "readyz", "login"]) {
    const response = await fetch(`${web}/${endpoint}`, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200, endpoint);
  }
  const response = await fetch(`${web}/api/web/v1/session`, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  console.log("Smoke passed: independent Web readiness and authentication gate.");
}
if (full) {
  for (const url of [`${api}/healthz`, `${api}/readyz`, `${web}/healthz`]) {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200, url);
  }
  const page = await fetch(web, { signal: AbortSignal.timeout(10000) });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Compass/);
  const response = await fetch(`${web}/api/demo/overview`, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.source, "synthetic-fixture");
  assert.equal(body.revenue_minor, 4000000);
  assert.equal(body.orders, 397);
  assert.equal(body.days, 3);
  console.log("Smoke passed: Web → BFF → API → seeded PostgreSQL.");
}
if (selected?.includes("agent") && !full) {
  for (const endpoint of ["healthz", "readyz", "v1/demo/overview"]) {
    const response = await fetch(`${api}/${endpoint}`, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200, endpoint);
    if (endpoint === "v1/demo/overview") {
      const body = await response.json();
      assert.equal(body.source, "synthetic-fixture");
      assert.equal(body.revenue_minor, 4000000);
      assert.equal(body.orders, 397);
      assert.equal(body.days, 3);
    }
  }
  console.log("Smoke passed: Agent readiness and seeded PostgreSQL.");
}
if (selected?.includes("memory") || process.argv.includes("--memory")) {
  const memory = (!local && process.env.MEMORY_API_URL) || "http://127.0.0.1:8001";
  const response = await fetch(`${memory}/readyz`, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "compass-memory",
    stage: "scaffold",
  });
  console.log("Smoke passed: Memory scaffold readiness.");
}
if (selected?.includes("home")) {
  const home = (!local && process.env.COMPASS_HOME_URL) || "http://127.0.0.1:3001";
  for (const endpoint of [
    "/",
    "/scaffold",
    "/prototype/index.html",
    "/resources/system-schema.json",
  ]) {
    const response = await fetch(`${home}${endpoint}`, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200, endpoint);
    if (endpoint === "/") assert.match(await response.text(), /Compass/);
    if (endpoint.endsWith(".json")) assert.ok(Object.keys(await response.json()).length);
  }
  console.log("Smoke passed: Home pages and generated assets.");
}
