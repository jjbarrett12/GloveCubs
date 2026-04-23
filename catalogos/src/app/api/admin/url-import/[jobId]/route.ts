/**
 * GET /api/admin/url-import/[jobId] — Job detail for preview (pages, products, family groups).
 */

import { NextResponse } from "next/server";
import { getUrlImportJobDetail } from "@/lib/url-import/admin-data";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    if (!jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }
    const detail = await getUrlImportJobDetail(jobId);
    if (!detail) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to get job detail" },
      { status: 500 }
    );
  }
}
