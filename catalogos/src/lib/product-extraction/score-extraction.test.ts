import { describe, expect, it } from "vitest";
import { makeFieldEvidence } from "./evidence-helpers";
import {
  applyProductUrlExtractionV2Scoring,
  assessPackagingConflicts,
} from "./score-extraction";
import type { ProductUrlExtractionV2 } from "./types";

function baseExtraction(overrides: Partial<ProductUrlExtractionV2> = {}): ProductUrlExtractionV2 {
  return {
    version: "product-url-extraction-v2",
    schemaVersion: 1,
    sourceUrl: "https://example.com/product/glove",
    fetchedAt: "2026-06-11T00:00:00.000Z",
    source: {},
    identity: {
      normalizedTitle: makeFieldEvidence("Nitrile Exam Glove", 0.82, "title"),
      brand: makeFieldEvidence("Proworks", 0.8, "meta"),
    },
    taxonomy: {
      categorySlug: makeFieldEvidence("disposable_gloves", 0.7, "heuristic"),
      productType: makeFieldEvidence("glove", 0.75, "heuristic"),
      material: makeFieldEvidence("nitrile", 0.9, "table"),
      disposableReusable: makeFieldEvidence("disposable", 0.82, "heuristic"),
    },
    commercePackaging: {
      unitsPerCase: makeFieldEvidence(1000, 0.88, "text"),
      innersPerCase: makeFieldEvidence(10, 0.88, "table"),
      unitsPerInner: makeFieldEvidence(100, 0.88, "table"),
      packTextRaw: makeFieldEvidence("100 gloves per box. 10 boxes per case. 1,000 gloves per case.", 0.75, "text"),
    },
    attributes: {
      material: makeFieldEvidence("nitrile", 0.9, "table"),
      examGrade: makeFieldEvidence(true, 0.78, "text"),
    },
    variants: {
      dimensions: [{ name: "size", confidence: 0.7, trust: "probable", source: "text", options: ["M"] }],
      options: [],
      proposedVariants: [
        {
          size: "M",
          manufacturerSku: "GL-N125F-M",
          evidence: [makeFieldEvidence("GL-N125F-M", 0.9, "embedded_json")],
          confidence: 0.88,
          trust: "probable",
        },
      ],
      unresolvedVariantNotes: [],
    },
    images: {
      candidates: [
        {
          id: "img1",
          url: "https://example.com/glove.jpg",
          absoluteUrl: "https://example.com/glove.jpg",
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
      overall: 0,
      identity: 0,
      variants: 0,
      images: 0,
      packaging: 0,
      attributes: 0,
    },
    review: {
      safeToCreateMaster: false,
      safeToStageVariants: false,
      publishReadinessHints: {
        hasVariantCandidates: false,
        hasImageCandidate: false,
        hasPackagingSignal: false,
        hasSkuSourceSeparation: false,
        warnings: [],
      },
      blockers: [],
      warnings: [],
    },
    ...overrides,
  };
}

describe("applyProductUrlExtractionV2Scoring", () => {
  it("strong extraction creates nonzero confidence buckets", () => {
    const scored = applyProductUrlExtractionV2Scoring(baseExtraction());
    expect(scored.confidence.overall).toBeGreaterThan(0.5);
    expect(scored.confidence.identity).toBeGreaterThan(0.5);
    expect(scored.confidence.variants).toBeGreaterThan(0.5);
    expect(scored.confidence.images).toBeGreaterThan(0.5);
    expect(scored.confidence.packaging).toBeGreaterThan(0.5);
    expect(scored.confidence.attributes).toBeGreaterThan(0.5);
  });

  it("no title creates blocker", () => {
    const scored = applyProductUrlExtractionV2Scoring(
      baseExtraction({
        identity: {},
      })
    );
    expect(scored.review.blockers.some((b) => /title/i.test(b))).toBe(true);
    expect(scored.review.safeToCreateMaster).toBe(false);
  });

  it("no product image creates warning and safeToCreateMaster false", () => {
    const scored = applyProductUrlExtractionV2Scoring(
      baseExtraction({
        images: { candidates: [], rejected: [] },
      })
    );
    expect(scored.review.warnings.some((w) => /image/i.test(w))).toBe(true);
    expect(scored.review.safeToCreateMaster).toBe(false);
    expect(scored.review.publishReadinessHints.hasImageCandidate).toBe(false);
  });

  it("source-confirmed variants set safeToStageVariants true", () => {
    const scored = applyProductUrlExtractionV2Scoring(baseExtraction());
    expect(scored.review.safeToStageVariants).toBe(true);
    expect(scored.review.publishReadinessHints.hasVariantCandidates).toBe(true);
  });

  it("unresolved dimensions create warning and safeToStageVariants false", () => {
    const scored = applyProductUrlExtractionV2Scoring(
      baseExtraction({
        variants: {
          dimensions: [
            { name: "size", confidence: 0.7, trust: "probable", source: "dom", options: ["M"] },
            { name: "color", confidence: 0.7, trust: "probable", source: "dom", options: ["Blue"] },
          ],
          options: [],
          proposedVariants: [],
          unresolvedVariantNotes: [
            "Multiple variant dimensions detected without source-confirmed SKU/combination mapping.",
          ],
        },
      })
    );
    expect(scored.review.safeToStageVariants).toBe(false);
    expect(scored.review.warnings.some((w) => /variant/i.test(w))).toBe(true);
  });

  it("high-confidence packaging conflict creates blocker", () => {
    const conflict = baseExtraction({
      commercePackaging: {
        unitsPerCase: makeFieldEvidence(2000, 0.9, "text"),
        innersPerCase: makeFieldEvidence(10, 0.9, "table"),
        unitsPerInner: makeFieldEvidence(100, 0.9, "table"),
        packTextRaw: makeFieldEvidence("10 boxes × 200 gloves = 2,000 gloves per case", 0.9, "text"),
      },
    });
    const assessment = assessPackagingConflicts(conflict);
    expect(assessment.hasInnerProductConflict).toBe(true);

    const scored = applyProductUrlExtractionV2Scoring(conflict);
    expect(scored.review.blockers.some((b) => /packaging math conflict/i.test(b))).toBe(true);
  });

  it("weak packaging conflict creates warning not blocker", () => {
    const conflict = baseExtraction({
      commercePackaging: {
        unitsPerCase: makeFieldEvidence(2000, 0.55, "text"),
        innersPerCase: makeFieldEvidence(10, 0.55, "table"),
        unitsPerInner: makeFieldEvidence(100, 0.55, "table"),
        packTextRaw: makeFieldEvidence("10 boxes × 200 gloves = 2,000 gloves per case", 0.5, "text"),
      },
    });
    const scored = applyProductUrlExtractionV2Scoring(conflict);
    expect(scored.review.blockers.some((b) => /packaging math conflict/i.test(b))).toBe(false);
    expect(scored.review.warnings.some((w) => /packaging math conflict/i.test(w))).toBe(true);
  });

  it("does not expose safeToPublishVariants and hints are informational", () => {
    const scored = applyProductUrlExtractionV2Scoring(baseExtraction());
    expect(scored.review).not.toHaveProperty("safeToPublishVariants");
    expect(typeof scored.review.publishReadinessHints.hasVariantCandidates).toBe("boolean");
    expect(scored.review.publishReadinessHints.warnings).toEqual(expect.any(Array));
  });

  it("GLV-looking SKU in parser output creates warning", () => {
    const scored = applyProductUrlExtractionV2Scoring(
      baseExtraction({
        identity: {
          normalizedTitle: makeFieldEvidence("Test Glove", 0.82, "title"),
          manufacturerSkuCandidates: makeFieldEvidence(["GLV-GL-N125"], 0.85, "heuristic"),
        },
        variants: {
          dimensions: [],
          options: [],
          proposedVariants: [],
          unresolvedVariantNotes: [],
        },
      })
    );
    expect(scored.review.warnings.some((w) => /GLV/i.test(w))).toBe(true);
    expect(scored.review.publishReadinessHints.hasSkuSourceSeparation).toBe(false);
  });
});
