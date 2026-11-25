import { ready } from "@/server/composition";
import { jsonResponse, errorResponse } from "@/server/http/responses";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return jsonResponse(await ready());
  } catch (error) {
    return errorResponse(error);
  }
}
