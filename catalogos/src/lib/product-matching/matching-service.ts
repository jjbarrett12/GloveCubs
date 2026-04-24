/**
 * Product Matching Agent — matching service.
 * Loads staged row + masters by category, runs scoring, returns MatchResult with candidate list and duplicate warning.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { flattenV2Metadata } from "@/lib/catalog/v2-master-product";
import { computeMatch } from "./scoring";
import type { NormalizedForMatching } from "./scoring";
import type { MasterForScoring } from "./scoring";
import type { MatchResult } from "./types";
import { findDuplicateCandidates, productIdsInDuplicatePairs } from "./duplicate-detection";

export interface StagedRowForMatching {
  id: string;
  normalized_data: Record<string, unknown>;
  attributes: Record<string, unknown>;
  category_id?: string | null;
}

/**
 * Resolve category_id for a staged row (from normalized_data.category_slug or category_id on row).
 */
async function resolveCategoryId(staged: StagedRowForMatching): Promise<string | null> {
  const slug = (staged.normalized_data?.category_slug as string) ?? (staged.normalized_data?.category as string);
  if (staged.category_id) return staged.category_id as string;
  if (!slug) return null;
  const supabase = getSupabaseCatalogos(true);
  const { data } = await supabase.from("categories").select("id").eq("slug", slug).maybeSingle();
  return (data?.id as string) ?? null;
}

/**
 * Load master products for category (id, name, attributes).
 */
async function loadMastersForCategory(categoryId: string): Promise<MasterForScoring[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, name, metadata")
    .eq("status", "active")
    .contains("metadata", { category_id: categoryId });
  if (error) return [];
  return (data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.name as string) ?? "",
    attributes: flattenV2Metadata((p as { metadata?: unknown }).metadata),
  }));
}

/**
 * Build NormalizedForMatching from staged row.
 */
function toNormalizedForMatching(staged: StagedRowForMatching): NormalizedForMatching {
  const nd = staged.normalized_data ?? {};
  const attrs = (nd.filter_attributes as Record<string, unknown>) ?? staged.attributes ?? {};
  return {
    upc: (nd.upc as string) ?? null,
    name: (nd.canonical_title as string) ?? (nd.name as string) ?? null,
    supplier_sku: (nd.supplier_sku as string) ?? null,
    brand: (nd.brand as string) ?? (attrs.brand as string) ?? null,
    filter_attributes: attrs,
  };
}

/**
 * Run matching for one staged row. Returns MatchResult (suggested_master_id, confidence, reason, candidate_list, duplicate_warning).
 */
export async function matchStagedRow(
  staged: StagedRowForMatching,
  options?: { duplicateProductIds?: Set<string> }
): Promise<MatchResult> {
  const categoryId = await resolveCategoryId(staged);
  if (!categoryId) {
    return {
      suggested_master_product_id: null,
      confidence: 0,
      reason: "no_match",
      candidate_list: [],
      duplicate_warning: false,
      requires_review: true,
    };
  }

  const masters = await loadMastersForCategory(categoryId);
  const duplicatePairs = options?.duplicateProductIds != null
    ? []
    : await findDuplicateCandidates(categoryId);
  const duplicateProductIds = options?.duplicateProductIds ?? productIdsInDuplicatePairs(duplicatePairs);

  const normalized = toNormalizedForMatching(staged);
  const result = computeMatch(normalized, masters, duplicateProductIds);

  return {
    suggested_master_product_id: result.suggested_master_product_id,
    confidence: result.confidence,
    reason: result.reason,
    candidate_list: result.candidate_list,
    duplicate_warning: result.duplicate_warning,
    requires_review: result.requires_review,
  };
}
