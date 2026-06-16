import { describe, expect, it } from "vitest";
import { COMMERCE_PACKAGING_SCHEMA_VERSION } from "@commerce-packaging/types";
import {
  buildCommerceSummary,
  buildQuoteLineCommerceFields,
  computeCommerceTotals,
  formatQuoteCartLinePrimary,
  formatQuoteCartLineSecondary,
} from "@/lib/quote-cart/commerce-line";
import { pdpCommerceFromProductMetadata } from "@/lib/catalog/store-product-commerce";
import type { QuoteCartItem } from "@/lib/quote-cart/types";

const fullPalletPkg = pdpCommerceFromProductMetadata(
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
      case_label: null,
      cases_per_pallet: 84,
      units_per_pallet: 84000,
      units_per_pallet_overridden: false,
      pallet_label: null,
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

describe("pdpCommerceFromProductMetadata pallet toggle", () => {
  it("enables pallet buying when price and cases_per_pallet exist", () => {
    expect(fullPalletPkg.palletBuyingEnabled).toBe(true);
  });

  it("disables pallet buying when pallet_price missing", () => {
    const pkg = pdpCommerceFromProductMetadata(
      {
        commerce_packaging: {
          schema_version: COMMERCE_PACKAGING_SCHEMA_VERSION,
          sell_by_case_enabled: true,
          sell_by_pallet_enabled: true,
          minimum_sell_unit: "case",
          bulk_sell_unit: "pallet",
          inner_unit_type: null,
          units_per_inner: null,
          inners_per_case: null,
          units_per_case: 1000,
          units_per_case_overridden: false,
          unit_noun: "gloves",
          case_label: null,
          cases_per_pallet: 84,
          units_per_pallet: 84000,
          units_per_pallet_overridden: false,
          pallet_label: null,
          case_price: 42,
          compare_at_case_price: null,
          standard_cost_per_case: null,
          compare_at_pallet_price: null,
          pallet_price: null,
          pallet_discount_percent: null,
          msrp_per_case: null,
          field_provenance: {},
          parse_warnings: [],
        },
      },
      42
    );
    expect(pkg.palletBuyingEnabled).toBe(false);
  });
});

describe("PDP quantity math", () => {
  it("computes case totals", () => {
    const totals = computeCommerceTotals("case", 3, fullPalletPkg);
    expect(totals.totalCases).toBe(3);
    expect(totals.totalUnits).toBe(3000);
  });

  it("computes pallet totals", () => {
    const totals = computeCommerceTotals("pallet", 2, fullPalletPkg);
    expect(totals.totalPallets).toBe(2);
    expect(totals.totalCases).toBe(168);
    expect(totals.totalUnits).toBe(168000);
  });

  it("supports pairs unit noun", () => {
    const pkg = pdpCommerceFromProductMetadata({ units_per_case: 72, category_slug: "reusable_work_gloves" }, 168);
    expect(buildCommerceSummary("case", 4, pkg)).toBe("4 cases · 288 pairs total");
  });
});

describe("buildQuoteLineCommerceFields", () => {
  it("builds case add payload", () => {
    const fields = buildQuoteLineCommerceFields("case", 3, fullPalletPkg);
    expect(fields.sell_unit).toBe("case");
    expect(fields.unit_price_major).toBe(42);
    expect(fields.units_per_case).toBe(1000);
    expect(fields.commerce_summary).toBe("3 cases · 3,000 gloves total");
  });

  it("builds pallet add payload", () => {
    const fields = buildQuoteLineCommerceFields("pallet", 2, fullPalletPkg);
    expect(fields.sell_unit).toBe("pallet");
    expect(fields.unit_price_major).toBe(2950);
    expect(fields.cases_per_pallet).toBe(84);
    expect(fields.commerce_summary).toContain("2 pallets");
    expect(fields.commerce_summary).toContain("168 cases");
  });

  it("does not use box/pack/dozen/pair as sell_unit", () => {
    const fields = buildQuoteLineCommerceFields("case", 1, fullPalletPkg);
    expect(["case", "pallet"]).toContain(fields.sell_unit);
    expect(fields.sell_unit).not.toBe("box");
  });
});

describe("quote cart line display", () => {
  const caseLine: QuoteCartItem = {
    product_id: "550e8400-e29b-41d4-a716-446655440000",
    name: "Nitrile",
    slug: "nitrile",
    brandName: null,
    quantity: 3,
    sell_unit: "case",
    unit_price_major: 42,
    units_per_case: 1000,
    unit_noun: "gloves",
  };

  const palletLine: QuoteCartItem = {
    ...caseLine,
    quantity: 2,
    sell_unit: "pallet",
    unit_price_major: 2950,
    cases_per_pallet: 84,
    units_per_pallet: 84000,
  };

  it("shows case primary label", () => {
    expect(formatQuoteCartLinePrimary(caseLine)).toBe("3 cases × $42.00 / case");
  });

  it("shows pallet primary label", () => {
    expect(formatQuoteCartLinePrimary(palletLine)).toBe("2 pallets × $2,950.00 / pallet");
  });

  it("shows total units secondary", () => {
    expect(formatQuoteCartLineSecondary(caseLine)).toBe("3,000 gloves total");
    expect(formatQuoteCartLineSecondary(palletLine)).toBe("168 cases / 168,000 gloves total");
  });

  it("does not show stock or sold-as language", () => {
    const copy = `${formatQuoteCartLinePrimary(caseLine)} ${formatQuoteCartLineSecondary(caseLine)}`;
    expect(copy.toLowerCase()).not.toContain("in stock");
    expect(copy.toLowerCase()).not.toContain("sold as box");
  });
});
