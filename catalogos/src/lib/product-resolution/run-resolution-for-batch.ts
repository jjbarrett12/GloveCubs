/**
 * Run resolution engine for a batch: generate product_resolution_candidates for each normalized row.
 * Call after normalization and family inference.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { resolveRow } from "./resolution-engine";
import { saveMatchDecision, buildDecisionKey } from "./match-decision-service";
import {
  RESOLUTION_AUTO_ATTACH_THRESHOLD,
  RESOLUTION_AUTO_ATTACH_REASONS,
  type NormalizedRowForResolution,
  type ResolutionCandidate,
} from "./types";

export interface RunResolutionForBatchResult {
  batchId: string;
  rowsProcessed: number;
  candidatesCreated: number;
  autoAttachedCount: number;
  errors: string[];
}

function canAutoAttach(best: ResolutionCandidate): boolean {
  if (!best.candidate_product_id) return false;
  if (best.match_type !== "variant" && best.match_type !== "offer" && best.match_type !== "duplicate") return false;
  if (best.confidence < RESOLUTION_AUTO_ATTACH_THRESHOLD) return false;
  const reason = best.reasons[0];
  return reason != null && (RESOLUTION_AUTO_ATTACH_REASONS as readonly string[]).includes(reason);
}

/**
 * Load category_id for the batch (from first normalized row's category or default disposable_gloves).
 */
async function getCategoryIdForBatch(batchId: string): Promise<string> {
  const supabase = getSupabaseCatalogos(true);
  const { data: row } = await supabase
    .from("supplier_products_normalized")
    .select("normalized_data")
    .eq("batch_id", batchId)
    .limit(1)
    .maybeSingle();
  const nd = (row?.normalized_data ?? {}) as Record<string, unknown>;
  const slug = (nd.category_slug ?? nd.category ?? "disposable_gloves") as string;
  const { data: cat } = await supabase.from("categories").select("id").eq("slug", slug).maybeSingle();
  if (cat) return (cat as { id: string }).id;
  const { data: def } = await supabase.from("categories").select("id").eq("slug", "disposable_gloves").single();
  return (def as { id: string }).id;
}

/**
 * Run resolution for all normalized rows in a batch; insert best candidate per row.
 */
export async function runResolutionForBatch(batchId: string): Promise<RunResolutionForBatchResult> {
  const supabase = getSupabaseCatalogos(true);
  const errors: string[] = [];

  const { data: rows, error: fetchErr } = await supabase
    .from("supplier_products_normalized")
    .select("id, batch_id, supplier_id, normalized_data, attributes, inferred_base_sku, inferred_size, family_group_key")
    .eq("batch_id", batchId);

  if (fetchErr) {
    return {
      batchId,
      rowsProcessed: 0,
      candidatesCreated: 0,
      autoAttachedCount: 0,
      errors: [fetchErr.message],
    };
  }

  const list = (rows ?? []) as NormalizedRowForResolution[];
  if (list.length === 0) {
    return {
      batchId,
      rowsProcessed: 0,
      candidatesCreated: 0,
      autoAttachedCount: 0,
      errors: [],
    };
  }

  const categoryId = await getCategoryIdForBatch(batchId);
  let candidatesCreated = 0;
  let autoAttachedCount = 0;

  for (const row of list) {
    try {
      const candidates = await resolveRow(row, categoryId);
      const best = candidates[0];
      if (!best) continue;

      const doAutoAttach = canAutoAttach(best);
      const status = doAutoAttach ? "approved" : "pending";

      const { error: insErr } = await supabase.from("product_resolution_candidates").insert({
        batch_id: batchId,
        normalized_row_id: row.id,
        candidate_family_id: best.candidate_family_id,
        candidate_product_id: best.candidate_product_id,
        match_type: best.match_type,
        confidence: best.confidence,
        reasons_json: best.reasons,
        status,
        ...(doAutoAttach ? { resolved_at: new Date().toISOString() } : {}),
      });

      if (insErr) {
        errors.push(`Row ${row.id}: ${insErr.message}`);
        continue;
      }
      candidatesCreated++;

      if (doAutoAttach && best.candidate_product_id) {
        const sku = (row.normalized_data?.supplier_sku ?? row.normalized_data?.sku ?? "").toString().trim();
        const decisionKey = buildDecisionKey(row.supplier_id, sku);
        await saveMatchDecision({
          supplierId: row.supplier_id,
          decisionKey,
          candidateFamilyId: best.candidate_family_id,
          candidateProductId: best.candidate_product_id,
          matchType: best.match_type,
          decidedBy: "auto_attach",
        });
        await supabase
          .from("supplier_products_normalized")
          .update({
            master_product_id: best.candidate_product_id,
            status: "approved",
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        autoAttachedCount++;
      }
    } catch (e) {
      errors.push(`Row ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    batchId,
    rowsProcessed: list.length,
    candidatesCreated,
    autoAttachedCount,
    errors,
  };
}
