/**
 * Deterministic glove price normalization (Phase 5).
 * `unit_price` = price per one invoice line quantity unit (same semantics as gc_commerce.invoice_lines / price_observations).
 * `units_per_line_uom` = comparable units (e.g. individual gloves) represented by quantity = 1 on the line.
 */

export const GLOVE_BASIS_PER_100 = "per_100_gloves" as const;

export type GlovePriceBasisId = typeof GLOVE_BASIS_PER_100;

export type NormalizeGlovePriceBasisInput = {
  /** Price per one line quantity unit (e.g. per box). */
  unitPrice: number;
  /** Comparable units (e.g. gloves) per line quantity unit of 1. */
  unitsPerLineUom: number;
  basis: GlovePriceBasisId;
};

export type NormalizeGlovePriceBasisResult =
  | { ok: true; normalizedUnitPrice: number; basis_uom: string }
  | { ok: false; reason: string };

/**
 * Normalizes to price per 100 comparable units (e.g. gloves).
 * Hard-blocks invalid or non-finite inputs — never silently compares incompatible bases.
 */
export function normalizeGlovePriceBasis(input: NormalizeGlovePriceBasisInput): NormalizeGlovePriceBasisResult {
  const { unitPrice, unitsPerLineUom, basis } = input;
  if (!Number.isFinite(unitPrice) || !Number.isFinite(unitsPerLineUom)) {
    return { ok: false, reason: "non_finite_input" };
  }
  if (unitPrice <= 0) {
    return { ok: false, reason: "invalid_unit_price" };
  }
  if (unitsPerLineUom <= 0) {
    return { ok: false, reason: "invalid_units_per_line_uom" };
  }
  if (basis !== GLOVE_BASIS_PER_100) {
    return { ok: false, reason: "unsupported_basis" };
  }
  const perUnit = unitPrice / unitsPerLineUom;
  const per100 = perUnit * 100;
  if (!Number.isFinite(per100)) {
    return { ok: false, reason: "normalization_overflow" };
  }
  return { ok: true, normalizedUnitPrice: per100, basis_uom: basis };
}
