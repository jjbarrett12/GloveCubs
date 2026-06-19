import { describe, expect, it } from "vitest";
import {
  buildCompareWizardPdpHref,
  compareCompareWizardRows,
  expandSizeCodes,
  filterCompareWizardRows,
  isStorefrontGcSku,
  PUBLIC_COMPARE_WIZARD_ROW_KEYS,
  resolveBoxesPerCase,
  rowMatchesCompareWizardSearch,
  sizeFilterMatches,
  sortCompareWizardRows,
  storefrontSafeCasePrice,
  storefrontSafePalletPrice,
} from "@/lib/catalog/compare-wizard-utils";
import type { CompareWizardRow } from "@/lib/catalog/compare-wizard-utils.types";

function row(overrides: Partial<CompareWizardRow> = {}): CompareWizardRow {
  return {
    id: "p1",
    slug: "test-glove",
    sku: "GC-TEST-1",
    name: "Test Glove",
    boxesPerCase: 10,
    sizes: "S–XL",
    sizeCodes: ["S", "M", "L", "XL"],
    material: "Nitrile",
    color: "Blue",
    thicknessMil: "5 mil",
    grade: "Exam",
    certifications: "FDA, CE",
    casePrice: 34.95,
    palletPrice: 629.1,
    bestFor: "Medical · Healthcare",
    industries: ["Healthcare"],
    badges: ["Best Seller"],
    pdpHref: "/store/p/test-glove",
    ...overrides,
  };
}

describe("compare-wizard-utils sorting", () => {
  it("sorts case price numerically ascending", () => {
    const rows = [row({ id: "a", casePrice: 50 }), row({ id: "b", casePrice: 15.95 }), row({ id: "c", casePrice: 34.95 })];
    const sorted = sortCompareWizardRows(rows, "casePrice", "asc");
    expect(sorted.map((r) => r.casePrice)).toEqual([15.95, 34.95, 50]);
  });

  it("sorts pallet price numerically descending with missing values last", () => {
    const rows = [
      row({ id: "a", palletPrice: 100 }),
      row({ id: "b", palletPrice: null }),
      row({ id: "c", palletPrice: 250 }),
    ];
    const sorted = sortCompareWizardRows(rows, "palletPrice", "desc");
    expect(sorted.map((r) => r.palletPrice)).toEqual([250, 100, null]);
  });

  it("sorts boxes per case numerically", () => {
    const rows = [row({ boxesPerCase: 20 }), row({ boxesPerCase: 8 }), row({ boxesPerCase: 10 })];
    const sorted = sortCompareWizardRows(rows, "boxesPerCase", "asc");
    expect(sorted.map((r) => r.boxesPerCase)).toEqual([8, 10, 20]);
  });

  it("sorts thickness numerically by mil value", () => {
    const rows = [row({ thicknessMil: "8 mil" }), row({ thicknessMil: "4 mil" }), row({ thicknessMil: "5 mil" })];
    const sorted = sortCompareWizardRows(rows, "thicknessMil", "asc");
    expect(sorted.map((r) => r.thicknessMil)).toEqual(["4 mil", "5 mil", "8 mil"]);
  });

  it("sorts text columns alphabetically with missing values last in asc and desc", () => {
    const rows = [row({ material: "Vinyl" }), row({ material: null }), row({ material: "Latex" })];
    expect(sortCompareWizardRows(rows, "material", "asc").map((r) => r.material)).toEqual(["Latex", "Vinyl", null]);
    expect(sortCompareWizardRows(rows, "material", "desc").map((r) => r.material)).toEqual(["Vinyl", "Latex", null]);
  });

  it("places missing numeric values last regardless of direction", () => {
    const a = row({ boxesPerCase: null });
    const b = row({ boxesPerCase: 10 });
    expect(compareCompareWizardRows(a, b, "boxesPerCase")).toBeGreaterThan(0);
    expect(compareCompareWizardRows(b, a, "boxesPerCase")).toBeLessThan(0);
  });
});

describe("compare-wizard-utils size range matching", () => {
  it("matches individual sizes inside S–XL", () => {
    const r = row({ sizes: "S–XL", sizeCodes: ["S", "M", "L", "XL"] });
    expect(sizeFilterMatches(r, "M")).toBe(true);
    expect(sizeFilterMatches(r, "XS")).toBe(false);
  });

  it("matches individual sizes inside XS–XL and M–2XL ranges", () => {
    expect(sizeFilterMatches(row({ sizes: "XS–XL", sizeCodes: [] }), "L")).toBe(true);
    expect(sizeFilterMatches(row({ sizes: "M–2XL", sizeCodes: [] }), "XL")).toBe(true);
    expect(sizeFilterMatches(row({ sizes: "S–XXL", sizeCodes: [] }), "XXL")).toBe(true);
    expect(sizeFilterMatches(row({ sizes: "S–XXL", sizeCodes: [] }), "XS")).toBe(false);
  });

  it("expands size ranges from label when raw codes are absent", () => {
    expect(expandSizeCodes("S–XL", [])).toEqual(["S", "M", "L", "XL"]);
  });
});

