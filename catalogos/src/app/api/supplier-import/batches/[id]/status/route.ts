/**
 * GET /api/supplier-import/batches/[id]/status
 * Poll import_batches.stats + status for large async CSV jobs.
 */

import { NextResponse } from "next/server";
import { getSupabaseCatalogos } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
    }

    const supabase = getSupabaseCatalogos(true);
    const { data, error } = await supabase
      .from("import_batches")
      .select(
        "id, supplier_id, status, started_at, completed_at, stats, source_kind, source_filename, preview_session_id"
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    const { data: recentLogs } = await supabase
      .from("import_batch_logs")
      .select("step, status, message, created_at")
      .eq("batch_id", id)
      .order("created_at", { ascending: false })
      .limit(8);

    return NextResponse.json({
      batch: data,
      recent_logs: recentLogs ?? [],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Status failed" },
      { status: 500 }
    );
  }
}
