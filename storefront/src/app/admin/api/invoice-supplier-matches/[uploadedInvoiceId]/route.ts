/**
 * Admin API: governed supplier resolution for an invoice intake (Phase 3).
 * PATCH /admin/api/invoice-supplier-matches/[uploadedInvoiceId]
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { appendProcurementEvent } from "@/lib/procurement/opportunity-service";
import { ProcurementEventType } from "@/lib/procurement/event-taxonomy";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { assertActiveCatalogosSupplierExists } from "@/lib/catalog/assert-catalogos-supplier-exists";
import { runPriceObservationAfterSupplierGovernance } from "@/lib/procurement/price-observation-service";

const patchSchema = z.object({
  decision: z.enum(["approve", "reject", "assign"]),
  catalogos_supplier_id: z.string().uuid().optional().nullable(),
  review_notes: z.string().max(2000).optional().nullable(),
});

export async function PATCH(request: NextRequest, context: { params: { uploadedInvoiceId: string } }) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uploadedInvoiceId = context.params.uploadedInvoiceId;
  if (!uploadedInvoiceId) {
    return NextResponse.json({ error: "Missing uploaded invoice id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.decision === "assign" && !parsed.data.catalogos_supplier_id) {
    return NextResponse.json({ error: "catalogos_supplier_id required for assign" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin() as any;

  if (parsed.data.decision === "assign") {
    const ok = await assertActiveCatalogosSupplierExists(supabase, parsed.data.catalogos_supplier_id!);
    if (!ok) {
      return NextResponse.json({ error: "invalid_or_inactive_catalogos_supplier_id" }, { status: 400 });
    }
  }

  const { data: row, error: rowErr } = await supabase
    .schema("gc_commerce")
    .from("invoice_supplier_matches")
    .select("uploaded_invoice_id, catalogos_supplier_id, review_status, method")
    .eq("uploaded_invoice_id", uploadedInvoiceId)
    .maybeSingle();

  if (rowErr || !row) {
    return NextResponse.json({ error: "Supplier match row not found" }, { status: 404 });
  }

  const priorSupplierId = (row as { catalogos_supplier_id?: string | null }).catalogos_supplier_id ?? null;
  const priorReviewStatus = String((row as { review_status?: string }).review_status ?? "");

  const { data: inv } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select("procurement_opportunity_id")
    .eq("id", uploadedInvoiceId)
    .single();
  const opportunityId = (inv as { procurement_opportunity_id?: string | null } | null)?.procurement_opportunity_id ?? null;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    reviewed_at: now,
    reviewed_by: admin.id,
    review_notes: parsed.data.review_notes ?? null,
    decision_source: "operator",
    updated_at: now,
  };

  if (parsed.data.decision === "approve") {
    if (!priorSupplierId) {
      return NextResponse.json({ error: "cannot_approve_without_resolved_supplier_id" }, { status: 400 });
    }
    patch.review_status = "approved";
  } else if (parsed.data.decision === "reject") {
    patch.review_status = "rejected";
    patch.catalogos_supplier_id = null;
    patch.method = "none";
    patch.confidence = null;
  } else {
    patch.review_status = "approved";
    patch.catalogos_supplier_id = parsed.data.catalogos_supplier_id;
    patch.method = "manual";
    patch.confidence = 1;
  }

  const { error: upErr } = await supabase
    .schema("gc_commerce")
    .from("invoice_supplier_matches")
    .update(patch)
    .eq("uploaded_invoice_id", uploadedInvoiceId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const obs = await runPriceObservationAfterSupplierGovernance(supabase, {
    uploadedInvoiceId,
    opportunityId,
    decision: parsed.data.decision,
  });
  if (!obs.ok) {
    return NextResponse.json({ error: obs.error }, { status: 500 });
  }

  if (opportunityId) {
    const eventType =
      parsed.data.decision === "reject" ? ProcurementEventType.supplier_match_rejected : ProcurementEventType.supplier_match_reviewed;
    const okEv = await appendProcurementEvent(supabase, opportunityId, eventType, {
      uploaded_invoice_id: uploadedInvoiceId,
      prior_catalogos_supplier_id: priorSupplierId,
      prior_review_status: priorReviewStatus,
      decision: parsed.data.decision,
      new_catalogos_supplier_id: (patch.catalogos_supplier_id as string | null | undefined) ?? priorSupplierId,
      decided_by: admin.id,
      decision_source: "operator",
      review_notes: parsed.data.review_notes ?? null,
    });
    if (!okEv) {
      return NextResponse.json({ error: "procurement_event_append_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, uploaded_invoice_id: uploadedInvoiceId, review_status: patch.review_status });
}
