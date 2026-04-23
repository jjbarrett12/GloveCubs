import { describe, expect, it } from "vitest";
import { extractFacetsV1 } from "./extract-facets-v1";
import { applyFacetExtractionToNormalizedDataRecord, mergeProposalsIntoFilterAttributes } from "./staging-facet-merge";

describe("extractFacetsV1", () => {
  it("extracts material color size thickness powder packaging from name (size via glove context + synonym)", () => {
    const r = extractFacetsV1({
      category_slug: "disposable_gloves",
      sku: "ACME-NIT-L-5MIL",
      name: "Acme Nitrile Exam Glove Large 5 mil powder free 1000/cs blue",
      brand: "Acme",
    });
    expect(r.proposed.material).toBe("nitrile");
    expect(r.proposed.color).toBe("blue");
    expect(r.proposed.size).toBe("l");
    expect(r.confidenceByKey.size).toBeGreaterThanOrEqual(0.9);
    expect(r.proposed.thickness_mil).toBe("5");
    expect(r.proposed.powder).toBe("powder_free");
    expect(r.proposed.packaging).toBe("case_1000_ct");
    expect(r.proposed.brand).toBe("Acme");
    expect(r.confidenceByKey.brand).toBe(1);
  });

  it("does not infer category from text", () => {
    const r = extractFacetsV1({
      category_slug: "",
      name: "Nitrile gloves category should be explicit",
    });
    expect(r.issues.some((i) => i.code === "missing_category_slug")).toBe(true);
  });

  it("merge does not overwrite operator-filled fields", () => {
    const { merged, applied_keys, suggested_not_applied } = mergeProposalsIntoFilterAttributes(
      { material: "latex", color: "" },
      { material: "nitrile", color: "blue" },
      { material: 0.95, color: 0.9 }
    );
    expect(merged.material).toBe("latex");
    expect(merged.color).toBe("blue");
    expect(applied_keys).toEqual(["color"]);
    expect(suggested_not_applied.map((x) => x.key)).toContain("material");
    expect(suggested_not_applied.find((x) => x.key === "material")?.reason).toBe("already_set");
  });

  it("auto-merges strong size; packaging stays suggested below 0.9", () => {
    const extracted = extractFacetsV1({
      category_slug: "disposable_gloves",
      sku: "ACME-NIT-L-5MIL",
      name: "Acme Nitrile Exam Glove Large 5 mil powder free 1000/cs blue",
      brand: "Acme",
    });
    const { merged, applied_keys, suggested_not_applied } = mergeProposalsIntoFilterAttributes(
      {},
      extracted.proposed,
      extracted.confidenceByKey
    );
    expect(merged.size).toBe("l");
    expect(merged.packaging).toBeUndefined();
    expect(applied_keys).toContain("size");
    expect(applied_keys).not.toContain("packaging");
    expect(suggested_not_applied.filter((x) => x.key === "packaging").map((x) => x.reason)).toEqual(["below_threshold"]);
    expect(applied_keys).toContain("material");
    expect(applied_keys).toContain("brand");
  });

  it("does not extract size from stray letters without glove context or explicit size label", () => {
    const r = extractFacetsV1({
      category_slug: "disposable_gloves",
      sku: "SHELF-ML-X9",
      name: "Industrial adhesive shelf mount ML series",
    });
    expect(r.proposed.size).toBeUndefined();
  });

  it("does not map medium duty or SKU token without glove context to size", () => {
    const r = extractFacetsV1({
      category_slug: "disposable_gloves",
      sku: "FORMAT-L-DESC",
      name: "Medium duty storage rack format L desc",
    });
    expect(r.proposed.size).toBeUndefined();
  });

  it("extracts size from explicit label without glove vocabulary", () => {
    const r = extractFacetsV1({
      category_slug: "disposable_gloves",
      sku: "SKU-001",
      name: "Widget refill size XL pack",
    });
    expect(r.proposed.size).toBe("xl");
    expect(r.confidenceByKey.size).toBeGreaterThanOrEqual(0.9);
  });

  it("extracts size from parentheses token with glove context", () => {
    const r = extractFacetsV1({
      category_slug: "disposable_gloves",
      sku: "G-100",
      name: "Nitrile exam (m) powder free",
    });
    expect(r.proposed.size).toBe("m");
    expect(r.confidenceByKey.size).toBeGreaterThanOrEqual(0.9);
  });
});

describe("applyFacetExtractionToNormalizedDataRecord", () => {
  it("writes proposed_facets and facet_parse_meta with applied_keys (size auto-merges when ≥0.9)", () => {
    const next = applyFacetExtractionToNormalizedDataRecord({
      category_slug: "disposable_gloves",
      name: "Vinyl small 3 mil white 150/cs",
      sku: "V-S-W-3",
      filter_attributes: {},
    });
    expect(next.proposed_facets).toMatchObject({ material: "vinyl", size: "s", thickness_mil: "3", color: "white" });
    const meta = next.facet_parse_meta as {
      parser_version?: string;
      applied_keys?: string[];
      issues?: { code: string }[];
    };
    expect(meta.parser_version).toContain("extract_facets");
    expect(meta.applied_keys?.sort()).toEqual(["color", "material", "size", "thickness_mil"].sort());
    expect(meta.issues?.some((i) => i.code === "packaging_unmapped")).toBe(true);
    expect(next.filter_attributes).toMatchObject({
      material: "vinyl",
      color: "white",
      thickness_mil: "3",
      size: "s",
    });
  });
});
