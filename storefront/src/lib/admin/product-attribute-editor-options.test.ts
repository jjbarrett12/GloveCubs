import { describe, expect, it } from "vitest";
import {
  isEditorHiddenAttributeKey,
  resolveEditorAllowedValues,
} from "@/lib/admin/product-attribute-editor-options";
import type { AttributeDefinitionRow } from "@/lib/admin/product-attribute-sync";

function def(key: string, allowedValues: string[] = []): AttributeDefinitionRow {
  return {
    id: key,
    attributeKey: key,
    label: key,
    displayGroup: null,
    cardinality: "single",
    isRequired: false,
    isFilterable: true,
    allowedValues,
  };
}

describe("product-attribute-editor-options", () => {
  it("hides legacy packaging and duplicate spec keys", () => {
    expect(isEditorHiddenAttributeKey("case_qty")).toBe(true);
    expect(isEditorHiddenAttributeKey("case_quantity")).toBe(true);
    expect(isEditorHiddenAttributeKey("units_per_case")).toBe(true);
    expect(isEditorHiddenAttributeKey("cases_per_pallet")).toBe(true);
    expect(isEditorHiddenAttributeKey("material")).toBe(false);
  });

  it("falls back when allowed values are missing from DB", () => {
    expect(resolveEditorAllowedValues(def("grip_texture"))).toEqual([
      "smooth",
      "textured",
      "grip",
      "micro_roughened",
    ]);
    expect(resolveEditorAllowedValues(def("cases_per_pallet"))).toContain("48");
  });

  it("prefers DB allowed values when present", () => {
    expect(resolveEditorAllowedValues(def("material", ["nitrile", "vinyl"]))).toEqual([
      "nitrile",
      "vinyl",
    ]);
  });
});
