import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { listUnifiedReviewQueue } from "@/lib/admin/unified-ingestion-review-queue";
import type { IngestionJobStatus, IngestionMode } from "../../../../../../../../lib/unified-ingestion/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const sp = request.nextUrl.searchParams;
  const modeRaw = sp.get("mode")?.trim();
  const statusRaw = sp.get("status")?.trim();
  const limitRaw = sp.get("limit");

  const mode =
    modeRaw === "quick_draft" || modeRaw === "deep_supplier_crawl" ? (modeRaw as IngestionMode) : "all";
  const jobStatus =
    statusRaw && statusRaw !== "all" ? (statusRaw as IngestionJobStatus) : "all";
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  const rows = await listUnifiedReviewQueue({
    mode,
    jobStatus,
    limit: Number.isFinite(limit) ? limit : 200,
  });

  return NextResponse.json({ rows, count: rows.length });
}
