/**
 * Minimal JSON queue: invoices needing operator attention (Phase 3).
 * GET /admin/api/procurement/review-queue/invoices
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin() as any;
  const s = supabase.schema("gc_commerce");

  const { data: byAggregate, error: aggErr } = await s
    .from("uploaded_invoices")
    .select(
      "id, aggregate_review_status, line_count_persisted, matching_attempt, matching_rerun_in_progress, procurement_opportunity_id, created_at, updated_at"
    )
    .or("aggregate_review_status.in.(pending_review,review_required,ambiguous,no_match)")
    .limit(100);

  if (aggErr) {
    return NextResponse.json({ error: aggErr.message }, { status: 500 });
  }

  const { data: lineRows, error: lineErr } = await s
    .from("invoice_lines")
    .select("uploaded_invoice_id")
    .or("review_status.in.(pending_review,review_required,ambiguous,rejected),and(review_status.eq.no_match,decision_source.neq.operator)")
    .limit(500);

  if (lineErr) {
    return NextResponse.json({ error: lineErr.message }, { status: 500 });
  }

  const { data: supRows, error: supErr } = await s
    .from("invoice_supplier_matches")
    .select("uploaded_invoice_id")
    .in("review_status", ["pending_review", "review_required", "ambiguous", "no_match"])
    .limit(500);

  if (supErr) {
    return NextResponse.json({ error: supErr.message }, { status: 500 });
  }

  const idSet = new Set<string>();
  for (const r of byAggregate ?? []) {
    idSet.add(String((r as { id: string }).id));
  }
  for (const r of lineRows ?? []) {
    idSet.add(String((r as { uploaded_invoice_id: string }).uploaded_invoice_id));
  }
  for (const r of supRows ?? []) {
    idSet.add(String((r as { uploaded_invoice_id: string }).uploaded_invoice_id));
  }

  const ids = Array.from(idSet).slice(0, 150);
  if (ids.length === 0) {
    return NextResponse.json({ invoices: [] });
  }

  const { data: invoices, error: invErr } = await s
    .from("uploaded_invoices")
    .select(
      "id, aggregate_review_status, line_count_persisted, matching_attempt, matching_rerun_in_progress, procurement_opportunity_id, created_at, updated_at"
    )
    .in("id", ids)
    .order("updated_at", { ascending: false })
    .limit(150);

  if (invErr) {
    return NextResponse.json({ error: invErr.message }, { status: 500 });
  }

  return NextResponse.json({ invoices: invoices ?? [] });
}
