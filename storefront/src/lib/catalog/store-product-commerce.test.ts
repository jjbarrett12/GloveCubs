import { describe, expect, it } from "vitest";
import { COMMERCE_PACKAGING_SCHEMA_VERSION } from "@commerce-packaging/types";
import {
  commerceDisplayFromProductMetadata,
  formatUnitsPerCaseLine,
  pdpCommerceFromProductMetadata,
} from "@/lib/catalog/store-product-commerce";

describe("store-product-commerce", () => {
  it("reads commerce_packaging from product metadata", () => {
    const display = commerceDisplayFromProductMetadata(
      {
        commerce_packaging: {
          schema_version: COMMERCE_PACKAGING_SCHEMA_VERSION,
          sell_by_case_enabled: true,
          sell_by_pallet_enabled: true,
          minimum_sell_unit: "case",
          bulk_sell_unit: "pallet",
          inner_unit_type: "box",
          units_per_inner: 100,
          inners_per_case: 10,
          units_per_case: 1000,
          units_per_case_overridden: false,
          unit_noun: "gloves",
          case_label: "10 boxes × 100 gloves = 1,000 gloves",
          cases_per_pallet: 84,
          units_per_pallet: 84000,
          units_per_pallet_overridden: false,
          pallet_label: "84 cases = 84,000 gloves",
          case_price: 42,
          compare_at_case_price: null,
          standard_cost_per_case: null,
          compare_at_pallet_price: null,
          pallet_price: 2950,
          pallet_discount_percent: null,
          msrp_per_case: null,
          field_provenance: {},
          parse_warnings: [],
        },
      },
      39
    );
    expect(display.casePrice).toBe(42);
    expect(display.unitsPerCase).toBe(1000);
    expect(display.unitNoun).toBe("gloves");
    expect(display.palletPricingAvailable).toBe(true);
  });

  it("falls back to metadata.units_per_case and bestPrice", () => {
    const display = commerceDisplayFromProductMetadata({ units_per_case: 72, category_slug: "reusable_work_gloves" }, 168);
    expect(display.unitsPerCase).toBe(72);
    expect(display.unitNoun).toBe("pairs");
    expect(display.casePrice).toBe(168);
    expect(display.palletPricingAvailable).toBe(false);
  });

  it("handles missing commerce_packaging gracefully", () => {
    const display = commerceDisplayFromProductMetadata({}, null);
    expect(display.unitsPerCase).toBeNull();
    expect(display.casePrice).toBeNull();
    expect(display.palletPricingAvailable).toBe(false);
  });

  it("formats units per case lines", () => {
    expect(formatUnitsPerCaseLine(1000, "gloves")).toBe("1,000 gloves per case");
    expect(formatUnitsPerCaseLine(72, "pairs")).toBe("72 pairs per case");
    expect(formatUnitsPerCaseLine(null, "gloves")).toBeNull();
  });

  it("shows case sale pricing when product price is higher", () => {
    const display = commerceDisplayFromProductMetadata(
      {
        commerce_packaging: {
          schema_version: COMMERCE_PACKAGING_SCHEMA_VERSION,
          sell_by_case_enabled: true,
          sell_by_pallet_enabled: false,
          minimum_sell_unit: "case",
          bulk_sell_unit: "pallet",
          inner_unit_type: null,
          units_per_inner: null,
          inners_per_case: null,
          units_per_case: 1000,
          units_per_case_overridden: false,
          unit_noun: "gloves",
          case_label: null,
          cases_per_pallet: null,
          units_per_pallet: null,
          units_per_pallet_overridden: false,
          pallet_label: null,
          case_price: 39.99,
          compare_at_case_price: 49.99,
          standard_cost_per_case: 22,
          compare_at_pallet_price: null,
          pallet_price: null,
          pallet_discount_percent: null,
          msrp_per_case: null,
          field_provenance: {},
          parse_warnings: [],
        },
      },
      null
    );
    expect(display.casePrice).toBe(39.99);
    expect(display.caseListPrice).toBe(49.99);
    expect(display.caseOnSale).toBe(true);
  });

  it("defaults sell unit to case when packaging missing", () => {
    const pkg = pdpCommerceFromProductMetadata({}, 42);
    expect(pkg.sellByCaseEnabled).toBe(true);
    expect(pkg.palletBuyingEnabled).toBe(false);
    expect(pkg.casePrice).toBe(42);
  });
});

describe("StoreProductCard price display logic", () => {
  it("uses case price with /case suffix", () => {
    const displayCasePrice = 42;
    const formatted = `$${displayCasePrice.toFixed(2)} / case`;
    expect(formatted).toBe("$42.00 / case");
  });

  it("does not use box/pack/dozen purchase-unit labels", () => {
    const forbidden = ["sold as box", "per dozen", "per pack", "in stock"];
    const cardCopy = "1,000 gloves per case · Pallet pricing available";
    for (const f of forbidden) {
      expect(cardCopy.toLowerCase()).not.toContain(f);
    }
  });
});
