/**
 * Normalization engine test cases: synonym lookup, extraction (dictionary-only),
 * unmapped flags, required validation, low-confidence flags, staging payload.
 * Run: npx vitest run src/lib/normalization/normalization-engine.test.ts
 */

import { describe, it, expect } from "vitest";
import { lookupAllowed } from "./synonym-lookup";
import { normalizeAttributeValue, normalizeToAllowed } from "@/lib/catalogos/synonym-normalize";
import { extractContentFromRaw, combinedText, parseThicknessFromRaw } from "./normalization-utils";
import { inferCategory, inferCategoryWithResult, CATEGORY_CONFIDENCE_THRESHOLD } from "./category-inference";
import {
  extractDisposableGloveAttributes,
  extractWorkGloveAttributes,
} from "./extract-attributes-dictionary";
import { runNormalization } from "./normalization-engine";
import { buildStagingPayload } from "./staging-payload";
import { validateAttributesByCategory } from "@/lib/catalogos/attribute-validation";
import { stageSafe, publishSafe } from "@/lib/catalogos/validation-modes";
import { getFallbackSynonymMap } from "@/lib/catalogos/synonym-provider";
import { MATERIAL_VALUES, SIZE_VALUES, POWDER_VALUES, PACKAGING_VALUES } from "@/lib/catalogos/attribute-dictionary-types";

describe("synonym lookup", () => {
  it("maps PF to powder_free", () => {
    const r = lookupAllowed("powder", "pf", POWDER_VALUES);
    expect(r.value).toBe("powder_free");
    expect(r.unmapped).toBe(false);
  });

  it("maps powder free to powder_free", () => {
    const r = lookupAllowed("powder", "powder free", POWDER_VALUES);
    expect(r.value).toBe("powder_free");
  });

  it("maps lg to l for size", () => {
    const r = lookupAllowed("size", "lg", SIZE_VALUES);
    expect(r.value).toBe("l");
  });

  it("maps 1000/cs to case_1000_ct for packaging", () => {
    const r = lookupAllowed("packaging", "1000/cs", PACKAGING_VALUES);
    expect(r.value).toBe("case_1000_ct");
  });

  it("returns unmapped when value not in dictionary", () => {
    const r = lookupAllowed("material", "silk", MATERIAL_VALUES);
    expect(r.value).toBeUndefined();
    expect(r.unmapped).toBe(true);
    expect(r.normalizedRaw).toBe("silk");
  });

  it("returns value when already allowed", () => {
    const r = lookupAllowed("material", "nitrile", MATERIAL_VALUES);
    expect(r.value).toBe("nitrile");
    expect(r.unmapped).toBe(false);
  });

  it("uses optional synonymMap when provided (DB-backed override)", () => {
    const dbMap: Record<string, Record<string, string>> = { material: { "nbr": "nitrile" } };
    const r = lookupAllowed("material", "nbr", MATERIAL_VALUES, dbMap);
    expect(r.value).toBe("nitrile");
    expect(r.unmapped).toBe(false);
  });
});

describe("normalization utils", () => {
  it("parseThicknessFromRaw normalizes 12mil, 12-mil, 12 mil to 12", () => {
    expect(parseThicknessFromRaw("12mil")).toBe(12);
    expect(parseThicknessFromRaw("12-mil")).toBe(12);
    expect(parseThicknessFromRaw("12 mil")).toBe(12);
    expect(parseThicknessFromRaw("12 MIL")).toBe(12);
    expect(parseThicknessFromRaw(12)).toBe(12);
    expect(parseThicknessFromRaw(null, "gloves 4 mil powder free")).toBe(4);
    expect(parseThicknessFromRaw(null, "6mil nitrile")).toBe(6);
  });

  it("extractContentFromRaw gets title, sku, cost", () => {
    const row = { name: "Blue Nitrile Gloves", sku: "NIT-001", cost: 85 };
    const content = extractContentFromRaw(row);
    expect(content.canonical_title).toBe("Blue Nitrile Gloves");
    expect(content.supplier_sku).toBe("NIT-001");
    expect(content.supplier_cost).toBe(85);
  });

  it("combinedText merges common fields", () => {
    const row = { name: "Gloves", description: "Nitrile", material: "nitrile" };
    expect(combinedText(row)).toContain("gloves");
    expect(combinedText(row)).toContain("nitrile");
  });
});

