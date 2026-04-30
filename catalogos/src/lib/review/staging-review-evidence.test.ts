import { describe, it, expect } from "vitest";
import {
  buildStagedProductReviewEvidence,
  formatConfidencePct,
  getPackagingMathReview,
  getStagingSizeDisplay,
  getStagingSourceTitle,
  getVariantSkuDisplay,
  summarizeEvidenceReview,
  unwrapExtractedField,
} from "./staging-review-evidence";

describe("formatConfidencePct", () => {
  it("renders percent for finite confidence", () => {
    expect(formatConfidencePct(0.85)).toBe("85%");
  });
  it("renders em dash when confidence missing", () => {
    expect(formatConfidencePct(undefined)).toBe("—");
    expect(formatConfidencePct(Number.NaN)).toBe("—");
  });
});

describe("unwrapExtractedField", () => {
  it("unwraps OpenClaw ExtractedField shape", () => {
    const u = unwrapExtractedField({
      raw_value: "Nitrile",
      normalized_value: "nitrile",
      confidence: 0.88,
      extraction_method: "table_parse",
    });
    expect(u?.rawDisplay).toBe("Nitrile");
    expect(u?.confidence).toBe(0.88);
    expect(u?.method).toBe("table_parse");
  });
});

describe("getVariantSkuDisplay", () => {
  it("matches evidence variant_sku precedence (supplier_sku before nd.sku)", () => {
    const nd = { supplier_sku: "SUP-1", sku: "ROW-1" };
    expect(getVariantSkuDisplay(nd, {})).toBe("SUP-1");
    expect(getVariantSkuDisplay({ sku: "ROW-2" }, {})).toBe("ROW-2");
    expect(getVariantSkuDisplay({}, { supplier_sku: "ATTR-SKU" })).toBe("ATTR-SKU");
  });
});

describe("getStagingSourceTitle", () => {
  it("prefers canonical_title then name", () => {
    expect(getStagingSourceTitle({ canonical_title: "CT", name: "N" })).toBe("CT");
    expect(getStagingSourceTitle({ name: "Only" })).toBe("Only");
    expect(getStagingSourceTitle({})).toBe("—");
  });
});

describe("getStagingSizeDisplay", () => {
  it("prefers inferred_size over attributes.size", () => {
    expect(getStagingSizeDisplay("XL", { size: "L" })).toBe("XL");
    expect(getStagingSizeDisplay(null, { size: "M" })).toBe("M");
    expect(getStagingSizeDisplay("", {})).toBe("—");
  });
});

describe("summarizeEvidenceReview", () => {
  it("counts only normalizedConfidence strictly below 0.60", () => {
    const rows = buildStagedProductReviewEvidence(
      {
        supplier_sku: "S",
        confidence_by_key: { material: 0.59, color: 0.6, grade: 0.5 },
        filter_attributes: { material: "a", color: "b", grade: "c" },
      },
      {},
      {}
    );
    const s = summarizeEvidenceReview(rows);
    expect(s.total).toBe(rows.length);
    expect(rows.find((r) => r.id === "color")?.normalizedConfidence).toBe(0.6);
    const lowIds = rows
      .filter((r) => r.normalizedConfidence != null && r.normalizedConfidence < 0.6)
      .map((r) => r.id);
    expect(lowIds).toEqual(expect.arrayContaining(["material", "grade"]));
    expect(lowIds).not.toContain("color");
    expect(s.lowConfidenceCount).toBe(lowIds.length);
  });
});

describe("getPackagingMathReview", () => {
  it("matches when product equals declared total", () => {
    const r = getPackagingMathReview({
      boxes_per_case: 10,
      gloves_per_box: 100,
      total_gloves_per_case: 1000,
    });
    expect(r.state).toBe("matches");
    expect(r.boxes).toBe(10);
    expect(r.glovesPerBox).toBe(100);
    expect(r.computedTotal).toBe(1000);
    expect(r.declaredTotal).toBe(1000);
  });

  it("mismatch when declared differs from product", () => {
    const r = getPackagingMathReview({
      boxes_per_case: 10,
      gloves_per_box: 100,
      total_gloves_per_case: 999,
    });
    expect(r.state).toBe("mismatch");
    expect(r.computedTotal).toBe(1000);
    expect(r.declaredTotal).toBe(999);
  });

  it("matches when product computable and no declared total", () => {
    const r = getPackagingMathReview({ boxes_per_case: 10, gloves_per_box: 100 });
    expect(r.state).toBe("matches");
    expect(r.computedTotal).toBe(1000);
    expect(r.declaredTotal).toBeNull();
  });

  it("incomplete when a factor is missing", () => {
    expect(getPackagingMathReview({ boxes_per_case: 10 }).state).toBe("incomplete");
    expect(getPackagingMathReview({ gloves_per_box: 100 }).state).toBe("incomplete");
  });

  it("uses pricing.boxes_per_case when nd.boxes_per_case absent", () => {
    const r = getPackagingMathReview({
      pricing: { boxes_per_case: 5 },
      gloves_per_box: 20,
      total_gloves_per_case: 100,
    });
    expect(r.state).toBe("matches");
    expect(r.boxes).toBe(5);
    expect(r.computedTotal).toBe(100);
  });

  it("uses box_qty when gloves_per_box absent", () => {
    const r = getPackagingMathReview({ boxes_per_case: 2, box_qty: 50, total_gloves_per_case: 100 });
    expect(r.state).toBe("matches");
    expect(r.glovesPerBox).toBe(50);
  });

  it("incomplete when only declared total present", () => {
    const r = getPackagingMathReview({ total_gloves_per_case: 1000 });
    expect(r.state).toBe("incomplete");
    expect(r.computedTotal).toBeNull();
    expect(r.declaredTotal).toBe(1000);
  });
});

