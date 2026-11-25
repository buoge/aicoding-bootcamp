import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { setTimeout } from "node:timers/promises";

const directory = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
let port = process.env.PORT ?? "3000";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" || args[i] === "-p") port = args[++i];
  else if (args[i].startsWith("--port=")) port = args[i].slice(7);
}
if (!/^\d+$/.test(port ?? "") || Number(port) < 1024 || Number(port) > 65535)
  throw new Error("Web development port must be between 1024 and 65535.");
function lsof(args) {
  try {
    return execFileSync("lsof", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    if (error.status === 1) return "";
    throw error;
  }
}
const pids = new Set(
  lsof(["-t", `-iTCP:${port}`, "-sTCP:LISTEN"])
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(Number),
);
// Next also locks its output directory, even when the old instance uses another port.
for (const line of execFileSync("ps", ["-axo", "pid=,comm="], { encoding: "utf8" }).split("\n")) {
  const match = line.trim().match(/^(\d+)\s+.*next-server/);
  if (!match) continue;
  const pid = Number(match[1]);
  if (
    lsof(["-a", "-p", String(pid), "-d", "cwd", "-Fn"])
      .split("\n")
      .includes(`n${directory}`)
  )
    pids.add(pid);
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}
for (const pid of pids) {
  if (pid === process.pid) throw new Error("Refusing to stop the launcher itself.");
  if (!alive(pid)) continue;
  console.log(`Stopping process ${pid} before starting Web on port ${port}.`);
  process.kill(pid, "SIGTERM");
}
for (let i = 0; i < 50 && [...pids].some(alive); i++) await setTimeout(100);
for (const pid of pids) if (alive(pid)) process.kill(pid, "SIGKILL");
for (let i = 0; i < 30 && [...pids].some(alive); i++) await setTimeout(100);
if ([...pids].some(alive)) throw new Error("Previous Web process did not exit.");
const require = createRequire(import.meta.url);
const child = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "dev",
    "--hostname",
    "127.0.0.1",
    ...args,
    "--port",
    port,
  ],
  {
    cwd: directory,
    env: process.env,
    stdio: "inherit",
  },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : 143);
});
