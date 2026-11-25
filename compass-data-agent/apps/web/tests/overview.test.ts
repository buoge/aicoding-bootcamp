import { describe, expect, it } from "vitest";
import { parseOverview } from "../src/lib/overview";

const fixture = {
  schema_version: "1",
  source: "synthetic-fixture",
  currency: "CNY",
  start_date: "2026-10-01",
  end_date: "2026-10-03",
  revenue_minor: 4000000,
  orders: 397,
  days: 3,
};
describe("overview network contract", () => {
  it("accepts the exported API shape", () => expect(parseOverview(fixture)).toEqual(fixture));
  it.each([
    { ...fixture, schema_version: "2" },
    { ...fixture, revenue_minor: -1 },
    { ...fixture, orders: "397" },
    { ...fixture, start_date: "yesterday" },
    { ...fixture, secret: "unexpected" },
  ])("rejects incompatible or malformed responses", (value) => {
    expect(() => parseOverview(value)).toThrow("Incompatible overview contract");
  });
});
