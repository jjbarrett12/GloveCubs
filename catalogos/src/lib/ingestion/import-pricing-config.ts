/**
 * Supplier-import auto pricing: shipping per category, fee on supplier_cost, fixed tier divisors.
 * Override shipping amounts via IMPORT_SHIPPING_* env vars (USD per unit).
 */

export const IMPORT_PRICING_RULE_VERSION = "2026-03-31-v2";

/** Gross margin floor for manual overrides: effective price >= landed / (1 - MIN_GROSS_MARGIN). */
export const IMPORT_MIN_GROSS_MARGIN = 0.2;

export interface ImportCategoryShippingRates {
  nitrileExam: number;
  vinylExam: number;
  latexExam: number;
  poly: number;
  reusableLight: number;
  reusableHeavy: number;
  cutResistant: number;
  chemical: number;
  defaultRate: number;
}

export interface ImportPricingRuntimeConfig {
  shipping: ImportCategoryShippingRates;
  /** payment_fee_estimate = supplier_cost * paymentFeeRate */
  paymentFeeRate: number;
  /** list_price = tier_d_price * listPriceMultiplier */
  listPriceMultiplier: number;
  tierDivisorA: number;
  tierDivisorB: number;
  tierDivisorC: number;
  tierDivisorD: number;
}

function envFloat(key: string, fallback: number): number {
  const v = process.env[key];
  if (v == null || v === "") return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Load effective config (once per batch / process is typical).
 */
export function loadImportPricingConfig(): ImportPricingRuntimeConfig {
  return {
    shipping: {
      nitrileExam: envFloat("IMPORT_SHIPPING_NITRILE_EXAM", 0.7),
      vinylExam: envFloat("IMPORT_SHIPPING_VINYL_EXAM", 0.65),
      latexExam: envFloat("IMPORT_SHIPPING_LATEX_EXAM", 0.7),
      poly: envFloat("IMPORT_SHIPPING_POLY", 0.4),
      reusableLight: envFloat("IMPORT_SHIPPING_REUSABLE_LIGHT", 0.5),
      reusableHeavy: envFloat("IMPORT_SHIPPING_REUSABLE_HEAVY", 0.8),
      cutResistant: envFloat("IMPORT_SHIPPING_CUT_RESISTANT", 0.75),
      chemical: envFloat("IMPORT_SHIPPING_CHEMICAL", 0.85),
      defaultRate: envFloat("IMPORT_SHIPPING_DEFAULT", 0.65),
    },
    paymentFeeRate: envFloat("IMPORT_PAYMENT_FEE_RATE", 0.03),
    listPriceMultiplier: envFloat("IMPORT_LIST_PRICE_MULTIPLIER", 1.15),
    tierDivisorA: envFloat("IMPORT_TIER_DIVISOR_A", 0.8),
    tierDivisorB: envFloat("IMPORT_TIER_DIVISOR_B", 0.75),
    tierDivisorC: envFloat("IMPORT_TIER_DIVISOR_C", 0.7),
    tierDivisorD: envFloat("IMPORT_TIER_DIVISOR_D", 0.65),
  };
}
