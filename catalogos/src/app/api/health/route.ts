import { NextResponse } from "next/server";

/** GET /api/health — liveness for storefront import status probes (no DB). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "catalogos",
    ts: new Date().toISOString(),
  });
}
