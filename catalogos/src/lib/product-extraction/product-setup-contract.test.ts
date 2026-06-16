import { describe, expect, it } from "vitest";
import { makeFieldEvidence } from "./evidence-helpers";
import {
  buildProductSetupContractFromExtractionV2,
  buildProductSetupContractSummary,
  extractProductSetupPassthroughFromParsedRow,
  isProductSetupContractV1,
  isProductSetupContractSummaryV1,
  isGlvLookingSku,
  PRODUCT_SETUP_CONTRACT_SCHEMA_VERSION,
} from "./product-setup-contract";
import type { ProductUrlExtractionV2 } from "./types";

function minimalExtraction(overrides: Partial<ProductUrlExtractionV2> = {}): ProductUrlExtractionV2 {
  return {
    version: "product-url-extraction-v2",
    schemaVersion: 1,
    sourceUrl: "https://example.com/glove",
    fetchedAt: "2026-06-11T00:00:00.000Z",
    source: { rawTextSample: "Nitrile exam glove" },
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
      thicknessMil: makeFieldEvidence(0.5, 0.8, "text"),
      certifications: makeFieldEvidence(["FDA"], 0.72, "text"),
    },
    variants: { dimensions: [], options: [], proposedVariants: [], unresolvedVariantNotes: [] },
    images: {
      candidates: [
        {
          id: "img1",
          url: "https://example.com/p.jpg",
          absoluteUrl: "https://example.com/p.jpg",
          alt: "Nitrile glove blue",
          width: 500,
          height: 500,
          source: "json_ld",
          role: "primary_product",
          score: 0.9,
          confidence: 0.9,
          trust: "trusted",
          reasons: ["json_ld_image"],
        },
      ],
      primaryCandidateId: "img1",
      rejected: [],
    },
    documents: { specSheetUrls: [], sdsUrls: [], otherUrls: [] },
    confidence: {
      overall: 0.8,
      identity: 0.8,
      variants: 0.7,
      images: 0.8,
      packaging: 0.85,
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
    ...overrides,
  };
}

describe("ProductSetupContractV1", () => {
  it("builds versioned contract from ProductUrlExtractionV2", () => {
    const contract = buildProductSetupContractFromExtractionV2(minimalExtraction(), {
      crawlJobId: "job-1",
    });
    expect(isProductSetupContractV1(contract)).toBe(true);
    expect(contract.schemaVersion).toBe(PRODUCT_SETUP_CONTRACT_SCHEMA_VERSION);
    expect(contract.source.extractionMode).toBe("v2");
    expect(contract.source.crawlJobId).toBe("job-1");
    expect(contract.identity.manufacturerSku).toBe("GL-N125F-M");
    expect(contract.attributes.thicknessMil).toBe(0.5);
    expect(contract.images.candidates).toHaveLength(1);
    expect(contract.images.candidates[0]?.score).toBe(0.9);
    expect(contract._sourceExtractionV2?.sourceUrl).toBe("https://example.com/glove");
  });

  it("rejects GLV-looking SKUs as manufacturer_sku", () => {
    expect(isGlvLookingSku("GLV-GL-N125")).toBe(true);
    const contract = buildProductSetupContractFromExtractionV2(
      minimalExtraction({
        identity: {
          manufacturerSkuCandidates: makeFieldEvidence(["GLV-GL-N125"], 0.85, "json_ld"),
        },
      })
    );
    expect(contract.identity.manufacturerSku).toBeUndefined();
  });

  it("summary strips _sourceExtractionV2 but keeps image candidates and compat alias", () => {
    const contract = buildProductSetupContractFromExtractionV2(minimalExtraction());
    const summary = buildProductSetupContractSummary(contract);
    expect(isProductSetupContractSummaryV1(summary)).toBe(true);
    expect(summary).not.toHaveProperty("_sourceExtractionV2");
    expect(summary.images.candidates).toHaveLength(1);
    expect(summary.images.candidates[0]?.recommendedPrimary).toBe(true);
    expect(summary._extraction_v2_compat?.sourceUrl).toBe("https://example.com/glove");
    expect(summary._extraction_v2_compat?.normalizedTitle).toBe("Nitrile Exam Glove");
  });

  it("extractProductSetupPassthroughFromParsedRow reads summary and manufacturer_sku", () => {
    const contract = buildProductSetupContractFromExtractionV2(minimalExtraction());
    const summary = buildProductSetupContractSummary(contract);
    const passthrough = extractProductSetupPassthroughFromParsedRow({
      product_setup_contract_summary: summary,
      manufacturer_sku: "GL-N125F-M",
    });
    expect(passthrough.product_setup_contract_summary?.schemaVersion).toBe(
      PRODUCT_SETUP_CONTRACT_SCHEMA_VERSION
    );
    expect(passthrough._extraction_v2?.normalizedTitle).toBe("Nitrile Exam Glove");
    expect(passthrough.manufacturer_sku).toBe("GL-N125F-M");
  });
});