describe("category inference", () => {
  it("infers disposable_gloves for nitrile exam gloves", () => {
    const row = { name: "Nitrile exam gloves powder free 4 mil" };
    expect(inferCategory(row)).toBe("disposable_gloves");
    const r = inferCategoryWithResult(row);
    expect(r.category_slug).toBe("disposable_gloves");
    expect(r.confidence).toBeGreaterThanOrEqual(CATEGORY_CONFIDENCE_THRESHOLD);
    expect(r.reason).toMatch(/keyword_match_disposable/);
    expect(r.ambiguous_candidates).toHaveLength(0);
  });

  it("infers reusable_work_gloves for cut resistant ANSI", () => {
    const row = { name: "Cut resistant work gloves ANSI A4" };
    expect(inferCategory(row)).toBe("reusable_work_gloves");
    const r = inferCategoryWithResult(row);
    expect(r.category_slug).toBe("reusable_work_gloves");
    expect(r.confidence).toBeGreaterThanOrEqual(CATEGORY_CONFIDENCE_THRESHOLD);
    expect(r.reason).toMatch(/keyword_match_work_gloves/);
    expect(r.ambiguous_candidates).toHaveLength(0);
  });

  it("respects categoryHint when ambiguous", () => {
    const row = { name: "Gloves" };
    expect(inferCategory(row, "reusable_work_gloves")).toBe("reusable_work_gloves");
    expect(inferCategory(row, "disposable_gloves")).toBe("disposable_gloves");
  });

  it("returns structured result with no_category_signals and ambiguous_candidates for ambiguous title", () => {
    const row = { name: "Gloves", description: "General purpose" };
    const r = inferCategoryWithResult(row);
    expect(r.reason).toBe("no_category_signals");
    expect(r.confidence).toBe(0);
    expect(r.ambiguous_candidates).toEqual(["disposable_gloves", "reusable_work_gloves"]);
    expect(r.category_slug).toBe("disposable_gloves");
  });

  it("returns low confidence and ambiguous_candidates when hint provided but no signals", () => {
    const row = { name: "Gloves" };
    const r = inferCategoryWithResult(row, "reusable_work_gloves");
    expect(r.category_slug).toBe("reusable_work_gloves");
    expect(r.confidence).toBe(0);
    expect(r.ambiguous_candidates).toHaveLength(2);
  });

  it("returns close_keyword_scores and ambiguous_candidates when both categories have similar scores", () => {
    const row = { name: "Gloves nitrile work reusable" };
    const r = inferCategoryWithResult(row);
    expect(r.ambiguous_candidates.length).toBeGreaterThanOrEqual(0);
    expect(["disposable_gloves", "reusable_work_gloves"]).toContain(r.category_slug);
    if (r.reason === "close_keyword_scores") {
      expect(r.confidence).toBeLessThanOrEqual(0.65);
    }
  });
});

