import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { authConfiguration } from "../platform/config";
import { reject } from "../platform/errors";

export function tokenFromCookie(header: string | null): string {
  const name = authConfiguration().cookieName;
  const matches = (header ?? "")
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p.startsWith(`${name}=`));
  if (matches.length !== 1) return "";
  const token = matches[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : "";
}
export function csrfToken(token: string): string {
  return createHmac("sha256", token).update("compass-csrf-v1").digest("base64url");
}
export function requireSameOrigin(request: Request) {
  const origin = authConfiguration().origin;
  if (request.headers.get("origin") !== origin) reject("forbidden", "请求来源无效。");
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") reject("forbidden");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    reject("validation_failed", "请使用 JSON 请求。");
}
export function requireCsrf(request: Request, token: string) {
  if (!token) reject("unauthenticated");
  const actual = Buffer.from(request.headers.get("x-csrf-token") ?? "");
  const expected = Buffer.from(csrfToken(token));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    reject("forbidden", "请求校验已失效，请重新加载页面。");
}
export function sessionCookie(token: string, expiresAt: string): string {
  const config = authConfiguration();
  return `${config.cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${config.secure ? "; Secure" : ""}`;
}
export function clearSessionCookie(): string {
  return sessionCookie("", new Date(0).toISOString());
}
