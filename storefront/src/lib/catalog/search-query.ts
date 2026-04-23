/**
 * Search query normalization + token classification (product-line aware).
 */

import {
  DEFAULT_PRODUCT_LINE_CODE,
  getSearchFacetsForProductLine,
  GLOBAL_SEARCH_SYNONYMS,
} from "./product-line-registry";

/**
 * Normalize free-text search (lowercase, spacing, global synonyms).
 * Optional line-specific pluralization: e.g. gloves → glove for hand-protection line only.
 */
export function normalizeSearchQuery(query: string, productLineCode?: string | null): string {
  let normalized = query.toLowerCase().trim().replace(/\s+/g, " ");

  const line = productLineCode || DEFAULT_PRODUCT_LINE_CODE;
  if (line === "ppe_gloves") {
    normalized = normalized.replace(/\bgloves\b/g, "glove");
  }

  for (const [abbrev, full] of Object.entries(GLOBAL_SEARCH_SYNONYMS)) {
    if (normalized.includes(abbrev)) {
      normalized = normalized.replace(new RegExp(`\\b${abbrev.replace(/ /g, "\\s+")}\\b`, "g"), full);
    }
  }

  return normalized;
}

export interface ParsedSearchTokens {
  terms: string[];
  materials: string[];
  sizes: string[];
  types: string[];
}

/**
 * Classify tokens using the facet vocabulary for the given product line.
 * When line is unknown, only `terms` are populated from split (no material/size/type buckets).
 */
export function parseSearchTokens(query: string, productLineCode?: string | null): ParsedSearchTokens {
  const normalized = normalizeSearchQuery(query, productLineCode);
  const tokens = normalized.split(" ").filter((t) => t.length > 1);
  const facets = getSearchFacetsForProductLine(productLineCode);

  return {
    terms: tokens,
    materials: tokens.filter((t) => facets.materials.some((m) => t.includes(m))),
    sizes: tokens.filter((t) => facets.sizes.some((s) => t.includes(s))),
    types: tokens.filter((t) => facets.productTypes.some((tp) => t.includes(tp))),
  };
}
