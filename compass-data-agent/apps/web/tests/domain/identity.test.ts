import { it, expect } from "vitest";
import { sessionIsLive } from "../../src/server/modules/identity/domain/session";
import { createLoginLimiter } from "../../src/server/modules/identity/infrastructure/login-limit";
import {
  encodePassword,
  verifyPassword,
  DUMMY_PASSWORD_HASH,
} from "../../src/server/modules/identity/infrastructure/password";
it("stores fixed-cost salted hashes and checks exact password bytes", async () => {
  const password = "correct horse battery";
  const encoded = await encodePassword(password);
  expect(encoded).toMatch(/^scrypt\$v1\$131072\$8\$1\$/);
  expect(await verifyPassword(password, encoded)).toBe(true);
  expect(await verifyPassword(password + " ", encoded)).toBe(false);
  expect(await verifyPassword(password, DUMMY_PASSWORD_HASH)).toBe(false);
  await expect(verifyPassword(password, encoded.replace("131072", "1"))).rejects.toThrow();
  await expect(encodePassword("short")).rejects.toThrow();
}, 15000);
it("expires sessions at the fixed boundary and limits simultaneous password work", () => {
  const now = new Date();
  expect(sessionIsLive("active", now, null, now)).toBe(false);
  expect(sessionIsLive("disabled", new Date(now.getTime() + 1000), null, now)).toBe(false);
  const limit = createLoginLimiter();
  const a = limit.acquire("a"),
    b = limit.acquire("b");
  expect(() => limit.acquire("c")).toThrow();
  a();
  a();
  const c = limit.acquire("c");
  b();
  c();
});
it("limits repeated login attempts and releases the limit after its time window", () => {
  let now = 1000;
  const limit = createLoginLimiter(() => now);
  for (let attempt = 0; attempt < 10; attempt++) limit.acquire("same.user")();
  expect(() => limit.acquire("same.user")).toThrow();
  now += 60000;
  expect(() => limit.acquire("same.user")()).not.toThrow();
});
