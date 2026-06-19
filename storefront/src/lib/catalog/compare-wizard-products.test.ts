import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildCompareWizardRow } from "@/lib/catalog/compare-wizard-products";
import type { StoreProductRow } from "@/lib/catalog/store-products";

function storeRow(overrides: Partial<StoreProductRow> = {}): StoreProductRow {
  return {
    id: "p1",
    name: "Black Nitrile Pro",
    slug: "black-nitrile-pro",
    brandName: "Brand",
    brandId: null,
    imageUrl: null,
    internalSku: "GC-NB-100",
    catalogVariantId: "v1",
    variantSku: "GC-NB-100-M",
    sizeCode: "M",
    materialHint: "nitrile",
    badges: ["Best Seller"],
    bestPrice: 34.95,
    casePrice: 34.95,
    caseListPrice: null,
    caseOnSale: false,
    palletPrice: 629.1,
    palletListPrice: null,
    palletOnSale: false,
    unitsPerCase: 1000,
    unitNoun: "gloves",
    palletPricingAvailable: true,
    caseLabel: "10 boxes/case",
    palletLabel: null,
    commercialUseSummary: "Medical",
    certificationHints: ["FDA"],
    protectionHint: null,
    activeVariantCount: 4,
    availableSizeCodes: ["S", "M", "L", "XL"],
    ...overrides,
  };
}

describe("compare-wizard-products", () => {
  it("builds storefront-safe rows with GC SKU links and encoded PDP href", () => {
    const built = buildCompareWizardRow(
      storeRow(),
      { commerce_packaging: { schema_version: 1, inners_per_case: 10 } },
      {
        material: ["nitrile"],
        grade: ["medical_exam_grade"],
        color: ["black"],
        thickness_mil: ["5"],
        certifications: ["fda"],
        uses: ["medical_exam"],
        industries: ["healthcare"],
      },
      ["S", "M", "L", "XL"]
    );
    expect(built?.sku).toBe("GC-NB-100");
    expect(built?.pdpHref).toBe("/store/p/black-nitrile-pro");
    expect(built?.casePrice).toBe(34.95);
    expect(built?.palletPrice).toBe(629.1);
    expect(built?.boxesPerCase).toBe(10);
    expect(built?.sizes).toBe("S–XL");
  });

  it("drops non-GC internal SKUs from public display", () => {
    const built = buildCompareWizardRow(storeRow({ internalSku: "GLV-123" }), null, undefined, ["M"]);
    expect(built?.sku).toBeNull();
    expect(built?.pdpHref).toBe("/store/p/black-nitrile-pro");
  });

  it("suppresses pallet price when pallet pricing is unavailable", () => {
    const built = buildCompareWizardRow(storeRow({ palletPricingAvailable: false, palletPrice: 999 }), null, undefined, ["M"]);
    expect(built?.palletPrice).toBeNull();
  });

  it("returns null when slug is missing", () => {
    expect(buildCompareWizardRow(storeRow({ slug: "" }), null, undefined, ["M"])).toBeNull();
  });

  it("fetch query only selects active storefront-safe product fields", () => {
    const src = readFileSync(
      path.resolve(__dirname, "compare-wizard-products.ts"),
      "utf8"
    );
    expect(src).toContain('.eq("status", "active")');
    expect(src).toContain('.not("slug", "is", null)');
    expect(src).not.toContain("standard_cost");
    expect(src).not.toContain("supplier");
    expect(src).not.toContain("inventory");
  });
});
