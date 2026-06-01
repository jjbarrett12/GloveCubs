import { describe, expect, it } from "vitest";
import { filterAttributesToCategory, type AttributeDefinitionRow } from "@/lib/admin/product-attribute-sync";

const gloveDefs: AttributeDefinitionRow[] = [
  {
    id: "d1",
    attributeKey: "material",
    label: "Material",
    displayGroup: null,
    cardinality: "single",
    isRequired: false,
    isFilterable: true,
    allowedValues: ["nitrile"],
  },
  {
    id: "d2",
    attributeKey: "color",
    label: "Color",
    displayGroup: null,
    cardinality: "single",
    isRequired: false,
    isFilterable: true,
    allowedValues: ["blue_violet"],
  },
];

const otherDefs: AttributeDefinitionRow[] = [
  {
    id: "d3",
    attributeKey: "material",
    label: "Material",
    displayGroup: null,
    cardinality: "single",
    isRequired: false,
    isFilterable: true,
    allowedValues: ["nitrile"],
  },
];

describe("filterAttributesToCategory", () => {
  it("removes old category-only keys", () => {
    const attrs = { material: "nitrile", color: "blue_violet", grade: "medical_exam_grade" };
    const filtered = filterAttributesToCategory(attrs, otherDefs);
    expect(filtered).toEqual({ material: "nitrile" });
    expect(filtered.color).toBeUndefined();
    expect(filtered.grade).toBeUndefined();
  });

  it("preserves overlapping keys when compatible", () => {
    const attrs = { material: "nitrile", color: "blue_violet" };
    const filtered = filterAttributesToCategory(attrs, gloveDefs);
    expect(filtered.material).toBe("nitrile");
    expect(filtered.color).toBe("blue_violet");
  });

  it("drops invalid keys not in new category definitions", () => {
    const attrs = { material: "nitrile", powder: "powder_free" };
    const filtered = filterAttributesToCategory(attrs, otherDefs);
    expect(Object.keys(filtered)).toEqual(["material"]);
  });
});
