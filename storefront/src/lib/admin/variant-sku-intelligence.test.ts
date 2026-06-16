import { describe, expect, it } from "vitest";
import {
  deriveGloveCubsParentSku,
  deriveGloveCubsVariantSku,
  deriveSkuProposalsFromImportDraft,
  detectSkuCollisionIssues,
  isSafeGloveCubsSkuProposal,
  stripKnownManufacturerGradeSuffix,
  stripKnownSizeSuffix,
} from "@/lib/admin/variant-sku-intelligence";
import type { ImportDraftProductV1 } from "@/lib/admin/import-draft-types";
import {
  IMPORT_DRAFT_PARSER_VERSION,
  IMPORT_DRAFT_SCHEMA_VERSION,
} from "@/lib/admin/import-draft-types";

const HOSPECO_SKUS = ["GL-N125F-XS", "GL-N125F-S", "GL-N125F-M", "GL-N125F-L", "GL-N125F-XL"];

function hospecoDraft(): ImportDraftProductV1 {
  return {
    schema_version: IMPORT_DRAFT_SCHEMA_VERSION,
    parser_version: IMPORT_DRAFT_PARSER_VERSION,
    source_url:
      "https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves-powder-free-3-mil-hos-gl-n125f-l-gl-n125fl",
    product_name: "Proworks Nitrile Gloves",
    brand: "Proworks",
    category_hint: null,
    description: null,
    image_url: null,
    sku: "GL-N125F-L",
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
    glove_grade: "medical_exam_grade",
    size: "L",
    variants: ["XS", "S", "M", "L", "XL"].map((code, i) => ({
      size_label: code,
      normalized_size_code: code,
      sku: null,
      manufacturer_sku: HOSPECO_SKUS[i]!,
      source_sku: HOSPECO_SKUS[i]!,
      mpn: null,
      gtin: null,
      list_price: null,
    })),
    confidence: { overall: 0.9, fields: {} },
    field_provenance: {},
    parse_warnings: [],
    raw_evidence: {},
  };
}

describe("stripKnownSizeSuffix", () => {
  it("strips hyphenated size suffixes", () => {
    expect(stripKnownSizeSuffix("GL-N125F-L")).toBe("GL-N125F");
    expect(stripKnownSizeSuffix("GL-N125F-XL")).toBe("GL-N125F");
    expect(stripKnownSizeSuffix("GL-N125F-XS")).toBe("GL-N125F");
  });

  it("strips glued size suffixes", () => {
    expect(stripKnownSizeSuffix("GL-N125FXL")).toBe("GL-N125F");
  });

  it("strips Hospeco compact suffixes GL-N125FX/FL/FM/FS/FXS", () => {
    expect(stripKnownSizeSuffix("GL-N125FL")).toBe("GL-N125F");
    expect(stripKnownSizeSuffix("GL-N125FM")).toBe("GL-N125F");
    expect(stripKnownSizeSuffix("GL-N125FS")).toBe("GL-N125F");
    expect(stripKnownSizeSuffix("GL-N125FX")).toBe("GL-N125F");
    expect(stripKnownSizeSuffix("GL-N125FXS")).toBe("GL-N125F");
  });
});

describe("stripKnownManufacturerGradeSuffix", () => {
  it("strips F from GL-N125F when allowed", () => {
    expect(stripKnownManufacturerGradeSuffix("GL-N125F", { allowGradeStrip: true })).toBe("GL-N125");
  });

  it("does not strip F without agreement flag", () => {
    expect(stripKnownManufacturerGradeSuffix("GL-N125F")).toBe("GL-N125F");
  });
});

