/**
 * Tests for variant family inference: base SKU, size, group key, and safety rules.
 */

import { describe, it, expect } from "vitest";
import {
  inferBaseSkuAndSizeFromSku,
  inferVariantFromSku,
  inferBaseSkuAndSize,
  inferSizeFromTitleOrSpecs,
  buildFamilyGroupKey,
  buildFamilyGroupKeyForAxis,
  onlySizeDiffers,
  onlyDiffersOnVariantAxis,
  attrsCompatiblePair,
  computeFamilyInference,
  FAMILY_GROUPING_CONFIDENCE_THRESHOLD,
} from "./family-inference";

describe("inferBaseSkuAndSizeFromSku", () => {
  it("extracts base SKU and size for GL-N125FS, FM, FL, FXL", () => {
    expect(inferBaseSkuAndSizeFromSku("GL-N125FS")).toEqual({
      baseSku: "GL-N125F",
      size: "s",
      confidence: 0.95,
      source: "sku_suffix",
    });
    expect(inferBaseSkuAndSizeFromSku("GL-N125FM")).toEqual({
      baseSku: "GL-N125F",
      size: "m",
      confidence: 0.95,
      source: "sku_suffix",
    });
    expect(inferBaseSkuAndSizeFromSku("GL-N125FL")).toEqual({
      baseSku: "GL-N125F",
      size: "l",
      confidence: 0.95,
      source: "sku_suffix",
    });
    expect(inferBaseSkuAndSizeFromSku("GL-N125FXL")).toEqual({
      baseSku: "GL-N125F",
      size: "xl",
      confidence: 0.95,
      source: "sku_suffix",
    });
  });

  it("returns null for SKU without size suffix", () => {
    expect(inferBaseSkuAndSizeFromSku("GLOVE-200")).toBeNull();
    expect(inferBaseSkuAndSizeFromSku("ABC123")).toBeNull();
  });

  it("matches XXL and XS", () => {
    expect(inferBaseSkuAndSizeFromSku("X-100XXL")).toEqual({
      baseSku: "X-100",
      size: "xxl",
      confidence: 0.95,
      source: "sku_suffix",
    });
    expect(inferBaseSkuAndSizeFromSku("X-100XS")).toEqual({
      baseSku: "X-100",
      size: "xs",
      confidence: 0.95,
      source: "sku_suffix",
    });
  });

  it("parses GLV-N125S/M/L/XL style stems (no extra letter before size)", () => {
    expect(inferVariantFromSku("GLV-N125S")).toMatchObject({
      baseSku: "GLV-N125",
      axis: "size",
      value: "s",
    });
    expect(inferVariantFromSku("GLV-N125M")).toMatchObject({ baseSku: "GLV-N125", value: "m" });
    expect(inferVariantFromSku("GLV-N125L")).toMatchObject({ baseSku: "GLV-N125", value: "l" });
    expect(inferVariantFromSku("GLV-N125XL")).toMatchObject({ baseSku: "GLV-N125", value: "xl" });
  });

  it("parses optional separator before size token", () => {
    expect(inferVariantFromSku("GLV-N125-XL")).toMatchObject({
      baseSku: "GLV-N125",
      axis: "size",
      value: "xl",
    });
  });

  it("parses color suffix codes", () => {
    expect(inferVariantFromSku("ACME-200-BLU")).toMatchObject({
      axis: "color",
      value: "blue",
    });
    expect(inferVariantFromSku("ACME-200_BLK")).toMatchObject({
      axis: "color",
      value: "black",
    });
  });

  it("parses explicit SZ / SIZE before size token", () => {
    expect(inferVariantFromSku("PROD-SZ-M")).toMatchObject({
      baseSku: "PROD",
      axis: "size",
      value: "m",
    });
    expect(inferVariantFromSku("ITEM_SIZE_XL")).toMatchObject({
      baseSku: "ITEM",
      axis: "size",
      value: "xl",
    });
  });

  it("parses length tail in inches", () => {
    expect(inferVariantFromSku("WRAP-55-12IN")).toMatchObject({
      baseSku: "WRAP-55",
      axis: "length",
      value: "12",
    });
    expect(inferVariantFromSku("CORD_18\"")).toMatchObject({
      axis: "length",
      value: "18",
    });
  });

  it("parses SM, MD, LG and numeric shoe-style size tails", () => {
    expect(inferVariantFromSku("BOOT-PRO-MD")).toMatchObject({ axis: "size", value: "m" });
    expect(inferVariantFromSku("BOOT-PRO-SM")).toMatchObject({ axis: "size", value: "s" });
    expect(inferVariantFromSku("BOOT-PRO-LG")).toMatchObject({ axis: "size", value: "l" });
    expect(inferVariantFromSku("SHOE-99-10")).toMatchObject({ axis: "size", value: "10" });
    expect(inferVariantFromSku("RING-3XL")).toMatchObject({ axis: "size", value: "3xl" });
  });
});

