/**
 * GET /api/admin/crawl-jobs/[id] — Admin-only. Crawl job detail + staging + failed pages.
 */

import { NextResponse } from "next/server";
import { getCrawlJobDetail } from "@/lib/distributor-sync/admin-data";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const detail = await getCrawlJobDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load job" },
      { status: 500 }
    );
  }
}
