import { describe, expect, it } from "vitest";
import {
  IMPORT_DRAFT_PARSER_VERSION,
  IMPORT_DRAFT_SCHEMA_VERSION,
  type ImportDraftProductV1,
} from "@/lib/admin/import-draft-types";
import { draftPromoteVariants, importDraftToProductWriteInput } from "@/lib/admin/import-draft-promote";

function baseDraft(overrides: Partial<ImportDraftProductV1> = {}): ImportDraftProductV1 {
  return {
    schema_version: IMPORT_DRAFT_SCHEMA_VERSION,
    parser_version: IMPORT_DRAFT_PARSER_VERSION,
    source_url: "https://example.com/p",
    product_name: "Test Glove",
    brand: "Acme",
    category_hint: null,
    description: "Desc",
    image_url: null,
    sku: "SKU-1",
    mpn: null,
    gtin: null,
    material: "nitrile",
    color: "blue",
    thickness_mil: 4,
    case_pack: "10/100",
    units_per_case: 1000,
    powder_free: true,
    latex_free: true,
    exam_grade: true,
    glove_grade: "medical_exam_grade",
    size: "M",
    variants: [
      {
        size_label: "Medium",
        normalized_size_code: "M",
        sku: "SKU-1-M",
        mpn: null,
        gtin: null,
        list_price: null,
      },
    ],
    confidence: { overall: 0.8, fields: {} },
    field_provenance: {},
    parse_warnings: [],
    raw_evidence: {},
    ...overrides,
  };
}

describe("import-draft-promote", () => {
  it("maps size M to variant sizeCode M", () => {
    const input = importDraftToProductWriteInput(baseDraft(), { category_id: "cat-1" });
    expect(input.variants[0]?.sizeCode).toBe("M");
    expect(input.attributes).toEqual({});
  });

  it("uses UNKNOWN when no size is parsed", () => {
    const draft = baseDraft({
      size: null,
      variants: [
        {
          size_label: null,
          normalized_size_code: "UNKNOWN",
          sku: "SKU-1",
          mpn: null,
          gtin: null,
          list_price: null,
        },
      ],
    });
    const variants = draftPromoteVariants(draft);
    expect(variants[0]?.sizeCode).toBe("UNKNOWN");
    expect(variants[0]?.sizeCode).not.toBe("OS");
  });

  it("never silently defaults parsed draft to OS", () => {
    const draft = baseDraft({ size: "M" });
    const variants = draftPromoteVariants(draft);
    expect(variants.every((v) => v.sizeCode !== "OS")).toBe(true);
  });

  it("preserves multiple variants from draft", () => {
    const draft = baseDraft({
      size: null,
      variants: [
        { size_label: "S", normalized_size_code: "S", sku: "A-S", mpn: null, gtin: null, list_price: null },
        { size_label: "M", normalized_size_code: "M", sku: "A-M", mpn: null, gtin: null, list_price: null },
      ],
    });
    expect(draftPromoteVariants(draft)).toHaveLength(2);
  });

  it("operator override variants win when supplied", () => {
    const input = importDraftToProductWriteInput(baseDraft(), {
      category_id: "cat-1",
      variants: [{ sizeCode: "XL", variantSku: "OP-1", listPrice: "9.99", manufacturerSku: "MFR-XL" }],
    }, { applySkuProposals: false });
    expect(input.variants).toEqual([
      { sizeCode: "XL", variantSku: "OP-1", listPrice: "9.99", manufacturerSku: "MFR-XL" },
    ]);
  });

  it("does not copy manufacturer sku into variantSku on promote", () => {
    const draft = baseDraft({
      variants: [
        {
          size_label: "M",
          normalized_size_code: "M",
          sku: null,
          manufacturer_sku: "GL-N125F-M",
          source_sku: "GL-N125F-M",
          mpn: null,
          gtin: null,
          list_price: null,
        },
      ],
    });
    const variants = draftPromoteVariants(draft);
    expect(variants[0]?.variantSku).toBe("");
    expect(variants[0]?.manufacturerSku).toBe("GL-N125F-M");
  });

  it("maps units_per_case into product write metadata via importDraft", () => {
    const input = importDraftToProductWriteInput(baseDraft(), { category_id: "cat-1" });
    expect(input.importDraft?.units_per_case).toBe(1000);
  });

  it("uses selected category_slug for disposable glove case copy", () => {
    const draft = baseDraft({
      commerce_packaging: {
        inner_unit_type: "box",
        units_per_inner: 200,
        inners_per_case: 10,
        units_per_case: 2000,
      },
    });
    const input = importDraftToProductWriteInput(draft, {
      category_id: "71c407a2-0ee0-455c-b4fb-0c8d930ad6f5",
      category_slug: "disposable_gloves",
    });
    expect(input.commercePackaging?.unit_noun).toBe("gloves");
    expect(input.commercePackaging?.case_label).toBe("10 boxes × 200 gloves = 2,000 gloves");
  });

  it("allows OS only when draft variant is explicitly OS", () => {
    const draft = baseDraft({
      size: "OS",
      variants: [
        {
          size_label: "One Size",
          normalized_size_code: "OS",
          sku: "SKU-OS",
          mpn: null,
          gtin: null,
          list_price: null,
        },
      ],
    });
    expect(draftPromoteVariants(draft)[0]?.sizeCode).toBe("OS");
  });
});
