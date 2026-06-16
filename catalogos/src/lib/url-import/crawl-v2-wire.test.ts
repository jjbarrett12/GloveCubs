import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { INTERNAL_SKU_KEYS } from "@/lib/product-extraction/extraction-v2-bridge";
import { runUrlExtractionV2 } from "@/lib/product-extraction/url-extraction-v2";
import { buildUrlImportProductInsertsFromExtractionV2 } from "./crawl-v2-wire";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOSPECO_FIXTURE = path.resolve(
  __dirname,
  "../../../../lib/commerce-packaging/fixtures/hospeco-proworks-nitrile.html"
);

describe("buildUrlImportProductInsertsFromExtractionV2", () => {
  it("builds deterministic inserts with V2 on first rawPayload only", async () => {
    const html = fs.readFileSync(HOSPECO_FIXTURE, "utf8");
    const extraction = await runUrlExtractionV2({
      url: "https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves",
      html,
    });

    const { inserts, warnings } = buildUrlImportProductInsertsFromExtractionV2({
      extraction,
      legacyRawPayload: {
        extraction_source: "product-url-extraction-v2",
        legacy_openclaw_available: false,
      },
    });

    expect(inserts.length).toBeGreaterThanOrEqual(5);
    expect(inserts[0]!.extraction_method).toBe("deterministic");
    expect(inserts[0]!.ai_used).toBe(false);
    expect(inserts[0]!.confidence).toBeGreaterThan(0);
    expect(inserts[0]!.confidence).toBeLessThanOrEqual(1);

    expect(inserts[0]!.raw_payload.extraction_v2).toBeDefined();
    expect((inserts[0]!.raw_payload.extraction_v2 as { version?: string }).version).toBe(
      "product-url-extraction-v2"
    );
    for (let i = 1; i < inserts.length; i++) {
      expect(inserts[i]!.raw_payload.extraction_v2).toBeUndefined();
    }

    for (const row of inserts) {
      const summary = row.normalized_payload._extraction_v2 as Record<string, unknown>;
      expect(summary?.version).toBe("product-url-extraction-v2");
      expect(row.normalized_payload).not.toHaveProperty("extraction_v2");
      expect(summary).not.toHaveProperty("identity");
      for (const key of INTERNAL_SKU_KEYS) {
        expect(row.normalized_payload[key]).toBeUndefined();
      }
    }

    expect(warnings.some((w) => /image/i.test(w))).toBe(true);
  });

  it("keeps compact _extraction_v2 without full extraction blobs in normalized_payload", async () => {
    const html = fs.readFileSync(HOSPECO_FIXTURE, "utf8");
    const extraction = await runUrlExtractionV2({
      url: "https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves",
      html,
    });
    const { inserts } = buildUrlImportProductInsertsFromExtractionV2({
      extraction,
      legacyRawPayload: { extraction_source: "product-url-extraction-v2" },
    });

    for (const row of inserts) {
      const norm = row.normalized_payload as Record<string, unknown>;
      const summary = norm._extraction_v2 as Record<string, unknown>;
      expect(summary).toBeDefined();
      expect(norm).not.toHaveProperty("extraction_v2");
      expect(summary).not.toHaveProperty("identity");
      expect(summary).not.toHaveProperty("jsonLdProduct");
      expect(summary).not.toHaveProperty("candidates");
      expect((summary as { images?: { candidates?: unknown[] } }).images?.candidates).toBeUndefined();
    }
  });

  it("preserves manufacturer vs supplier SKU separation and commerce_packaging when present", async () => {
    const html = fs.readFileSync(HOSPECO_FIXTURE, "utf8");
    const extraction = await runUrlExtractionV2({
      url: "https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves",
      html,
    });
    const { inserts } = buildUrlImportProductInsertsFromExtractionV2({ extraction });

    const withMfr = inserts.filter((r) => r.normalized_payload.manufacturer_sku);
    if (withMfr.length > 0) {
      for (const row of withMfr) {
        const mfr = String(row.normalized_payload.manufacturer_sku);
        expect(mfr).not.toMatch(/\bGLV[-_]/i);
        expect(row.normalized_payload.sku).toBeUndefined();
      }
    }

    const withPkg = inserts.filter((r) => r.normalized_payload.commerce_packaging);
    expect(withPkg.length).toBeGreaterThan(0);
  });
});

describe("isUrlExtractionV2Enabled crawl branch contract", () => {
  it("flag false keeps legacy path contract (helper not used by crawl when disabled)", async () => {
    const prev = process.env.GLOVECUBS_URL_EXTRACTION_V2;
    process.env.GLOVECUBS_URL_EXTRACTION_V2 = "false";
    const { isUrlExtractionV2Enabled } = await import("@/lib/product-extraction/feature-flag");
    expect(isUrlExtractionV2Enabled()).toBe(false);
    if (prev === undefined) delete process.env.GLOVECUBS_URL_EXTRACTION_V2;
    else process.env.GLOVECUBS_URL_EXTRACTION_V2 = prev;
  });

  it("flag true enables V2 crawl wire path selection", async () => {
    const prev = process.env.GLOVECUBS_URL_EXTRACTION_V2;
    process.env.GLOVECUBS_URL_EXTRACTION_V2 = "true";
    const { isUrlExtractionV2Enabled } = await import("@/lib/product-extraction/feature-flag");
    expect(isUrlExtractionV2Enabled()).toBe(true);
    if (prev === undefined) delete process.env.GLOVECUBS_URL_EXTRACTION_V2;
    else process.env.GLOVECUBS_URL_EXTRACTION_V2 = prev;
  });
});
