import { describe, expect, it } from "vitest";
import { mergeProductMetadata, resolveManufacturerSkuForVariantWrite } from "@/lib/admin/product-write";
import type { ProductWriteInput } from "@/lib/admin/product-write";
import {
  IMPORT_DRAFT_PARSER_VERSION,
  IMPORT_DRAFT_SCHEMA_VERSION,
  type ImportDraftProductV1,
} from "@/lib/admin/import-draft-types";
import { mapImportDraftToAttributes } from "@/lib/admin/import-suggestion-mapper";
import { proposeVariantsFromImport } from "@/lib/admin/variant-generation";

function draftWithVariants(overrides: Partial<ImportDraftProductV1> = {}): ImportDraftProductV1 {
  return minimalDraft({
    variants: [
      { size_label: "M", normalized_size_code: "M", sku: "SKU-M", mpn: null, gtin: null, list_price: "10" },
    ],
    ...overrides,
  });
}

function minimalDraft(overrides: Partial<ImportDraftProductV1> = {}): ImportDraftProductV1 {
  return {
    schema_version: IMPORT_DRAFT_SCHEMA_VERSION,
    parser_version: IMPORT_DRAFT_PARSER_VERSION,
    source_url: "https://example.com/p",
    product_name: "Glove",
    brand: "Safety Zone",
    category_hint: null,
    description: null,
    image_url: null,
    sku: null,
    mpn: null,
    gtin: null,
    material: "nitrile",
    color: "Blue Violet",
    thickness_mil: 3,
    case_pack: "10/200",
    units_per_case: 2000,
    powder_free: true,
    latex_free: true,
    exam_grade: true,
    glove_grade: "medical_exam_grade",
    size: "M",
    variants: [],
    confidence: { overall: 0.5, fields: {} },
    field_provenance: {},
    parse_warnings: [],
    raw_evidence: {},
    ...overrides,
  };
}

function baseInput(overrides: Partial<ProductWriteInput> = {}): ProductWriteInput {
  return {
    name: "Glove",
    brandName: "",
    categoryId: "cat-1",
    description: "",
    primaryImageUrl: "",
    status: "draft",
    quoteOnly: true,
    variants: [{ sizeCode: "M", variantSku: "", listPrice: "" }],
    attributes: { material: "nitrile" },
    ...overrides,
  };
}

describe("mergeProductMetadata", () => {
  it("preserves import_source_url and parser_version after save", () => {
    const existing = {
      import_source_url: "https://example.com/p",
      import_parser_version: "productExtraction.v1",
      import_schema_version: 1,
      quote_only: true,
      category_id: "cat-1",
      material: "legacy-should-strip",
    };
    const merged = mergeProductMetadata(existing, baseInput(), false);
    expect(merged.import_source_url).toBe("https://example.com/p");
    expect(merged.import_parser_version).toBe("productExtraction.v1");
    expect(merged.material).toBeUndefined();
  });

  it("preserves unknown metadata keys", () => {
    const existing = {
      custom_operator_note: "keep me",
      quote_only: true,
    };
    const merged = mergeProductMetadata(existing, baseInput(), false);
    expect(merged.custom_operator_note).toBe("keep me");
  });

  it("updates known editor fields", () => {
    const existing = { quote_only: false, category_id: "old" };
    const merged = mergeProductMetadata(existing, baseInput({ categoryId: "cat-2", quoteOnly: true }), false);
    expect(merged.category_id).toBe("cat-2");
    expect(merged.quote_only).toBe(true);
  });

  it("preserves units_per_case in metadata on save", () => {
    const existing = {
      import_source_url: "https://example.com/p",
      units_per_case: 2000,
      quote_only: true,
    };
    const merged = mergeProductMetadata(existing, baseInput(), false);
    expect(merged.units_per_case).toBe(2000);
  });

  it("does not dual-write filter fields to metadata", () => {
    const merged = mergeProductMetadata(null, baseInput({ attributes: { material: "nitrile", color: "black" } }), false);
    expect(merged.material).toBeUndefined();
    expect(merged.color).toBeUndefined();
    expect(merged.mil_thickness).toBeUndefined();
  });
});

describe("import suggestion mapper", () => {
  it("maps latex_free to certifications when allowed", () => {
    const allowed = new Map<string, string[]>([
      ["certifications", ["latex_free", "food_safe"]],
      ["material", ["nitrile"]],
    ]);
    const result = mapImportDraftToAttributes(minimalDraft(), allowed);
    expect(result.attributes.certifications).toEqual(["latex_free"]);
  });
});

describe("variant generation", () => {
  it("preserves existing SKU when size matches", () => {
    const draft = draftWithVariants({
      variants: [
        { size_label: "S", normalized_size_code: "S", sku: "IMP-S", mpn: null, gtin: null, list_price: "10" },
        { size_label: "M", normalized_size_code: "M", sku: "IMP-M", mpn: null, gtin: null, list_price: "10" },
      ],
    });
    const existing = [{ id: "v1", sizeCode: "S", variantSku: "KEEP-S", listPrice: "9" }];
    const proposal = proposeVariantsFromImport(draft, existing);
    const s = proposal.proposed.find((v) => v.sizeCode === "S");
    expect(s?.variantSku).toBe("KEEP-S");
    expect(s?.listPrice).toBe("9");
  });

  it("removes OS when standard sizes exist without explicit evidence", () => {
    const draft = draftWithVariants({
      size: "OS",
      variants: [
        { size_label: "OS", normalized_size_code: "OS", sku: null, mpn: null, gtin: null, list_price: null },
        { size_label: "M", normalized_size_code: "M", sku: null, mpn: null, gtin: null, list_price: null },
      ],
    });
    const proposal = proposeVariantsFromImport(draft, [], { replaceOs: true });
    expect(proposal.proposed.some((v) => v.sizeCode === "OS")).toBe(false);
    expect(proposal.proposed.some((v) => v.sizeCode === "M")).toBe(true);
    expect(proposal.removedOs).toBe(true);
  });
});

describe("resolveManufacturerSkuForVariantWrite", () => {
  it("reads manufacturer_sku from import draft by size, not variant_sku field", () => {
    const input = baseInput({
      importDraft: minimalDraft({
        variants: [
          {
            size_label: "M",
            normalized_size_code: "M",
            sku: null,
            manufacturer_sku: "GL-N125F-M",
            mpn: null,
            gtin: null,
            list_price: null,
          },
        ],
      }),
    });
    expect(resolveManufacturerSkuForVariantWrite(input, "M")).toBe("GL-N125F-M");
  });

  it("prefers explicit manufacturerSku on variant input", () => {
    const input = baseInput();
    expect(
      resolveManufacturerSkuForVariantWrite(input, "M", {
        sizeCode: "M",
        variantSku: "GLV-GL-N125M",
        listPrice: "",
        manufacturerSku: "GL-N125F-M",
      })
    ).toBe("GL-N125F-M");
  });
});

describe("checkVariantSkuCollision", () => {
  it("returns error when variant SKU already exists", async () => {
    const supabase = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: "other-variant" } }),
            }),
          }),
        }),
      }),
    };
    const { checkVariantSkuCollision } = await import("@/lib/admin/product-write");
    const result = await checkVariantSkuCollision(supabase, "GLV-GL-N125M");
    expect(result).toEqual({ error: "SKU already exists: GLV-GL-N125M" });
  });
});
