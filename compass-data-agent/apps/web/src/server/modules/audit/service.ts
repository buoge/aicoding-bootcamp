import { reject } from "../../platform/errors";
import type { AuditStore, AuditScope, AuditFilter, AuditPage } from "./ports";

function decodeCursor(cursor?: string): { time: string; id: string } | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url");
    if (raw.toString("base64url") !== cursor) reject("validation_failed");
    const value = JSON.parse(raw.toString("utf8"));
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      typeof value[0] !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value[0]) ||
      !Number.isFinite(Date.parse(value[0])) ||
      typeof value[1] !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value[1])
    )
      reject("validation_failed");
    return { time: value[0], id: value[1] };
  } catch {
    return reject("validation_failed", "审计分页游标无效。");
  }
}
export async function listAudit(
  store: AuditStore,
  scope: AuditScope,
  filter: AuditFilter,
): Promise<AuditPage> {
  const result = await store.list(scope, filter, decodeCursor(filter.cursor), filter.limit + 1);
  const items = result.items.slice(0, filter.limit);
  const last = items.at(-1);
  return {
    items,
    total: result.total,
    nextCursor:
      result.items.length > filter.limit && last
        ? Buffer.from(JSON.stringify([last.occurredAt, last.id])).toString("base64url")
        : null,
  };
}

export async function generateAuditCsv(
  store: AuditStore,
  scope: AuditScope,
  filter: AuditFilter,
): Promise<{ csv: string; count: number; bytes: number }> {
  const result = await store.list(scope, { ...filter, cursor: undefined }, null, 10001);
  if (result.items.length > 10000)
    reject("validation_failed", "记录超过 10000 条，请缩小筛选范围。");
  const cell = (input: string) => {
    const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(input) ? `'${input}` : input;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const rows = [
    ["时间", "主体", "动作", "对象", "结果", "摘要"],
    ...result.items.map((entry) => [
      entry.occurredAt,
      entry.actorUserId ?? "",
      entry.action,
      entry.targetId ?? "",
      entry.outcome,
      JSON.stringify(entry.safeSummary),
    ]),
  ];
  const csv = "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
  const bytes = Buffer.byteLength(csv);
  if (bytes > 10 * 1024 * 1024) reject("validation_failed", "文件超过 10 MiB，请缩小筛选范围。");
  return { csv, count: result.items.length, bytes };
}