describe("inferSizeFromTitleOrSpecs", () => {
  it("detects Small, Medium, Large, XL", () => {
    expect(inferSizeFromTitleOrSpecs("Nitrile Gloves Small")).toBe("s");
    expect(inferSizeFromTitleOrSpecs("Nitrile Gloves Medium")).toBe("m");
    expect(inferSizeFromTitleOrSpecs("Nitrile Gloves Large")).toBe("l");
    expect(inferSizeFromTitleOrSpecs("Nitrile Gloves XL")).toBe("xl");
    expect(inferSizeFromTitleOrSpecs("Extra Large Exam Gloves")).toBe("xl");
  });
  it("detects SM, MD, LG and 3XL / numeric size phrases", () => {
    expect(inferSizeFromTitleOrSpecs("Widget SM blue")).toBe("s");
    expect(inferSizeFromTitleOrSpecs("Widget MD blue")).toBe("m");
    expect(inferSizeFromTitleOrSpecs("Widget LG blue")).toBe("l");
    expect(inferSizeFromTitleOrSpecs("Heavy duty 3XL apron")).toBe("3xl");
    expect(inferSizeFromTitleOrSpecs("Leather glove size 10 grade A")).toBe("10");
  });
  it("returns null when no size in text", () => {
    expect(inferSizeFromTitleOrSpecs("Nitrile Exam Gloves 4mil")).toBeNull();
  });
});

describe("inferBaseSkuAndSize", () => {
  it("prefers SKU suffix over title", () => {
    const r = inferBaseSkuAndSize("GL-N125FS", { title: "Medium Gloves" });
    expect(r.baseSku).toBe("GL-N125F");
    expect(r.size).toBe("s");
    expect(r.source).toBe("sku_suffix");
  });
  it("falls back to title when no SKU suffix", () => {
    const r = inferBaseSkuAndSize("GLOVE-200", { title: "Nitrile Gloves Medium" });
    expect(r.baseSku).toBe("GLOVE-200");
    expect(r.size).toBe("m");
    expect(r.source).toBe("title_or_specs");
  });
  it("uses sizeFromAttrs when provided", () => {
    const r = inferBaseSkuAndSize("GLOVE-200", { title: "Gloves", sizeFromAttrs: "l" });
    expect(r.size).toBe("l");
    expect(r.confidence).toBe(0.9);
  });
});

describe("buildFamilyGroupKey", () => {
  it("produces same key for same base SKU and shared attrs", () => {
    const attrs = { brand: "Acme", material: "nitrile", thickness_mil: "4", color: "blue", powder: "powder_free", grade: "medical_exam_grade", packaging: "box_100_ct" };
    const k1 = buildFamilyGroupKey("GL-N125F", attrs);
    const k2 = buildFamilyGroupKey("GL-N125F", { ...attrs });
    expect(k1).toBe(k2);
  });
  it("produces different key when color differs", () => {
    const k1 = buildFamilyGroupKey("GL-N125F", { brand: "Acme", material: "nitrile", color: "blue" });
    const k2 = buildFamilyGroupKey("GL-N125F", { brand: "Acme", material: "nitrile", color: "black" });
    expect(k1).not.toBe(k2);
  });
});

describe("buildFamilyGroupKeyForAxis", () => {
  it("matches legacy key for size axis", () => {
    const attrs = { brand: "Acme", material: "nitrile", color: "blue" };
    expect(buildFamilyGroupKeyForAxis("GLV-N125", attrs, "size")).toBe(buildFamilyGroupKey("GLV-N125", attrs));
  });
  it("ignores color in key when axis is color", () => {
    const a = { brand: "Acme", material: "nitrile", color: "blue" };
    const b = { brand: "Acme", material: "nitrile", color: "black" };
    expect(buildFamilyGroupKeyForAxis("X-1", a, "color")).toBe(buildFamilyGroupKeyForAxis("X-1", b, "color"));
  });
});

