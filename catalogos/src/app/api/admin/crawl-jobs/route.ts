/**
 * GET /api/admin/crawl-jobs — Admin-only. List recent crawl jobs.
 */

import { NextResponse } from "next/server";
import { listCrawlJobs } from "@/lib/distributor-sync/admin-data";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
    const jobs = await listCrawlJobs(limit);
    return NextResponse.json(jobs);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list jobs" },
      { status: 500 }
    );
  }
}
