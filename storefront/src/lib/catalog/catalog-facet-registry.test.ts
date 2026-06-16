import { describe, expect, it } from "vitest";
import {
  getAllFilterableFacetKeys,
  getCustomerFacingCatalogFacetKeys,
  HIDDEN_STOREFRONT_FACET_KEYS,
  isCustomerFacingFacetKey,
} from "@/lib/catalog/catalog-facet-registry";

describe("catalog-facet-registry customer-facing filters", () => {
  it("excludes purchase-unit and inventory facets from filterable keys", () => {
    const keys = getAllFilterableFacetKeys();
    for (const hidden of [
      "box_quantity",
      "pack_quantity",
      "packaging",
      "case_quantity",
      "sold_as",
      "in_stock",
      "stock_status",
    ]) {
      expect(keys).not.toContain(hidden);
      expect(isCustomerFacingFacetKey(hidden)).toBe(false);
    }
  });

  it("includes commerce packaging facets", () => {
    const keys = getAllFilterableFacetKeys();
    expect(keys).toContain("units_per_case");
    expect(keys).toContain("cases_per_pallet");
    expect(keys).toContain("pallet_pricing_available");
  });

  it("lists all hidden keys in HIDDEN_STOREFRONT_FACET_KEYS", () => {
    expect(HIDDEN_STOREFRONT_FACET_KEYS).toContain("inventory");
    expect(HIDDEN_STOREFRONT_FACET_KEYS).toContain("availability");
    expect(HIDDEN_STOREFRONT_FACET_KEYS).toContain("case_quantity");
  });

  it("customer-facing catalog keys include size and commerce facets", () => {
    const keys = getCustomerFacingCatalogFacetKeys();
    expect(keys).toContain("size");
    expect(keys).toContain("units_per_case");
    expect(keys).not.toContain("box_quantity");
  });
});