describe("buildStagedProductReviewEvidence", () => {
  it("shows normalized confidence from confidence_by_key when present", () => {
    const rows = buildStagedProductReviewEvidence(
      {
        supplier_sku: "SKU-1",
        confidence_by_key: { material: 0.9, color: 0.85 },
        filter_attributes: { material: "nitrile", color: "blue" },
      },
      {},
      {}
    );
    const mat = rows.find((r) => r.id === "material");
    const col = rows.find((r) => r.id === "color");
    expect(mat?.normalizedDisplay).toBe("nitrile");
    expect(mat?.normalizedConfidence).toBe(0.9);
    expect(col?.normalizedConfidence).toBe(0.85);
  });

  it("shows GTIN, MPN, and manufacturer from normalized_data", () => {
    const rows = buildStagedProductReviewEvidence(
      {
        supplier_sku: "V-1",
        upc: "012345678905",
        manufacturer_part_number: "MPN-99",
        manufacturer: "Acme OEM",
        filter_attributes: {},
      },
      {},
      {}
    );
    expect(rows.find((r) => r.id === "gtin")?.normalizedDisplay).toBe("012345678905");
    expect(rows.find((r) => r.id === "mpn")?.normalizedDisplay).toBe("MPN-99");
    expect(rows.find((r) => r.id === "manufacturer")?.normalizedDisplay).toBe("Acme OEM");
  });

  it("shows spec_sheet_urls count in evidence when present", () => {
    const rows = buildStagedProductReviewEvidence(
      {
        supplier_sku: "V-1",
        spec_sheet_urls: ["https://a.com/spec.pdf", "https://a.com/sds.pdf"],
        filter_attributes: { material: "nitrile" },
      },
      { material: "nitrile" },
      { spec_sheet_urls: ["https://a.com/spec.pdf", "https://a.com/sds.pdf"] }
    );
    const spec = rows.find((r) => r.id === "spec_sheet_urls");
    expect(spec?.normalizedDisplay).toBe("2 link(s)");
    expect(spec?.sourceHint?.rawDisplay).toContain("https://a.com/spec.pdf");
  });

  it("shows packaging fields separately from filter attributes", () => {
    const rows = buildStagedProductReviewEvidence(
      {
        supplier_sku: "V-2",
        boxes_per_case: 10,
        gloves_per_box: 100,
        total_gloves_per_case: 1000,
        pricing: { boxes_per_case: 10 },
        filter_attributes: { material: "nitrile" },
      },
      {},
      {}
    );
    expect(rows.find((r) => r.id === "boxes_per_case")?.normalizedDisplay).toBe("10");
    expect(rows.find((r) => r.id === "gloves_per_box")?.normalizedDisplay).toBe("100");
    expect(rows.find((r) => r.id === "total_gloves_per_case")?.normalizedDisplay).toBe("1000");
  });

  it("surfaces raw extract hint without overwriting normalized confidence", () => {
    const rows = buildStagedProductReviewEvidence(
      {
        supplier_sku: "V-3",
        confidence_by_key: { material: 0.72 },
        filter_attributes: { material: "nitrile" },
      },
      {},
      {
        material: { raw_value: "Nitrile blend", confidence: 0.91, extraction_method: "pattern_match" },
      }
    );
    const mat = rows.find((r) => r.id === "material");
    expect(mat?.normalizedConfidence).toBe(0.72);
    expect(mat?.sourceHint?.rawDisplay).toContain("Nitrile blend");
    expect(mat?.sourceHint?.confidence).toBe(0.91);
  });

  it("surfaces _fieldExtraction ontology hint when distinct from raw", () => {
    const rows = buildStagedProductReviewEvidence(
      {
        supplier_sku: "V-4",
        confidence_by_key: { size: 0.9 },
        filter_attributes: { size: "m" },
        _fieldExtraction: {
          size: { raw_value: "Medium", normalized_value: "m", confidence: 0.81 },
        },
      },
      {},
      { size: "Med" }
    );
    const sz = rows.find((r) => r.id === "size_code");
    expect(sz?.normalizedDisplay).toBe("m");
    expect(sz?.ontologyHint?.rawDisplay).toContain("Medium");
  });
});