describe("compare-wizard-utils filters and search", () => {
  it("applies material, grade, color, industry, and size filters together", () => {
    const rows = [
      row(),
      row({
        id: "p2",
        material: "Vinyl",
        grade: "Industrial",
        color: "Clear",
        industries: ["Food Service"],
        sizes: "M",
        sizeCodes: ["M"],
      }),
    ];
    const filtered = filterCompareWizardRows(rows, {
      material: "Nitrile",
      grade: "Exam",
      color: "Blue",
      industry: "Healthcare",
      size: "L",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("p1");
  });

  it("searches across sku, name, material, color, grade, certifications, and best-for text", () => {
    const r = row();
    expect(rowMatchesCompareWizardSearch(r, "gc-test-1")).toBe(true);
    expect(rowMatchesCompareWizardSearch(r, "test glove")).toBe(true);
    expect(rowMatchesCompareWizardSearch(r, "nitrile")).toBe(true);
    expect(rowMatchesCompareWizardSearch(r, "blue")).toBe(true);
    expect(rowMatchesCompareWizardSearch(r, "exam")).toBe(true);
    expect(rowMatchesCompareWizardSearch(r, "fda")).toBe(true);
    expect(rowMatchesCompareWizardSearch(r, "healthcare")).toBe(true);
    expect(rowMatchesCompareWizardSearch(r, "not-present")).toBe(false);
  });
});

describe("compare-wizard-utils boxes per case", () => {
  it("prefers boxes_per_case then inners_per_case then safe division", () => {
    expect(resolveBoxesPerCase({ boxes_per_case: 12 }, null)).toBe(12);
    expect(
      resolveBoxesPerCase(
        { commerce_packaging: { schema_version: 1, inners_per_case: 10, units_per_case: 1000, units_per_inner: 100 } },
        null
      )
    ).toBe(10);
    expect(
      resolveBoxesPerCase(
        { commerce_packaging: { schema_version: 1, units_per_case: 1000, units_per_inner: 100 } },
        null
      )
    ).toBe(10);
  });

  it("does not guess when division is unsafe", () => {
    expect(
      resolveBoxesPerCase(
        { commerce_packaging: { schema_version: 1, units_per_case: 1000, units_per_inner: 300 } },
        null
      )
    ).toBeNull();
  });

  it("falls back to packaging summary label", () => {
    expect(resolveBoxesPerCase(null, "10 boxes/case")).toBe(10);
  });
});

describe("compare-wizard-utils public safety", () => {
  it("accepts only GC- prefixed storefront SKUs", () => {
    expect(isStorefrontGcSku("GC-NB-100")).toBe(true);
    expect(isStorefrontGcSku("glv-test")).toBe(false);
    expect(isStorefrontGcSku(null)).toBe(false);
  });

  it("builds encoded PDP hrefs", () => {
    expect(buildCompareWizardPdpHref("black nitrile pro")).toBe("/store/p/black%20nitrile%20pro");
  });

  it("suppresses non-positive or unavailable storefront prices", () => {
    expect(storefrontSafeCasePrice(0)).toBeNull();
    expect(storefrontSafeCasePrice(-1)).toBeNull();
    expect(storefrontSafeCasePrice(34.95)).toBe(34.95);
    expect(storefrontSafePalletPrice(100, false)).toBeNull();
    expect(storefrontSafePalletPrice(0, true)).toBeNull();
    expect(storefrontSafePalletPrice(629.1, true)).toBe(629.1);
  });

  it("defines a fixed public row surface without supplier/admin fields", () => {
    expect(PUBLIC_COMPARE_WIZARD_ROW_KEYS).not.toContain("standard_cost_per_case");
    expect(PUBLIC_COMPARE_WIZARD_ROW_KEYS).not.toContain("supplier");
    expect(PUBLIC_COMPARE_WIZARD_ROW_KEYS).not.toContain("inventory");
    expect(PUBLIC_COMPARE_WIZARD_ROW_KEYS).toContain("pdpHref");
  });
});