describe("deterministic extraction - disposable gloves", () => {
  it("extracts only dictionary-allowed values", () => {
    const row = {
      name: "Blue nitrile powder-free exam gloves large 4 mil",
      sku: "NIT-PF-4-L",
      cost: 85,
      material: "nitrile",
      color: "blue",
      size: "l",
      brand: "Acme",
      case_qty: 1000,
    };
    const { attributes, unmapped } = extractDisposableGloveAttributes(row);
    expect(attributes.category).toBe("disposable_gloves");
    expect(attributes.material).toBe("nitrile");
    expect(attributes.color).toBe("blue");
    expect(attributes.size).toBe("l");
    expect(attributes.brand).toBe("Acme");
    expect(attributes.powder).toBe("powder_free");
    expect(attributes.thickness_mil).toBe("4");
    expect(attributes.packaging).toBe("case_1000_ct");
    expect(unmapped).toHaveLength(0);
  });

  it("records unmapped raw value for material", () => {
    const row = { name: "Silk gloves", material: "silk", size: "m", color: "black", brand: "X", packaging: "box_100_ct", powder: "powder_free", grade: "industrial_grade" };
    const { attributes, unmapped } = extractDisposableGloveAttributes(row);
    const unmappedMaterial = unmapped.find((u) => u.attribute_key === "material");
    expect(unmappedMaterial?.raw_value).toBe("silk");
    expect(attributes.material).toBeUndefined();
  });

  it("maps synonym lg to l", () => {
    const row = { name: "Gloves", size: "lg", material: "nitrile", color: "black", brand: "X", packaging: "box_100_ct", powder: "pf", grade: "industrial_grade" };
    const { attributes } = extractDisposableGloveAttributes(row);
    expect(attributes.size).toBe("l");
  });

  it("accepts optional synonymMap and uses it for lookup", () => {
    const synonymMap: Record<string, Record<string, string>> = { grade: { "exam": "medical_exam_grade" } };
    const row = { name: "Gloves", size: "m", material: "nitrile", color: "blue", brand: "X", packaging: "box_100_ct", powder: "powder_free", grade: "exam" };
    const { attributes } = extractDisposableGloveAttributes(row, { synonymMap });
    expect(attributes.grade).toBe("medical_exam_grade");
  });

  it("produces same result with explicit fallback map as with no map (single source from provider)", () => {
    const row = { name: "Gloves 1000/case", size: "lg", material: "nitrile", color: "blu", brand: "X", case_qty: 1000, powder: "pf", grade: "industrial_grade" };
    const withFallback = extractDisposableGloveAttributes(row, { synonymMap: getFallbackSynonymMap() });
    const withNoMap = extractDisposableGloveAttributes(row);
    expect(withFallback.attributes.size).toBe("l");
    expect(withNoMap.attributes.size).toBe("l");
    expect(withFallback.attributes.color).toBe("blue");
    expect(withNoMap.attributes.color).toBe("blue");
    expect(withFallback.attributes.packaging).toBe("case_1000_ct");
    expect(withNoMap.attributes.packaging).toBe("case_1000_ct");
  });
});

describe("deterministic extraction - work gloves", () => {
  it("extracts cut level and size", () => {
    const row = {
      name: "ANSI A4 cut resistant work gloves large",
      sku: "CR-A4-L",
      cost: 22,
      size: "l",
      color: "black",
      brand: "Acme",
    };
    const { attributes, unmapped } = extractWorkGloveAttributes(row);
    expect(attributes.category).toBe("reusable_work_gloves");
    expect(attributes.size).toBe("l");
    expect(attributes.color).toBe("black");
    expect(attributes.cut_level_ansi).toBe("a4");
    expect(unmapped).toHaveLength(0);
  });

  it("extracts warm_cold_weather winter", () => {
    const row = { name: "Insulated winter work gloves XL", size: "xl", color: "black", brand: "Acme" };
    const { attributes } = extractWorkGloveAttributes(row);
    expect(attributes.warm_cold_weather).toBe("winter");
  });
});

describe("missing-required validation (stage_safe / publish_safe)", () => {
  it("stage_safe flags missing required for disposable_gloves", () => {
    const attrs = { category: "disposable_gloves" as const, material: "nitrile" };
    const v = stageSafe("disposable_gloves", attrs);
    expect(v.stageable).toBe(true);
    expect(v.missing_required).toContain("size");
    expect(v.missing_required).toContain("color");
    expect(v.missing_required).toContain("brand");
    expect(v.missing_required).toContain("packaging");
    expect(v.missing_required).toContain("powder");
    expect(v.missing_required).toContain("grade");
  });

  it("publish_safe blocks when required missing", () => {
    const attrs = { category: "disposable_gloves" as const, material: "nitrile" };
    const p = publishSafe("disposable_gloves", attrs);
    expect(p.publishable).toBe(false);
    expect(p.error).toBeDefined();
  });

  it("stage_safe and publish_safe pass when required present for work gloves", () => {
    const attrs = { category: "reusable_work_gloves" as const, size: "l", color: "black", brand: "Acme" };
    const v = stageSafe("reusable_work_gloves", attrs);
    expect(v.stageable).toBe(true);
    expect(v.missing_required).toHaveLength(0);
    const p = publishSafe("reusable_work_gloves", attrs);
    expect(p.publishable).toBe(true);
  });
});

