import { describe, expect, it } from "vitest";
import { facetKeysGroupedForUi, getFacetOrderForStoreCategory, orderedFacetKeysForUi } from "@/lib/catalog/store-facet-links";

describe("store-facet-links procurement UI", () => {
  it("orders disposable commerce facets after color/size area", () => {
    const keys = orderedFacetKeysForUi(
      {
        color: [{ value: "blue", count: 1 }],
        units_per_case: [{ value: "1000", count: 2 }],
        cases_per_pallet: [{ value: "84", count: 1 }],
        material: [{ value: "nitrile", count: 5 }],
      },
      "disposable_gloves"
    );
    expect(keys.indexOf("material")).toBeLessThan(keys.indexOf("units_per_case"));
    expect(keys.indexOf("color")).toBeLessThan(keys.indexOf("units_per_case"));
    expect(keys.indexOf("units_per_case")).toBeLessThan(keys.indexOf("cases_per_pallet"));
    expect(keys).not.toContain("box_quantity");
    expect(keys).not.toContain("pack_quantity");
    expect(keys).not.toContain("case_quantity");
    expect(keys).not.toContain("sold_as");
  });

  it("prefers units_per_case over legacy case_quantity when both have counts", () => {
    const keys = orderedFacetKeysForUi(
      {
        units_per_case: [{ value: "2000", count: 1 }],
        case_quantity: [{ value: "10", count: 1 }],
        material: [{ value: "nitrile", count: 1 }],
      },
      "disposable_gloves"
    );
    expect(keys).toContain("units_per_case");
    expect(keys).not.toContain("case_quantity");
  });

  it("orders reusable commerce facets after size", () => {
    const keys = orderedFacetKeysForUi(
      {
        size: [{ value: "l", count: 1 }],
        units_per_case: [{ value: "72", count: 1 }],
        cases_per_pallet: [{ value: "48", count: 1 }],
        cut_level_ansi: [{ value: "a3", count: 1 }],
        material: [{ value: "nitrile", count: 1 }],
      },
      "reusable_work_gloves"
    );
    expect(keys.indexOf("size")).toBeLessThan(keys.indexOf("units_per_case"));
    expect(keys.indexOf("units_per_case")).toBeLessThan(keys.indexOf("cases_per_pallet"));
  });

  it("groups facets by display_group metadata", () => {
    const groups = facetKeysGroupedForUi(
      { material: [{ value: "nitrile", count: 1 }], uses: [{ value: "food", count: 1 }] },
      {
        material: { label: "Material", displayGroup: "Product specifications" },
        uses: { label: "Uses", displayGroup: "Use & environment" },
      }
    );
    expect(groups.map((g) => g.groupLabel)).toContain("Product specifications");
    expect(groups.map((g) => g.groupLabel)).toContain("Use & environment");
  });

  it("uses universal order when category unknown", () => {
    const order = getFacetOrderForStoreCategory(undefined);
    expect(order.indexOf("units_per_case")).toBeLessThan(order.indexOf("certifications"));
  });
});
