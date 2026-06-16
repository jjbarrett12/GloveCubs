import { describe, expect, it } from "vitest";
import { makeFieldEvidence } from "./evidence-helpers";
import {
  buildProductSetupContractFromExtractionV2,
  buildProductSetupContractSummary,
} from "./product-setup-contract";
import {
  buildProductSetupApplyCandidates,
  getProductSetupApplyBlockReason,
  isHighRiskComplianceField,
  isSafeIdentityField,
  isSafeProductSetupApplyCandidate,
} from "./product-setup-apply-candidates";
import { applyProductSetupCandidatesToNormalizedData } from "./product-setup-apply-service";
import { buildProductSetupWizardReadiness } from "./product-setup-wizard-readiness";
import type { ProductUrlExtractionV2 } from "./types";

function extraction(over: Partial<ProductUrlExtractionV2> = {}): ProductUrlExtractionV2 {
  return {
    version: "product-url-extraction-v2",
    schemaVersion: 1,
    sourceUrl: "https://example.com/glove",
    fetchedAt: "2026-06-11T00:00:00.000Z",
    source: { rawTextSample: "Nitrile exam glove powder free" },
    identity: {
      normalizedTitle: makeFieldEvidence("Nitrile Exam Glove", 0.85, "title"),
      brand: makeFieldEvidence("Proworks", 0.82, "meta"),
      manufacturerSkuCandidates: makeFieldEvidence(["GL-N125F-M"], 0.88, "json_ld"),
    },
    taxonomy: {
      categorySlug: makeFieldEvidence("disposable_gloves", 0.75, "heuristic"),
      material: makeFieldEvidence("nitrile", 0.92, "table"),
    },
    commercePackaging: {
      unitsPerCase: makeFieldEvidence(1000, 0.88, "text"),
      innersPerCase: makeFieldEvidence(10, 0.88, "table"),
      unitsPerInner: makeFieldEvidence(100, 0.88, "table"),
    },
    attributes: {
      material: makeFieldEvidence("nitrile", 0.92, "table"),
      thicknessMil: makeFieldEvidence(0.5, 0.8, "text"),
      powderFree: makeFieldEvidence(true, 0.82, "text", { quote: "powder free" }),
      foodSafe: makeFieldEvidence(true, 0.55, "text"),
      examGrade: makeFieldEvidence(true, 0.6, "text"),
    },
    variants: { dimensions: [], options: [], proposedVariants: [], unresolvedVariantNotes: [] },
    images: {
      candidates: [
        {
          id: "img1",
          url: "https://example.com/p.jpg",
          absoluteUrl: "https://example.com/p.jpg",
          source: "json_ld",
          role: "primary_product",
          score: 0.9,
          confidence: 0.9,
          trust: "trusted",
          reasons: [],
        },
      ],
      primaryCandidateId: "img1",
      rejected: [],
    },
    documents: { specSheetUrls: [], sdsUrls: [], otherUrls: [] },
    confidence: {
      overall: 0.85,
      identity: 0.85,
      variants: 0.7,
      images: 0.85,
      packaging: 0.88,
      attributes: 0.85,
    },
    review: {
      safeToCreateMaster: true,
      safeToStageVariants: false,
      publishReadinessHints: {
        hasVariantCandidates: false,
        hasImageCandidate: true,
        hasPackagingSignal: true,
        hasSkuSourceSeparation: true,
        warnings: [],
      },
      blockers: [],
      warnings: [],
    },
    ...over,
  };
}

