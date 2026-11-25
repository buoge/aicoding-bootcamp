import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
const checks = [
  ["node", ["--version"]],
  ["pnpm", ["--version"]],
  ["uv", ["--version"]],
  ["docker", ["compose", "version"]],
  ["docker", ["info", "--format", "{{.ServerVersion}}"]],
];
let failed = false;
for (const [cmd, args] of checks) {
  const result = spawnSync(cmd, args, { encoding: "utf8", timeout: 15000 });
  const ok = result.status === 0;
  console.log(
    `${ok ? "OK" : "FAIL"} ${cmd} ${args.join(" ")}: ${ok ? result.stdout.trim() : "unavailable"}`,
  );
  failed ||= !ok;
}
console.log(
  existsSync(".env") ? "OK .env" : "NOTE copy .env.example to .env before local development",
);
process.exitCode = failed ? 1 : 0;
