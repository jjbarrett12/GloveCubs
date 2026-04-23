/**
 * GET /api/admin/distributor-sources — Admin-only. List distributor sources.
 */

import { NextResponse } from "next/server";
import { listDistributorSources } from "@/lib/distributor-sync/admin-data";

export async function GET() {
  try {
    const sources = await listDistributorSources();
    return NextResponse.json(sources);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list sources" },
      { status: 500 }
    );
  }
}
