import { describe, expect, it } from "vitest";
import { facetKeysGroupedForUi, orderedFacetKeysForUi } from "@/lib/catalog/store-facet-links";

describe("store-facet-links procurement UI", () => {
  it("orders procurement facets before convenience keys", () => {
    const keys = orderedFacetKeysForUi({
      texture: [{ value: "textured", count: 1 }],
      material: [{ value: "nitrile", count: 5 }],
      certifications: [{ value: "fda", count: 2 }],
    });
    expect(keys.indexOf("material")).toBeLessThan(keys.indexOf("texture"));
    expect(keys).not.toContain("brand");
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
});
