/**
 * Conservative CatalogOS rematch for an existing invoice (Phase 3).
 * Does not overwrite operator-trusted lines; single-flight via matching_rerun_in_progress.
 */

import { appendProcurementEvent } from "@/lib/procurement/opportunity-service";
import { ProcurementEventType } from "@/lib/procurement/event-taxonomy";
import { isTrustedProcurementLine } from "@/lib/procurement/trusted-procurement-line";
import { computeAggregateReview, INVOICE_MATCHING_VERSION, lineReviewFromMatch } from "@/lib/invoice/invoice-phase2";
import { resolveInvoiceLinesViaCatalogos } from "@/lib/invoice/catalogos-resolve-client";

export type InvoiceMatchingRerunResult =
  | {
      ok: true;
      matching_attempt: number;
      rematched_line_ids: string[];
      skipped_trusted_line_ids: string[];
    }
  | { ok: false; error: string };

type LineRow = Record<string, unknown>;

export async function runInvoiceMatchingRerun(input: {
  supabase: any;
  uploadedInvoiceId: string;
  adminUserId: string;
}): Promise<InvoiceMatchingRerunResult> {
  const { supabase, uploadedInvoiceId, adminUserId } = input;
  const s = supabase.schema("gc_commerce");

  const { data: lockedRow, error: lockErr } = await s
    .from("uploaded_invoices")
    .update({ matching_rerun_in_progress: true, updated_at: new Date().toISOString() })
    .eq("id", uploadedInvoiceId)
    .eq("matching_rerun_in_progress", false)
    .select("id, matching_attempt, procurement_opportunity_id")
    .maybeSingle();

  if (lockErr) {
    return { ok: false, error: `rerun_lock:${lockErr.message}` };
  }
  if (!lockedRow?.id) {
    return { ok: false, error: "matching_rerun_in_progress_or_not_found" };
  }

  const opportunityId = (lockedRow as { procurement_opportunity_id?: string | null }).procurement_opportunity_id ?? null;
  const priorAttempt = Number((lockedRow as { matching_attempt?: number }).matching_attempt ?? 0);
  const nextAttempt = priorAttempt + 1;

  const clearLock = async () => {
    await s.from("uploaded_invoices").update({ matching_rerun_in_progress: false, updated_at: new Date().toISOString() }).eq("id", uploadedInvoiceId);
  };

  try {
    if (opportunityId) {
      const okReq = await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.matching_rerun_requested, {
        uploaded_invoice_id: uploadedInvoiceId,
        requested_by: adminUserId,
        matching_attempt: nextAttempt,
      });
      if (!okReq) {
        return { ok: false, error: "event_matching_rerun_requested_failed" };
      }
    }

    const { error: attErr } = await s
      .from("uploaded_invoices")
      .update({
        matching_attempt: nextAttempt,
        matching_version: INVOICE_MATCHING_VERSION,
        updated_at: new Date().toISOString(),
      })
      .eq("id", uploadedInvoiceId);
    if (attErr) {
      return { ok: false, error: `rerun_attempt:${attErr.message}` };
    }

    const { data: lineRows, error: linesErr } = await s
      .from("invoice_lines")
      .select(
        "id, line_index, raw_description, supplier_sku, quantity, unit_price, review_status, decision_source, human_decided_at, human_decided_by, catalog_product_id"
      )
      .eq("uploaded_invoice_id", uploadedInvoiceId)
      .order("line_index", { ascending: true });
    if (linesErr) {
      return { ok: false, error: `rerun_load_lines:${linesErr.message}` };
    }
    if (!lineRows?.length) {
      if (opportunityId) {
        await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.matching_rerun_completed, {
          uploaded_invoice_id: uploadedInvoiceId,
          matching_attempt: nextAttempt,
          note: "no_lines",
          rematched_line_ids: [],
          skipped_trusted_line_ids: [],
        });
      }
      return { ok: true, matching_attempt: nextAttempt, rematched_line_ids: [], skipped_trusted_line_ids: [] };
    }

    const lines = lineRows as LineRow[];
    const skippedTrustedLineIds: string[] = [];
    const rematchPayload: { line_id: string; row: Record<string, unknown> }[] = [];

    for (const ln of lines) {
      const id = String(ln.id);
      if (isTrustedProcurementLine(ln as Parameters<typeof isTrustedProcurementLine>[0])) {
        skippedTrustedLineIds.push(id);
        continue;
      }
      const desc = String(ln.raw_description ?? "");
      const sku = ln.supplier_sku != null ? String(ln.supplier_sku) : "";
      rematchPayload.push({
        line_id: id,
        row: {
          description: desc,
          name: desc,
          product_name: desc,
          sku: sku || "UNKNOWN",
          supplier_sku: sku || "UNKNOWN",
          price: ln.unit_price ?? 0,
          cost: ln.unit_price ?? 0,
          unit_cost: ln.unit_price ?? 0,
          quantity: ln.quantity ?? 0,
        },
      });
    }

    const rematchedLineIds: string[] = [];
    if (rematchPayload.length === 0) {
      if (opportunityId) {
        await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.matching_rerun_completed, {
          uploaded_invoice_id: uploadedInvoiceId,
          matching_attempt: nextAttempt,
          note: "all_lines_trusted_skip",
          rematched_line_ids: [],
          skipped_trusted_line_ids: skippedTrustedLineIds,
        });
      }
      return { ok: true, matching_attempt: nextAttempt, rematched_line_ids: [], skipped_trusted_line_ids: skippedTrustedLineIds };
    }

    const catalog = await resolveInvoiceLinesViaCatalogos(
      { lines: rematchPayload },
      { opportunityId: opportunityId ?? undefined, uploadedInvoiceId }
    );

    if (catalog.ok && catalog.results?.length) {
      for (const r of catalog.results) {
        const cur = lines.find((l) => String(l.id) === r.line_id);
        if (cur && isTrustedProcurementLine(cur as Parameters<typeof isTrustedProcurementLine>[0])) {
          continue;
        }
        const review = lineReviewFromMatch(r);
        const { error: upErr } = await s
          .from("invoice_lines")
          .update({
            review_status: review,
            normalized_snapshot: r.normalized_snapshot,
            catalog_product_id: r.catalog_product_id,
            match_confidence: r.match_confidence,
            match_reason: r.match_reason,
            decision_source: "system",
            updated_at: new Date().toISOString(),
          })
          .eq("id", r.line_id);
        if (upErr) {
          if (opportunityId) {
            await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.matching_rerun_completed, {
              uploaded_invoice_id: uploadedInvoiceId,
              matching_attempt: nextAttempt,
              error: upErr.message,
              rematched_line_ids: rematchedLineIds,
              skipped_trusted_line_ids: skippedTrustedLineIds,
            });
          }
          return { ok: false, error: `line_update:${upErr.message}` };
        }
        rematchedLineIds.push(r.line_id);
      }
    } else {
      const err = !catalog.ok && "error" in catalog ? catalog.error : "catalogos_error";
      for (const p of rematchPayload) {
        const cur = lines.find((l) => String(l.id) === p.line_id);
        if (cur && isTrustedProcurementLine(cur as Parameters<typeof isTrustedProcurementLine>[0])) continue;
        await s
          .from("invoice_lines")
          .update({
            review_status: "review_required",
            normalized_snapshot: {
              catalogos_error: err,
              rerun: true,
            },
            decision_source: "system",
            updated_at: new Date().toISOString(),
          })
          .eq("id", p.line_id);
        rematchedLineIds.push(p.line_id);
      }
    }

    const { data: statusRows } = await s.from("invoice_lines").select("review_status").eq("uploaded_invoice_id", uploadedInvoiceId);
    const lineStatuses = (statusRows ?? []).map((x: { review_status: string }) => x.review_status);
    const { data: supRow } = await s.from("invoice_supplier_matches").select("review_status").eq("uploaded_invoice_id", uploadedInvoiceId).maybeSingle();
    const supplierStatus = String((supRow as { review_status?: string } | null)?.review_status ?? "pending_review");
    const aggregate = computeAggregateReview(lineStatuses, supplierStatus);

    await s
      .from("uploaded_invoices")
      .update({
        aggregate_review_status: aggregate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", uploadedInvoiceId);

    if (opportunityId) {
      const okDone = await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.matching_rerun_completed, {
        uploaded_invoice_id: uploadedInvoiceId,
        matching_attempt: nextAttempt,
        rematched_line_ids: rematchedLineIds,
        skipped_trusted_line_ids: skippedTrustedLineIds,
      });
      if (!okDone) {
        return { ok: false, error: "event_matching_rerun_completed_failed" };
      }
    }

    return { ok: true, matching_attempt: nextAttempt, rematched_line_ids: rematchedLineIds, skipped_trusted_line_ids: skippedTrustedLineIds };
  } finally {
    await clearLock();
  }
}
