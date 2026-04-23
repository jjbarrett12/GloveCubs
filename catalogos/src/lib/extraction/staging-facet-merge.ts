/**
 * Merge extractFacetsV1 proposals into staging filter_attributes (non-destructive for operator-set keys).
 */

import { extractFacetsV1, FACET_PARSER_VERSION, type RawProductInput } from "./extract-facets-v1";

export function rawInputFromNormalizedData(nd: Record<string, unknown>): RawProductInput {
  return {
    category_slug: String(nd.category_slug ?? nd.category ?? "").trim(),
    sku: (nd.supplier_sku ?? nd.sku) as string | null | undefined,
    name: (nd.name ?? nd.canonical_title) as string | null | undefined,
    brand: nd.brand as string | null | undefined,
    description: typeof nd.description === "string" ? nd.description : null,
    specs_text: typeof nd.specs_text === "string" ? nd.specs_text : null,
    source_kind: nd.quick_add ? "quick_add" : nd.csv_bulk_needs_review ? "csv_bulk" : "staging_edit",
  };
}

export function isEmptyStagingValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

export type FacetMergeSkipReason = "below_threshold" | "already_set";

export interface FacetSuggestedNotApplied {
  key: string;
  reason: FacetMergeSkipReason;
  value: unknown;
}

export interface MergeProposalsResult {
  merged: Record<string, unknown>;
  /** Keys written into `merged` from `proposed` on this pass (confidence + empty slot). */
  applied_keys: string[];
  /** Proposed values that were not merged, with an explicit reason (honesty for UI). */
  suggested_not_applied: FacetSuggestedNotApplied[];
}

export function mergeProposalsIntoFilterAttributes(
  current: Record<string, unknown>,
  proposed: Record<string, unknown>,
  confidenceByKey: Record<string, number>
): MergeProposalsResult {
  const out = { ...current };
  const applied_keys: string[] = [];
  const suggested_not_applied: FacetSuggestedNotApplied[] = [];
  const TH_DEFAULT = 0.9;
  const TH_BRAND = 0.85;
  for (const [key, val] of Object.entries(proposed)) {
    if (val === undefined || val === null || val === "") continue;
    const c = confidenceByKey[key] ?? 0;
    const min = key === "brand" ? TH_BRAND : TH_DEFAULT;
    if (c < min) {
      suggested_not_applied.push({ key, reason: "below_threshold", value: val });
      continue;
    }
    if (!isEmptyStagingValue(out[key])) {
      suggested_not_applied.push({ key, reason: "already_set", value: val });
      continue;
    }
    out[key] = val;
    applied_keys.push(key);
  }
  return { merged: out, applied_keys, suggested_not_applied };
}

/**
 * After manual merchandising edits, clear extraction UI state so Quick Add does not show
 * stale applied/suggested sections (Option A — no re-parse on attribute-only save).
 */
export function stripFacetExtractionUiState(nd: Record<string, unknown>): Record<string, unknown> {
  const { proposed_facets, facet_parse_meta: rawMeta, ...rest } = nd;
  void proposed_facets;
  const prev = rawMeta && typeof rawMeta === "object" ? { ...(rawMeta as Record<string, unknown>) } : {};
  return {
    ...rest,
    facet_parse_meta: {
      ...prev,
      applied_keys: [],
      suggested_not_applied: [],
      issues: [],
    },
  };
}

export function applyFacetExtractionToNormalizedDataRecord(nd: Record<string, unknown>): Record<string, unknown> {
  const raw = rawInputFromNormalizedData(nd);
  const { proposed, issues, confidenceByKey } = extractFacetsV1(raw);
  const prevFilter = (nd.filter_attributes as Record<string, unknown>) ?? {};
  const { merged, applied_keys, suggested_not_applied } = mergeProposalsIntoFilterAttributes(
    prevFilter,
    proposed,
    confidenceByKey
  );
  return {
    ...nd,
    filter_attributes: merged,
    proposed_facets: proposed,
    facet_parse_meta: {
      issues,
      confidenceByKey,
      parser_version: FACET_PARSER_VERSION,
      applied_keys,
      suggested_not_applied,
    },
  };
}
