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
import { emptyCommercePackaging, normalizeCommercePackaging } from "@commerce-packaging/labels";

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
    const cp = normalizeCommercePackaging(
      {
        units_per_case: 1000,
        case_price: 42,
        inner_unit_type: "box",
        units_per_inner: 100,
        inners_per_case: 10,
        unit_noun: "gloves",
      },
      "disposable_gloves"
    );
    const result = computeEditorReadiness({
      brandName: "Brand",
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
      commercePackaging: cp,
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

  it("blocks draft save on duplicate variant SKUs within product", () => {
    const result = computeEditorReadiness({
      categoryId: "cat-1",
      primaryImageUrl: "",
      publishIntent: false,
      quoteOnly: true,
      attributes: {},
      variants: [
        { sizeCode: "M", variantSku: "GLV-GL-N125M", listPrice: "" },
        { sizeCode: "L", variantSku: "GLV-GL-N125M", listPrice: "" },
      ],
      metadata: null,
      governanceWarnings: [],
      attributeDefinitions: [],
      dirty: false,
    });
    expect(hasDraftSaveBlockers(result)).toBe(true);
    expect(result.draftSaveBlockers.some((b) => b.label.includes("Duplicate variant SKUs"))).toBe(true);
  });

  it("warns when commerce_packaging has units_per_case but storefront filter is empty", () => {
    const allowedByKey = new Map([["units_per_case", ["1000", "2000"]], ["material", ["nitrile"]]]);
    const cp = normalizeCommercePackaging(
      { units_per_case: 2000, inners_per_case: 10, units_per_inner: 200, inner_unit_type: "box" },
      "disposable_gloves"
    );
    const result = computeEditorReadiness({
      categoryId: "cat-1",
      primaryImageUrl: "",
      publishIntent: false,
      quoteOnly: true,
      attributes: { material: "nitrile" },
      variants: [{ sizeCode: "M", variantSku: "SKU", listPrice: "" }],
      metadata: null,
      governanceWarnings: [],
      attributeDefinitions: [],
      dirty: false,
      importDraft: minimalDraft({ color: null, commerce_packaging: cp }),
      allowedByKey,
      commercePackaging: cp,
    });
    expect(result.warnings.some((w) => w.code === "missing_filter_units_per_case")).toBe(true);
    expect(result.warnings.some((w) => w.recommendedAction === "Apply filter sync")).toBe(true);
  });

  it("blocks publish when units_per_case missing", () => {
    const cp = emptyCommercePackaging();
    cp.case_price = 42;
    const result = computeEditorReadiness({
      brandName: "Brand",
      categoryId: "cat-1",
      primaryImageUrl: "https://img.example/a.jpg",
      publishIntent: true,
      quoteOnly: false,
      attributes: { color: "blue_violet" },
      variants: [{ sizeCode: "M", variantSku: "SKU", listPrice: "" }],
      metadata: null,
      governanceWarnings: [],
      attributeDefinitions: defs,
      dirty: false,
      commercePackaging: cp,
    });
    expect(result.publishBlockers.some((b) => b.code === "missing_units_per_case")).toBe(true);
  });

  it("blocks publish when case price missing", () => {
    const cp = normalizeCommercePackaging(
      { units_per_case: 1000, inner_unit_type: "box", units_per_inner: 100, inners_per_case: 10, unit_noun: "gloves" },
      "disposable_gloves"
    );
    const result = computeEditorReadiness({
      brandName: "Brand",
      categoryId: "cat-1",
      primaryImageUrl: "https://img.example/a.jpg",
      publishIntent: true,
      quoteOnly: false,
      attributes: { color: "blue_violet" },
      variants: [{ sizeCode: "M", variantSku: "SKU", listPrice: "" }],
      metadata: null,
      governanceWarnings: [],
      attributeDefinitions: defs,
      dirty: false,
      commercePackaging: cp,
    });
    expect(result.publishBlockers.some((b) => b.code === "missing_case_price")).toBe(true);
  });

  it("warns when pallet price missing but pallet enabled", () => {
    const cp = normalizeCommercePackaging(
      {
        units_per_case: 1000,
        case_price: 42,
        sell_by_pallet_enabled: true,
        cases_per_pallet: 84,
        inner_unit_type: "box",
        units_per_inner: 100,
        inners_per_case: 10,
        unit_noun: "gloves",
      },
      "disposable_gloves"
    );
    const result = computeEditorReadiness({
      brandName: "Brand",
      categoryId: "cat-1",
      primaryImageUrl: "https://img.example/a.jpg",
      publishIntent: true,
      quoteOnly: false,
      attributes: { color: "blue_violet" },
      variants: [{ sizeCode: "M", variantSku: "SKU", listPrice: "42" }],
      metadata: null,
      governanceWarnings: [],
      attributeDefinitions: defs,
      dirty: false,
      commercePackaging: cp,
    });
    expect(result.warnings.some((w) => w.code === "missing_pallet_price")).toBe(true);
    expect(result.warnings.some((w) => w.code === "missing_cases_per_pallet")).toBe(false);
  });

  it("warns on units_per_case override and low confidence", () => {
    const cp = normalizeCommercePackaging(
      {
        units_per_case: 950,
        units_per_case_overridden: true,
        case_price: 42,
        inner_unit_type: "box",
        units_per_inner: 100,
        inners_per_case: 10,
        unit_noun: "gloves",
        field_provenance: {
          units_per_case: {
            value: 950,
            confidence: 0.5,
            source: "page_text_fallback",
            evidence_text: "950/case",
            inferred: true,
          },
        },
      },
      "disposable_gloves"
    );
    const result = computeEditorReadiness({
      brandName: "Brand",
      categoryId: "cat-1",
      primaryImageUrl: "https://img.example/a.jpg",
      publishIntent: true,
      quoteOnly: false,
      attributes: { color: "blue_violet" },
      variants: [{ sizeCode: "M", variantSku: "SKU", listPrice: "" }],
      metadata: null,
      governanceWarnings: [],
      attributeDefinitions: defs,
      dirty: false,
      commercePackaging: cp,
    });
    expect(result.warnings.some((w) => w.code === "units_per_case_overridden")).toBe(true);
    expect(result.warnings.some((w) => w.code === "packaging_low_confidence")).toBe(true);
    expect(result.warnings.some((w) => w.code === "packaging_math_conflict")).toBe(true);
  });

  it("blocks publish when variant SKU missing", () => {
    const result = computeEditorReadiness({
      brandName: "Brand",
      categoryId: "cat-1",
      primaryImageUrl: "https://img.example/a.jpg",
      publishIntent: true,
      quoteOnly: true,
      attributes: { color: "blue_violet" },
      variants: [{ sizeCode: "M", variantSku: "", listPrice: "" }],
      metadata: null,
      governanceWarnings: [],
      attributeDefinitions: defs,
      dirty: false,
      internalSku: "GLV-GL-N125",
      commercePackaging: normalizeCommercePackaging(
        { units_per_case: 1000, case_price: 42, inner_unit_type: "box", units_per_inner: 100, inners_per_case: 10, unit_noun: "gloves" },
        "disposable_gloves"
      ),
    });
    expect(result.publishBlockers.some((b) => b.code === "missing_variant_sku")).toBe(true);
  });

  it("blocks when duplicate parent SKU collision hint provided", () => {
    const result = computeEditorReadiness({
      brandName: "Brand",
      categoryId: "cat-1",
      primaryImageUrl: "https://img.example/a.jpg",
      publishIntent: true,
      quoteOnly: true,
      attributes: { color: "blue_violet" },
      variants: [{ sizeCode: "M", variantSku: "GLV-GL-N125M", listPrice: "" }],
      metadata: null,
      governanceWarnings: [],
      attributeDefinitions: defs,
      dirty: false,
      internalSku: "GLV-GL-N125",
      skuCollisions: { existingParentSkus: new Set(["GLV-GL-N125"]) },
      commercePackaging: normalizeCommercePackaging(
        { units_per_case: 1000, case_price: 42, inner_unit_type: "box", units_per_inner: 100, inners_per_case: 10, unit_noun: "gloves" },
        "disposable_gloves"
      ),
    });
    expect(result.publishBlockers.some((b) => b.code === "duplicate_parent_sku")).toBe(true);
  });

  it("warns when manufacturer SKU used as variant SKU", () => {
    const result = computeEditorReadiness({
      categoryId: "cat-1",
      primaryImageUrl: "https://img.example/a.jpg",
      publishIntent: true,
      quoteOnly: true,
      attributes: {},
      variants: [{ sizeCode: "M", variantSku: "GL-N125F-M", listPrice: "" }],
      metadata: null,
      governanceWarnings: [],
      attributeDefinitions: [],
      dirty: false,
      internalSku: "GLV-GL-N125",
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
      commercePackaging: normalizeCommercePackaging(
        { units_per_case: 1000, case_price: 42, inner_unit_type: "box", units_per_inner: 100, inners_per_case: 10, unit_noun: "gloves" },
        "disposable_gloves"
      ),
    });
    expect(result.publishBlockers.some((b) => b.code === "manufacturer_sku_used_as_variant_sku")).toBe(
      true
    );
  });

  it("blocks storefront publish for clipboard URL-import metadata", () => {
    const result = computeEditorReadiness({
      brandName: "Acme",
      categoryId: "cat-1",
      primaryImageUrl: "https://example.com/img.jpg",
      publishIntent: true,
      quoteOnly: true,
      attributes: { color: "blue_violet" },
      variants: [{ sizeCode: "M", variantSku: "GLV-TEST-M", listPrice: "10" }],
      metadata: {
        import_staging_id: "staging-uuid",
        import_extraction_authority: "catalogos_url_import_v2",
        catalogos_url_import_job_id: "job-123",
      },
      governanceWarnings: [],
      attributeDefinitions: defs,
      dirty: false,
      commercePackaging: normalizeCommercePackaging(
        { units_per_case: 1000, case_price: 42, inner_unit_type: "box", units_per_inner: 100, inners_per_case: 10, unit_noun: "gloves" },
        "disposable_gloves"
      ),
      internalSku: "GLV-TEST",
    });
    expect(result.publishBlockers.some((b) => b.code === "url_import_storefront_publish_blocked")).toBe(
      true
    );
  });

  it("blocks storefront publish for CatalogOS job metadata without clipboard staging id", () => {
    const result = computeEditorReadiness({
      brandName: "Acme",
      categoryId: "cat-1",
      primaryImageUrl: "https://example.com/img.jpg",
      publishIntent: true,
      quoteOnly: true,
      attributes: { color: "blue_violet" },
      variants: [{ sizeCode: "M", variantSku: "GLV-TEST-M", listPrice: "10" }],
      metadata: { catalogos_url_import_job_id: "job-only" },
      governanceWarnings: [],
      attributeDefinitions: defs,
      dirty: false,
      internalSku: "GLV-TEST",
    });
    expect(result.publishBlockers.some((b) => b.code === "url_import_storefront_publish_blocked")).toBe(
      true
    );
  });
});
