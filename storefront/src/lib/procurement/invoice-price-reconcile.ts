/**
 * Invoice line arithmetic: quantity × unit price vs line total.
 */

export const PRICE_ARITHMETIC_REL_TOLERANCE = 0.02;
export const PRICE_ARITHMETIC_ABS_TOLERANCE = 0.05;

export type PriceReconcileResult =
  | { ok: true; expected_line_total: number }
  | { ok: false; code: "PRICE_REVIEW_REQUIRED"; reason: string; expected_line_total: number | null; line_total: number | null };

export function reconcileInvoiceLinePrice(input: {
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
}): PriceReconcileResult {
  const qty = input.quantity;
  const unit = input.unit_price;
  const total = input.line_total;
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, code: "PRICE_REVIEW_REQUIRED", reason: "invalid_quantity", expected_line_total: null, line_total: total };
  }
  if (unit == null || !Number.isFinite(unit) || unit <= 0) {
    return { ok: false, code: "PRICE_REVIEW_REQUIRED", reason: "invalid_unit_price", expected_line_total: null, line_total: total };
  }
  const expected = qty * unit;
  if (total == null || !Number.isFinite(total)) {
    return { ok: true, expected_line_total: expected };
  }
  const abs = Math.abs(expected - total);
  const rel = abs / Math.max(Math.abs(total), Math.abs(expected), 0.01);
  if (abs > PRICE_ARITHMETIC_ABS_TOLERANCE && rel > PRICE_ARITHMETIC_REL_TOLERANCE) {
    return {
      ok: false,
      code: "PRICE_REVIEW_REQUIRED",
      reason: "quantity_times_unit_disagrees_with_line_total",
      expected_line_total: expected,
      line_total: total,
    };
  }
  return { ok: true, expected_line_total: expected };
}
