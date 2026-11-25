import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = ".agents/hooks/hooks.json";
const scriptPath = ".agents/hooks/format-edited.mjs";
const config = JSON.parse(readFileSync(path.join(root, configPath), "utf8"));
const command = config.hooks.PostToolUse[0].hooks[0].command;
const ts = "const value={name:'compass',items:[1,2]}\n";
const formattedTs = 'const value = { name: "compass", items: [1, 2] };\n';
const python = "value={'name':'compass','items':[1,2]}\n";
const formattedPython = 'value = {"name": "compass", "items": [1, 2]}\n';

function fixture(t, { prettier = true, ruff = true } = {}) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "compass format hook-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
    return path.join(dir, file);
  };
  for (const file of [
    scriptPath,
    configPath,
    ".prettierrc.json",
    ".prettierignore",
    ".editorconfig",
    "pyproject.toml",
  ]) {
    write(file, readFileSync(path.join(root, file)));
  }
  if (prettier) symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
  if (ruff) {
    mkdirSync(path.join(dir, ".venv/bin"), { recursive: true });
    symlinkSync(path.join(root, ".venv/bin/ruff"), path.join(dir, ".venv/bin/ruff"));
  }
  return {
    dir,
    write,
    read: (file) => readFileSync(path.join(dir, file), "utf8"),
    run(event, cwd = dir) {
      return spawnSync("/bin/sh", ["-c", command], {
        cwd,
        input: JSON.stringify({ hook_event_name: "PostToolUse", cwd, ...event }),
        encoding: "utf8",
        timeout: 30_000,
      });
    },
  };
}

function success(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
}

function edit(file, tool_name = "Edit") {
  return { tool_name, tool_input: { file_path: file } };
}

function patch(body) {
  return {
    tool_name: "apply_patch",
    tool_input: { command: `*** Begin Patch\n${body}\n*** End Patch` },
  };
}

test("both client entries resolve to the single hook source and exclude shell/read tools", () => {
  for (const file of [".claude/settings.json", ".codex/hooks.json"]) {
    assert.equal(realpathSync(path.join(root, file)), realpathSync(path.join(root, configPath)));
  }
  const matcher = new RegExp(config.hooks.PostToolUse[0].matcher);
  for (const name of ["Edit", "Write", "MultiEdit", "apply_patch"]) assert.ok(matcher.test(name));
  for (const name of ["Read", "Bash", "exec_command", "mcp__fs__write"])
    assert.ok(!matcher.test(name));
});

for (const tool of ["Edit", "Write", "MultiEdit"]) {
  test(`Claude ${tool} formats only its named file, silently and without Python dependencies`, (t) => {
    const f = fixture(t, { ruff: false });
    f.write("src/unrelated.ts", ts);
    const file = f.write("src/edited.ts", ts);
    success(f.run(edit(file, tool)));
    assert.equal(f.read("src/edited.ts"), formattedTs);
    assert.equal(f.read("src/unrelated.ts"), ts);
  });
}

test("Codex mixed patch formats add/update/move targets and skips deletes", (t) => {
  const f = fixture(t);
  f.write("src/new.ts", ts);
  f.write("src/main.py", python);
  f.write("src/renamed.ts", ts);
  // A recreated old name must not be formatted as part of a move or deletion.
  f.write("src/old.ts", ts);
  f.write("src/deleted.ts", ts);
  f.write("src/unrelated.py", python);
  success(
    f.run(
      patch(
        [
          "*** Add File: src/new.ts",
          `+${ts.trimEnd()}`,
          "*** Update File: src/main.py",
          "@@",
          "+value={}",
          "*** Update File: src/old.ts",
          "*** Move to: src/renamed.ts",
          "@@",
          "+const value={}",
          "*** Delete File: src/deleted.ts",
        ].join("\n"),
      ),
    ),
  );
  assert.equal(f.read("src/new.ts"), formattedTs);
  assert.equal(f.read("src/renamed.ts"), formattedTs);
  assert.equal(f.read("src/main.py"), formattedPython);
  assert.equal(f.read("src/old.ts"), ts);
  assert.equal(f.read("src/deleted.ts"), ts);
  assert.equal(f.read("src/unrelated.py"), python);
});

test("shared command finds Compass from subdirectories and resolves patch paths against event cwd", (t) => {
  const f = fixture(t);
  f.write("apps/web/src/main.ts", ts);
  const cwd = path.join(f.dir, "apps/web");
  success(f.run(patch("*** Update File: src/main.ts\n@@\n+const value={}"), cwd));
  assert.equal(f.read("apps/web/src/main.ts"), formattedTs);
  f.write("apps/web/src/main.ts", ts);
  success(f.run(edit(path.join(cwd, "src/main.ts")), cwd));
  assert.equal(f.read("apps/web/src/main.ts"), formattedTs);
});

