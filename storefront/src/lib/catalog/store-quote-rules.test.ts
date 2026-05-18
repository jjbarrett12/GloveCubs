import { describe, expect, it } from "vitest";
import {
  canAddProductRowToQuote,
  isQuoteVariantIdentityComplete,
  isStoreProductRowQuotableOnListing,
  productRequiresSizeSelection,
  storeProductPdpVariantsAnchor,
} from "@/lib/catalog/store-quote-rules";
import type { StoreProductRow } from "@/lib/catalog/store-products";

function row(overrides: Partial<StoreProductRow> = {}): StoreProductRow {
  return {
    id: "p1",
    name: "Test Glove",
    slug: "test-glove",
    brandName: "Brand",
    brandId: null,
    imageUrl: null,
    internalSku: "PARENT-1",
    catalogVariantId: "v1",
    variantSku: "SKU-S",
    sizeCode: "S",
    materialHint: "Nitrile",
    badges: [],
    bestPrice: 12,
    commercialUseSummary: null,
    certificationHints: [],
    protectionHint: null,
    activeVariantCount: 1,
    ...overrides,
  };
}

describe("store-quote-rules", () => {
  it("requires size selection when multiple active variants", () => {
    expect(productRequiresSizeSelection(row({ activeVariantCount: 3 }))).toBe(true);
    expect(productRequiresSizeSelection(row({ activeVariantCount: 1 }))).toBe(false);
  });

  it("blocks listing quote for multi-variant parents", () => {
    expect(canAddProductRowToQuote(row({ activeVariantCount: 2 }))).toBe(false);
    expect(isStoreProductRowQuotableOnListing(row({ activeVariantCount: 2 }))).toBe(false);
  });

  it("allows single-variant listing quote when identity is complete", () => {
    expect(canAddProductRowToQuote(row())).toBe(true);
    expect(isStoreProductRowQuotableOnListing(row())).toBe(true);
  });

  it("requires variant id and sku for complete identity", () => {
    expect(isQuoteVariantIdentityComplete(row())).toBe(true);
    expect(isQuoteVariantIdentityComplete(row({ catalogVariantId: null }))).toBe(false);
    expect(isQuoteVariantIdentityComplete(row({ variantSku: "" }))).toBe(false);
  });

  it("builds PDP variants anchor", () => {
    expect(storeProductPdpVariantsAnchor("my-slug")).toBe("/store/p/my-slug#variants");
  });
});