describe("buildProductSetupApplyCandidates", () => {
  it("marks safe identity fields as applyable", () => {
    const contract = buildProductSetupContractSummary(buildProductSetupContractFromExtractionV2(extraction()));
    const readiness = buildProductSetupWizardReadiness({ contractSummary: contract, normalizedData: {} });
    const candidates = buildProductSetupApplyCandidates(readiness, contract, {});
    const title = candidates.find((c) => c.fieldKey === "title");
    expect(title?.applyStatus).toBe("safe_to_apply");
    expect(title?.mutationKind).toBe("identity");
  });

  it("blocks GLV-looking manufacturer SKUs via guard", () => {
    expect(
      getProductSetupApplyBlockReason({
        fieldKey: "manufacturerSku",
        sectionKey: "identity",
        mutationKind: "identity",
        confidence: 0.9,
        extractedValue: "GLV-GL-N125",
      })
    ).toMatch(/GLV-looking SKU/i);
    expect(isSafeIdentityField("manufacturerSku", "GLV-GL-N125", 0.9)).toBe(false);
  });

  it("requires allowed canonical values for material", () => {
    const contract = buildProductSetupContractSummary(
      buildProductSetupContractFromExtractionV2(
        extraction({
          attributes: { material: makeFieldEvidence("unknown_material", 0.9, "text") },
          taxonomy: { material: makeFieldEvidence("unknown_material", 0.9, "text") },
        })
      )
    );
    const readiness = buildProductSetupWizardReadiness({
      contractSummary: contract,
      normalizedData: { filter_attributes: {} },
    });
    const candidates = buildProductSetupApplyCandidates(readiness, contract, {});
    const material = candidates.find((c) => c.fieldKey === "material");
    expect(material?.applyStatus).not.toBe("safe_to_apply");
  });

  it("blocks high-risk food_safe and exam_grade from auto-apply", () => {
    expect(isHighRiskComplianceField("foodSafe")).toBe(true);
    expect(isHighRiskComplianceField("examGrade")).toBe(true);
    const contract = buildProductSetupContractSummary(buildProductSetupContractFromExtractionV2(extraction()));
    const readiness = buildProductSetupWizardReadiness({ contractSummary: contract, normalizedData: {} });
    const candidates = buildProductSetupApplyCandidates(readiness, contract, {});
    expect(candidates.find((c) => c.fieldKey === "foodSafe")?.applyStatus).toBe("blocked");
    expect(candidates.find((c) => c.fieldKey === "examGrade")?.applyStatus).toBe("blocked");
    expect(candidates.find((c) => c.fieldKey === "medicalGrade")?.applyStatus).toBe("blocked");
  });

  it("marks powder, grade, packaging, and latex-free as safe when normalized", () => {
    const contract = buildProductSetupContractSummary(
      buildProductSetupContractFromExtractionV2(
        extraction({
          attributes: {
            material: makeFieldEvidence("nitrile", 0.92, "table"),
            powderFree: makeFieldEvidence(true, 0.82, "text", { quote: "powder free" }),
            latexFree: makeFieldEvidence(true, 0.82, "text", { quote: "latex free" }),
            examGrade: makeFieldEvidence(true, 0.82, "text", { quote: "exam glove" }),
          },
        })
      )
    );
    const nd = {
      category_slug: "disposable_gloves",
      filter_attributes: {},
    };
    const readiness = buildProductSetupWizardReadiness({ contractSummary: contract, normalizedData: nd });
    const candidates = buildProductSetupApplyCandidates(readiness, contract, nd);
    expect(candidates.find((c) => c.fieldKey === "powderFree")?.applyStatus).toBe("safe_to_apply");
    expect(candidates.find((c) => c.fieldKey === "grade")?.applyStatus).toBe("safe_to_apply");
    expect(candidates.find((c) => c.fieldKey === "packaging")?.applyStatus).toBe("safe_to_apply");
    expect(candidates.find((c) => c.fieldKey === "latexFree")?.applyStatus).toBe("safe_to_apply");
    expect(candidates.find((c) => c.fieldKey === "powderFree")?.normalizedValue).toBe("powder_free");
    expect(candidates.find((c) => c.fieldKey === "grade")?.normalizedValue).toBe("medical_exam_grade");
    expect(candidates.find((c) => c.fieldKey === "packaging")?.normalizedValue).toBe("case_1000_ct");
  });

  it("allows thickness when canonical value resolves and not yet staged", () => {
    const contract = buildProductSetupContractSummary(buildProductSetupContractFromExtractionV2(extraction()));
    const nd = { category_slug: "disposable_gloves", filter_attributes: {} };
    const readiness = buildProductSetupWizardReadiness({ contractSummary: contract, normalizedData: nd });
    const candidates = buildProductSetupApplyCandidates(readiness, contract, nd);
    const t = candidates.find((c) => c.fieldKey === "thicknessMil");
    expect(t?.normalizedValue).toBe("0.5");
    expect(t?.applyStatus).toBe("safe_to_apply");
  });

  it("blocks SKU proposal fields with reason", () => {
    const contract = buildProductSetupContractSummary(buildProductSetupContractFromExtractionV2(extraction()));
    const readiness = buildProductSetupWizardReadiness({ contractSummary: contract, normalizedData: {} });
    const candidates = buildProductSetupApplyCandidates(readiness, contract, {});
    const sku = candidates.find((c) => c.fieldKey === "proposedParentGlvSku");
    if (sku) {
      expect(sku.applyStatus).toBe("blocked");
      expect(sku.blockReason).toMatch(/SKU proposal/i);
    }
  });
});

describe("applyProductSetupCandidatesToNormalizedData", () => {
  it("applies identity field to normalized_data", () => {
    const contract = buildProductSetupContractSummary(buildProductSetupContractFromExtractionV2(extraction()));
    const readiness = buildProductSetupWizardReadiness({ contractSummary: contract, normalizedData: {} });
    const candidates = buildProductSetupApplyCandidates(readiness, contract, {}).filter((c) =>
      isSafeProductSetupApplyCandidate(c)
    );
    const titleCandidate = candidates.find((c) => c.fieldKey === "title");
    expect(titleCandidate).toBeDefined();
    const result = applyProductSetupCandidatesToNormalizedData({}, titleCandidate ? [titleCandidate] : []);
    expect(result.appliedFields).toContain("title");
    expect(result.normalizedData.canonical_title).toBe("Nitrile Exam Glove");
  });

  it("is idempotent when value already present", () => {
    const contract = buildProductSetupContractSummary(buildProductSetupContractFromExtractionV2(extraction()));
    const nd = { canonical_title: "Nitrile Exam Glove", name: "Nitrile Exam Glove" };
    const readiness = buildProductSetupWizardReadiness({ contractSummary: contract, normalizedData: nd });
    const candidates = buildProductSetupApplyCandidates(readiness, contract, nd);
    const title = candidates.find((c) => c.fieldKey === "title");
    expect(title?.applyStatus).toBe("already_applied");
  });
});

describe("guard helpers", () => {
  it("isSafeIdentityField rejects low confidence", () => {
    expect(isSafeIdentityField("brand", "Proworks", 0.5)).toBe(false);
    expect(isSafeIdentityField("brand", "Proworks", 0.8)).toBe(true);
  });
});
