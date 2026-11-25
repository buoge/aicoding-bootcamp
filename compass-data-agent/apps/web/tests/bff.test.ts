import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/agent-api", () => ({ getDemoOverview: vi.fn() }));
import { getDemoOverview } from "@/server/agent-api";
import { GET } from "@/app/api/demo/overview/route";

const fixture = {
  schema_version: "1",
  source: "synthetic-fixture",
  currency: "CNY",
  start_date: "2026-10-01",
  end_date: "2026-10-03",
  revenue_minor: 4000000,
  orders: 397,
  days: 3,
} as const;
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
describe("BFF demo boundary", () => {
  it("does not call the backend while the demo is disabled", async () => {
    vi.stubEnv("COMPASS_DEMO_ENABLED", "false");
    const response = await GET();
    expect(response.status).toBe(404);
    expect(getDemoOverview).not.toHaveBeenCalled();
  });
  it("forwards the validated DTO without caching", async () => {
    vi.stubEnv("COMPASS_DEMO_ENABLED", "true");
    vi.mocked(getDemoOverview).mockResolvedValue(fixture);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(fixture);
  });
  it("maps upstream errors without exposing internal details", async () => {
    vi.stubEnv("COMPASS_DEMO_ENABLED", "true");
    vi.mocked(getDemoOverview).mockRejectedValue(new Error("internal database address"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain("internal database address");
  });
});
