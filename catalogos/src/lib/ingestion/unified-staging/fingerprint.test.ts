import { describe, it, expect } from "vitest";
import {
  computeProductFingerprint,
  computeSourceFingerprint,
  normalizeSourceUrl,
} from "../../../../../lib/unified-ingestion/fingerprint";

describe("normalizeSourceUrl", () => {
  it("strips fragment and www, normalizes trailing slash", () => {
    expect(normalizeSourceUrl("https://WWW.Example.com/path/#x")).toBe("https://example.com/path");
    expect(normalizeSourceUrl("https://example.com/path/")).toBe("https://example.com/path");
  });
});

describe("computeSourceFingerprint", () => {
  it("is stable for equivalent URLs", () => {
    const a = computeSourceFingerprint({
      mode: "quick_draft",
      sourceUrl: "https://www.vendor.com/glove/1/",
      supplierId: null,
    });
    const b = computeSourceFingerprint({
      mode: "quick_draft",
      sourceUrl: "https://vendor.com/glove/1",
      supplierId: null,
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("differs when mode or supplier changes", () => {
    const base = computeSourceFingerprint({
      mode: "quick_draft",
      sourceUrl: "https://vendor.com/p",
      supplierId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
    const deep = computeSourceFingerprint({
      mode: "deep_supplier_crawl",
      sourceUrl: "https://vendor.com/p",
      supplierId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
    expect(base).not.toBe(deep);
  });

  it("includes identity keys when present", () => {
    const noId = computeSourceFingerprint({
      mode: "quick_draft",
      sourceUrl: "https://vendor.com/p",
    });
    const withGtin = computeSourceFingerprint({
      mode: "quick_draft",
      sourceUrl: "https://vendor.com/p",
      identityKeys: { gtin: "000123" },
    });
    expect(noId).not.toBe(withGtin);
  });
});

describe("computeProductFingerprint", () => {
  it("varies by variant key under same source", () => {
    const source = computeSourceFingerprint({
      mode: "deep_supplier_crawl",
      sourceUrl: "https://vendor.com/cat",
      supplierId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    });
    const v1 = computeProductFingerprint({ sourceFingerprint: source, variantKey: "SKU-A" });
    const v2 = computeProductFingerprint({ sourceFingerprint: source, variantKey: "SKU-B" });
    expect(v1).not.toBe(v2);
  });
});
