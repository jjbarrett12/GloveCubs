/**
 * Authoritative invoice savings formulas. Backend only — do not duplicate in React.
 * Savings is null unless every gate in `assertSavingsPermitted` passes.
 */

export type SavingsBlockReason =
  | "unknown_uom"
  | "unknown_packaging"
  | "candidate_only_substitute"
  | "material_incompatible"
  | "grade_incompatible"
  | "compatibility_blocked"
  | "missing_authoritative_sell_price"
  | "supplier_cost_used_as_sell_price"
  | "price_normalization_failed"
  | "price_arithmetic_conflict"
  | "equivalency_not_approved";

export type NormalizedGlovePrices = {
  per_glove: number;
  per_100: number;
  per_1000: number;
  per_case: number | null;
};

export type GovernedSavings = {
  current: NormalizedGlovePrices;
  glovecubs: NormalizedGlovePrices;
  dollar_savings_per_1000: number;
  percent_savings: number;
  invoice_dollar_savings: number | null;
  invoice_glove_count: number | null;
};

export function normalizePricesFromPurchasedUnit(input: {
  unitPrice: number;
  glovesPerPurchasedUnit: number;
  glovesPerCase?: number | null;
}): { ok: true; prices: NormalizedGlovePrices } | { ok: false; reason: string } {
  const { unitPrice, glovesPerPurchasedUnit } = input;
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return { ok: false, reason: "invalid_unit_price" };
  if (!Number.isFinite(glovesPerPurchasedUnit) || glovesPerPurchasedUnit <= 0) {
    return { ok: false, reason: "invalid_gloves_per_purchased_unit" };
  }
  const perGlove = unitPrice / glovesPerPurchasedUnit;
  if (!Number.isFinite(perGlove) || perGlove <= 0) return { ok: false, reason: "normalization_overflow" };
  const glovesPerCase =
    input.glovesPerCase != null && Number.isFinite(input.glovesPerCase) && input.glovesPerCase > 0
      ? input.glovesPerCase
      : null;
  return {
    ok: true,
    prices: {
      per_glove: perGlove,
      per_100: perGlove * 100,
      per_1000: perGlove * 1000,
      per_case: glovesPerCase != null ? perGlove * glovesPerCase : null,
    },
  };
}

export function computeGovernedSavings(input: {
  current: NormalizedGlovePrices;
  glovecubs: NormalizedGlovePrices;
  invoiceQuantity?: number | null;
  glovesPerPurchasedUnit?: number | null;
}): GovernedSavings {
  const dollar_savings_per_1000 = input.current.per_1000 - input.glovecubs.per_1000;
  const percent_savings =
    input.current.per_1000 > 0 ? (dollar_savings_per_1000 / input.current.per_1000) * 100 : 0;
  let invoice_dollar_savings: number | null = null;
  let invoice_glove_count: number | null = null;
  const qty = input.invoiceQuantity;
  const per = input.glovesPerPurchasedUnit;
  if (qty != null && per != null && Number.isFinite(qty) && qty > 0 && Number.isFinite(per) && per > 0) {
    invoice_glove_count = qty * per;
    invoice_dollar_savings = (input.current.per_glove - input.glovecubs.per_glove) * invoice_glove_count;
  }
  return {
    current: input.current,
    glovecubs: input.glovecubs,
    dollar_savings_per_1000,
    percent_savings,
    invoice_dollar_savings,
    invoice_glove_count,
  };
}

export function sellPriceLooksLikeCost(source: string | null | undefined): boolean {
  const s = String(source ?? "").toLowerCase();
  return s.includes("cost") && !s.includes("sell");
}
