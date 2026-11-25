export function GET() {
  return Response.json(
    { status: "ok", service: "compass-web" },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
