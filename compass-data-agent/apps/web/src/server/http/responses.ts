import "server-only";
import { randomUUID } from "node:crypto";
import { ZodError, type ZodType } from "zod";
import { ApplicationError } from "../platform/errors";

export const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
export function jsonResponse<T>(
  value: T,
  revision?: string,
  status = 200,
  schema?: ZodType,
): Response {
  const parsed = schema?.safeParse(value);
  if (parsed && !parsed.success) throw new ApplicationError("unavailable", "响应校验失败。");
  const safe = parsed ? parsed.data : value;
  return Response.json(safe, {
    status,
    headers: { ...privateHeaders, ...(revision ? { "X-Compass-View-Revision": revision } : {}) },
  });
}
export function errorResponse(error: unknown): Response {
  const requestId = randomUUID();
  const dbCode = (error as { code?: string })?.code;
  let app: ApplicationError;
  if (error instanceof ApplicationError) app = error;
  else if (error instanceof ZodError)
    app = new ApplicationError("validation_failed", "请检查输入字段、范围和版本。");
  else if (dbCode === "23505")
    app = new ApplicationError("conflict", "记录已存在，请重新读取并核对，避免重复创建。");
  else if (dbCode === "23503")
    app = new ApplicationError("conflict", "关联记录已变化，请重新读取。");
  else {
    app = new ApplicationError("unavailable", "服务暂时不可用，请稍后重试。");
    console.error(`Web request unavailable (${requestId}).`);
  }
  const status = {
    unauthenticated: 401,
    forbidden: 403,
    not_found: 404,
    conflict: 409,
    validation_failed: 422,
    rate_limited: 429,
    unavailable: 503,
  }[app.code];
  return Response.json(
    {
      error: {
        code: app.code,
        message: app.message,
        requestId,
        ...(app.currentVersion ? { currentVersion: app.currentVersion } : {}),
      },
    },
    { status, headers: { ...privateHeaders, ...(status === 429 ? { "Retry-After": "60" } : {}) } },
  );
}
export async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > 65536)
    throw new ApplicationError("validation_failed", "请求内容过大。");
  if (!request.body) return {};
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new ApplicationError("validation_failed", "请求内容过大。");
      }
      chunks.push(value);
    }
    return size ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError("validation_failed", "JSON 内容无效。");
  }
}
