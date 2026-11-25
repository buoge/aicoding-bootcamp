import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function smoke(t, args, fail = "") {
  const dir = mkdtempSync(path.join(tmpdir(), "compass-smoke-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  copyFileSync(path.join(root, "scripts/smoke.mjs"), path.join(dir, "smoke.mjs"));
  writeFileSync(path.join(dir, ".env"), "COMPASS_SMOKE_TEST_SECRET=do-not-load\n");
  writeFileSync(
    path.join(dir, "fetch.mjs"),
    `
globalThis.fetch = async (url) => {
  if (process.env.COMPASS_SMOKE_TEST_SECRET) throw new Error('local smoke loaded .env');
  console.log('REQUEST ' + url);
  const path = new URL(url).pathname;
  let body = 'Compass';
  let status = path === '/api/web/v1/session' ? 401 : 200;
  if (path.includes('overview')) body = {source:'synthetic-fixture', revenue_minor:4000000, orders:397, days:3};
  if (url.includes(':8001/')) body = {status:'ok',service:'compass-memory',stage:'scaffold'};
  if (path.endsWith('.json')) body = {domains:[]};
  if (${JSON.stringify(fail)} && url.includes(${JSON.stringify(fail)})) status = 503;
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {status, headers:{'cache-control': path === '/api/web/v1/session' ? 'private, no-store' : 'no-store'}});
};
`,
  );
  const env = { ...process.env };
  delete env.COMPASS_SMOKE_TEST_SECRET;
  return spawnSync(
    process.execPath,
    ["--import", path.join(dir, "fetch.mjs"), "smoke.mjs", ...args],
    {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...env,
        COMPASS_WEB_URL: "https://remote.invalid",
        AGENT_API_URL: "https://remote.invalid",
        MEMORY_API_URL: "https://remote.invalid",
        COMPASS_HOME_URL: "https://remote.invalid",
      },
    },
  );
}

for (const [app, port] of [
  ["home", 3001],
  ["web", 3000],
  ["agent", 8000],
  ["memory", 8001],
  ["worker", null],
]) {
  test(`local smoke for ${app} requests only its fixed local endpoints`, (t) => {
    const result = smoke(t, ["--local", "--apps", app]);
    assert.equal(result.status, 0, result.stderr);
    const requests = result.stdout.split("\n").filter((line) => line.startsWith("REQUEST "));
    if (port) {
      assert.ok(requests.length);
      for (const line of requests)
        assert.ok(line.startsWith(`REQUEST http://127.0.0.1:${port}/`), line);
    } else assert.deepEqual(requests, []);
    if (app === "home") assert.match(result.stdout, /\/resources\/system-schema.json/);
    if (app === "web") assert.match(result.stdout, /\/api\/web\/v1\/session/);
  });
}

test("full local smoke includes BFF data path and authentication", (t) => {
  const result = smoke(t, ["--local", "--apps", "home,web,agent,memory,worker"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\/api\/demo\/overview/);
  assert.match(result.stdout, /\/api\/web\/v1\/session/);
});

test("failed readiness and unknown application return nonzero", (t) => {
  assert.notEqual(smoke(t, ["--local", "--apps", "agent"], "/readyz").status, 0);
  assert.notEqual(smoke(t, ["--local", "--apps", "unknown"]).status, 0);
});
