import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import test from "node:test";

const script = fileURLToPath(new URL("./prepare-data.mjs", import.meta.url));
const sqlName = "compass-retail.sql";
const archiveName = `${sqlName}.gz`;
const digest = (value) => createHash("sha256").update(value).digest("hex");

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "compass-data-prepare-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "scripts"));
  const data = path.join(root, "data/retail");
  mkdirSync(data, { recursive: true });
  copyFileSync(script, path.join(root, "scripts/prepare-data.mjs"));
  const sql = Buffer.from("BEGIN;\nCREATE SCHEMA retail_course;\nCOMMIT;\n");
  const archive = gzipSync(sql);
  writeFileSync(path.join(data, archiveName), archive);
  writeFileSync(path.join(data, `${archiveName}.sha256`), `${digest(archive)}  ${archiveName}\n`);
  writeFileSync(path.join(data, "compass-retail.sha256"), `${digest(sql)}  ${sqlName}\n`);
  return {
    data,
    sql,
    sqlPath: path.join(data, sqlName),
    run() {
      return spawnSync(process.execPath, [path.join(root, "scripts/prepare-data.mjs")], {
        cwd: tmpdir(),
        encoding: "utf8",
      });
    },
  };
}

test("prepares a verified SQL from an arbitrary cwd and safely repeats without rewriting", (t) => {
  const f = fixture(t);
  const first = f.run();
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(readFileSync(f.sqlPath), f.sql);
  const before = statSync(f.sqlPath);
  assert.equal(f.run().status, 0);
  assert.equal(statSync(f.sqlPath).ino, before.ino);
  assert.equal(statSync(f.sqlPath).mtimeMs, before.mtimeMs);
  assert.ok(existsSync(path.join(f.data, archiveName)));
  assert.ok(!readdirSync(f.data).some((name) => name.startsWith(".prepare-")));
});

test("an LFS pointer or missing archive explains how to fetch the actual object", (t) => {
  const f = fixture(t);
  writeFileSync(
    path.join(f.data, archiveName),
    `version https://git-lfs.github.com/spec/v1\noid sha256:${"0".repeat(64)}\nsize 123\n`,
  );
  const pointer = f.run();
  assert.equal(pointer.status, 1);
  assert.match(pointer.stderr, /Git LFS 指针.*git lfs pull/s);
  assert.ok(!existsSync(f.sqlPath));
  rmSync(path.join(f.data, archiveName));
  const missing = f.run();
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /缺少.*git lfs pull/s);
});

test("corrupt compressed bytes fail before producing SQL", (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.data, archiveName), "broken archive");
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SHA-256 不匹配/);
  assert.ok(!existsSync(f.sqlPath));
});

test("a mismatched uncompressed checksum never publishes a partial SQL", (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.data, "compass-retail.sha256"), `${"0".repeat(64)}  ${sqlName}\n`);
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SHA-256 不匹配/);
  assert.ok(!existsSync(f.sqlPath));
  assert.ok(!readdirSync(f.data).some((name) => name.startsWith(".prepare-")));
});

test("invalid gzip with a matching archive checksum cleans its temporary output", (t) => {
  const f = fixture(t);
  const broken = Buffer.from("invalid gzip");
  writeFileSync(path.join(f.data, archiveName), broken);
  writeFileSync(path.join(f.data, `${archiveName}.sha256`), `${digest(broken)}  ${archiveName}\n`);
  assert.equal(f.run().status, 1);
  assert.ok(!existsSync(f.sqlPath));
  assert.ok(!readdirSync(f.data).some((name) => name.startsWith(".prepare-")));
});

test("existing SQL with different content is preserved and rejected", (t) => {
  const f = fixture(t);
  writeFileSync(f.sqlPath, "local edits");
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SHA-256 不匹配/);
  assert.equal(readFileSync(f.sqlPath, "utf8"), "local edits");
});
