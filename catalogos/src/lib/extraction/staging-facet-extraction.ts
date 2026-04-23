/**
 * Persist merged facet proposals on supplier_products_normalized for the publish path.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { applyFacetExtractionToNormalizedDataRecord } from "./staging-facet-merge";
import { extractFacetsV1 } from "./extract-facets-v1";
import { rawInputFromNormalizedData } from "./staging-facet-merge";

export { applyFacetExtractionToNormalizedDataRecord, rawInputFromNormalizedData } from "./staging-facet-merge";

export async function persistFacetExtractionForNormalizedRow(
  supabase: SupabaseClient,
  normalizedId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { data, error } = await supabase
    .from("supplier_products_normalized")
    .select("normalized_data")
    .eq("id", normalizedId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Not found" };
  const nd = (data.normalized_data as Record<string, unknown>) ?? {};
  const next = applyFacetExtractionToNormalizedDataRecord(nd);
  const attrs = (next.filter_attributes as Record<string, unknown>) ?? {};
  const { error: uerr } = await supabase
    .from("supplier_products_normalized")
    .update({
      normalized_data: next,
      attributes: attrs,
      updated_at: new Date().toISOString(),
    })
    .eq("id", normalizedId);
  if (uerr) return { success: false, error: uerr.message };
  return { success: true };
}

/** Re-run extraction in-memory (no DB). */
export function previewFacetExtractionForNormalizedData(nd: Record<string, unknown>) {
  return extractFacetsV1(rawInputFromNormalizedData(nd));
}
