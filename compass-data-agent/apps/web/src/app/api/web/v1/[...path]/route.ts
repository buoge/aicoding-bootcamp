import { handleWebRequest } from "@/server/http/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = handleWebRequest;
export const POST = handleWebRequest;
export const PATCH = handleWebRequest;
export const PUT = handleWebRequest;
export const DELETE = handleWebRequest;
