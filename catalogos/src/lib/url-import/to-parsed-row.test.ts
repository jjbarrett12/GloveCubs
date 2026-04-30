import { describe, it, expect } from "vitest";
import { finalizeUrlImportParsedRow, normalizedFamilyToParsedRow, urlImportPayloadToParsedRow } from "./to-parsed-row";
import type { NormalizedFamily } from "@/lib/openclaw/normalize";

describe("urlImportPayloadToParsedRow", () => {
  it("maps compliance_tags to certifications and adds extractable hints", () => {
    const row = urlImportPayloadToParsedRow({
      sku: "SKU-1",
      compliance_tags: ["fda_approved", "astm_tested"],
      name: "Glove",
    });
    expect(row.certifications).toEqual(expect.arrayContaining(["fda_approved", "astm_tested"]));
    expect(String(row.long_description ?? "")).toMatch(/fda approved/i);
    expect(String(row.long_description ?? "")).toMatch(/astm/i);
    expect(row).not.toHaveProperty("compliance_tags");
  });

  it("maps use_case_tags to uses", () => {
    const row = urlImportPayloadToParsedRow({
      sku: "SKU-2",
      use_case_tags: ["medical_exam", "food_handling"],
    });
    expect(row.uses).toEqual(expect.arrayContaining(["medical_exam", "food_handling"]));
    expect(row).not.toHaveProperty("use_case_tags");
  });

  it("maps supplier_manufacturer to manufacturer", () => {
    const row = urlImportPayloadToParsedRow({
      sku: "SKU-3",
      supplier_manufacturer: "Acme OEM",
    });
    expect(row.manufacturer).toBe("Acme OEM");
    expect(row).not.toHaveProperty("supplier_manufacturer");
  });

  it("preserves MPN and consolidates UPC/GTIN into upc", () => {
    const row = urlImportPayloadToParsedRow({
      sku: "SKU-4",
      mpn: "MPN-99",
      gtin: "012345678905",
    });
    expect(row.manufacturer_part_number).toBe("MPN-99");
    expect(row.upc).toBe("012345678905");
    expect(row).not.toHaveProperty("mpn");
  });

  it("does not set boxes_per_case from case_qty alone", () => {
    const row = urlImportPayloadToParsedRow({
      sku: "SKU-5",
      case_qty: 10,
      box_qty: 100,
    });
    expect(row.boxes_per_case).toBeUndefined();
    expect(row.case_qty).toBe(10);
  });

  it("keeps explicit boxes_per_case and derives total_gloves_per_case", () => {
    const row = urlImportPayloadToParsedRow({
      sku: "SKU-6",
      boxes_per_case: 4,
      gloves_per_box: 100,
    });
    expect(row.boxes_per_case).toBe(4);
    expect(row.gloves_per_box).toBe(100);
    expect(row.total_gloves_per_case).toBe(400);
  });

  it("merges image_urls into images and image_url", () => {
    const row = urlImportPayloadToParsedRow({
      sku: "SKU-7",
      image_urls: ["https://cdn.example.com/a.png", "https://cdn.example.com/b.png"],
    });
    expect(row.images).toEqual(["https://cdn.example.com/a.png", "https://cdn.example.com/b.png"]);
    expect(row.image_url).toBe("https://cdn.example.com/a.png");
    expect(row).not.toHaveProperty("image_urls");
  });

  it("lifts mpn and tags from _extracted", () => {
    const row = urlImportPayloadToParsedRow({
      sku: "SKU-8",
      name: "X",
      _extracted: {
        mpn: { raw_value: "Z-MPN", normalized_value: "Z-MPN", confidence: 1, extraction_method: "table_parse" },
        compliance_tags: { raw_value: ["latex_free"], normalized_value: ["latex_free"], confidence: 1, extraction_method: "inference" },
      },
    });
    expect(row.manufacturer_part_number).toBe("Z-MPN");
    expect(row.certifications).toEqual(expect.arrayContaining(["latex_free"]));
    expect(row).not.toHaveProperty("_extracted");
  });
});

describe("normalizedFamilyToParsedRow", () => {
  it("does not populate boxes_per_case from case_qty", () => {
    const normalized = {
      sku: "V-1",
      family_name: "Fam",
      box_qty: 100,
      case_qty: 10,
      source_url: "https://example.com/p",
    } as unknown as NormalizedFamily;

    const row = normalizedFamilyToParsedRow(normalized, {});
    expect(row.boxes_per_case).toBeUndefined();
    expect(row.case_qty).toBe(10);
    expect(row.gloves_per_box).toBe(100);
  });

  it("uses explicit boxes_per_case on normalized record when present", () => {
    const normalized = {
      sku: "V-2",
      family_name: "Fam",
      box_qty: 100,
      case_qty: 10,
      source_url: "https://example.com/p",
      boxes_per_case: 5,
    } as unknown as NormalizedFamily;

    const row = normalizedFamilyToParsedRow(normalized, {});
    expect(row.boxes_per_case).toBe(5);
    expect(row.total_gloves_per_case).toBe(500);
  });

  it("reads boxes per case from parsedPage spec_table when missing on family", () => {
    const normalized = {
      sku: "V-3",
      family_name: "Fam",
      box_qty: 50,
      source_url: "https://example.com/p",
    } as unknown as NormalizedFamily;

    const row = normalizedFamilyToParsedRow(normalized, {
      parsedPage: {
        spec_table: {
          "Boxes per Case": "8",
        },
      },
    });
    expect(row.boxes_per_case).toBe(8);
    expect(row.total_gloves_per_case).toBe(400);
  });

  it("merges spec_sheet_urls from parsedPage into parsed row", () => {
    const normalized = {
      sku: "V-4",
      family_name: "Fam",
      source_url: "https://example.com/p",
    } as unknown as NormalizedFamily;

    const row = normalizedFamilyToParsedRow(normalized, {
      parsedPage: {
        spec_sheet_urls: ["https://cdn.example.com/spec.pdf", "https://cdn.example.com/sds.pdf"],
      },
    });
    expect(row.spec_sheet_urls).toEqual(["https://cdn.example.com/spec.pdf", "https://cdn.example.com/sds.pdf"]);
  });
});

describe("finalizeUrlImportParsedRow", () => {
  it("merges and dedupes spec_sheet_urls from row and parsedPage", () => {
    const row = finalizeUrlImportParsedRow(
      { sku: "S", spec_sheet_urls: ["https://a.com/a.pdf"] },
      { parsedPage: { spec_sheet_urls: ["https://a.com/a.pdf", "https://b.com/sds.pdf"] } }
    );
    expect(row.spec_sheet_urls).toEqual(["https://a.com/a.pdf", "https://b.com/sds.pdf"]);
  });
});
