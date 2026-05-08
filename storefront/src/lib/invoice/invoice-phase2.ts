/**
 * Phase 2 procurement memory: persist invoice_lines, supplier match, CatalogOS matcher results.
 * Relational rows are canonical; uploaded_invoices.payload.last_extract remains a raw extraction artifact only.
 */

import { randomUUID } from "crypto";
import type { InvoiceExtractResponse } from "@/lib/ai/schemas";
import { appendProcurementEvent } from "@/lib/procurement/opportunity-service";
import { ProcurementEventType } from "@/lib/procurement/event-taxonomy";
import { resolveInvoiceVendor } from "@/lib/invoice/supplier-resolve";
import { resolveInvoiceLinesViaCatalogos, type CatalogosResolveLineResult } from "@/lib/invoice/catalogos-resolve-client";

export const INVOICE_MATCHING_VERSION = "invoice-match-v1" as const;

export function lineReviewFromMatch(m: CatalogosResolveLineResult): string {
  if (m.matched) {
    if (
      m.match_confidence >= 0.85 &&
      (m.match_reason === "upc_exact" || m.match_reason === "attribute_match")
    ) {
      return "pending_review";
    }
    return "review_required";
  }
  if (m.match_reason === "no_match" && m.match_confidence === 0) {
    return "no_match";
  }
  return "review_required";
}

export function computeAggregateReview(
  lineStatuses: string[],
  supplierStatus: string
): "pending_review" | "review_required" | "no_match" | "ambiguous" | "cleared" {
  if (supplierStatus === "ambiguous" || supplierStatus === "review_required") return "review_required";
  if (lineStatuses.some((s) => s === "ambiguous")) return "ambiguous";
  if (lineStatuses.some((s) => s === "review_required")) return "review_required";
  /** Unanimous operator-visible no-match (lines persisted); mixed no_match + other states stays in review_required. */
  if (lineStatuses.length > 0 && lineStatuses.every((s) => s === "no_match")) return "no_match";
  if (lineStatuses.some((s) => s === "no_match")) return "review_required";
  if (supplierStatus === "no_match") return "review_required";
  if (lineStatuses.length === 0) return "cleared";
  return "pending_review";
}

export type ProcessInvoicePhase2Input = {
  supabase: any;
  opportunityId: string;
  uploadedInvoiceId: string;
  extractOk: boolean;
  extract: InvoiceExtractResponse | null;
};

export type ProcessInvoicePhase2Result = { ok: true } | { ok: false; error: string };

