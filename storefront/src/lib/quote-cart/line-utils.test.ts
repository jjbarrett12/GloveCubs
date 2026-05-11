import { describe, expect, it } from "vitest";
import {
  normalizeQuoteCartLineInput,
  quoteCartCatalogMergeMatch,
  quoteCartLinesMatch,
} from "@/lib/quote-cart/line-utils";

const base = {
  product_id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Glove",
  slug: "glove-a",
  brandName: "Brand" as string | null,
};

describe("quoteCartCatalogMergeMatch", () => {
  it("matches on product + variant only (ignores line_note)", () => {
    const a = normalizeQuoteCartLineInput({ ...base, catalog_variant_id: null, line_note: "note a" });
    const b = normalizeQuoteCartLineInput({ ...base, catalog_variant_id: null, line_note: null });
    expect(quoteCartCatalogMergeMatch(a, b)).toBe(true);
  });

  it("distinguishes variants", () => {
    const v1 = normalizeQuoteCartLineInput({
      ...base,
      catalog_variant_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      line_note: null,
    });
    const v2 = normalizeQuoteCartLineInput({
      ...base,
      catalog_variant_id: "7ba7b810-9dad-11d1-80b4-00c04fd430c8",
      line_note: null,
    });
    expect(quoteCartCatalogMergeMatch(v1, v2)).toBe(false);
  });
});

describe("quoteCartLinesMatch", () => {
  it("requires matching line_note when both set", () => {
    const a = normalizeQuoteCartLineInput({ ...base, catalog_variant_id: null, line_note: "foo" });
    const b = normalizeQuoteCartLineInput({ ...base, catalog_variant_id: null, line_note: "bar" });
    expect(quoteCartLinesMatch(a, b)).toBe(false);
    const same = normalizeQuoteCartLineInput({ ...base, catalog_variant_id: null, line_note: "foo" });
    expect(quoteCartLinesMatch(a, same)).toBe(true);
  });
});

describe("normalizeQuoteCartLineInput", () => {
  it("trims and caps line_note", () => {
    const long = "x".repeat(3000);
    const n = normalizeQuoteCartLineInput({ ...base, catalog_variant_id: null, line_note: long });
    expect(n.line_note?.length).toBe(2000);
  });

  it("coerces blank line_note to null", () => {
    const n = normalizeQuoteCartLineInput({ ...base, catalog_variant_id: null, line_note: "   " });
    expect(n.line_note).toBeNull();
  });
});