describe("normalization engine", () => {
  it("produces content + filter_attributes + category_inference + review_flags", () => {
    const row = {
      name: "Blue nitrile powder-free exam gloves large 4 mil case 1000",
      sku: "NIT-PF-4-L-BLU",
      cost: 85,
      material: "nitrile",
      color: "blue",
      size: "l",
      brand: "Acme",
      case_qty: 1000,
    };
    const result = runNormalization(row);
    expect(result.content.canonical_title).toBe("Blue nitrile powder-free exam gloves large 4 mil case 1000");
    expect(result.content.supplier_sku).toBe("NIT-PF-4-L-BLU");
    expect(result.category_slug).toBe("disposable_gloves");
    expect(result.category_inference).toBeDefined();
    expect(result.category_inference.category_slug).toBe("disposable_gloves");
    expect(result.category_inference.confidence).toBeGreaterThanOrEqual(CATEGORY_CONFIDENCE_THRESHOLD);
    expect(result.category_inference.reason).toBeDefined();
    expect(result.category_inference.ambiguous_candidates).toEqual([]);
    expect(result.filter_attributes.material).toBe("nitrile");
    expect(result.filter_attributes.powder).toBe("powder_free");
    expect(result.filter_attributes.packaging).toBe("case_1000_ct");
    expect(result.review_flags.some((f) => f.code === "missing_required")).toBe(false);
  });

  it("adds unmapped_value and missing_required flags", () => {
    const row = { name: "Gloves", sku: "X", cost: 10, material: "silk" };
    const result = runNormalization(row);
    expect(result.review_flags.some((f) => f.code === "unmapped_value" && f.attribute_key === "material")).toBe(true);
    expect(result.review_flags.some((f) => f.code === "missing_required")).toBe(true);
  });

  it("adds low_category_confidence and ambiguous_category review flags when title has no category signals", () => {
    const row = { name: "Gloves", sku: "X", cost: 10 };
    const result = runNormalization(row);
    expect(result.category_inference.confidence).toBe(0);
    expect(result.category_inference.ambiguous_candidates).toEqual(["disposable_gloves", "reusable_work_gloves"]);
    expect(result.review_flags.some((f) => f.code === "low_category_confidence")).toBe(true);
    expect(result.review_flags.some((f) => f.code === "ambiguous_category")).toBe(true);
  });
});

describe("staging payload generation", () => {
  it("builds valid insert payload with UUIDs", () => {
    const row = {
      name: "Black latex industrial gloves XL powdered 100 ct",
      sku: "LAT-XL-100",
      cost: 12,
      material: "latex",
      color: "black",
      size: "xl",
      brand: "Acme",
      box_qty: 100,
    };
    const result = runNormalization(row);
    const payload = buildStagingPayload({
      result,
      batchId: "11111111-1111-1111-1111-111111111111",
      rawId: "22222222-2222-2222-2222-222222222222",
      supplierId: "33333333-3333-3333-3333-333333333333",
    });
    expect(payload.batch_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(payload.status).toBe("pending");
    expect(payload.normalized_data.canonical_title).toBe("Black latex industrial gloves XL powdered 100 ct");
    expect(payload.normalized_data.filter_attributes.material).toBe("latex");
    expect(payload.attributes).toEqual(payload.normalized_data.filter_attributes);
  });
});
