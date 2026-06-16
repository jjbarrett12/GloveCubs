import { describe, expect, it } from "vitest";
import { makeFieldEvidence } from "./evidence-helpers";
import {
  buildProductSetupContractFromExtractionV2,
  buildProductSetupContractSummary,
} from "./product-setup-contract";
import {
  buildAttributeSection,
  buildContractSummaryFromLegacyStaging,
  buildImageSection,
  buildProductSetupWizardReadiness,
  buildVariantSection,
  resolveWizardContractSummary,
} from "./product-setup-wizard-readiness";
import type { ProductUrlExtractionV2 } from "./types";
import type { PublishReadiness } from "@/lib/review/publish-guards";

function minimalExtraction(over: Partial<ProductUrlExtractionV2> = {}): ProductUrlExtractionV2 {
  return {
    version: "product-url-extraction-v2",
    schemaVersion: 1,
    sourceUrl: "https://example.com/glove",
    fetchedAt: "2026-06-11T00:00:00.000Z",
    source: { rawTextSample: "Exam glove" },
    identity: {
      normalizedTitle: makeFieldEvidence("Nitrile Exam Glove", 0.82, "title"),
      brand: makeFieldEvidence("Proworks", 0.8, "meta"),
      manufacturerSkuCandidates: makeFieldEvidence(["GL-N125F-M"], 0.85, "json_ld"),
    },
    taxonomy: {
      categorySlug: makeFieldEvidence("disposable_gloves", 0.7, "heuristic"),
      material: makeFieldEvidence("nitrile", 0.9, "table"),
    },
    commercePackaging: {
      unitsPerCase: makeFieldEvidence(1000, 0.88, "text"),
      innersPerCase: makeFieldEvidence(10, 0.88, "table"),
      unitsPerInner: makeFieldEvidence(100, 0.88, "table"),
    },
    attributes: {
      material: makeFieldEvidence("nitrile", 0.9, "table"),
    },
    variants: {
      dimensions: [{ name: "size", confidence: 0.8, trust: "probable", source: "dom", options: ["S", "M", "L"] }],
      options: [],
      proposedVariants: [
        { size: "S", manufacturerSku: "GL-N125F-S", evidence: [], confidence: 0.78, trust: "probable" },
        { size: "M", manufacturerSku: "GL-N125F-M", evidence: [], confidence: 0.78, trust: "probable" },
        { size: "L", manufacturerSku: "GL-N125F-L", evidence: [], confidence: 0.78, trust: "probable" },
      ],
      unresolvedVariantNotes: [],
    },
    images: {
      candidates: [
        {
          id: "img1",
          url: "https://example.com/p.jpg",
          absoluteUrl: "https://example.com/p.jpg",
          alt: "Nitrile glove",
          source: "json_ld",
          role: "primary_product",
          score: 0.9,
          confidence: 0.9,
          trust: "trusted",
          reasons: [],
        },
        {
          id: "logo1",
          url: "https://example.com/logo.png",
          absoluteUrl: "https://example.com/logo.png",
          source: "img",
          role: "logo",
          score: 0.1,
          confidence: 0.1,
          trust: "weak",
          reasons: [],
          rejectionReason: "logo",
          recommendedGallery: false,
          recommendedPrimary: false,
        } as never,
      ],
      primaryCandidateId: "img1",
      rejected: [],
    },
    documents: { specSheetUrls: [], sdsUrls: [], otherUrls: [] },
    confidence: {
      overall: 0.8,
      identity: 0.8,
      variants: 0.78,
      images: 0.8,
      packaging: 0.85,
      attributes: 0.85,
    },
    review: {
      safeToCreateMaster: true,
      safeToStageVariants: true,
      publishReadinessHints: {
        hasVariantCandidates: true,
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

describe("buildProductSetupWizardReadiness", () => {
  it("builds readiness from contract summary", () => {
    const contract = buildProductSetupContractFromExtractionV2(minimalExtraction());
    const summary = buildProductSetupContractSummary(contract);
    const readiness = buildProductSetupWizardReadiness({ contractSummary: summary });
    expect(readiness.schemaVersion).toBe("glovecubs.product_setup_wizard_readiness.v1");
    expect(readiness.sections.identity.fields.length).toBeGreaterThan(0);
    expect(readiness.sections.variants.fields.some((f) => f.key === "detectedSizes")).toBe(true);
  });

  it("exposes image candidates with roles and scores", () => {
    const contract = buildProductSetupContractFromExtractionV2(minimalExtraction());
    const summary = buildProductSetupContractSummary(contract);
    const section = buildImageSection(summary);
    const roles = section.fields.find((f) => f.key === "candidateRoles");
    expect(roles?.displayValue).toMatch(/primary_product/);
    expect(roles?.displayValue).toMatch(/90%/);
  });

  it("handles multi-size variant section", () => {
    const contract = buildProductSetupContractFromExtractionV2(minimalExtraction());
    const summary = buildProductSetupContractSummary(contract);
    const section = buildVariantSection(summary);
    expect(section.fields.find((f) => f.key === "detectedSizes")?.displayValue).toMatch(/S/);
    expect(section.fields.find((f) => f.key === "manufacturerVariantSkus")?.displayValue).toMatch(/GL-N125F-M/);
  });

  it("high-risk foodSafe with low confidence is needs_review", () => {
    const contract = buildProductSetupContractFromExtractionV2(
      minimalExtraction({
        attributes: {
          material: makeFieldEvidence("nitrile", 0.9, "table"),
          foodSafe: makeFieldEvidence(true, 0.55, "text"),
        },
      })
    );
    const summary = buildProductSetupContractSummary(contract);
    const section = buildAttributeSection(summary);
    const food = section.fields.find((f) => f.key === "foodSafe");
    expect(food?.status).toBe("needs_review");
  });

  it("missing pricing yields needs_pricing not parser failure", () => {
    const contract = buildProductSetupContractFromExtractionV2(minimalExtraction());
    const summary = buildProductSetupContractSummary(contract);
    const readiness = buildProductSetupWizardReadiness({
      contractSummary: summary,
      normalizedData: { normalized_case_cost: 0 },
    });
    expect(readiness.overallStatus).toBe("needs_pricing");
    expect(readiness.sections.pricing.warnings.some((w) => /pricing/i.test(w))).toBe(true);
  });

  it("missing required identity title yields missing_required_fields", () => {
    const contract = buildProductSetupContractFromExtractionV2(
      minimalExtraction({
        identity: { brand: makeFieldEvidence("X", 0.8, "meta") },
      })
    );
    const summary = buildProductSetupContractSummary(contract);
    const readiness = buildProductSetupWizardReadiness({ contractSummary: summary });
    expect(readiness.overallStatus).toBe("missing_required_fields");
    expect(readiness.missingFields).toContain("title");
  });

  it("merges publish readiness blockers without replacing semantics", () => {
    const contract = buildProductSetupContractFromExtractionV2(minimalExtraction());
    const summary = buildProductSetupContractSummary(contract);
    const pr: PublishReadiness = {
      canPublish: false,
      blockers: ["Status must be approved"],
      warnings: [],
      categorySlug: "disposable_gloves",
      categoryRequirementsEnforced: true,
      blockerSections: {
        workflow: ["Status must be approved"],
        staging_validation: [],
        missing_required_attributes: [],
        case_pricing: [],
        sku: [],
      },
      postClickPipelineNotes: [],
    };
    const readiness = buildProductSetupWizardReadiness({
      contractSummary: summary,
      normalizedData: { normalized_case_cost: 85 },
      publishReadiness: pr,
    });
    expect(readiness.sections.publishReadiness.status).toBe("blocked");
    expect(readiness.blockedReasons.some((b) => /approved/i.test(b))).toBe(true);
  });
});

describe("resolveWizardContractSummary", () => {
  it("prefers product_setup_contract_summary", () => {
    const contract = buildProductSetupContractFromExtractionV2(minimalExtraction());
    const summary = buildProductSetupContractSummary(contract);
    const resolved = resolveWizardContractSummary({ product_setup_contract_summary: summary }, {});
    expect(resolved?.identity.title).toBe("Nitrile Exam Glove");
  });

  it("falls back to _extraction_v2 legacy stub", () => {
    const legacy = buildContractSummaryFromLegacyStaging({
      _extraction_v2: {
        version: "product-url-extraction-v2",
        schemaVersion: 1,
        sourceUrl: "https://example.com/legacy",
        imageCandidateCount: 1,
        proposedVariantCount: 0,
        variantDimensions: [],
        confidence: {
          overall: 0.7,
          identity: 0.7,
          variants: 0.5,
          images: 0.6,
          packaging: 0.7,
          attributes: 0.7,
        },
        review: {
          safeToCreateMaster: false,
          safeToStageVariants: false,
          publishReadinessHints: {
            hasVariantCandidates: false,
            hasImageCandidate: true,
            hasPackagingSignal: false,
            hasSkuSourceSeparation: true,
            warnings: [],
          },
          blockers: [],
          warnings: [],
        },
      },
      canonical_title: "Legacy Glove",
    });
    expect(legacy?.source.extractionMode).toBe("legacy_stub");
    expect(legacy?.identity.title).toBe("Legacy Glove");
  });
});
