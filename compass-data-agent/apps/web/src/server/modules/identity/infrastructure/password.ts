import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { reject } from "../../../platform/errors.ts";

const profile = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const prefix = "scrypt$v1$131072$8$1$";

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, profile, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function encodePassword(password: string): Promise<string> {
  if (
    [...password].length < 12 ||
    [...password].length > 128 ||
    Buffer.byteLength(password) > 512
  ) {
    reject("validation_failed", "密码需为 12–128 个字符，且不超过 512 字节。");
  }
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `${prefix}${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (Buffer.byteLength(password) > 512) return false;
  if (!encoded.startsWith(prefix)) reject("unavailable");
  const fields = encoded.slice(prefix.length).split("$");
  if (fields.length !== 2) reject("unavailable");
  const salt = Buffer.from(fields[0], "base64url");
  const expected = Buffer.from(fields[1], "base64url");
  if (
    salt.length !== 16 ||
    expected.length !== 64 ||
    salt.toString("base64url") !== fields[0] ||
    expected.toString("base64url") !== fields[1]
  )
    reject("unavailable");
  return timingSafeEqual(await derive(password, salt), expected);
}

// A valid fixed-cost record, unrelated to any account. Unknown users perform the same KDF.
export const DUMMY_PASSWORD_HASH = `${prefix}${Buffer.alloc(16, 73).toString("base64url")}$${Buffer.alloc(64, 29).toString("base64url")}`;
