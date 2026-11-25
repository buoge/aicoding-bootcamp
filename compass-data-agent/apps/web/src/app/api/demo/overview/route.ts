import { getDemoOverview } from "@/server/agent-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (process.env.COMPASS_DEMO_ENABLED !== "true") {
    return Response.json({ error: "Demo disabled" }, { status: 404, headers });
  }
  try {
    return Response.json(await getDemoOverview(), { headers });
  } catch {
    return Response.json({ error: "示例数据暂不可用，请稍后重试。" }, { status: 503, headers });
  }
}
