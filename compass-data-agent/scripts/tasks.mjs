import { spawnSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { resolveWorkspaceFilters, workspacePackages } from "./workspace-filters.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let args;
try {
  args = resolveWorkspaceFilters(process.argv.slice(2), () => workspacePackages(root));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const runtimeTasks = new Set([
  "dev",
  "db:migrate",
  "seed",
  "db:provision",
  "db:apply-sql",
  "db:manage",
  "test:integration",
  "test:setup",
  "test:e2e",
]);
const runtime = args.some((arg) => runtimeTasks.has(arg));
// Only runtime tasks receive local credentials; builds and cached checks stay environment-free.
if (runtime && existsSync(path.join(root, ".env"))) {
  process.loadEnvFile(path.join(root, ".env"));
}
function version(command, optional = false) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  if (result.status !== 0) {
    if (optional) return "unavailable";
    throw new Error(`Missing tool: ${command}`);
  }
  return result.stdout.trim();
}
const turbo = path.join(root, "node_modules/.bin/turbo");
if (!existsSync(turbo)) throw new Error("Run pnpm install --frozen-lockfile before tasks");
const env = { ...process.env };
// Runtime tasks are uncached. Missing Python tools must not block a Node-only task.
if (!runtime) {
  env.CI_TOOLCHAIN_ID = [process.platform, process.arch, process.version, version("pnpm")].join(
    "|",
  );
  env.PYTHON_TOOLCHAIN_ID = [
    version("uv", true),
    version(path.join(root, ".venv/bin/python"), true),
  ].join("|");
}
// Turbo's terminal UI owns stdin. One-shot interactive maintenance needs a direct,
// single-workspace pnpm child so both hidden TTY input and pipes reach the script.
const separator = args.indexOf("--");
const taskArgs = separator < 0 ? args : args.slice(0, separator);
const task = taskArgs[0];
const configPath = path.join(root, "turbo.json");
const interactive =
  existsSync(configPath) &&
  JSON.parse(readFileSync(configPath, "utf8")).tasks?.[task]?.interactive === true;
let command = turbo,
  forwarded = ["run", ...args];
if (interactive && !taskArgs.some((arg) => arg.startsWith("--dry"))) {
  let selector;
  if (taskArgs.length === 3 && ["-F", "--filter"].includes(taskArgs[1])) selector = taskArgs[2];
  else if (taskArgs.length === 2) selector = taskArgs[1].match(/^(?:--filter=|-F=?)(.+)$/)?.[1];
  if (!selector || !workspacePackages(root).some((pkg) => pkg.name === selector))
    throw new Error("Interactive tasks require exactly one explicit workspace filter.");
  command = "pnpm";
  forwarded = [
    "--filter",
    selector,
    "run",
    task,
    ...(separator < 0 ? [] : args.slice(separator + 1)),
  ];
}
const child = spawn(command, forwarded, { cwd: root, stdio: "inherit", env });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
