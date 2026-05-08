/**
 * Minimal JSON queue: unresolved invoice lines (Phase 3).
 * GET /admin/api/procurement/review-queue/lines?uploaded_invoice_id=<uuid>
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";

export async function GET(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uploadedInvoiceId = request.nextUrl.searchParams.get("uploaded_invoice_id")?.trim();
  if (!uploadedInvoiceId) {
    return NextResponse.json({ error: "uploaded_invoice_id query required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("invoice_lines")
    .select(
      "id, line_index, raw_description, review_status, decision_source, catalog_product_id, match_confidence, match_reason, human_decision, human_decided_at, human_decided_by, review_notes, resolution_reason, updated_at"
    )
    .eq("uploaded_invoice_id", uploadedInvoiceId)
    .or("review_status.in.(pending_review,review_required,ambiguous,rejected),and(review_status.eq.no_match,decision_source.neq.operator)")
    .order("line_index", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lines: data ?? [] });
}
