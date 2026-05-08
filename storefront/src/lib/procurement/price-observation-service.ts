/**
 * Phase 4 — single writer for trusted price observations (spend memory).
 * Invoked only after governed DB commits (line or supplier PATCH), never from OCR/match/rerun.
 */

import { appendProcurementEvent } from "@/lib/procurement/opportunity-service";
import { ProcurementEventType } from "@/lib/procurement/event-taxonomy";
import { isTrustedProcurementLine } from "@/lib/procurement/trusted-procurement-line";
import { isTrustedSupplierMatch } from "@/lib/procurement/trusted-supplier-match";
import { runSavingsOpportunityBuildAfterTrustedObservation } from "@/lib/procurement/savings-opportunity-service";

export type PriceObservationResult = { ok: true } | { ok: false; error: string };

async function appendSpendEvents(
  supabase: any,
  opportunityId: string,
  observationId: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const a = await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.price_observation_created, {
    observation_id: observationId,
    ...payload,
  });
  if (!a) return false;
  const b = await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.spend_memory_updated, {
    observation_id: observationId,
    ...payload,
  });
  if (!b) return false;
  const c = await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.trusted_spend_promoted, {
    observation_id: observationId,
    ...payload,
  });
  return c;
}

async function appendRejectionEvents(
  supabase: any,
  opportunityId: string,
  observationId: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const a = await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.price_observation_rejected, {
    observation_id: observationId,
    ...payload,
  });
  if (!a) return false;
  return appendProcurementEvent(supabase, opportunityId, ProcurementEventType.spend_memory_updated, {
    observation_id: observationId,
    ...payload,
  });
}

export async function supersedeTrustedObservationForLine(
  supabase: any,
  input: { lineId: string; exclusionReason: string; opportunityId: string | null }
): Promise<PriceObservationResult> {
  const s = supabase.schema("gc_commerce");
  const { data: prior, error: selErr } = await s
    .from("price_observations")
    .select("id, invoice_line_id, uploaded_invoice_id, company_id, catalog_product_id")
    .eq("invoice_line_id", input.lineId)
    .eq("trust_status", "trusted")
    .maybeSingle();
  if (selErr) {
    return { ok: false, error: `price_observation_select:${selErr.message}` };
  }
  if (!prior) {
    return { ok: true };
  }
  const { error: upErr } = await s
    .from("price_observations")
    .update({
      trust_status: "superseded",
      exclusion_reason: input.exclusionReason.slice(0, 2000),
    })
    .eq("id", (prior as { id: string }).id)
    .eq("trust_status", "trusted");
  if (upErr) {
    return { ok: false, error: `price_observation_supersede:${upErr.message}` };
  }
  if (input.opportunityId) {
    const ok = await appendRejectionEvents(supabase, input.opportunityId, (prior as { id: string }).id, {
      invoice_line_id: input.lineId,
      reason: input.exclusionReason,
    });
    if (!ok) {
      return { ok: false, error: "price_observation_rejection_events_failed" };
    }
  }
  return { ok: true };
}

export async function supersedeTrustedObservationsForUploadedInvoice(
  supabase: any,
  input: { uploadedInvoiceId: string; exclusionReason: string; opportunityId: string | null }
): Promise<PriceObservationResult> {
  const s = supabase.schema("gc_commerce");
  const reason = input.exclusionReason.slice(0, 2000);
  const { data: updated, error: upErr } = await s
    .from("price_observations")
    .update({
      trust_status: "superseded",
      exclusion_reason: reason,
    })
    .eq("uploaded_invoice_id", input.uploadedInvoiceId)
    .eq("trust_status", "trusted")
    .select("id, invoice_line_id");
  if (upErr) {
    return { ok: false, error: `price_observation_bulk_supersede:${upErr.message}` };
  }
  if (input.opportunityId && updated?.length) {
    for (const r of updated) {
      const ok = await appendRejectionEvents(supabase, input.opportunityId, String((r as { id: string }).id), {
        invoice_line_id: String((r as { invoice_line_id: string }).invoice_line_id),
        uploaded_invoice_id: input.uploadedInvoiceId,
        reason,
      });
      if (!ok) {
        return { ok: false, error: "price_observation_rejection_events_failed" };
      }
    }
  }
  return { ok: true };
}

