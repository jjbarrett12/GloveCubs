import { describe, expect, it } from "vitest";
import {
  applyFacetExtractionToNormalizedDataRecord,
  stripFacetExtractionUiState,
} from "./staging-facet-merge";

describe("stripFacetExtractionUiState", () => {
  it("removes proposed_facets and clears applied/suggested/issues while preserving parser_version", () => {
    const cleared = stripFacetExtractionUiState({
      category_slug: "disposable_gloves",
      name: "Test",
      filter_attributes: { material: "nitrile" },
      proposed_facets: { material: "nitrile", size: "l" },
      facet_parse_meta: {
        applied_keys: ["material"],
        suggested_not_applied: [{ key: "size", reason: "below_threshold", value: "l" }],
        issues: [{ code: "x", message: "y" }],
        parser_version: "extract_facets_v1",
        confidenceByKey: { material: 0.95 },
      },
    });
    expect(cleared.proposed_facets).toBeUndefined();
    const meta = cleared.facet_parse_meta as {
      applied_keys: unknown[];
      suggested_not_applied: unknown[];
      issues: unknown[];
      parser_version?: string;
      confidenceByKey?: Record<string, number>;
    };
    expect(meta.applied_keys).toEqual([]);
    expect(meta.suggested_not_applied).toEqual([]);
    expect(meta.issues).toEqual([]);
    expect(meta.parser_version).toBe("extract_facets_v1");
    expect(meta.confidenceByKey?.material).toBe(0.95);
    expect((cleared.filter_attributes as Record<string, unknown>).material).toBe("nitrile");
  });

  it("after extract then strip, UI meta no longer lists stale applied keys", () => {
    const extracted = applyFacetExtractionToNormalizedDataRecord({
      category_slug: "disposable_gloves",
      name: "Nitrile large",
      sku: "X-L",
      filter_attributes: {},
    });
    expect((extracted.facet_parse_meta as { applied_keys: string[] }).applied_keys.length).toBeGreaterThan(0);
    const afterManual = stripFacetExtractionUiState({
      ...extracted,
      filter_attributes: { ...(extracted.filter_attributes as object), size: "l" },
      attributes: { ...(extracted.filter_attributes as object), size: "l" },
    });
    expect((afterManual.facet_parse_meta as { applied_keys: unknown[] }).applied_keys).toEqual([]);
    expect((afterManual.facet_parse_meta as { suggested_not_applied: unknown[] }).suggested_not_applied).toEqual([]);
    expect(afterManual.proposed_facets).toBeUndefined();
  });
});
