/**
 * Minimal JSON queue: supplier match row for an invoice (Phase 3).
 * GET /admin/api/procurement/review-queue/supplier-matches?uploaded_invoice_id=<uuid>
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
    .from("invoice_supplier_matches")
    .select(
      "uploaded_invoice_id, vendor_raw, normalized_vendor_key, catalogos_supplier_id, confidence, method, review_status, reviewed_by, reviewed_at, review_notes, decision_source, updated_at"
    )
    .eq("uploaded_invoice_id", uploadedInvoiceId)
    .in("review_status", ["pending_review", "review_required", "ambiguous", "no_match"])
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ supplier_match: data });
}
