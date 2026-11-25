import "server-only";
import { reject } from "./errors";

export function authConfiguration() {
  let origin: URL;
  try {
    origin = new URL(process.env.WEB_PUBLIC_ORIGIN ?? "");
  } catch {
    return reject("unavailable");
  }
  const local =
    process.env.WEB_AUTH_ALLOW_LOCAL_HTTP === "true" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) &&
    origin.protocol === "http:";
  if (
    (!local && origin.protocol !== "https:") ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    reject("unavailable");
  const ttl = Number(process.env.WEB_SESSION_TTL_SECONDS ?? 43200);
  if (!Number.isInteger(ttl) || ttl <= 0 || ttl > 43200) reject("unavailable");
  return {
    origin: origin.origin,
    ttl,
    cookieName: local ? "compass-dev-session" : "__Host-compass-session",
    secure: !local,
  };
}
