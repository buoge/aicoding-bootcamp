import { beforeEach, it, expect, vi } from "vitest";
const fake = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("pg", () => ({
  default: {
    Pool: class {
      on() {}
      async connect() {
        return fake;
      }
      async end() {}
    },
  },
}));
import { withTransaction, closeDatabase } from "../../src/server/platform/db";
beforeEach(async () => {
  await closeDatabase();
  vi.clearAllMocks();
  process.env.WEB_DATABASE_URL = "postgresql://unused.invalid/test";
  fake.query.mockResolvedValue({ rows: [] });
});
it("retries a serialization failure only after a confirmed rollback before COMMIT", async () => {
  const work = vi
    .fn()
    .mockRejectedValueOnce(Object.assign(new Error("retry"), { code: "40001" }))
    .mockResolvedValue("saved");
  expect(await withTransaction("command", work)).toBe("saved");
  expect(work).toHaveBeenCalledTimes(2);
  expect(fake.release).toHaveBeenCalledTimes(2);
});
it("never repeats a business operation after an ambiguous COMMIT failure", async () => {
  fake.query.mockImplementation(async (sql: string) => {
    if (sql === "COMMIT") throw Object.assign(new Error("commit response lost"), { code: "40001" });
    return { rows: [] };
  });
  const work = vi.fn().mockResolvedValue("csv bytes");
  await expect(withTransaction("export", work)).rejects.toThrow("commit response lost");
  expect(work).toHaveBeenCalledTimes(1);
  expect(fake.release).toHaveBeenCalledTimes(1);
});