export async function processInvoicePhase2(input: ProcessInvoicePhase2Input): Promise<ProcessInvoicePhase2Result> {
  const { supabase, opportunityId, uploadedInvoiceId, extractOk, extract } = input;

  const { count: existingCount, error: countErr } = await supabase
    .schema("gc_commerce")
    .from("invoice_lines")
    .select("*", { count: "exact", head: true })
    .eq("uploaded_invoice_id", uploadedInvoiceId);
  if (countErr) {
    return { ok: false, error: `line_count_failed:${countErr.message}` };
  }
  if ((existingCount ?? 0) > 0) {
    return { ok: true };
  }

  const { data: intakeRow } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select("matching_attempt")
    .eq("id", uploadedInvoiceId)
    .single();
  const nextAttempt = Number((intakeRow as { matching_attempt?: number } | null)?.matching_attempt ?? 0) + 1;
  await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .update({
      matching_attempt: nextAttempt,
      matching_version: INVOICE_MATCHING_VERSION,
      updated_at: new Date().toISOString(),
    })
    .eq("id", uploadedInvoiceId);

  const lines = extract?.lines ?? [];
  const vendorRaw = extract?.vendor_name ?? "";

  const lineIds: string[] = [];
  const rowsToInsert: Record<string, unknown>[] = [];

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]!;
    const id = randomUUID();
    lineIds.push(id);
    rowsToInsert.push({
      id,
      uploaded_invoice_id: uploadedInvoiceId,
      line_index: i,
      raw_description: String(ln.description ?? "").slice(0, 4000),
      quantity: Number(ln.quantity) || 0,
      unit_price: ln.unit_price != null ? Number(ln.unit_price) : null,
      line_total: ln.total != null ? Number(ln.total) : null,
      supplier_sku: ln.sku_or_code != null ? String(ln.sku_or_code).slice(0, 500) : null,
      extraction_confidence: null,
      review_status: "pending_review",
      normalized_snapshot: {},
      substitute_candidate: false,
      decision_source: "system",
      updated_at: new Date().toISOString(),
    });
  }

  if (rowsToInsert.length > 0) {
    const { error: insErr } = await supabase.schema("gc_commerce").from("invoice_lines").insert(rowsToInsert);
    if (insErr) {
      return { ok: false, error: `invoice_lines_insert:${insErr.message}` };
    }
    const okEv = await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.invoice_lines_persisted, {
      uploaded_invoice_id: uploadedInvoiceId,
      line_ids: lineIds,
      count: lineIds.length,
      matching_version: INVOICE_MATCHING_VERSION,
      matching_attempt: nextAttempt,
    });
    if (!okEv) return { ok: false, error: "event_invoice_lines_persisted_failed" };
  }

  await supabase.schema("gc_commerce").from("invoice_supplier_matches").delete().eq("uploaded_invoice_id", uploadedInvoiceId);

  const supplier = await resolveInvoiceVendor(supabase, vendorRaw);
  const { error: supErr } = await supabase.schema("gc_commerce").from("invoice_supplier_matches").insert({
    uploaded_invoice_id: uploadedInvoiceId,
    vendor_raw: vendorRaw.slice(0, 2000),
    normalized_vendor_key: supplier.normalized_vendor_key || null,
    catalogos_supplier_id: supplier.catalogos_supplier_id,
    confidence: supplier.confidence,
    method: supplier.method,
    review_status: supplier.review_status,
    decision_source: "system",
    updated_at: new Date().toISOString(),
  });
  if (supErr) {
    return { ok: false, error: `supplier_match_insert:${supErr.message}` };
  }

  const okSupEv = await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.supplier_match_completed, {
    uploaded_invoice_id: uploadedInvoiceId,
    catalogos_supplier_id: supplier.catalogos_supplier_id,
    confidence: supplier.confidence,
    method: supplier.method,
    review_status: supplier.review_status,
  });
  if (!okSupEv) return { ok: false, error: "event_supplier_match_failed" };

  const catalogPayload = {
    lines: lineIds.map((lineId, i) => {
      const ln = lines[i]!;
      const sku = ln.sku_or_code != null ? String(ln.sku_or_code) : "";
      return {
        line_id: lineId,
        row: {
          description: ln.description,
          name: ln.description,
          product_name: ln.description,
          sku: sku || "UNKNOWN",
          supplier_sku: sku || "UNKNOWN",
          price: ln.unit_price ?? 0,
          cost: ln.unit_price ?? 0,
          unit_cost: ln.unit_price ?? 0,
          quantity: ln.quantity,
        },
      };
    }),
  };

  const lineStatuses: string[] = [];
  const noMatchLineIds: string[] = [];
  const reviewLineIds: string[] = [];

  if (lineIds.length === 0) {
    const okProd = await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.product_match_completed, {
      uploaded_invoice_id: uploadedInvoiceId,
      results: [],
      matching_version: INVOICE_MATCHING_VERSION,
      note: "no_lines_to_match",
    });
    if (!okProd) return { ok: false, error: "event_product_match_empty_failed" };
  } else {
    const catalog = await resolveInvoiceLinesViaCatalogos(catalogPayload, {
      opportunityId,
      uploadedInvoiceId,
    });

    if (catalog.ok && catalog.results?.length) {
      for (const r of catalog.results) {
        const review = lineReviewFromMatch(r);
        lineStatuses.push(review);
        if (review === "no_match") noMatchLineIds.push(r.line_id);
        if (review === "review_required") reviewLineIds.push(r.line_id);

        const { error: upErr } = await supabase
          .schema("gc_commerce")
          .from("invoice_lines")
          .update({
            review_status: review,
            normalized_snapshot: r.normalized_snapshot,
            catalog_product_id: r.catalog_product_id,
            match_confidence: r.match_confidence,
            match_reason: r.match_reason,
            updated_at: new Date().toISOString(),
          })
          .eq("id", r.line_id);
        if (upErr) {
          return { ok: false, error: `line_update:${upErr.message}` };
        }
      }

      const okProd = await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.product_match_completed, {
        uploaded_invoice_id: uploadedInvoiceId,
        results: catalog.results.map((r) => ({
          line_id: r.line_id,
          matched: r.matched,
          catalog_product_id: r.catalog_product_id,
          match_confidence: r.match_confidence,
          match_reason: r.match_reason,
        })),
        matching_version: INVOICE_MATCHING_VERSION,
      });
      if (!okProd) return { ok: false, error: "event_product_match_failed" };
    } else if (!catalog.ok && "skipped" in catalog && catalog.skipped) {
      for (const id of lineIds) {
        lineStatuses.push("review_required");
        reviewLineIds.push(id);
        await supabase
          .schema("gc_commerce")
          .from("invoice_lines")
          .update({
            review_status: "review_required",
            normalized_snapshot: { skipped: true, reason: catalog.reason },
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
      }
      const okProd = await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.product_match_completed, {
        uploaded_invoice_id: uploadedInvoiceId,
        skipped: true,
        reason: catalog.reason,
        matching_version: INVOICE_MATCHING_VERSION,
      });
      if (!okProd) return { ok: false, error: "event_product_match_skipped_failed" };
    } else {
      const err = !catalog.ok && "error" in catalog ? catalog.error : "catalogos_error";
      for (const id of lineIds) {
        lineStatuses.push("review_required");
        reviewLineIds.push(id);
        await supabase
          .schema("gc_commerce")
          .from("invoice_lines")
          .update({
            review_status: "review_required",
            normalized_snapshot: { catalogos_error: err },
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
      }
      const okProd = await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.product_match_completed, {
        uploaded_invoice_id: uploadedInvoiceId,
        error: err,
        matching_version: INVOICE_MATCHING_VERSION,
      });
      if (!okProd) return { ok: false, error: "event_product_match_error_failed" };
    }
  }

  if (noMatchLineIds.length > 0) {
    const okNm = await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.no_match_detected, {
      uploaded_invoice_id: uploadedInvoiceId,
      line_ids: noMatchLineIds,
    });
    if (!okNm) return { ok: false, error: "event_no_match_failed" };
  }

  if (reviewLineIds.length > 0) {
    const okRv = await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.line_review_required, {
      uploaded_invoice_id: uploadedInvoiceId,
      line_ids: reviewLineIds,
    });
    if (!okRv) return { ok: false, error: "event_line_review_failed" };
  }

  const aggregate = computeAggregateReview(lineStatuses, supplier.review_status);
  const lineCountPersisted = lines.length;

  const { data: payloadRow } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select("payload")
    .eq("id", uploadedInvoiceId)
    .single();
  const prevPayload = (payloadRow?.payload as Record<string, unknown> | undefined) ?? {};

  await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .update({
      line_count_persisted: lineCountPersisted,
      aggregate_review_status: extractOk ? aggregate : "review_required",
      payload: {
        ...prevPayload,
        /** Duplicated line arrays removed — query gc_commerce.invoice_lines. */
        line_items: [],
        /** Raw LLM artifact only — structured truth is gc_commerce.invoice_lines. */
        invoice_lines_canonical: true,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", uploadedInvoiceId);

  return { ok: true };
}
