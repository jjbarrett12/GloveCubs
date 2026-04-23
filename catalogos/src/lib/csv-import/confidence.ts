/**
 * Confidence summary for preview: per-field and row-level low-confidence flags.
 */

import type { ConfidenceSummary } from "./types";
import type { FieldMappingItem } from "./types";
import type { ParsedRow } from "@/lib/ingestion/types";
import { transformRow } from "./transform";

const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Build confidence summary from mapping and (optionally) sample transformed rows.
 */
export function buildConfidenceSummary(
  mappings: FieldMappingItem[],
  sampleRows?: Record<string, unknown>[],
  lowThreshold = DEFAULT_LOW_CONFIDENCE_THRESHOLD
): ConfidenceSummary {
  const per_field: Record<string, number> = {};
  for (const m of mappings) {
    per_field[m.source_column] = m.confidence;
  }
  const confidences = mappings.map((m) => m.confidence);
  const average = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
  const low_confidence_fields = mappings.filter((m) => m.confidence < lowThreshold).map((m) => m.source_column);

  let rows_below_threshold = 0;
  if (sampleRows && sampleRows.length > 0) {
    const transformed = sampleRows.map((r) => transformRow(r, mappings));
    rows_below_threshold = countRowsWithLowConfidence(transformed, mappings, lowThreshold);
  }

  return {
    average,
    per_field,
    low_confidence_fields,
    rows_below_threshold,
  };
}

/**
 * Count rows where any mapped value is missing or would be low-confidence.
 * Simplified: count rows missing a key required field (name/sku).
 */
function countRowsWithLowConfidence(
  rows: ParsedRow[],
  mappings: FieldMappingItem[],
  _lowThreshold: number
): number {
  let count = 0;
  const hasSku = mappings.some((m) => ["sku", "supplier_sku", "item", "item_number", "id"].includes(m.mapped_field));
  const hasName = mappings.some((m) => ["name", "product_name", "title"].includes(m.mapped_field));
  for (const row of rows) {
    const sku = row.sku ?? row.supplier_sku ?? row.item ?? row.item_number ?? row.id;
    const name = row.name ?? row.product_name ?? row.title;
    if ((hasSku && !sku) || (hasName && !name)) count++;
  }
  return count;
}
