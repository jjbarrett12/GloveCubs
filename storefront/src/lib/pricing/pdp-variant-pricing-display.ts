import type { StoreProductDetail } from "@/lib/catalog/store-product-detail";
import { PDP_BEST_PRICE_SCOPE, type PdpBuyerUnitReference, type PdpVariantPricingRow } from "@/lib/pricing/variant-pricing-contracts";

export type PdpVariantTierDisplay = {
  kind: "tier_reference";
  tierLabel: string;
  listUsd: number;
  yourUsd: number;
  pricingSource: string;
};

export type PdpVariantListOnlyDisplay = {
  kind: "list_only";
  listUsd: number;
  pricingSource: string;
};

export type PdpVariantRequestPricingDisplay = {
  kind: "request_pricing";
};

export type PdpSelectedVariantPricingDisplay =
  | PdpVariantTierDisplay
  | PdpVariantListOnlyDisplay
  | PdpVariantRequestPricingDisplay;

export type PdpParentFromDisplay = {
  fromUsd: number;
  scope: typeof PDP_BEST_PRICE_SCOPE;
};

function pricingByVariantId(rows: PdpVariantPricingRow[]): Map<string, PdpVariantPricingRow> {
  return new Map(rows.map((r) => [r.catalogVariantId, r]));
}

/** Selected-variant pricing only — never maps parent bestPrice into variant fields. */
export function resolvePdpSelectedVariantPricingDisplay(
  selectedVariantId: string | null,
  variantPricing: PdpVariantPricingRow[],
  buyerUnitReferencesByVariantId: Record<string, PdpBuyerUnitReference> | undefined
): PdpSelectedVariantPricingDisplay {
  if (!selectedVariantId) {
    return { kind: "request_pricing" };
  }

  const buyerRef = buyerUnitReferencesByVariantId?.[selectedVariantId];
  if (buyerRef?.isVariantSpecificList && buyerRef.catalogVariantId === selectedVariantId) {
    return {
      kind: "tier_reference",
      tierLabel: buyerRef.tierLabel,
      listUsd: buyerRef.listUsd,
      yourUsd: buyerRef.yourUsd,
      pricingSource: buyerRef.pricingSource,
    };
  }

  const row = pricingByVariantId(variantPricing).get(selectedVariantId);
  if (row?.listUnitPriceMajor != null) {
    return {
      kind: "list_only",
      listUsd: row.listUnitPriceMajor,
      pricingSource: row.pricingSource,
    };
  }

  return { kind: "request_pricing" };
}

export function resolvePdpParentFromDisplay(
  bestPrice: number | null | undefined,
  bestPriceScope: StoreProductDetail["bestPriceScope"]
): PdpParentFromDisplay | null {
  if (bestPrice == null || !Number.isFinite(bestPrice) || bestPrice <= 0) return null;
  if (bestPriceScope !== PDP_BEST_PRICE_SCOPE) return null;
  return { fromUsd: bestPrice, scope: PDP_BEST_PRICE_SCOPE };
}

export function variantListUnitLabel(
  variantId: string,
  variantPricing: PdpVariantPricingRow[]
): string | null {
  const row = pricingByVariantId(variantPricing).get(variantId);
  if (row?.listUnitPriceMajor == null) return null;
  return String(row.listUnitPriceMajor);
}

export function matrixShowsListUnitColumn(variantPricing: PdpVariantPricingRow[]): boolean {
  return variantPricing.some((r) => r.listUnitPriceMajor != null);
}
