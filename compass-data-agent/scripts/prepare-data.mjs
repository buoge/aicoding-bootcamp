import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { link, lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = path.join(root, "data/retail");
const sql = "compass-retail.sql";
const archive = `${sql}.gz`;
const fetchHint =
  '在 Compass 根目录运行 git lfs install，然后运行 git lfs pull --include="$(git rev-parse --show-prefix)data/retail/compass-retail.sql.gz" --exclude=""。';

async function checksum(file, checksumFile) {
  const text = (await readFile(path.join(data, checksumFile), "utf8")).trim();
  const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(text);
  if (!match || match[2] !== file) throw new Error(`无效的校验文件：${checksumFile}`);
  return match[1];
}

async function verify(file, expected) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest("hex") !== expected) {
    throw new Error(
      `${path.basename(file)} SHA-256 不匹配；文件已保留，请检查数据版本或重新获取。`,
    );
  }
}

async function prepare() {
  const archivePath = path.join(data, archive);
  const sqlPath = path.join(data, sql);
  const archiveInfo = await lstat(archivePath).catch((error) => {
    if (error.code === "ENOENT") throw new Error(`缺少 ${archive}。${fetchHint}`);
    throw error;
  });
  if (!archiveInfo.isFile()) throw new Error(`${archive} 必须是普通文件。`);
  if (archiveInfo.size < 1024) {
    const header = await readFile(archivePath, "utf8");
    if (header.startsWith("version https://git-lfs.github.com/spec/v1")) {
      throw new Error(`当前只有 Git LFS 指针，数据尚未下载。${fetchHint}`);
    }
  }
  const archiveHash = await checksum(archive, `${archive}.sha256`);
  const sqlHash = await checksum(sql, "compass-retail.sha256");
  await verify(archivePath, archiveHash);

  const existing = await lstat(sqlPath).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing) {
    if (!existing.isFile()) throw new Error(`${sql} 必须是普通文件；拒绝覆盖。`);
    await verify(sqlPath, sqlHash);
    console.log(`已就绪：data/retail/${sql}（压缩包与现有 SQL 校验通过）。`);
    return;
  }

  const temporary = await mkdtemp(path.join(data, ".prepare-"));
  const output = path.join(temporary, sql);
  try {
    await pipeline(
      createReadStream(archivePath),
      createGunzip(),
      createWriteStream(output, { flags: "wx" }),
    );
    await verify(output, sqlHash);
    // Publish only a complete, verified file; never overwrite a concurrent output.
    await link(output, sqlPath);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  console.log(`已就绪：data/retail/${sql}（压缩包与解压 SQL 校验通过）。`);
}

try {
  if (process.argv.length !== 2)
    throw new Error("用法：pnpm data:prepare（无参数；只校验并解压，不连接数据库）");
  await prepare();
} catch (error) {
  console.error(`数据准备失败：${error.message}`);
  process.exitCode = 1;
}
