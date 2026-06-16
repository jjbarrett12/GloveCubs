/**
 * Static policy guards for product ingest authority — prevents new drift without env/DB.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCT_SETUP_CONTRACT_SCHEMA_VERSION } from "@/lib/product-extraction/product-setup-contract";

const ROOT = join(__dirname, "../..");

const URL_IMPORT_SOURCES = [
  "src/lib/url-import/bridge.ts",
  "src/lib/url-import/crawl-service.ts",
  "src/lib/url-import/crawl-v2-wire.ts",
  "src/lib/ingestion/run-pipeline.ts",
];

describe("product ingest authority (CatalogOS)", () => {
  it("ProductUrlExtractionV2 version string is canonical", () => {
    const s = readFileSync(join(ROOT, "src/lib/product-extraction/types.ts"), "utf8");
    expect(s).toContain('"product-url-extraction-v2"');
  });

  it("ProductSetupContractV1 schema version is canonical", () => {
    expect(PRODUCT_SETUP_CONTRACT_SCHEMA_VERSION).toBe("glovecubs.product_setup_contract.v1");
  });

  for (const rel of URL_IMPORT_SOURCES) {
    it(`${rel} does not call runPublish (no URL auto-publish)`, () => {
      const s = readFileSync(join(ROOT, rel), "utf8");
      expect(s).not.toMatch(/\brunPublish\b/);
      expect(s).not.toContain("publish-service");
    });
  }

  it("crawl-service wires V2 extraction when flag enabled", () => {
    const s = readFileSync(join(ROOT, "src/lib/url-import/crawl-service.ts"), "utf8");
    expect(s).toContain("isUrlExtractionV2Enabled");
    expect(s).toContain("runUrlExtractionV2");
    expect(s).toContain("buildUrlImportProductInsertsFromExtractionV2");
  });

  it("bridge attaches product_setup_contract_full without publishing", () => {
    const s = readFileSync(join(ROOT, "src/lib/url-import/bridge.ts"), "utf8");
    expect(s).toContain("runPipelineFromParsedRows");
    expect(s).toContain("product_setup_contract_full");
    expect(s).not.toMatch(/\brunPublish\b/);
  });
});
