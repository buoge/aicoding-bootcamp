import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));

function editedPaths(event) {
  if (event.hook_event_name !== "PostToolUse") return [];
  const response = event.tool_response;
  if (
    response?.is_error ||
    response?.isError ||
    response?.success === false ||
    (typeof response?.exit_code === "number" && response.exit_code !== 0)
  ) {
    return [];
  }

  if (["Edit", "Write", "MultiEdit"].includes(event.tool_name)) {
    const file = event.tool_input?.file_path;
    if (typeof file !== "string" || !file) throw new Error("编辑事件缺少 tool_input.file_path");
    return [file];
  }
  if (event.tool_name !== "apply_patch") return [];

  // Codex exposes the patch as tool_input.command, including freeform tool calls.
  const patch = event.tool_input?.command;
  if (typeof patch !== "string" || !patch.trim().startsWith("*** Begin Patch\n")) {
    throw new Error("apply_patch 事件缺少有效的 tool_input.command 补丁");
  }
  const files = new Set();
  let current;
  for (const line of patch.split("\n")) {
    const header = /^\*\*\* (Add File|Update File|Delete File|Move to): (.+)$/.exec(line);
    if (!header) continue;
    const [, action, file] = header;
    if (action === "Delete File") {
      files.delete(file);
      current = undefined;
    } else {
      if (action === "Move to") files.delete(current);
      files.add(file);
      current = file;
    }
  }
  return [...files];
}

function insideRoot(file) {
  const relative = path.relative(root, file);
  return (
    relative &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function regularFile(file, cwd) {
  const absolute = path.resolve(cwd, file);
  if (!insideRoot(absolute)) return undefined;
  try {
    // Skip symlinks (including symlinked directories), directories and deleted files.
    if (realpathSync(absolute) !== absolute || !statSync(absolute).isFile()) return undefined;
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code)) return undefined;
    throw error;
  }
  return absolute;
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${label} 失败：${result.error?.message ?? `exit ${result.status}, signal ${result.signal ?? "none"}`}\n${result.stderr}${result.stdout}`.trim(),
    );
  }
}

function main() {
  const event = JSON.parse(readFileSync(0, "utf8"));
  const cwd = typeof event.cwd === "string" ? event.cwd : process.cwd();
  const files = [
    ...new Set(
      editedPaths(event)
        .map((file) => regularFile(file, cwd))
        .filter(Boolean),
    ),
  ];
  const python = files.filter((file) => /\.(py|pyi|ipynb)$/.test(file));
  const prettier = files.filter((file) => !python.includes(file));
  const errors = [];
  // Run both groups even when one fails, so a mixed patch still gets useful formatting.
  for (const [targets, format] of [
    [
      prettier,
      () => {
        const cli = path.join(root, "node_modules/prettier/bin/prettier.cjs");
        if (!existsSync(cli))
          throw new Error("缺少项目 Prettier；请先运行 pnpm install --frozen-lockfile");
        run(process.execPath, [cli, "--write", "--ignore-unknown", "--", ...prettier], "Prettier");
      },
    ],
    [
      python,
      () => {
        const cli = path.join(root, ".venv/bin/ruff");
        if (!existsSync(cli))
          throw new Error("缺少项目 Ruff；请先运行 uv sync --locked --all-packages");
        run(cli, ["format", "--force-exclude", "--", ...python], "Ruff format");
      },
    ],
  ]) {
    if (!targets.length) continue;
    try {
      format();
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
}

try {
  main();
} catch (error) {
  console.error(`[compass format hook] ${error.message}`);
  process.exitCode = 2;
}
