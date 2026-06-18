import { describe, expect, it } from "vitest";
import {
  IMPORT_DRAFT_PARSER_VERSION,
  IMPORT_DRAFT_SCHEMA_VERSION,
  type ImportDraftProductV1,
} from "@/lib/admin/import-draft-types";
import {
  hasManualManufacturerSkuEdits,
  manufacturerFieldsFromDraftVariant,
  proposeVariantsFromImport,
  sortVariantsByGloveSize,
} from "@/lib/admin/variant-generation";

function minimalDraft(overrides: Partial<ImportDraftProductV1> = {}): ImportDraftProductV1 {
  return {
    schema_version: IMPORT_DRAFT_SCHEMA_VERSION,
    parser_version: IMPORT_DRAFT_PARSER_VERSION,
    source_url: "https://example.com/p",
    product_name: "Glove",
    brand: "Acme",
    category_hint: null,
    description: null,
    image_url: null,
    sku: null,
    mpn: null,
    gtin: null,
    material: "nitrile",
    color: null,
    thickness_mil: 3,
    case_pack: null,
    units_per_case: null,
    powder_free: true,
    latex_free: true,
    exam_grade: true,
    glove_grade: null,
    size: null,
    variants: [],
    confidence: { overall: 0.5, fields: {} },
    field_provenance: {},
    parse_warnings: [],
    raw_evidence: {},
    ...overrides,
  };
}

describe("sortVariantsByGloveSize", () => {
  it("sorts in XS, S, M, L, XL, XXL, XXXL order", () => {
    const sorted = sortVariantsByGloveSize([
      { sizeCode: "XL", variantSku: "", listPrice: "" },
      { sizeCode: "L", variantSku: "", listPrice: "" },
      { sizeCode: "M", variantSku: "", listPrice: "" },
    ]);
    expect(sorted.map((r) => r.sizeCode)).toEqual(["M", "L", "XL"]);
  });

  it("places unknown sizes after known sizes", () => {
    const sorted = sortVariantsByGloveSize([
      { sizeCode: "CUSTOM", variantSku: "", listPrice: "" },
      { sizeCode: "S", variantSku: "", listPrice: "" },
    ]);
    expect(sorted.map((r) => r.sizeCode)).toEqual(["S", "CUSTOM"]);
  });
});

describe("proposeVariantsFromImport", () => {
  it("sorts generated variants by canonical size order", () => {
    const draft = minimalDraft({
      variants: [
        { size_label: "L", normalized_size_code: "L", sku: null, manufacturer_sku: "N105ORFL", mpn: null, gtin: null, list_price: null },
        { size_label: "XL", normalized_size_code: "XL", sku: null, manufacturer_sku: "N105ORFX", mpn: null, gtin: null, list_price: null },
        { size_label: "M", normalized_size_code: "M", sku: null, manufacturer_sku: "N105ORFM", mpn: null, gtin: null, list_price: null },
      ],
    });
    const proposal = proposeVariantsFromImport(draft, []);
    expect(proposal.proposed.map((v) => v.sizeCode)).toEqual(["M", "L", "XL"]);
  });

  it("assigns per-variant manufacturer SKUs from import evidence", () => {
    const draft = minimalDraft({
      variants: [
        { size_label: "M", normalized_size_code: "M", sku: null, manufacturer_sku: "N105ORFM", mpn: null, gtin: null, list_price: null },
        { size_label: "L", normalized_size_code: "L", sku: null, manufacturer_sku: "N105ORFL", mpn: null, gtin: null, list_price: null },
      ],
    });
    const proposal = proposeVariantsFromImport(draft, []);
    expect(proposal.proposed.find((v) => v.sizeCode === "M")?.manufacturerSku).toBe("N105ORFM");
    expect(proposal.proposed.find((v) => v.sizeCode === "L")?.manufacturerSku).toBe("N105ORFL");
  });

  it("preserves manual manufacturer SKU edits on re-generate", () => {
    const draft = minimalDraft({
      variants: [
        { size_label: "M", normalized_size_code: "M", sku: null, manufacturer_sku: "N105ORFM", mpn: null, gtin: null, list_price: null },
      ],
    });
    const existing = [
      {
        sizeCode: "M",
        variantSku: "GC-TEST-M",
        listPrice: "",
        manufacturerSku: "CUSTOM-M",
        manufacturerSkuSource: "manual" as const,
      },
    ];
    const proposal = proposeVariantsFromImport(draft, existing, { preserveManualSkus: true });
    expect(proposal.proposed[0]?.manufacturerSku).toBe("CUSTOM-M");
    expect(proposal.proposed[0]?.variantSku).toBe("GC-TEST-M");
  });
});

describe("manufacturerFieldsFromDraftVariant", () => {
  it("marks missing manufacturer SKU as needs review", () => {
    const fields = manufacturerFieldsFromDraftVariant({
      size_label: "M",
      normalized_size_code: "M",
      sku: null,
      mpn: null,
      gtin: null,
      list_price: null,
    });
    expect(fields.manufacturerSkuSource).toBe("missing");
    expect(fields.manufacturerSkuNeedsReview).toBe(true);
  });
});

describe("hasManualManufacturerSkuEdits", () => {
  it("detects manual manufacturer SKU source", () => {
    expect(
      hasManualManufacturerSkuEdits([
        { sizeCode: "M", variantSku: "", listPrice: "", manufacturerSkuSource: "manual" },
      ])
    ).toBe(true);
  });
});
