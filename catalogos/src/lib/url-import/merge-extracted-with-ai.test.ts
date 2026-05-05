import { describe, expect, it } from "vitest";
import type { ExtractedProductFamily } from "@/lib/openclaw/types";
import {
  mergeExtractedWithAiPatch,
  shouldCallHtmlAi,
  shouldSkipHtmlAiAllStrong,
} from "./merge-extracted-with-ai";
import type { HtmlAiProductPatch } from "./html-product-ai-enrich";

function detField(
  raw: string,
  confidence: number
): { raw_value: string; normalized_value: string; confidence: number; extraction_method: "table_parse" } {
  return {
    raw_value: raw,
    normalized_value: raw,
    confidence,
    extraction_method: "table_parse",
  };
}

describe("mergeExtractedWithAiPatch", () => {
  it("does not overwrite fields with confidence >= 0.85", () => {
    const extracted: ExtractedProductFamily = {
      source_url: "https://x.test/p",
      material: detField("nitrile", 0.9),
      size: detField("M", 0.88),
    };
    const patch: HtmlAiProductPatch = {
      material: "vinyl",
      size: "XL",
    };
    const { merged, appliedFields } = mergeExtractedWithAiPatch(extracted, patch, {});
    expect(appliedFields).not.toContain("material");
    expect(appliedFields).not.toContain("size");
    expect(merged.material?.normalized_value).toBe("nitrile");
    expect(merged.size?.normalized_value).toBe("M");
  });

  it("overwrites fields with confidence < 0.70", () => {
    const extracted: ExtractedProductFamily = {
      source_url: "https://x.test/p",
      powder_status: detField("unknown", 0.55),
    };
    const patch: HtmlAiProductPatch = { powder_status: "powder_free" };
    const { merged, appliedFields } = mergeExtractedWithAiPatch(extracted, patch, {});
    expect(appliedFields).toContain("powder_status");
    expect(merged.powder_status?.normalized_value).toBe("powder_free");
    expect(merged.powder_status?.extraction_method).toBe("ai_semantic");
  });

  it("fills missing monitored fields", () => {
    const extracted: ExtractedProductFamily = {
      source_url: "https://x.test/p",
      material: detField("nitrile", 0.9),
    };
    const patch: HtmlAiProductPatch = { size: "L" };
    const { merged, appliedFields } = mergeExtractedWithAiPatch(extracted, patch, {});
    expect(appliedFields).toContain("size");
    expect(merged.size?.normalized_value).toBe("L");
  });

  it("never merges into sku, brand, or mpn", () => {
    const extracted: ExtractedProductFamily = {
      source_url: "https://x.test/p",
      sku: detField("SKU-1", 0.4),
      brand: detField("Acme", 0.4),
      mpn: detField("MPN-1", 0.4),
    };
    const patch: HtmlAiProductPatch = {
      material: "nitrile",
    };
    const { merged } = mergeExtractedWithAiPatch(extracted, patch, {});
    expect(merged.sku?.normalized_value).toBe("SKU-1");
    expect(merged.brand?.normalized_value).toBe("Acme");
    expect(merged.mpn?.normalized_value).toBe("MPN-1");
  });
});

describe("shouldCallHtmlAi / shouldSkipHtmlAiAllStrong", () => {
  it("calls when required size missing", () => {
    const extracted: ExtractedProductFamily = {
      source_url: "https://x.test/p",
      material: detField("nitrile", 0.9),
    };
    expect(shouldCallHtmlAi(extracted)).toBe(true);
    expect(shouldSkipHtmlAiAllStrong(extracted)).toBe(false);
  });

  it("skips call when all populated monitored fields are >= 0.85", () => {
    const extracted: ExtractedProductFamily = {
      source_url: "https://x.test/p",
      material: detField("nitrile", 0.9),
      size: detField("M", 0.88),
    };
    expect(shouldCallHtmlAi(extracted)).toBe(false);
    expect(shouldSkipHtmlAiAllStrong(extracted)).toBe(true);
  });
});
