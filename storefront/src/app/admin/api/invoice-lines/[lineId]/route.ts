/**
 * Admin API: governed canonical line decisions (Phase 3) + trusted spend memory (Phase 4).
 * PATCH /admin/api/invoice-lines/[lineId]
 *
 * Ordering: line DB commit → price observation writer → procurement governance events.
 *
 * **Notes-only** body (`{ review_notes }` strict) updates audit text only — it cannot change review_status,
 * decision_source, or human_decision (operators must not mistake it for governance).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { appendProcurementEvent } from "@/lib/procurement/opportunity-service";
import { ProcurementEventType, type ProcurementEventTypeId } from "@/lib/procurement/event-taxonomy";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { assertActiveCatalogProductExists } from "@/lib/catalog/assert-catalog-product-exists";
import { isTrustedProcurementLine } from "@/lib/procurement/trusted-procurement-line";
import { runPriceObservationAfterLineGovernance } from "@/lib/procurement/price-observation-service";
import { governInvoiceLinePatchSchema, notesOnlyInvoiceLinePatchSchema } from "@/lib/admin/invoice-line-patch-contract";

const patchSchema = governInvoiceLinePatchSchema;

export async function PATCH(request: NextRequest, context: { params: { lineId: string } }) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lineId = context.params.lineId;
  if (!lineId) {
    return NextResponse.json({ error: "Missing line id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin() as any;

  const notesParsed = notesOnlyInvoiceLinePatchSchema.safeParse(body);
  if (notesParsed.success) {
    const { data: exists, error: exErr } = await supabase
      .schema("gc_commerce")
      .from("invoice_lines")
      .select("id")
      .eq("id", lineId)
      .maybeSingle();
    if (exErr || !exists) {
      return NextResponse.json({ error: "Line not found" }, { status: 404 });
    }
    const now = new Date().toISOString();
    const { error: upErr } = await supabase
      .schema("gc_commerce")
      .from("invoice_lines")
      .update({ review_notes: notesParsed.data.review_notes, updated_at: now })
      .eq("id", lineId);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, line_id: lineId, mode: "notes_only" });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.decision === "assign" && !parsed.data.catalog_product_id) {
    return NextResponse.json({ error: "catalog_product_id required for assign" }, { status: 400 });
  }

  const { data: line, error: lineErr } = await supabase
    .schema("gc_commerce")
    .from("invoice_lines")
    .select(
      "id, uploaded_invoice_id, review_status, catalog_product_id, match_confidence, match_reason, decision_source, human_decided_at, human_decided_by"
    )
    .eq("id", lineId)
    .single();
  if (lineErr || !line) {
    return NextResponse.json({ error: "Line not found" }, { status: 404 });
  }

  const row = line as Record<string, unknown>;
  const priorReviewStatus = String(row.review_status ?? "");
  const priorCatalogProductId = (row.catalog_product_id as string | null) ?? null;

  const uploadedId = String(row.uploaded_invoice_id);
  const { data: inv } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select("procurement_opportunity_id")
    .eq("id", uploadedId)
    .single();
  const opportunityId = (inv as { procurement_opportunity_id?: string | null } | null)?.procurement_opportunity_id ?? null;

  if (parsed.data.decision === "approve" && isTrustedProcurementLine(row as Parameters<typeof isTrustedProcurementLine>[0])) {
    const obs = await runPriceObservationAfterLineGovernance(supabase, { lineId, opportunityId });
    if (!obs.ok) {
      return NextResponse.json({ error: obs.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, line_id: lineId, review_status: "approved", idempotent: true });
  }

  if (parsed.data.decision === "approve" && !priorCatalogProductId) {
    return NextResponse.json({ error: "cannot_approve_without_catalog_product_id" }, { status: 400 });
  }

  if (parsed.data.decision === "assign") {
    const ok = await assertActiveCatalogProductExists(supabase, parsed.data.catalog_product_id!);
    if (!ok) {
      return NextResponse.json({ error: "invalid_or_inactive_catalog_product_id" }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  let nextStatus = "pending_review";

  if (parsed.data.decision === "approve") {
    nextStatus = "approved";
  } else if (parsed.data.decision === "reject") {
    nextStatus = "rejected";
  } else if (parsed.data.decision === "no_match") {
    nextStatus = "no_match";
  } else if (parsed.data.decision === "assign") {
    nextStatus = "approved";
  }

  const patch: Record<string, unknown> = {
    review_status: nextStatus,
    human_decision: parsed.data.decision,
    human_decided_at: now,
    human_decided_by: admin.id,
    decision_source: "operator",
    review_notes: parsed.data.review_notes ?? null,
    resolution_reason: parsed.data.resolution_reason ?? null,
    updated_at: now,
  };
  if (parsed.data.decision === "assign" && parsed.data.catalog_product_id) {
    patch.catalog_product_id = parsed.data.catalog_product_id;
  }
  if (parsed.data.decision === "reject" || parsed.data.decision === "no_match") {
    patch.catalog_product_id = null;
  }

  const { error: upErr } = await supabase.schema("gc_commerce").from("invoice_lines").update(patch).eq("id", lineId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const obs = await runPriceObservationAfterLineGovernance(supabase, { lineId, opportunityId });
  if (!obs.ok) {
    return NextResponse.json({ error: obs.error }, { status: 500 });
  }

  if (opportunityId) {
    let eventType: ProcurementEventTypeId = ProcurementEventType.canonical_match_reviewed;
    if (parsed.data.decision === "reject") {
      eventType = ProcurementEventType.canonical_match_rejected;
    } else if (parsed.data.decision === "assign") {
      eventType = ProcurementEventType.canonical_match_manually_assigned;
    } else if (parsed.data.decision === "no_match") {
      eventType = ProcurementEventType.no_match_confirmed;
    }

    const payload: Record<string, unknown> = {
      line_id: lineId,
      uploaded_invoice_id: uploadedId,
      prior_review_status: priorReviewStatus,
      prior_catalog_product_id: priorCatalogProductId,
      decision: parsed.data.decision,
      new_review_status: nextStatus,
      new_catalog_product_id: (patch.catalog_product_id as string | null | undefined) ?? priorCatalogProductId,
      decided_by: admin.id,
      decision_source: "operator",
      review_notes: parsed.data.review_notes ?? null,
      resolution_reason: parsed.data.resolution_reason ?? null,
    };
    if (parsed.data.decision === "approve") {
      payload.match_confidence = row.match_confidence ?? null;
      payload.match_reason = row.match_reason ?? null;
    }

    const okEv = await appendProcurementEvent(supabase, opportunityId, eventType, payload);
    if (!okEv) {
      return NextResponse.json({ error: "procurement_event_append_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, line_id: lineId, review_status: nextStatus });
}
