/**
 * Match decision memory: lookup and store admin resolution decisions for reuse.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import type { ResolutionMatchType } from "./types";

export interface MatchDecisionRow {
  id: string;
  supplier_id: string;
  decision_key: string;
  candidate_family_id: string | null;
  candidate_product_id: string | null;
  match_type: ResolutionMatchType;
  decided_by: string | null;
  created_at: string;
}

/**
 * Build a stable decision key for a normalized row (supplier + supplier_sku).
 */
export function buildDecisionKey(supplierId: string, supplierSku: string): string {
  const sku = (supplierSku ?? "").trim().toLowerCase();
  return `${supplierId}:${sku}`;
}

/**
 * Look up a prior decision for this supplier + SKU.
 */
export async function getMatchDecision(
  supplierId: string,
  supplierSku: string
): Promise<MatchDecisionRow | null> {
  const key = buildDecisionKey(supplierId, supplierSku);
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("match_decisions")
    .select("*")
    .eq("supplier_id", supplierId)
    .eq("decision_key", key)
    .maybeSingle();
  if (error || !data) return null;
  return data as MatchDecisionRow;
}

/**
 * Store an admin decision for future imports.
 */
export async function saveMatchDecision(params: {
  supplierId: string;
  decisionKey: string;
  candidateFamilyId?: string | null;
  candidateProductId?: string | null;
  matchType: ResolutionMatchType;
  decidedBy?: string | null;
}): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  await supabase.from("match_decisions").upsert(
    {
      supplier_id: params.supplierId,
      decision_key: params.decisionKey,
      candidate_family_id: params.candidateFamilyId ?? null,
      candidate_product_id: params.candidateProductId ?? null,
      match_type: params.matchType,
      decided_by: params.decidedBy ?? null,
    },
    { onConflict: "supplier_id,decision_key" }
  );
}