test("spaces, Unicode, Next route brackets and shell characters remain literal filenames", (t) => {
  const f = fixture(t);
  const file = "src/中文 空格/[id]/$(touch PWNED);'quote.ts";
  f.write(file, ts);
  success(f.run(patch(`*** Add File: ${file}\n+const value={}`)));
  assert.equal(f.read(file), formattedTs);
  assert.equal(existsSync(path.join(f.dir, "PWNED")), false);
});

test("real repository formatter exclusions and unknown file types are preserved", (t) => {
  const f = fixture(t);
  f.write(".gitignore", "private-config.json\n");
  const excluded = [
    ["private-config.json", '{"private":"local"}'],
    ["src/generated/api.ts", ts],
    ["apps/home/public/copy.ts", ts],
    ["apps/home/src/components/GhostFibers.jsx", ts],
    [".agents/ignored.ts", ts],
    ["contracts/openapi.json", '{"openapi":"3.1"}'],
    ["work/main.py", python],
    ["src/generated/main.py", python],
    ["image.png", "not a real image"],
  ];
  for (const [file, content] of excluded) f.write(file, content);
  success(f.run(patch(excluded.map(([file]) => `*** Add File: ${file}\n+placeholder`).join("\n"))));
  for (const [file, content] of excluded) assert.equal(f.read(file), content, file);
});

test("directories, missing files, symlinks and paths outside Compass never reach formatters", (t) => {
  const f = fixture(t, { prettier: false, ruff: false });
  const outside = realpathSync(mkdtempSync(path.join(tmpdir(), "compass hook outside-")));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const externalFile = path.join(outside, "main.ts");
  writeFileSync(externalFile, ts);
  symlinkSync(externalFile, path.join(f.dir, "linked.ts"));
  symlinkSync(outside, path.join(f.dir, "linked-dir"));
  for (const file of [
    externalFile,
    path.relative(f.dir, externalFile),
    "linked.ts",
    "linked-dir/main.ts",
    "missing.ts",
    ".agents",
  ]) {
    success(f.run(edit(file)));
  }
  assert.equal(readFileSync(externalFile, "utf8"), ts);
});

test("unrelated events and failed tools are no-ops", (t) => {
  const f = fixture(t, { prettier: false, ruff: false });
  f.write("src/main.ts", ts);
  success(f.run({ ...edit("src/main.ts"), hook_event_name: "PreToolUse" }));
  success(f.run(edit("src/main.ts", "Read")));
  for (const tool_response of [
    { is_error: true },
    { isError: true },
    { success: false },
    { exit_code: 1 },
  ]) {
    success(
      f.run({ ...patch("*** Update File: src/main.ts\n@@\n+const value={}"), tool_response }),
    );
  }
  assert.equal(f.read("src/main.ts"), ts);
});

test("missing installed dependencies report actionable errors without installing tools", (t) => {
  const f = fixture(t, { prettier: false, ruff: false });
  for (const [file, content, message] of [
    ["src/main.ts", ts, /pnpm install --frozen-lockfile/],
    ["src/main.py", python, /uv sync --locked --all-packages/],
  ]) {
    f.write(file, content);
    const result = f.run(edit(file));
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, message);
    assert.equal(f.read(file), content);
  }
});

test("syntax errors return exit 2 and concrete diagnostics, while the other language still formats", (t) => {
  const f = fixture(t);
  f.write("src/broken.ts", "const value = {\n");
  f.write("src/main.py", python);
  const result = f.run(
    patch("*** Update File: src/broken.ts\n@@\n+bad\n*** Update File: src/main.py\n@@\n+value={}"),
  );
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Prettier/);
  assert.match(result.stderr, /broken\.ts/);
  assert.equal(f.read("src/main.py"), formattedPython);
  f.write("src/broken.py", "def broken(:\n");
  const pythonResult = f.run(edit("src/broken.py"));
  assert.equal(pythonResult.status, 2);
  assert.match(pythonResult.stderr, /Ruff format/);
  assert.match(pythonResult.stderr, /broken\.py/);
});

test("malformed hook payloads produce errors rather than silently skipping an edit", (t) => {
  const f = fixture(t);
  for (const event of [edit(undefined), { tool_name: "apply_patch", tool_input: {} }]) {
    const result = f.run(event);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /tool_input/);
  }
  const result = spawnSync(process.execPath, [path.join(f.dir, scriptPath)], {
    input: "not JSON",
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /compass format hook/);
});
