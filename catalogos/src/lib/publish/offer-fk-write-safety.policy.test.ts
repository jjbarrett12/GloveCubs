import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const STAGING = path.resolve(__dirname, "../services/publish/publish-staging-catalogos.ts");
const MERGE = path.resolve(__dirname, "../product-matching/match-runs.ts");
const SUGGESTED = path.resolve(__dirname, "../ingestion/offer-service.ts");

describe("offer FK write-path safety", () => {
  it("staging publish uses withResolvedCatalogVariantId (does not send raw null)", () => {
    const src = readFileSync(STAGING, "utf8");
    expect(src).toContain("withResolvedCatalogVariantId");
    expect(src).not.toContain("catalog_variant_id: catalogVariantId");
  });

  it("mergeDuplicateProducts clears catalog_variant_id when changing product_id", () => {
    const src = readFileSync(MERGE, "utf8");
    expect(src).toContain("product_id: keepProductId");
    expect(src).toContain("catalog_variant_id: null");
  });

  it("createSuggestedOffer does not send catalog_variant_id", () => {
    const src = readFileSync(SUGGESTED, "utf8");
    expect(src).not.toContain("catalog_variant_id");
  });
});
