/**
 * Data layer: load resolution candidates for review; approve/reject and persist decisions.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { saveMatchDecision, buildDecisionKey } from "./match-decision-service";
import { upsertPattern } from "./sku-pattern-service";
import type { ResolutionMatchType } from "./types";
import { RESOLUTION_REASONS } from "./types";

const LEARN_PATTERN_MIN_CONFIDENCE = 0.88;
const LEARN_PATTERN_REASONS = [
  RESOLUTION_REASONS.FAMILY_BASE_SKU_AND_SIZE,
  RESOLUTION_REASONS.SKU_PATTERN_FAMILY_AND_SIZE,
  RESOLUTION_REASONS.FAMILY_BASE_SKU,
  RESOLUTION_REASONS.SKU_PATTERN_FAMILY,
];

export interface ResolutionCandidateRow {
  id: string;
  normalized_row_id: string;
  candidate_family_id: string | null;
  candidate_product_id: string | null;
  match_type: ResolutionMatchType;
  confidence: number;
  reasons_json: string[];
  status: string;
}

export async function getResolutionCandidatesForNormalizedRow(
  normalizedRowId: string
): Promise<ResolutionCandidateRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("product_resolution_candidates")
    .select("id, normalized_row_id, candidate_family_id, candidate_product_id, match_type, confidence, reasons_json, status")
    .eq("normalized_row_id", normalizedRowId)
    .order("confidence", { ascending: false });
  if (error) return [];
  return (data ?? []).map((r) => ({
    ...r,
    reasons_json: Array.isArray(r.reasons_json) ? r.reasons_json : [],
  })) as ResolutionCandidateRow[];
}

/**
 * Approve a resolution candidate: store in match_decisions and update normalized row's master_product_id when candidate is variant/offer.
 */
export async function approveResolutionCandidate(
  candidateId: string,
  options: { decidedBy?: string } = {}
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseCatalogos(true);
  const { data: candidate, error: candErr } = await supabase
    .from("product_resolution_candidates")
    .select("id, normalized_row_id, batch_id, candidate_family_id, candidate_product_id, match_type, status, confidence, reasons_json")
    .eq("id", candidateId)
    .single();
  if (candErr || !candidate) {
    return { success: false, error: "Candidate not found" };
  }
  const c = candidate as {
    id: string;
    normalized_row_id: string;
    batch_id: string;
    candidate_family_id: string | null;
    candidate_product_id: string | null;
    match_type: ResolutionMatchType;
    status: string;
    confidence: number;
    reasons_json: string[];
  };
  if (c.status !== "pending") {
    return { success: false, error: "Candidate already resolved" };
  }

  const { data: normRow } = await supabase
    .from("supplier_products_normalized")
    .select("id, supplier_id, normalized_data, inferred_base_sku, inferred_size")
    .eq("id", c.normalized_row_id)
    .single();
  if (!normRow) return { success: false, error: "Normalized row not found" };
  const supplierId = (normRow as { supplier_id: string }).supplier_id;
  const nd = (normRow as { normalized_data?: Record<string, unknown> }).normalized_data ?? {};
  const supplierSku = (nd.supplier_sku ?? nd.sku ?? "").toString().trim();
  const decisionKey = buildDecisionKey(supplierId, supplierSku);

  await saveMatchDecision({
    supplierId,
    decisionKey,
    candidateFamilyId: c.candidate_family_id,
    candidateProductId: c.candidate_product_id,
    matchType: c.match_type,
    decidedBy: options.decidedBy ?? null,
  });

  const productId = c.candidate_product_id;
  if (productId && (c.match_type === "variant" || c.match_type === "offer" || c.match_type === "duplicate")) {
    await supabase
      .from("supplier_products_normalized")
      .update({
        master_product_id: productId,
        status: "approved",
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", c.normalized_row_id);
  }

  await supabase
    .from("product_resolution_candidates")
    .update({
      status: "approved",
      resolved_at: new Date().toISOString(),
      resolved_by: options.decidedBy ?? null,
    })
    .eq("id", candidateId);

  const conf = c.confidence ?? 0;
  const reasons = Array.isArray(c.reasons_json) ? c.reasons_json : [];
  const baseSku = (normRow as { inferred_base_sku?: string | null }).inferred_base_sku?.trim();
  const inferredSize = (normRow as { inferred_size?: string | null }).inferred_size?.trim();
  if (
    conf >= LEARN_PATTERN_MIN_CONFIDENCE &&
    baseSku &&
    (c.candidate_family_id != null || c.candidate_product_id != null) &&
    LEARN_PATTERN_REASONS.some((r) => reasons.includes(r))
  ) {
    const suffixValues = inferredSize ? [inferredSize] : [];
    upsertPattern({
      supplierId,
      baseSkuPattern: baseSku,
      suffixType: "size",
      suffixValues,
      exampleSku: supplierSku || undefined,
    }).catch(() => {});
  }

  return { success: true };
}

/**
 * Reject a resolution candidate (mark as new product or leave for manual resolution).
 */
export async function rejectResolutionCandidate(
  candidateId: string,
  options: { decidedBy?: string } = {}
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseCatalogos(true);
  const { data: candidate, error: candErr } = await supabase
    .from("product_resolution_candidates")
    .select("id, status")
    .eq("id", candidateId)
    .single();
  if (candErr || !candidate) return { success: false, error: "Candidate not found" };
  if ((candidate as { status: string }).status !== "pending") {
    return { success: false, error: "Candidate already resolved" };
  }
  await supabase
    .from("product_resolution_candidates")
    .update({
      status: "rejected",
      resolved_at: new Date().toISOString(),
      resolved_by: options.decidedBy ?? null,
    })
    .eq("id", candidateId);
  return { success: true };
}