describe("deriveGloveCubsParentSku", () => {
  it("derives GLV-GL-N125 from GL-N125F-L", () => {
    const proposal = deriveGloveCubsParentSku({
      manufacturerSkus: HOSPECO_SKUS,
      productSku: "GL-N125F-L",
      sourceUrl: hospecoDraft().source_url,
    });
    expect(proposal.value).toBe("GLV-GL-N125");
    expect(proposal.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it("has lower confidence with single SKU only", () => {
    const proposal = deriveGloveCubsParentSku({
      manufacturerSkus: ["GL-N125F-L"],
    });
    expect(proposal.confidence).toBeLessThan(0.95);
    expect(proposal.warnings.length).toBeGreaterThan(0);
  });

  it("does not strip arbitrary trailing letters from unknown SKUs", () => {
    const proposal = deriveGloveCubsParentSku({
      manufacturerSkus: ["ACME-WIDGETX"],
    });
    expect(proposal.value).not.toBe("GLV-ACME-WIDGET");
  });
});

describe("deriveGloveCubsVariantSku", () => {
  it("generates parent + size without hyphen", () => {
    expect(deriveGloveCubsVariantSku("GLV-GL-N125", "L")).toBe("GLV-GL-N125L");
    expect(deriveGloveCubsVariantSku("GLV-GL-N125", "XS")).toBe("GLV-GL-N125XS");
  });

  it("returns null without valid size", () => {
    expect(deriveGloveCubsVariantSku("GLV-GL-N125", "UNKNOWN")).toBeNull();
    expect(deriveGloveCubsVariantSku("", "M")).toBeNull();
  });
});

describe("deriveSkuProposalsFromImportDraft", () => {
  it("proposes parent and five variant SKUs for Hospeco draft", () => {
    const result = deriveSkuProposalsFromImportDraft(hospecoDraft());
    expect(result.parent_sku.value).toBe("GLV-GL-N125");
    expect(result.variants).toHaveLength(5);
    expect(result.variants.map((v) => v.proposed_glovecubs_sku)).toEqual([
      "GLV-GL-N125XS",
      "GLV-GL-N125S",
      "GLV-GL-N125M",
      "GLV-GL-N125L",
      "GLV-GL-N125XL",
    ]);
    expect(isSafeGloveCubsSkuProposal(result)).toBe(true);
  });

  it("derives GLV parent from compact Hospeco manufacturer SKUs", () => {
    const compact = ["GL-N125FXS", "GL-N125FS", "GL-N125FM", "GL-N125FL", "GL-N125FX"];
    const draft: ImportDraftProductV1 = {
      ...hospecoDraft(),
      // Neutral URL — hospecoDraft URL embeds hyphenated GL-N125F-L which breaks compact-only clustering.
      source_url: "https://www.hospecobrands.com/products/proworks-nitrile-gl-n125f",
      sku: "GL-N125FL",
      variants: ["XS", "S", "M", "L", "XL"].map((code, i) => ({
        size_label: code,
        normalized_size_code: code,
        sku: null,
        manufacturer_sku: compact[i]!,
        source_sku: compact[i]!,
        mpn: null,
        gtin: null,
        list_price: null,
      })),
    };
    const result = deriveSkuProposalsFromImportDraft(draft);
    expect(result.parent_sku.value).toBe("GLV-GL-N125");
    expect(result.variants.map((v) => v.proposed_glovecubs_sku)).toContain("GLV-GL-N125XL");
  });
});

describe("detectSkuCollisionIssues", () => {
  it("flags duplicate parent and variant SKUs", () => {
    const issues = detectSkuCollisionIssues({
      parentSku: "GLV-GL-N125",
      variantSkus: ["GLV-GL-N125M"],
      existingParentSkus: new Set(["GLV-GL-N125"]),
      existingVariantSkus: new Set(["GLV-GL-N125M"]),
    });
    expect(issues.some((i) => i.code === "duplicate_parent_sku")).toBe(true);
    expect(issues.some((i) => i.code === "duplicate_variant_sku")).toBe(true);
  });

  it("flags duplicate variant SKUs within the same product", () => {
    const issues = detectSkuCollisionIssues({
      parentSku: "GLV-GL-N125",
      variantSkus: ["GLV-GL-N125M", "GLV-GL-N125M"],
    });
    expect(issues.some((i) => i.code === "duplicate_variant_sku_same_product")).toBe(true);
  });

  it("flags manufacturer SKU used as variant SKU", () => {
    const issues = detectSkuCollisionIssues({
      parentSku: "GLV-GL-N125",
      variantSkus: ["GL-N125F-M"],
      manufacturerSkusByVariant: ["GL-N125F-M"],
    });
    expect(issues.some((i) => i.code === "manufacturer_sku_used_as_variant_sku")).toBe(true);
  });
});
