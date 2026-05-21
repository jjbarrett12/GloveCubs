import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getUnifiedIngestionJobDetail } from "@/lib/admin/unified-ingestion-review-queue";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { jobId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const jobId = params.jobId?.trim();
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  const job = await getUnifiedIngestionJobDetail(jobId);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  return NextResponse.json({ job });
}
