import { describe, expect, it } from "vitest";
import { prepareUrlImportBridgeRows } from "./bridge";
import { buildProductSetupContractFromExtractionV2 } from "@/lib/product-extraction/product-setup-contract";
import { makeFieldEvidence } from "@/lib/product-extraction/evidence-helpers";
import type { ProductUrlExtractionV2 } from "@/lib/product-extraction/types";

function minimalExtraction(): ProductUrlExtractionV2 {
  return {
    version: "product-url-extraction-v2",
    schemaVersion: 1,
    sourceUrl: "https://example.com/glove",
    fetchedAt: "2026-06-11T00:00:00.000Z",
    source: {},
    identity: {
      normalizedTitle: makeFieldEvidence("Test Glove", 0.8, "title"),
      manufacturerSkuCandidates: makeFieldEvidence(["MFR-123"], 0.85, "json_ld"),
    },
    taxonomy: {},
    commercePackaging: {},
    attributes: {},
    variants: { dimensions: [], options: [], proposedVariants: [], unresolvedVariantNotes: [] },
    images: { candidates: [], rejected: [] },
    documents: { specSheetUrls: [], sdsUrls: [], otherUrls: [] },
    confidence: { overall: 0.8, identity: 0.8, variants: 0.7, images: 0.7, packaging: 0.7, attributes: 0.7 },
    review: {
      safeToCreateMaster: true,
      safeToStageVariants: false,
      publishReadinessHints: {
        hasVariantCandidates: false,
        hasImageCandidate: false,
        hasPackagingSignal: false,
        hasSkuSourceSeparation: true,
        warnings: [],
      },
      blockers: [],
      warnings: [],
    },
  };
}

describe("prepareUrlImportBridgeRows", () => {
  it("copies product_setup_contract_full from url_import raw_payload onto ParsedRow", () => {
    const contract = buildProductSetupContractFromExtractionV2(minimalExtraction());
    const rows = prepareUrlImportBridgeRows([
      {
        normalized_payload: {
          name: "Test Glove",
          sku: "MFR-123",
          supplier_sku: "MFR-123",
          cost: 0,
          manufacturer_sku: "MFR-123",
        },
        raw_payload: { product_setup_contract: contract },
      },
    ]);
    expect(rows[0]?.product_setup_contract_full).toEqual(contract);
  });
});
