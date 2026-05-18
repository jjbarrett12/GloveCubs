import { describe, expect, it } from "vitest";
import {
  matrixShowsListUnitColumn,
  resolvePdpParentFromDisplay,
  resolvePdpSelectedVariantPricingDisplay,
  variantListUnitLabel,
} from "@/lib/pricing/pdp-variant-pricing-display";
import { PDP_BEST_PRICE_SCOPE, type PdpBuyerUnitReference, type PdpVariantPricingRow } from "@/lib/pricing/variant-pricing-contracts";

const variantA = "variant-a";
const variantB = "variant-b";

const pricingRows: PdpVariantPricingRow[] = [
  {
    catalogVariantId: variantA,
    catalogProductId: "product-1",
    listUnitPriceMajor: 8.5,
    offerCount: 1,
    pricingSource: "catalogos.supplier_offers.variant_sku_v1",
    currencyCode: "USD",
  },
  {
    catalogVariantId: variantB,
    catalogProductId: "product-1",
    listUnitPriceMajor: 11,
    offerCount: 1,
    pricingSource: "catalogos.supplier_offers.variant_sku_v1",
    currencyCode: "USD",
  },
];

const buyerRefs: Record<string, PdpBuyerUnitReference> = {
  [variantA]: {
    catalogVariantId: variantA,
    tierLabel: "Cub",
    tierCode: "cub",
    listUsd: 8.5,
    yourUsd: 7.65,
    pricingSource: "site_variant_list_x_company_tier_v1",
    isVariantSpecificList: true,
  },
};

describe("resolvePdpSelectedVariantPricingDisplay — sibling leakage", () => {
  it("shows tier reference only for selected variant with variant-specific buyer ref", () => {
    const display = resolvePdpSelectedVariantPricingDisplay(variantA, pricingRows, buyerRefs);
    expect(display).toEqual({
      kind: "tier_reference",
      tierLabel: "Cub",
      listUsd: 8.5,
      yourUsd: 7.65,
      pricingSource: "site_variant_list_x_company_tier_v1",
    });
  });

  it("does not apply variant A buyer ref when variant B is selected", () => {
    const display = resolvePdpSelectedVariantPricingDisplay(variantB, pricingRows, buyerRefs);
    expect(display).toEqual({
      kind: "list_only",
      listUsd: 11,
      pricingSource: "catalogos.supplier_offers.variant_sku_v1",
    });
    if (display.kind === "tier_reference") {
      expect(display.yourUsd).not.toBe(7.65);
    }
  });

  it("ignores buyer ref when catalogVariantId does not match selected variant", () => {
    const mismatched: Record<string, PdpBuyerUnitReference> = {
      [variantB]: {
        ...buyerRefs[variantA],
        catalogVariantId: variantA,
      },
    };
    const display = resolvePdpSelectedVariantPricingDisplay(variantB, pricingRows, mismatched);
    expect(display.kind).toBe("list_only");
    if (display.kind === "list_only") {
      expect(display.listUsd).toBe(11);
    }
  });

  it("returns request_pricing when selected variant has no list row", () => {
    const display = resolvePdpSelectedVariantPricingDisplay("variant-missing", pricingRows, buyerRefs);
    expect(display).toEqual({ kind: "request_pricing" });
  });

  it("never maps parent bestPrice into selected variant display", () => {
    const display = resolvePdpSelectedVariantPricingDisplay(variantB, [], buyerRefs);
    expect(display).toEqual({ kind: "request_pricing" });
    const parent = resolvePdpParentFromDisplay(5.99, PDP_BEST_PRICE_SCOPE);
    expect(parent?.fromUsd).toBe(5.99);
    if (display.kind !== "request_pricing") {
      expect(display).not.toHaveProperty("fromUsd");
    }
  });
});

describe("matrix list unit column", () => {
  it("shows column when any variant has list pricing", () => {
    expect(matrixShowsListUnitColumn(pricingRows)).toBe(true);
    expect(variantListUnitLabel(variantB, pricingRows)).toBe("11");
  });

  it("hides column when no variant has list pricing", () => {
    expect(matrixShowsListUnitColumn([])).toBe(false);
    expect(
      matrixShowsListUnitColumn([
        {
          catalogVariantId: variantA,
          catalogProductId: "p1",
          listUnitPriceMajor: null,
          offerCount: 0,
          pricingSource: "site_list_unavailable",
          currencyCode: "USD",
        },
      ])
    ).toBe(false);
  });
});

describe("resolvePdpParentFromDisplay", () => {
  it("returns product_min From only for product_min scope", () => {
    expect(resolvePdpParentFromDisplay(4.25, PDP_BEST_PRICE_SCOPE)).toEqual({
      fromUsd: 4.25,
      scope: PDP_BEST_PRICE_SCOPE,
    });
    expect(resolvePdpParentFromDisplay(4.25, undefined)).toBeNull();
  });
});
