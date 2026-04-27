/**
 * Single source of truth for catalogos.supplier_offers pricing normalization (USD).
 * Used by CatalogOS publish, ingestion offers, supplier portal feed commit, and storefront offer CRUD.
 * Does not read catalog_v2.metadata for money.
 */

export const ALLOWED_SUPPLIER_OFFER_CURRENCY = "USD" as const;

export const SUPPLIER_OFFER_COST_BASES = ["per_case", "per_each", "per_pair"] as const;
export type SupplierOfferCostBasis = (typeof SUPPLIER_OFFER_COST_BASES)[number];

export type SupplierOfferNormalizationConfidence = "high" | "medium" | "low";

export type SupplierOfferNormalizationNote = { code: string; detail: string };

export type SupplierOfferNormalizationPayload = {
  currency_code: typeof ALLOWED_SUPPLIER_OFFER_CURRENCY;
  cost_basis: SupplierOfferCostBasis;
  pack_qty: number | null;
  normalized_unit_cost_minor: number | null;
  normalized_unit_uom: string | null;
  normalization_confidence: SupplierOfferNormalizationConfidence;
  normalization_notes: SupplierOfferNormalizationNote[];
};

export type NormalizeSupplierOfferPricingInput = {
  currency_code: string;
  cost_basis: SupplierOfferCostBasis;
  cost: number;
  units_per_case?: number | null;
};

export const SUPPLIER_OFFER_NORMALIZATION_WRITE_KEYS = [
  "currency_code",
  "cost_basis",
  "pack_qty",
  "normalized_unit_cost_minor",
  "normalized_unit_uom",
  "normalization_confidence",
  "normalization_notes",
] as const;

export function parseSupplierOfferCostBasis(value: string | null | undefined): SupplierOfferCostBasis {
  if (value == null || String(value).trim() === "") {
    throw new Error("supplier_offers cost_basis is required (stored value missing)");
  }
  const v = String(value);
  if (!SUPPLIER_OFFER_COST_BASES.includes(v as SupplierOfferCostBasis)) {
    throw new Error(`Invalid supplier_offers cost_basis: ${value}`);
  }
  return v as SupplierOfferCostBasis;
}

export function assertSupplierOfferCurrencyUsdOnly(currency_code: string): void {
  if (currency_code !== ALLOWED_SUPPLIER_OFFER_CURRENCY) {
    throw new Error(
      `currency_code must be ${ALLOWED_SUPPLIER_OFFER_CURRENCY} until multi-currency is supported (got ${currency_code})`
    );
  }
}

/** Pack size from staging normalized_data / attributes only (not catalog_v2.metadata). */
export function unitsPerCaseFromStagingNormalizedContent(
  content: Record<string, unknown>,
  attributes: Record<string, unknown>
): number | null | undefined {
  const u =
    content.units_per_case ??
    content.case_qty ??
    content.pack_size_normalized ??
    attributes.case_qty ??
    (attributes as { case_qty?: unknown }).case_qty;
  if (u == null) return undefined;
  const n = Number(u);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.trunc(n);
}

/** Maps pricing.sell_unit from staging to supplier_offers.cost_basis. */
export function costBasisFromSellUnit(sellUnit: string | undefined): SupplierOfferCostBasis {
  const s = String(sellUnit ?? "case").toLowerCase();
  if (s === "each") return "per_each";
  return "per_case";
}

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
            "cost interpreted as USD per case; pack_qty from units_per_case; normalized_unit_cost_minor = round(cost*100/units_per_case) cents per each.",
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
          "cost_basis is per_case but units_per_case is null or not positive; normalized unit cost not derived.",
      },
    ],
  };
}

/**
 * Computes all seven normalization columns for a supplier_offers upsert/update.
 * Callers must merge this object into every write payload.
 */
export function normalizeSupplierOfferPricing(input: NormalizeSupplierOfferPricingInput): SupplierOfferNormalizationPayload {
  assertSupplierOfferCurrencyUsdOnly(input.currency_code);
  if (!SUPPLIER_OFFER_COST_BASES.includes(input.cost_basis)) {
    throw new Error(`Invalid cost_basis: ${String(input.cost_basis)}`);
  }
  const cost = input.cost;
  if (!Number.isFinite(cost)) {
    throw new Error("cost must be a finite number");
  }

  switch (input.cost_basis) {
    case "per_case": {
      const d = derivePerCaseUnitNormalization({ cost, units_per_case: input.units_per_case });
      return {
        currency_code: ALLOWED_SUPPLIER_OFFER_CURRENCY,
        cost_basis: "per_case",
        pack_qty: d.pack_qty,
        normalized_unit_cost_minor: d.normalized_unit_cost_minor,
        normalized_unit_uom: d.normalized_unit_uom,
        normalization_confidence: d.normalization_confidence,
        normalization_notes: d.normalization_notes,
      };
    }
    case "per_each": {
      return {
        currency_code: ALLOWED_SUPPLIER_OFFER_CURRENCY,
        cost_basis: "per_each",
        pack_qty: null,
        normalized_unit_cost_minor: Math.round(cost * 100),
        normalized_unit_uom: "each",
        normalization_confidence: "high",
        normalization_notes: [
          {
            code: "cost_basis_per_each",
            detail: "Cost quoted per each; normalized_unit_cost_minor = round(cost*100) USD cents.",
          },
        ],
      };
    }
    case "per_pair": {
      return {
        currency_code: ALLOWED_SUPPLIER_OFFER_CURRENCY,
        cost_basis: "per_pair",
        pack_qty: 2,
        normalized_unit_cost_minor: Math.round((cost * 100) / 2),
        normalized_unit_uom: "each",
        normalization_confidence: "high",
        normalization_notes: [
          {
            code: "cost_basis_per_pair",
            detail: "Cost quoted per pair; normalized to each via round(cost*100/2) USD cents.",
          },
        ],
      };
    }
    default: {
      const _x: never = input.cost_basis;
      throw new Error(`Unhandled cost_basis: ${String(_x)}`);
    }
  }
}

export function assertSupplierOfferWritePayloadHasNormalization(row: Record<string, unknown>): void {
  for (const k of SUPPLIER_OFFER_NORMALIZATION_WRITE_KEYS) {
    if (!(k in row)) {
      throw new Error(`supplier_offers write missing required field: ${k}`);
    }
  }
  if (!Array.isArray(row.normalization_notes)) {
    throw new Error("supplier_offers write: normalization_notes must be a JSON array");
  }
}

/**
 * Merges base offer fields with normalization output and validates completeness.
 */
export function buildSupplierOfferUpsertRow(
  base: Record<string, unknown>,
  pricingInput: NormalizeSupplierOfferPricingInput
): Record<string, unknown> {
  const norm = normalizeSupplierOfferPricing(pricingInput);
  const row = {
    ...base,
    ...norm,
    normalization_notes: norm.normalization_notes,
  };
  assertSupplierOfferWritePayloadHasNormalization(row);
  return row;
}
