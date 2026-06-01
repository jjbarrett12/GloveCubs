import { describe, expect, it } from "vitest";
import {
  IMPORT_DRAFT_PARSER_VERSION,
  IMPORT_DRAFT_SCHEMA_VERSION,
  type ImportDraftProductV1,
} from "@/lib/admin/import-draft-types";
import {
  computeEditorReadiness,
  hasDraftSaveBlockers,
  hasPublishBlockers,
} from "@/lib/admin/product-editor-readiness";
import type { AttributeDefinitionRow } from "@/lib/admin/product-attribute-sync";

const defs: AttributeDefinitionRow[] = [
  {
    id: "def-color",
    attributeKey: "color",
    label: "Color",
    displayGroup: "Specs",
    cardinality: "single",
    isRequired: true,
    isFilterable: true,
    allowedValues: ["blue_violet"],
  },
];

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
    case_pack: null,
    units_per_case: null,
    powder_free: true,
    latex_free: null,
    exam_grade: true,
    glove_grade: "medical_exam_grade",
    size: "M",
    variants: [{ size_label: "M", normalized_size_code: "M", sku: "X", mpn: null, gtin: null, list_price: null }],
    confidence: { overall: 0.9, fields: {} },
    field_provenance: {},
    parse_warnings: [],
    raw_evidence: {},
    ...overrides,
  };
}

describe("computeEditorReadiness", () => {
  it("allows draft save when required attribute missing but publish is blocked", () => {
    const result = computeEditorReadiness({
      categoryId: "cat-1",
      primaryImageUrl: "https://img.example/a.jpg",
      publishIntent: false,
      quoteOnly: true,
      attributes: { material: "nitrile" },
      variants: [{ sizeCode: "M", variantSku: "SKU", listPrice: "" }],
      metadata: null,
      governanceWarnings: [],
      attributeDefinitions: defs,
      dirty: false,
    });
    expect(hasPublishBlockers(result)).toBe(false);
    expect(hasDraftSaveBlockers(result)).toBe(false);
    expect(result.warnings.some((w) => w.code.startsWith("missing_required"))).toBe(false);

    const publish = computeEditorReadiness({
      categoryId: "cat-1",
      primaryImageUrl: "https://img.example/a.jpg",
      publishIntent: true,
      quoteOnly: true,
      attributes: { material: "nitrile" },
      variants: [{ sizeCode: "M", variantSku: "SKU", listPrice: "" }],
      metadata: null,
      governanceWarnings: [],
      attributeDefinitions: defs,
      dirty: false,
    });
    expect(hasPublishBlockers(publish)).toBe(true);
    expect(publish.publishBlockers.some((b) => b.code === "missing_required_color")).toBe(true);
  });

  it("uses live primary image instead of stale missing_images governance warning", () => {
    const result = computeEditorReadiness({
      categoryId: "cat-1",
      primaryImageUrl: "https://img.example/live.jpg",
      publishIntent: true,
      quoteOnly: true,
      attributes: { color: "blue_violet" },
      variants: [{ sizeCode: "M", variantSku: "SKU", listPrice: "" }],
      metadata: { product_line_code: "other_product" },
      governanceWarnings: [{ code: "missing_images", label: "No product images", severity: "warning" }],
      attributeDefinitions: defs,
      dirty: false,
    });
    expect(result.warnings.some((w) => w.code === "missing_images")).toBe(false);
    expect(hasPublishBlockers(result)).toBe(false);
  });

  it("surfaces missing color from import evidence", () => {
    const allowedByKey = new Map([["color", ["blue_violet"]], ["material", ["nitrile"]]]);
    const result = computeEditorReadiness({
      categoryId: "cat-1",
      primaryImageUrl: "",
      publishIntent: false,
      quoteOnly: true,
      attributes: { material: "nitrile" },
      variants: [{ sizeCode: "M", variantSku: "SKU", listPrice: "" }],
      metadata: null,
      governanceWarnings: [],
      attributeDefinitions: defs,
      dirty: false,
      importDraft: minimalDraft(),
      allowedByKey,
    });
    expect(result.warnings.some((w) => w.code === "missing_filter_color")).toBe(true);
    expect(result.warnings.some((w) => w.label.includes("Color missing from storefront filters"))).toBe(true);
  });

  it("blocks draft save on duplicate variant sizes", () => {
    const result = computeEditorReadiness({
      categoryId: "cat-1",
      primaryImageUrl: "",
      publishIntent: false,
      quoteOnly: true,
      attributes: {},
      variants: [
        { sizeCode: "M", variantSku: "A", listPrice: "" },
        { sizeCode: "M", variantSku: "B", listPrice: "" },
      ],
      metadata: null,
      governanceWarnings: [],
      attributeDefinitions: [],
      dirty: false,
    });
    expect(hasDraftSaveBlockers(result)).toBe(true);
  });
});
