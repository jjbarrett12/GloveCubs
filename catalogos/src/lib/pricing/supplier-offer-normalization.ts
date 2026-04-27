/**
 * Derives normalized unit cost fields for catalogos.supplier_offers (USD minor units).
 * Uses only offer-level numeric fields — never catalog_v2.metadata for money.
 */

export const ALLOWED_SUPPLIER_OFFER_CURRENCY = "USD" as const;

export const SUPPLIER_OFFER_COST_BASES = ["per_case", "per_each", "per_pair"] as const;
export type SupplierOfferCostBasis = (typeof SUPPLIER_OFFER_COST_BASES)[number];

export type SupplierOfferNormalizationConfidence = "high" | "medium" | "low";

export type SupplierOfferNormalizationNote = { code: string; detail: string };

export function assertSupplierOfferCurrencyUsdOnly(currency_code: string): void {
  if (currency_code !== ALLOWED_SUPPLIER_OFFER_CURRENCY) {
    throw new Error(
      `currency_code must be ${ALLOWED_SUPPLIER_OFFER_CURRENCY} until multi-currency is supported (got ${currency_code})`
    );
  }
}

/**
 * Backfill-aligned logic when cost_basis is per_case: derive per-each cost in USD minor units from case cost.
 */
export function derivePerCaseUnitNormalization(args: {
  cost: number;
  units_per_case: number | null | undefined;
}): {
  pack_qty: number | null;
  normalized_unit_cost_minor: number | null;
  normalized_unit_uom: string | null;
  normalization_confidence: SupplierOfferNormalizationConfidence;
  normalization_notes: SupplierOfferNormalizationNote[];
} {
  const units = args.units_per_case;
  const cost = args.cost;
  if (units != null && units > 0 && Number.isFinite(cost)) {
    const normalized_unit_cost_minor = Math.round((cost * 100) / units);
    return {
      pack_qty: units,
      normalized_unit_cost_minor,
      normalized_unit_uom: "each",
      normalization_confidence: "medium",
      normalization_notes: [
        {
          code: "assumed_cost_per_case",
          detail:
            "Backfill: cost interpreted as USD per case; pack_qty from units_per_case; normalized_unit_cost_minor = round(cost*100/units_per_case) cents per each.",
        },
      ],
    };
  }
  return {
    pack_qty: null,
    normalized_unit_cost_minor: null,
    normalized_unit_uom: null,
    normalization_confidence: "low",
    normalization_notes: [
      {
        code: "missing_units_per_case",
        detail:
          "Backfill: cost_basis is per_case but units_per_case is null or not positive; normalized unit cost not derived.",
      },
    ],
  };
}
