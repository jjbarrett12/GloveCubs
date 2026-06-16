import type { CommercePackagingV1, SellUnit, UnitNoun } from "@commerce-packaging/types";
import { COMMERCE_PACKAGING_SCHEMA_VERSION } from "@commerce-packaging/types";
import {
  resolveCaseUnitPricing,
  resolveEffectiveCasePriceFromPackaging,
  resolveEffectivePalletPriceFromPackaging,
  resolvePalletUnitPricing,
  type CommerceUnitPricing,
} from "@commerce-packaging/pricing";

export type { CommerceUnitPricing };

export type PdpCommercePackaging = {
  sellByCaseEnabled: boolean;
  sellByPalletEnabled: boolean;
  casePrice: number | null;
  caseListPrice: number | null;
  caseOnSale: boolean;
  palletPrice: number | null;
  palletListPrice: number | null;
  palletOnSale: boolean;
  unitsPerCase: number | null;
  casesPerPallet: number | null;
  unitsPerPallet: number | null;
  unitNoun: UnitNoun;
  caseLabel: string | null;
  palletLabel: string | null;
  /** Pallet toggle enabled when price + cases_per_pallet are configured. */
  palletBuyingEnabled: boolean;
};

export type StoreProductCommerceDisplay = {
  casePrice: number | null;
  caseListPrice: number | null;
  caseOnSale: boolean;
  unitsPerCase: number | null;
  unitNoun: UnitNoun;
  palletPricingAvailable: boolean;
  palletPrice: number | null;
  palletListPrice: number | null;
  palletOnSale: boolean;
  caseLabel: string | null;
  palletLabel: string | null;
};

function finitePositive(n: unknown): number | null {
  if (n == null) return null;
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return null;
  return x;
}

function parseCommercePackaging(raw: unknown): CommercePackagingV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== COMMERCE_PACKAGING_SCHEMA_VERSION) return null;
  return o as CommercePackagingV1;
}

function unitNounFromMeta(
  cp: CommercePackagingV1 | null,
  meta: Record<string, unknown> | null
): UnitNoun {
  if (cp?.unit_noun) return cp.unit_noun;
  const cat = typeof meta?.category_slug === "string" ? meta.category_slug : "";
  if (cat === "reusable_work_gloves") return "pairs";
  if (cat === "disposable_gloves") return "gloves";
  return "units";
}

function casePricingWithFallback(
  cp: CommercePackagingV1 | null,
  listPriceFallback: number | null
): CommerceUnitPricing {
  const fromPackaging = resolveCaseUnitPricing(cp);
  if (fromPackaging.effectivePrice != null) return fromPackaging;
  const fallback = finitePositive(listPriceFallback);
  return {
    listPrice: null,
    salePrice: fallback,
    effectivePrice: fallback,
    onSale: false,
  };
}

export function commerceDisplayFromProductMetadata(
  meta: Record<string, unknown> | null | undefined,
  bestPrice: number | null
): StoreProductCommerceDisplay {
  const cp = parseCommercePackaging(meta?.commerce_packaging);
  const legacyUnits = finitePositive(meta?.units_per_case);
  const unitsPerCase = finitePositive(cp?.units_per_case) ?? legacyUnits;
  const unitNoun = unitNounFromMeta(cp, meta ?? null);
  const casePricing = casePricingWithFallback(cp, bestPrice);
  const palletPricing = resolvePalletUnitPricing(cp);

  const palletPricingAvailable = Boolean(
    cp?.sell_by_pallet_enabled === true &&
      (resolveEffectivePalletPriceFromPackaging(cp) != null ||
        finitePositive(cp?.cases_per_pallet) != null ||
        meta?.pallet_pricing_available === true ||
        meta?.pallet_pricing_available === "yes")
  );

  return {
    casePrice: casePricing.effectivePrice,
    caseListPrice: casePricing.listPrice,
    caseOnSale: casePricing.onSale,
    unitsPerCase,
    unitNoun,
    palletPricingAvailable,
    palletPrice: palletPricing.effectivePrice,
    palletListPrice: palletPricing.listPrice,
    palletOnSale: palletPricing.onSale,
    caseLabel: cp?.case_label ?? null,
    palletLabel: cp?.pallet_label ?? null,
  };
}

export function formatUnitsPerCaseLine(unitsPerCase: number | null, unitNoun: UnitNoun): string | null {
  if (unitsPerCase == null || unitsPerCase <= 0) return null;
  return `${unitsPerCase.toLocaleString("en-US")} ${unitNoun} per case`;
}

export function pdpCommerceFromProductMetadata(
  meta: Record<string, unknown> | null | undefined,
  listPriceFallback: number | null
): PdpCommercePackaging {
  const cp = parseCommercePackaging(meta?.commerce_packaging);
  const legacyUnits = finitePositive(meta?.units_per_case);
  const unitsPerCase = finitePositive(cp?.units_per_case) ?? legacyUnits;
  const casesPerPallet = finitePositive(cp?.cases_per_pallet);
  const unitsPerPallet =
    finitePositive(cp?.units_per_pallet) ??
    (casesPerPallet != null && unitsPerCase != null ? casesPerPallet * unitsPerCase : null);
  const unitNoun = unitNounFromMeta(cp, meta ?? null);
  const casePricing = casePricingWithFallback(cp, listPriceFallback);
  const palletPricing = resolvePalletUnitPricing(cp);
  const sellByPalletEnabled = cp?.sell_by_pallet_enabled === true;
  const palletBuyingEnabled = Boolean(
    sellByPalletEnabled && palletPricing.effectivePrice != null && casesPerPallet != null
  );

  return {
    sellByCaseEnabled: cp?.sell_by_case_enabled ?? true,
    sellByPalletEnabled,
    casePrice: casePricing.effectivePrice,
    caseListPrice: casePricing.listPrice,
    caseOnSale: casePricing.onSale,
    palletPrice: palletPricing.effectivePrice,
    palletListPrice: palletPricing.listPrice,
    palletOnSale: palletPricing.onSale,
    unitsPerCase,
    casesPerPallet,
    unitsPerPallet,
    unitNoun,
    caseLabel: cp?.case_label ?? null,
    palletLabel: cp?.pallet_label ?? null,
    palletBuyingEnabled,
  };
}

export function defaultSellUnitForCommerce(_pkg: PdpCommercePackaging): SellUnit {
  return "case";
}

export function pricingForSellUnit(
  commerce: Pick<
    PdpCommercePackaging,
    | "casePrice"
    | "caseListPrice"
    | "caseOnSale"
    | "palletPrice"
    | "palletListPrice"
    | "palletOnSale"
  >,
  sellUnit: SellUnit
): Pick<CommerceUnitPricing, "listPrice" | "salePrice" | "effectivePrice" | "onSale"> {
  if (sellUnit === "pallet") {
    return {
      listPrice: commerce.palletListPrice,
      salePrice: commerce.palletPrice,
      effectivePrice: commerce.palletPrice,
      onSale: commerce.palletOnSale,
    };
  }
  return {
    listPrice: commerce.caseListPrice,
    salePrice: commerce.casePrice,
    effectivePrice: commerce.casePrice,
    onSale: commerce.caseOnSale,
  };
}
