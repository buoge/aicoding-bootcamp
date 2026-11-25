import "server-only";
import createClient from "openapi-fetch";
import type { paths } from "../generated/api";
import { parseOverview } from "../lib/overview";

export async function getDemoOverview() {
  if (process.env.COMPASS_DEMO_ENABLED !== "true") throw new Error("Demo disabled");
  const client = createClient<paths>({
    baseUrl: process.env.AGENT_API_URL ?? "http://127.0.0.1:8000",
    cache: "no-store",
  });
  const { data, error } = await client.GET("/v1/demo/overview", {
    signal: AbortSignal.timeout(5000),
  });
  if (error || !data) throw new Error("Agent API unavailable");
  return parseOverview(data);
}
