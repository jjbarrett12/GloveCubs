import { describe, expect, it } from "vitest";
import {
  IMPORT_DRAFT_PARSER_VERSION,
  IMPORT_DRAFT_SCHEMA_VERSION,
  type ImportDraftProductV1,
} from "@/lib/admin/import-draft-types";
import {
  buildImportFieldSuggestions,
  buildSafeApplyAllPatch,
  filterSafeSuggestions,
  isSafeSuggestion,
  type ImportApplyExistingState,
  type ImportFieldSuggestion,
} from "@/lib/admin/import-suggestion-mapper";
import type { EditorVariantRow } from "@/lib/admin/variant-generation";

function minimalDraft(overrides: Partial<ImportDraftProductV1> = {}): ImportDraftProductV1 {
  return {
    schema_version: IMPORT_DRAFT_SCHEMA_VERSION,
    parser_version: IMPORT_DRAFT_PARSER_VERSION,
    source_url: "https://example.com/p",
    product_name: "Glove",
    brand: "Safety Zone",
    category_hint: null,
    description: "Desc",
    image_url: "https://example.com/img.jpg",
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
    variants: [
      { size_label: "M", normalized_size_code: "M", sku: "IMPORT-M", mpn: null, gtin: null, list_price: "10" },
      { size_label: "L", normalized_size_code: "L", sku: "IMPORT-L", mpn: null, gtin: null, list_price: "11" },
    ],
    confidence: { overall: 0.9, fields: {} },
    field_provenance: {},
    parse_warnings: [],
    raw_evidence: {},
    ...overrides,
  };
}

const allowedByKey = new Map<string, string[]>([
  ["material", ["nitrile", "latex"]],
  ["color", ["blue_violet", "black", "blue"]],
  ["thickness_mil", ["3", "4", "5"]],
  ["powder", ["powder_free", "powdered"]],
  ["grade", ["medical_exam_grade", "industrial"]],
  ["certifications", ["latex_free", "fda_510k"]],
]);

const existingVariants: EditorVariantRow[] = [
  { id: "var-m", sizeCode: "M", variantSku: "GL-N125FM-a46a", listPrice: "9.99" },
];

const highConfidence = {
  product_name: { confidence: 0.95, source: "extractor" },
  brand: { confidence: 0.95, source: "extractor" },
  material: { confidence: 0.95, source: "extractor" },
  color: { confidence: 0.95, source: "extractor" },
  description: { confidence: 0.95, source: "extractor" },
  image_url: { confidence: 0.95, source: "extractor" },
  size: { confidence: 0.95, source: "extractor" },
};

function existingFilled(): ImportApplyExistingState {
  return {
    identity: {
      name: "Existing Name",
      brandName: "Safety Zone",
      description: "Existing desc",
      primaryImageUrl: "https://example.com/existing.jpg",
    },
    attributes: {
      material: "nitrile",
      thickness_mil: "3",
      powder: "powder_free",
      grade: "medical_exam_grade",
    },
    variants: existingVariants,
  };
}

