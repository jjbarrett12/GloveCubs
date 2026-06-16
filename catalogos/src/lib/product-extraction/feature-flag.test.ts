import { describe, expect, it } from "vitest";
import { isUrlExtractionV2Enabled } from "./feature-flag";
import type { ProductUrlExtractionV2 } from "./types";

describe("product-extraction Layer 1", () => {
  it("isUrlExtractionV2Enabled is false unless env is exactly true", () => {
    const prev = process.env.GLOVECUBS_URL_EXTRACTION_V2;
    delete process.env.GLOVECUBS_URL_EXTRACTION_V2;
    expect(isUrlExtractionV2Enabled()).toBe(false);
    process.env.GLOVECUBS_URL_EXTRACTION_V2 = "1";
    expect(isUrlExtractionV2Enabled()).toBe(false);
    process.env.GLOVECUBS_URL_EXTRACTION_V2 = "true";
    expect(isUrlExtractionV2Enabled()).toBe(true);
    if (prev === undefined) delete process.env.GLOVECUBS_URL_EXTRACTION_V2;
    else process.env.GLOVECUBS_URL_EXTRACTION_V2 = prev;
  });

  it("ProductUrlExtractionV2 contract compiles with required review shape", () => {
    const sample: ProductUrlExtractionV2 = {
      version: "product-url-extraction-v2",
      schemaVersion: 1,
      sourceUrl: "https://example.com/p",
      fetchedAt: new Date().toISOString(),
      source: {},
      identity: {},
      taxonomy: {},
      commercePackaging: {},
      attributes: {},
      variants: {
        dimensions: [],
        options: [],
        proposedVariants: [],
        unresolvedVariantNotes: [],
      },
      images: { candidates: [], rejected: [] },
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
    };
    expect(sample.version).toBe("product-url-extraction-v2");
  });
});
