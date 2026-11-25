import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { resolveWorkspaceFilters, workspacePackages } from "./workspace-filters.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packages = [
  "@compass/home",
  "@compass/web",
  "@compass/agent",
  "@compass/memory",
  "@compass/worker",
  "utility",
].map((name) => ({
  name,
}));
const resolve = (args) => resolveWorkspaceFilters(args, () => packages);

test("short filters support every CLI spelling and multiple/excluded packages", () => {
  for (const [input, expected] of [
    [
      ["-F", "home"],
      ["-F", "@compass/home"],
    ],
    [
      ["--filter", "web"],
      ["--filter", "@compass/web"],
    ],
    [["--filter=agent"], ["--filter=@compass/agent"]],
    [["-F=home"], ["-F=@compass/home"]],
    [["-Fhome"], ["-F@compass/home"]],
    [
      ["-F", "home", "-F", "!web"],
      ["-F", "@compass/home", "-F", "!@compass/web"],
    ],
    [
      ["-F", "utility"],
      ["-F", "utility"],
    ],
  ])
    assert.deepEqual(resolve(["dev", ...input]), ["dev", ...expected]);
});

test("full names, advanced selectors and app arguments are forwarded unchanged", () => {
  const args = [
    "dev",
    "-F",
    "@compass/home",
    "--filter=./apps/home",
    "-F",
    "@compass/web...",
    "-F",
    "...home",
    "-F",
    "home...",
    "-F",
    "@compass/*",
    "-F",
    "[HEAD^1]",
    "--",
    "-F",
    "home",
  ];
  assert.deepEqual(
    resolveWorkspaceFilters(args, () => {
      throw new Error("Discovery must stay lazy");
    }),
    args,
  );
  assert.deepEqual(resolve(["dev", "-F", "home", "--", "--filter=web"]), [
    "dev",
    "-F",
    "@compass/home",
    "--",
    "--filter=web",
  ]);
});

test("unknown and ambiguous short names fail instead of selecting the wrong app", () => {
  assert.throws(
    () => resolve(["dev", "-F", "unknown-app"]),
    /Unknown workspace short name 'unknown-app'/,
  );
  assert.throws(
    () =>
      resolveWorkspaceFilters(["dev", "-F", "home"], () => [
        { name: "@compass/home" },
        { name: "@other/home" },
      ]),
    /Ambiguous.*@compass\/home, @other\/home/,
  );
});

test("new apps are discovered from pnpm workspace globs without an alias registration", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "compass-workspace-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "fixture-root", private: true, packageManager: "pnpm@11.3.0" }),
  );
  writeFileSync(
    path.join(dir, "pnpm-workspace.yaml"),
    'packages:\n  - "services/*"\n  - "!services/ignored"\n',
  );
  function addApp(folder, name) {
    mkdirSync(path.join(dir, "services", folder), { recursive: true });
    writeFileSync(
      path.join(dir, "services", folder, "package.json"),
      JSON.stringify({ name, private: true, scripts: { dev: "node server.mjs" } }),
    );
  }
  addApp("first", "@future/first");
  addApp("ignored", "@future/ignored");
  assert.deepEqual(
    workspacePackages(dir).map((pkg) => pkg.name),
    ["@future/first"],
  );
  addApp("dashboard", "@future/dashboard");
  assert.deepEqual(
    resolveWorkspaceFilters(["dev", "-F", "dashboard"], () => workspacePackages(dir)),
    ["dev", "-F", "@future/dashboard"],
  );
});

test("every current app follows the short-name launch convention", () => {
  const members = workspacePackages(root);
  for (const pkg of members.filter((pkg) =>
    path.relative(root, pkg.path).startsWith(`apps${path.sep}`),
  )) {
    const name = pkg.name.split("/").at(-1);
    assert.equal(
      name,
      path.basename(pkg.path),
      `${pkg.name}: app directory and package short name must match`,
    );
    assert.equal(
      members.filter((member) => member.name.split("/").at(-1) === name).length,
      1,
      `${name}: workspace short name must be unique`,
    );
    assert.ok(
      JSON.parse(readFileSync(path.join(pkg.path, "package.json"), "utf8")).scripts?.dev,
      `${pkg.name}: dev script is required`,
    );
    const result = spawnSync("pnpm", ["dev", "-F", name, "--dry-run=json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const graph = JSON.parse(result.stdout);
    assert.deepEqual(
      graph.tasks.filter((task) => task.task === "dev").map((task) => task.taskId),
      [`${pkg.name}#dev`],
    );
  }
});
