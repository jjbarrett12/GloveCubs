/**
 * Stable per-row key for raw ingestion (idempotency within a batch + dedupe UX).
 * Keep pure for unit tests; DB uniqueness is still authoritative.
 */

import type { ParsedRow } from "./types";

/**
 * Derive external_id from the first non-empty identifier on the row, else synthetic `row_{index}`.
 */
export function deriveExternalIdForParsedRow(row: ParsedRow, index: number): string {
  const id =
    row.supplier_sku ??
    row.sku ??
    row.id ??
    row.item_number ??
    row.product_id ??
    row.item ??
    index;
  const s = String(id).trim();
  return s || `row_${index}`;
}