describe("onlyDiffersOnVariantAxis", () => {
  it("allows color to differ when axis is color", () => {
    expect(
      onlyDiffersOnVariantAxis(
        { brand: "Acme", material: "nitrile", thickness_mil: "4", color: "blue" },
        { brand: "Acme", material: "nitrile", thickness_mil: "4", color: "black" },
        "color"
      )
    ).toBe(true);
  });
});

describe("onlySizeDiffers", () => {
  it("returns true when only size differs", () => {
    const a = { brand: "Acme", material: "nitrile", thickness_mil: "4", color: "blue", size: "s" };
    const b = { brand: "Acme", material: "nitrile", thickness_mil: "4", color: "blue", size: "m" };
    expect(onlySizeDiffers(a, b)).toBe(true);
  });
  it("returns false when color differs", () => {
    const a = { brand: "Acme", material: "nitrile", color: "blue", size: "s" };
    const b = { brand: "Acme", material: "nitrile", color: "black", size: "s" };
    expect(onlySizeDiffers(a, b)).toBe(false);
  });
  it("returns false when material or thickness differs", () => {
    expect(onlySizeDiffers(
      { material: "nitrile", thickness_mil: "4" },
      { material: "latex", thickness_mil: "4" }
    )).toBe(false);
    expect(onlySizeDiffers(
      { material: "nitrile", thickness_mil: "4" },
      { material: "nitrile", thickness_mil: "6" }
    )).toBe(false);
  });
});

describe("attrsCompatiblePair", () => {
  it("allows missing vs present except when both non-empty disagree", () => {
    const a = { brand: "acme", material: "nitrile", color: "blue" };
    const b = { brand: "", material: "nitrile", color: "blue" };
    const c = { brand: "other", material: "nitrile", color: "blue" };
    expect(attrsCompatiblePair(a, b, "size")).toBe(true);
    expect(attrsCompatiblePair(a, c, "size")).toBe(false);
  });
});