describe("buildSafeApplyAllPatch", () => {
  it("skips low-confidence fields", () => {
    const draft = minimalDraft({
      field_provenance: {
        color: { confidence: 0.4, source: "extractor" },
        material: { confidence: 0.95, source: "extractor" },
      },
    });
    const suggestions = buildImportFieldSuggestions(draft);
    const safe = filterSafeSuggestions(suggestions);
    expect(safe.some((s) => s.applyKey === "color")).toBe(false);
    expect(safe.some((s) => s.applyKey === "material")).toBe(true);

    const { patch, appliedCount } = buildSafeApplyAllPatch(draft, allowedByKey, safe, existingVariants);
    expect(patch.attributes?.color).toBeUndefined();
    expect(patch.attributes?.material).toBe("nitrile");
    expect(appliedCount).toBeGreaterThan(0);
  });

  it("skips invalid dictionary fields", () => {
    const draft = minimalDraft({
      color: "Not A Real Color",
      field_provenance: {
        color: { confidence: 0.95, source: "extractor" },
      },
    });
    const suggestions = buildImportFieldSuggestions(draft);
    const safe = filterSafeSuggestions(suggestions);
    const { patch, appliedCount } = buildSafeApplyAllPatch(draft, allowedByKey, safe, existingVariants);
    expect(patch.attributes?.color).toBeUndefined();
    const colorSuggestion = safe.find((s) => s.applyKey === "color");
    if (colorSuggestion) {
      const single = buildSafeApplyAllPatch(draft, allowedByKey, [colorSuggestion], existingVariants);
      expect(single.appliedCount).toBe(0);
    }
    expect(appliedCount).toBeLessThan(safe.length);
  });

  it("omits already-filled attributes from patch by default", () => {
    const draft = minimalDraft({ field_provenance: highConfidence });
    const safe = filterSafeSuggestions(buildImportFieldSuggestions(draft));
    const existing = existingFilled();
    const { patch } = buildSafeApplyAllPatch(draft, allowedByKey, safe, existingVariants, { existing });
    expect(patch.attributes?.material).toBeUndefined();
    expect(patch.attributes?.thickness_mil).toBeUndefined();
    expect(patch.attributes?.powder).toBeUndefined();
    expect(patch.attributes?.grade).toBeUndefined();
  });

  it("includes empty attributes from safe import suggestions", () => {
    const draft = minimalDraft({ field_provenance: highConfidence });
    const colorSuggestion = buildImportFieldSuggestions(draft).find((s) => s.applyKey === "color")!;
    const existing = existingFilled();
    const { patch, appliedCount } = buildSafeApplyAllPatch(
      draft,
      allowedByKey,
      [colorSuggestion],
      existingVariants,
      { existing }
    );
    expect(appliedCount).toBe(1);
    expect(patch.attributes?.color).toBeDefined();
  });

  it("preserves existing identity fields by default", () => {
    const draft = minimalDraft({ field_provenance: highConfidence });
    const safe = filterSafeSuggestions(buildImportFieldSuggestions(draft));
    const { patch } = buildSafeApplyAllPatch(draft, allowedByKey, safe, existingVariants, {
      existing: existingFilled(),
    });
    expect(patch.identity?.name).toBeUndefined();
    expect(patch.identity?.brandName).toBeUndefined();
    expect(patch.identity?.description).toBeUndefined();
    expect(patch.identity?.primaryImageUrl).toBeUndefined();
  });

  it("includes filled fields when overwriteExisting is true", () => {
    const draft = minimalDraft({ field_provenance: highConfidence });
    const materialSuggestion = buildImportFieldSuggestions(draft).find((s) => s.applyKey === "material")!;
    const { patch, appliedCount } = buildSafeApplyAllPatch(
      draft,
      allowedByKey,
      [materialSuggestion],
      existingVariants,
      { existing: existingFilled(), overwriteExisting: true }
    );
    expect(appliedCount).toBe(1);
    expect(patch.attributes?.material).toBe("nitrile");
  });

  it("merges import variants preserving existing SKU and id without raw replace when M exists", () => {
    const draft = minimalDraft({
      field_provenance: { size: { confidence: 0.95, source: "extractor" } },
    });
    const variantsSuggestion: ImportFieldSuggestion = {
      id: "variants",
      label: "Variants",
      value: "M, L",
      confidence: 0.95,
      source: "extractor",
      target: "variants",
      applyKey: "variants",
    };
    const { patch, appliedCount } = buildSafeApplyAllPatch(
      draft,
      allowedByKey,
      [variantsSuggestion],
      existingVariants,
      { existing: existingFilled() }
    );
    expect(appliedCount).toBe(1);
    const m = patch.variants?.find((v) => v.sizeCode === "M");
    expect(m?.id).toBe("var-m");
    expect(m?.variantSku).toBe("GL-N125FM-a46a");
    const sizes = patch.variants?.map((v) => v.sizeCode) ?? [];
    expect(new Set(sizes).size).toBe(sizes.length);
    expect(sizes).toContain("L");
  });

  it("omits variants patch when import adds no new sizes", () => {
    const draft = minimalDraft({
      variants: [
        { size_label: "M", normalized_size_code: "M", sku: "IMPORT-M", mpn: null, gtin: null, list_price: "10" },
      ],
      field_provenance: { size: { confidence: 0.95, source: "extractor" } },
    });
    const variantsSuggestion: ImportFieldSuggestion = {
      id: "variants",
      label: "Variants",
      value: "M",
      confidence: 0.95,
      source: "extractor",
      target: "variants",
      applyKey: "variants",
    };
    const { patch, appliedCount } = buildSafeApplyAllPatch(
      draft,
      allowedByKey,
      [variantsSuggestion],
      existingVariants,
      { existing: existingFilled() }
    );
    expect(appliedCount).toBe(0);
    expect(patch.variants).toBeUndefined();
  });

  it("appliedCount matches fields actually included after preserve filtering", () => {
    const draft = minimalDraft({ field_provenance: highConfidence });
    const safe = filterSafeSuggestions(buildImportFieldSuggestions(draft));
    const { appliedCount } = buildSafeApplyAllPatch(draft, allowedByKey, safe, existingVariants, {
      existing: existingFilled(),
    });
    expect(appliedCount).toBe(
      safe.reduce((n, s) => {
        const one = buildSafeApplyAllPatch(draft, allowedByKey, [s], existingVariants, {
          existing: existingFilled(),
        });
        return n + one.appliedCount;
      }, 0)
    );
  });
});

describe("isSafeSuggestion", () => {
  it("uses 0.7 threshold", () => {
    expect(isSafeSuggestion(0.7)).toBe(true);
    expect(isSafeSuggestion(0.69)).toBe(false);
  });
});