async function tryInsertTrustedObservationForLine(
  supabase: any,
  lineId: string,
  opportunityId: string | null,
  observationSource: "operator_governance" | "repair" | "invoice_supplier_governance"
): Promise<PriceObservationResult> {
  const s = supabase.schema("gc_commerce");

  const { data: line, error: lineErr } = await s
    .from("invoice_lines")
    .select(
      "id, uploaded_invoice_id, review_status, decision_source, human_decided_at, human_decided_by, catalog_product_id, quantity, unit_price, line_total, updated_at"
    )
    .eq("id", lineId)
    .single();
  if (lineErr || !line) {
    return { ok: false, error: "line_not_found" };
  }

  const L = line as Record<string, unknown>;
  if (!isTrustedProcurementLine(L as Parameters<typeof isTrustedProcurementLine>[0])) {
    return { ok: true };
  }

  if (L.unit_price == null || !Number.isFinite(Number(L.unit_price))) {
    return { ok: true };
  }

  const uploadedInvoiceId = String(L.uploaded_invoice_id);
  const { data: inv, error: invErr } = await s
    .from("uploaded_invoices")
    .select("id, company_id, procurement_opportunity_id")
    .eq("id", uploadedInvoiceId)
    .single();
  if (invErr || !inv) {
    return { ok: false, error: "uploaded_invoice_not_found" };
  }
  const companyId = (inv as { company_id?: string | null }).company_id;
  if (!companyId) {
    return { ok: true };
  }

  const { data: sup, error: supErr } = await s
    .from("invoice_supplier_matches")
    .select("review_status, decision_source, reviewed_at, reviewed_by, catalogos_supplier_id")
    .eq("uploaded_invoice_id", uploadedInvoiceId)
    .maybeSingle();
  if (supErr) {
    return { ok: false, error: `supplier_match:${supErr.message}` };
  }
  if (!sup || !isTrustedSupplierMatch(sup as Parameters<typeof isTrustedSupplierMatch>[0])) {
    return { ok: true };
  }

  const supplierId = String((sup as { catalogos_supplier_id: string }).catalogos_supplier_id);
  const catalogProductId = String(L.catalog_product_id);
  const observedAt = String(L.human_decided_at ?? L.updated_at ?? new Date().toISOString());

  const { data: existing } = await s
    .from("price_observations")
    .select("id")
    .eq("invoice_line_id", lineId)
    .eq("trust_status", "trusted")
    .maybeSingle();
  if (existing?.id) {
    return { ok: true };
  }

  const insertRow = {
    invoice_line_id: lineId,
    uploaded_invoice_id: uploadedInvoiceId,
    company_id: companyId,
    procurement_opportunity_id: (inv as { procurement_opportunity_id?: string | null }).procurement_opportunity_id ?? null,
    catalog_product_id: catalogProductId,
    catalogos_supplier_id: supplierId,
    quantity: Number(L.quantity) || 0,
    unit_price: Number(L.unit_price),
    line_total: L.line_total != null ? Number(L.line_total) : null,
    currency: null,
    observed_at: observedAt,
    observation_source: observationSource,
    trust_status: "trusted",
    exclusion_reason: null,
  };

  const { data: inserted, error: insErr } = await s.from("price_observations").insert(insertRow).select("id").single();
  if (insErr) {
    if (String(insErr.message ?? "").toLowerCase().includes("duplicate") || String(insErr.code) === "23505") {
      return { ok: true };
    }
    return { ok: false, error: `price_observation_insert:${insErr.message}` };
  }

  const observationId = String((inserted as { id: string }).id);
  const opp = opportunityId ?? (inv as { procurement_opportunity_id?: string | null }).procurement_opportunity_id ?? null;
  if (opp) {
    const ok = await appendSpendEvents(supabase, opp, observationId, {
      invoice_line_id: lineId,
      uploaded_invoice_id: uploadedInvoiceId,
      company_id: companyId,
      catalog_product_id: catalogProductId,
      catalogos_supplier_id: supplierId,
      unit_price: insertRow.unit_price,
      quantity: insertRow.quantity,
      observed_at: observedAt,
    });
    if (!ok) {
      return { ok: false, error: "price_observation_promotion_events_failed" };
    }
  }

  const build = await runSavingsOpportunityBuildAfterTrustedObservation(supabase, {
    invoiceLineId: lineId,
    companyId: String(companyId),
    catalogProductId,
    procurementOpportunityId: opp,
  });
  if (!build.ok) {
    return { ok: false, error: build.error };
  }

  return { ok: true };
}

/** After invoice line governance row is committed. */
export async function runPriceObservationAfterLineGovernance(
  supabase: any,
  input: { lineId: string; opportunityId: string | null }
): Promise<PriceObservationResult> {
  const s = supabase.schema("gc_commerce");
  const { data: line } = await s
    .from("invoice_lines")
    .select("review_status, decision_source, human_decided_at, human_decided_by, catalog_product_id")
    .eq("id", input.lineId)
    .single();
  if (!line) {
    return { ok: false, error: "line_not_found" };
  }
  const rs = String((line as { review_status: string }).review_status);
  if (rs === "rejected" || rs === "no_match") {
    return supersedeTrustedObservationForLine(supabase, {
      lineId: input.lineId,
      exclusionReason: rs === "rejected" ? "line_rejected" : "line_no_match",
      opportunityId: input.opportunityId,
    });
  }
  return tryInsertTrustedObservationForLine(supabase, input.lineId, input.opportunityId, "operator_governance");
}

/** After supplier governance row is committed (reject all trusted spend for invoice, or try promote lines). */
export async function runPriceObservationAfterSupplierGovernance(
  supabase: any,
  input: {
    uploadedInvoiceId: string;
    opportunityId: string | null;
    decision: "approve" | "reject" | "assign";
  }
): Promise<PriceObservationResult> {
  if (input.decision === "reject") {
    return supersedeTrustedObservationsForUploadedInvoice(supabase, {
      uploadedInvoiceId: input.uploadedInvoiceId,
      exclusionReason: "supplier_untrusted",
      opportunityId: input.opportunityId,
    });
  }

  const s = supabase.schema("gc_commerce");
  const { data: lines, error } = await s.from("invoice_lines").select("id").eq("uploaded_invoice_id", input.uploadedInvoiceId);
  if (error) {
    return { ok: false, error: `lines_list:${error.message}` };
  }
  for (const row of lines ?? []) {
    const res = await tryInsertTrustedObservationForLine(
      supabase,
      String((row as { id: string }).id),
      input.opportunityId,
      "invoice_supplier_governance"
    );
    if (!res.ok) return res;
  }
  return { ok: true };
}

/** Explicit repair entry (idempotent insert only; no supersede). */
export async function runTrustedPriceObservationRepairForLine(
  supabase: any,
  lineId: string,
  opportunityId: string | null
): Promise<PriceObservationResult> {
  return tryInsertTrustedObservationForLine(supabase, lineId, opportunityId, "repair");
}