describe("computeFamilyInference", () => {
  it("groups GL-N125FS, FM, FL, FXL into one family when attrs match", async () => {
    const sharedAttrs = { brand: "Acme", material: "nitrile", thickness_mil: "4", color: "blue", powder: "powder_free", grade: "medical_exam_grade", packaging: "box_100_ct" };
    const rows = [
      { id: "1", sku: "GL-N125FS", normalized_data: { supplier_sku: "GL-N125FS", canonical_title: "Glove S" }, attributes: sharedAttrs },
      { id: "2", sku: "GL-N125FM", normalized_data: { supplier_sku: "GL-N125FM", canonical_title: "Glove M" }, attributes: sharedAttrs },
      { id: "3", sku: "GL-N125FL", normalized_data: { supplier_sku: "GL-N125FL", canonical_title: "Glove L" }, attributes: sharedAttrs },
      { id: "4", sku: "GL-N125FXL", normalized_data: { supplier_sku: "GL-N125FXL", canonical_title: "Glove XL" }, attributes: sharedAttrs },
    ];
    const result = await computeFamilyInference(rows, { confidenceThreshold: FAMILY_GROUPING_CONFIDENCE_THRESHOLD });
    expect(result).toHaveLength(4);
    const key = result[0].family_group_key;
    expect(key).toBeTruthy();
    result.forEach((r, i) => {
      expect(r.inferred_base_sku).toBe("GL-N125F");
      expect(r.inferred_size).toBe(["s", "m", "l", "xl"][i]);
      expect(r.family_group_key).toBe(key);
      expect(r.variant_axis).toBe("size");
      expect(r.variant_value).toBe(["s", "m", "l", "xl"][i]);
    });
  });

  it("groups color suffix SKUs when only color differs", async () => {
    const shared = { brand: "Acme", material: "nitrile", thickness_mil: "4", powder: "powder_free", grade: "medical_exam_grade", packaging: "box_100_ct" };
    const rows = [
      { id: "1", sku: "LINE-99-BLU", normalized_data: { supplier_sku: "LINE-99-BLU" }, attributes: { ...shared, color: "blue" } },
      { id: "2", sku: "LINE-99-BLK", normalized_data: { supplier_sku: "LINE-99-BLK" }, attributes: { ...shared, color: "black" } },
    ];
    const result = await computeFamilyInference(rows, { confidenceThreshold: 0.85 });
    const key = result[0].family_group_key;
    expect(key).toBeTruthy();
    expect(result[1].family_group_key).toBe(key);
    expect(result[0].variant_axis).toBe("color");
    expect(result[0].variant_value).toBe("blue");
    expect(result[1].variant_value).toBe("black");
  });

  it("does NOT group when color differs (mixed products)", async () => {
    const rows = [
      { id: "1", sku: "GL-N125FS", normalized_data: { supplier_sku: "GL-N125FS" }, attributes: { brand: "Acme", material: "nitrile", color: "blue" } },
      { id: "2", sku: "GL-N125FM", normalized_data: { supplier_sku: "GL-N125FM" }, attributes: { brand: "Acme", material: "nitrile", color: "black" } },
    ];
    const result = await computeFamilyInference(rows, { confidenceThreshold: 0.85 });
    expect(result).toHaveLength(2);
    expect(result[0].family_group_key).toBeNull();
    expect(result[1].family_group_key).toBeNull();
  });

  it("does NOT group when thickness_mil differs", async () => {
    const rows = [
      { id: "1", sku: "GL-N125FS", normalized_data: { supplier_sku: "GL-N125FS" }, attributes: { brand: "Acme", material: "nitrile", thickness_mil: "4", color: "blue" } },
      { id: "2", sku: "GL-N125FM", normalized_data: { supplier_sku: "GL-N125FM" }, attributes: { brand: "Acme", material: "nitrile", thickness_mil: "6", color: "blue" } },
    ];
    const result = await computeFamilyInference(rows, { confidenceThreshold: 0.85 });
    expect(result).toHaveLength(2);
    expect(result[0].family_group_key).toBeNull();
    expect(result[1].family_group_key).toBeNull();
  });

  it("does NOT group color variants when titles have no token overlap (no strong size waiver)", async () => {
    const shared = { brand: "Acme", material: "nitrile", thickness_mil: "4", powder: "powder_free", grade: "medical_exam_grade", packaging: "box_100_ct" };
    const rows = [
      {
        id: "1",
        sku: "LINE-99-BLU",
        normalized_data: { supplier_sku: "LINE-99-BLU", canonical_title: "aaa bbb ccc ddd eee uniquealpha" },
        attributes: { ...shared, color: "blue" },
      },
      {
        id: "2",
        sku: "LINE-99-BLK",
        normalized_data: { supplier_sku: "LINE-99-BLK", canonical_title: "zzz yyy www vvv uuu uniqueomega" },
        attributes: { ...shared, color: "black" },
      },
    ];
    const result = await computeFamilyInference(rows, { confidenceThreshold: 0.85 });
    expect(result[0].family_group_key).toBeNull();
    expect(result[1].family_group_key).toBeNull();
  });

  it("does NOT group when category_slug differs on normalized_data (guard)", async () => {
    const sharedAttrs = { brand: "Acme", material: "nitrile", thickness_mil: "4", color: "blue", powder: "powder_free", grade: "medical_exam_grade", packaging: "box_100_ct" };
    const rows = [
      {
        id: "1",
        sku: "GL-N125FS",
        normalized_data: { supplier_sku: "GL-N125FS", canonical_title: "Glove S", category_slug: "exam-gloves" },
        attributes: sharedAttrs,
      },
      {
        id: "2",
        sku: "GL-N125FM",
        normalized_data: { supplier_sku: "GL-N125FM", canonical_title: "Glove M", category_slug: "disposable-apparel" },
        attributes: sharedAttrs,
      },
    ];
    const result = await computeFamilyInference(rows, { confidenceThreshold: FAMILY_GROUPING_CONFIDENCE_THRESHOLD });
    expect(result[0].family_group_key).toBeNull();
    expect(result[1].family_group_key).toBeNull();
  });

  it("groups title-inferred color variants when brand and material exist and titles align", async () => {
    const shared = { brand: "Acme", material: "nitrile", thickness_mil: "4", powder: "powder_free", grade: "medical_exam_grade", packaging: "box_100_ct" };
    const rows = [
      {
        id: "1",
        sku: "GLOVE-MODEL-X",
        normalized_data: { supplier_sku: "GLOVE-MODEL-X", canonical_title: "Acme nitrile exam glove blue box" },
        attributes: { ...shared, color: "blue" },
      },
      {
        id: "2",
        sku: "GLOVE-MODEL-X",
        normalized_data: { supplier_sku: "GLOVE-MODEL-X", canonical_title: "Acme nitrile exam glove black box" },
        attributes: { ...shared, color: "black" },
      },
    ];
    const result = await computeFamilyInference(rows, { confidenceThreshold: 0.85 });
    const key = result[0].family_group_key;
    expect(key).toBeTruthy();
    expect(result[1].family_group_key).toBe(key);
    expect(result[0].variant_axis).toBe("color");
    expect(result[0].family_group_meta?.v).toBe(1);
    expect(result[0].family_group_meta?.row_count).toBe(2);
  });

  it("still groups strong size-SKU variants when titles are unrelated (title waiver)", async () => {
    const sharedAttrs = { brand: "Acme", material: "nitrile", thickness_mil: "4", color: "blue", powder: "powder_free", grade: "medical_exam_grade", packaging: "box_100_ct" };
    const rows = [
      {
        id: "1",
        sku: "GL-N125FS",
        normalized_data: { supplier_sku: "GL-N125FS", canonical_title: "qqq www eee rrr" },
        attributes: sharedAttrs,
      },
      {
        id: "2",
        sku: "GL-N125FM",
        normalized_data: { supplier_sku: "GL-N125FM", canonical_title: "ttt yyy uuu iii ooo" },
        attributes: sharedAttrs,
      },
    ];
    const result = await computeFamilyInference(rows, { confidenceThreshold: FAMILY_GROUPING_CONFIDENCE_THRESHOLD });
    expect(result[0].family_group_key).toBeTruthy();
    expect(result[1].family_group_key).toBe(result[0].family_group_key);
    expect(result[0].family_group_meta?.title_similarity_min).toBeNull();
  });

  it("groups size SKUs when one row omits optional attrs (tolerant identity)", async () => {
    const full = { brand: "Acme", material: "nitrile", thickness_mil: "4", color: "blue", powder: "powder_free", grade: "medical_exam_grade", packaging: "box_100_ct" };
    const partial = { brand: "Acme", material: "nitrile", color: "blue" };
    const rows = [
      { id: "1", sku: "GL-N125FS", normalized_data: { supplier_sku: "GL-N125FS", canonical_title: "Glove S" }, attributes: full },
      { id: "2", sku: "GL-N125FM", normalized_data: { supplier_sku: "GL-N125FM", canonical_title: "Glove M" }, attributes: partial },
    ];
    const result = await computeFamilyInference(rows, { confidenceThreshold: FAMILY_GROUPING_CONFIDENCE_THRESHOLD });
    expect(result[0].family_group_key).toBeTruthy();
    expect(result[1].family_group_key).toBe(result[0].family_group_key);
  });

  it("uses AI hint only for ungrouped rows when hook returns a parse", async () => {
    const rows = [
      {
        id: "1",
        sku: "ZZ-UNKNOWN-A",
        normalized_data: { supplier_sku: "ZZ-UNKNOWN-A", canonical_title: "Mystery widget variant A" },
        attributes: { brand: "Acme", material: "nitrile", color: "blue" },
      },
      {
        id: "2",
        sku: "ZZ-UNKNOWN-B",
        normalized_data: { supplier_sku: "ZZ-UNKNOWN-B", canonical_title: "Mystery widget variant B" },
        attributes: { brand: "Acme", material: "nitrile", color: "blue" },
      },
    ];
    const result = await computeFamilyInference(rows, {
      confidenceThreshold: 0.85,
      enableTitleStemCluster: false,
      enableTitleDescriptionCluster: false,
      aiVariantHint: async ({ sku }) => {
        if (sku.includes("ZZ-UNKNOWN")) {
          return {
            baseSku: "ZZ-UNKNOWN",
            axis: "size",
            value: sku.endsWith("A") ? "s" : "m",
            confidence: 0.65,
            source: "ai_variant_hint",
          };
        }
        return null;
      },
    });
    expect(result[0].family_group_key).toBeTruthy();
    expect(result[1].family_group_key).toBe(result[0].family_group_key);
    expect(result[0].family_group_meta?.sources).toContain("ai_variant_hint");
    expect(result[0].family_group_meta?.grouping_tier).toBe("ai_hint");
  });
});
