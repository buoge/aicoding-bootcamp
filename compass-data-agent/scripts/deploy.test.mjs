import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { apps, deploy, deploymentEnv, parseArgs, parseContainers } from "./deploy.mjs";

function fixture(
  t,
  { fail, containers = [], sourceEnv = {}, workerState = "running", portFailure = false } = {},
) {
  const workspace = mkdtempSync(path.join(tmpdir(), "compass-deploy-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const calls = [];
  const ports = [];
  const config = {
    services: Object.fromEntries(
      [...apps, "postgres"].map((app) => [
        app,
        {
          ports:
            app === "worker"
              ? []
              : [
                  {
                    host_ip: "127.0.0.1",
                    published: {
                      home: 3001,
                      web: 3000,
                      agent: 8000,
                      memory: 8001,
                      postgres: 55432,
                    }[app],
                  },
                ],
        },
      ]),
    ),
  };
  return {
    workspace,
    calls,
    ports,
    invoke: (args) =>
      deploy(args, {
        workspace,
        sourceEnv,
        checkPort: async (port) => {
          ports.push(port);
          if (portFailure) throw new Error("port occupied");
        },
        run(command, args, options) {
          calls.push({ command, args, options });
          if (fail?.(args)) throw new Error("injected failure");
          if (args[0] === "context" && args[1] === "show") return "desktop-linux\n";
          if (args[0] === "context" && args[1] === "inspect")
            return JSON.stringify("unix:///local/docker.sock");
          if (args.includes("config")) return JSON.stringify(config);
          if (args.includes("ps") && args.includes("json"))
            return JSON.stringify(
              args.at(-1) === "worker" ? [{ Service: "worker", State: workerState }] : containers,
            );
          return "";
        },
      }),
  };
}

test("defaults to all apps and rejects unknown/destructive arguments", () => {
  assert.deepEqual(parseArgs(["up"]).selected, apps);
  for (const app of apps) assert.deepEqual(parseArgs(["up", app]).selected, [app]);
  for (const args of [
    ["up", "unknown"],
    ["up", "web", "--volumes"],
    ["down", "web"],
  ])
    assert.throws(() => parseArgs(args));
});

test("isolates Compose overrides and pins every Docker operation to the checked local socket", async (t) => {
  const f = fixture(t, {
    sourceEnv: {
      DOCKER_CONTEXT: "desktop-linux",
      DOCKER_HOST: "tcp://ignored",
      COMPOSE_FILE: "evil.yml",
      COMPOSE_PROFILES: "other",
      COMPASS_NPM_REGISTRY: "https://registry.npmjs.org/",
    },
  });
  await f.invoke(["up", "home"]);
  for (const call of f.calls.filter(
    (call) => call.command === "docker" && call.args[0] !== "context",
  )) {
    assert.deepEqual(call.args.slice(0, 2), ["--host", "unix:///local/docker.sock"]);
    assert.equal(call.options.env.COMPOSE_FILE, undefined);
    assert.equal(call.options.env.DOCKER_HOST, undefined);
  }
  assert.equal(deploymentEnv({ COMPOSE_PROFILES: "x" }).COMPOSE_PROFILES, undefined);
  assert.ok(f.calls.some((call) => call.args.includes("--env-file")));
});

test("rejects remote Docker before building or changing containers", async (t) => {
  const f = fixture(t, { sourceEnv: { DOCKER_HOST: "ssh://production" } });
  await assert.rejects(f.invoke(["up"]), /Unix-socket/);
  assert.equal(f.calls.length, 0);
});

test("full deploy checks contracts, builds first, migrates on every run and verifies all apps", async (t) => {
  const f = fixture(t);
  await f.invoke(["up"]);
  const index = (word) => f.calls.findIndex((call) => call.args.includes(word));
  assert.ok(index("contracts:check") < index("build"));
  assert.ok(index("build") < index("stop"));
  assert.ok(index("stop") < index("run"));
  assert.ok(index("run") < index("--force-recreate"));
  assert.ok(index("--force-recreate") < index("scripts/smoke.mjs"));
  assert.equal(
    f.calls.filter((call) => call.args.includes("run") && call.args.includes("--rm")).length,
    2,
  );
  const smoke = f.calls.find((call) => call.args.includes("scripts/smoke.mjs"));
  assert.deepEqual(smoke.args.slice(-3), ["--local", "--apps", apps.join(",")]);
  await f.invoke(["up"]);
  assert.equal(
    f.calls.filter((call) => call.args.includes("run") && call.args.includes("--rm")).length,
    4,
  );
  assert.equal(existsSync(path.join(f.workspace, "work/local-deploy.lock")), false);
});

for (const app of apps)
  test(`single ${app} deploy leaves other apps untouched`, async (t) => {
    const f = fixture(t);
    await f.invoke(["up", app]);
    const stop = f.calls.find((call) => call.args.includes("stop"));
    assert.deepEqual(stop.args.slice(stop.args.indexOf("stop")), ["stop", "--timeout", "15", app]);
    const start = f.calls.find((call) => call.args.includes("--force-recreate"));
    assert.equal(start.args.at(-1), app);
    assert.ok(start.args.includes("--no-deps"));
    const migrations = f.calls.filter(
      (call) => call.args.includes("run") && call.args.includes("--rm"),
    );
    assert.deepEqual(
      migrations.map((call) => call.args.at(-1)),
      app === "web" ? ["web-migrate"] : app === "agent" ? ["migrate"] : [],
    );
    assert.equal(
      f.calls.some((call) => call.args.includes("contracts:check")),
      app === "web",
    );
  });

for (const stage of ["contracts:check", "build", "run", "scripts/smoke.mjs"])
  test(`failure at ${stage} stops downstream work and releases lock`, async (t) => {
    const f = fixture(t, { fail: (args) => args.includes(stage) });
    await assert.rejects(f.invoke(["up"]), /injected failure/);
    assert.ok(f.calls.at(-1).args.includes(stage));
    assert.equal(existsSync(path.join(f.workspace, "work/local-deploy.lock")), false);
    if (["contracts:check", "build"].includes(stage))
      assert.equal(
        f.calls.some((call) => call.args.includes("stop")),
        false,
      );
  });

test("port conflict and unhealthy database fail before build", async (t) => {
  const port = fixture(t, { portFailure: true });
  await assert.rejects(port.invoke(["up", "home"]), /port occupied/);
  assert.equal(
    port.calls.some((call) => call.args.includes("build")),
    false,
  );
  const db = fixture(t, {
    containers: [{ Service: "postgres", State: "running", Health: "unhealthy" }],
  });
  await assert.rejects(db.invoke(["up"]), /PostgreSQL.*unhealthy/);
  assert.equal(
    db.calls.some((call) => call.args.includes("build")),
    false,
  );
});

test("re-deploy allows ports already published by the selected running container", async (t) => {
  const f = fixture(t, {
    containers: [
      {
        Service: "home",
        State: "running",
        Publishers: [{ URL: "127.0.0.1", PublishedPort: 3001 }],
      },
    ],
  });
  await f.invoke(["up", "home"]);
  assert.deepEqual(f.ports, []);
  assert.equal(parseContainers('{"Service":"home"}\n{"Service":"web"}').length, 2);
});

test("worker exiting after startup prevents success", async (t) => {
  const f = fixture(t, { workerState: "exited" });
  await assert.rejects(f.invoke(["up", "worker"]), /Worker scaffold/);
});

test("down preserves data and concurrent deploy is rejected", async (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.workspace, "work/local-deploy.lock"), { recursive: true });
  await assert.rejects(f.invoke(["up", "home"]), /lock exists/);
  assert.equal(existsSync(path.join(f.workspace, "work/local-deploy.lock")), true);
  rmSync(path.join(f.workspace, "work/local-deploy.lock"), { recursive: true });
  await f.invoke(["down"]);
  assert.ok(f.calls.at(-1).args.includes("down"));
  assert.equal(
    f.calls.some((call) => call.args.includes("--volumes") || call.args.includes("--rmi")),
    false,
  );
});

test("status and logs do not build or mutate containers", async (t) => {
  const f = fixture(t);
  await f.invoke(["status", "web"]);
  await f.invoke(["logs", "agent"]);
  assert.equal(
    f.calls.some(
      (call) =>
        call.args.includes("build") || call.args.includes("up") || call.args.includes("stop"),
    ),
    false,
  );
  assert.equal(existsSync(path.join(f.workspace, "work")), false);
});
