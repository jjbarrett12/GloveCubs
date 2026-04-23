/**
 * Pass-through fields from mapped CSV rows into normalized_data JSONB
 * (UOM, pack, category guess) without requiring full normalization-engine changes.
 */

import type { ParsedRow } from "./types";

function firstStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return undefined;
}

export interface SupplierImportHints {
  uom?: string;
  pack_size?: string;
  category_guess?: string;
}

/**
 * Extract supplier-facing hints from a standardized ParsedRow (post–column mapping).
 */
export function extractSupplierImportHints(row: ParsedRow): SupplierImportHints {
  const uom = firstStr(
    row.uom,
    row.unit_of_measure,
    row.unit,
    row.sell_uom,
    row.um
  );
  const pack_size = firstStr(
    row.pack_size,
    row.pack_qty,
    row.case_pack,
    row.packs_per_case,
    row.qty_per_case
  );
  const category_guess = firstStr(
    row.category_guess,
    row.product_category,
    row.category,
    row.family
  );
  const out: SupplierImportHints = {};
  if (uom) out.uom = uom;
  if (pack_size) out.pack_size = pack_size;
  if (category_guess) out.category_guess = category_guess;
  return out;
}
