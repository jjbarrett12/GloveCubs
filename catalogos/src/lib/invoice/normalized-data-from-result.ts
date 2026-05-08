/**
 * Maps normalization engine output to MatchInput.normalized shape.
 * Duplicated from ingestion-chunk-runner (not exported there) — single source for invoice resolve.
 */

import type { NormalizedData } from "@/lib/ingestion/types";
import type { NormalizedProductContent } from "@/lib/catalogos/attribute-dictionary-types";

export function normalizedDataFromInvoiceNormalization(result: {
  content: NormalizedProductContent;
  filter_attributes: Record<string, unknown>;
}): NormalizedData {
  const c = result.content;
  return {
    name: c.canonical_title,
    sku: c.supplier_sku,
    brand: c.brand,
    description: c.long_description ?? c.short_description,
    upc: c.upc,
    image_url: Array.isArray(c.images) && c.images.length > 0 ? c.images[0] : undefined,
    cost: c.supplier_cost,
    attributes: result.filter_attributes as NormalizedData["attributes"],
  };
}
