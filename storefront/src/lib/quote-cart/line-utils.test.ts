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

  it("merges same product/variant/sell_unit", () => {
    const a = normalizeQuoteCartLineInput({ ...base, catalog_variant_id: null, sell_unit: "case" });
    const b = normalizeQuoteCartLineInput({ ...base, catalog_variant_id: null });
    expect(quoteCartCatalogMergeMatch(a, b)).toBe(true);
  });

  it("does not merge different sell_unit", () => {
    const caseLine = normalizeQuoteCartLineInput({ ...base, catalog_variant_id: null, sell_unit: "case" });
    const palletLine = normalizeQuoteCartLineInput({ ...base, catalog_variant_id: null, sell_unit: "pallet" });
    expect(quoteCartCatalogMergeMatch(caseLine, palletLine)).toBe(false);
  });

  it("defaults missing sell_unit to case for merge", () => {
    const legacy = normalizeQuoteCartLineInput({ ...base, catalog_variant_id: null });
    const explicitCase = normalizeQuoteCartLineInput({ ...base, catalog_variant_id: null, sell_unit: "case" });
    expect(quoteCartCatalogMergeMatch(legacy, explicitCase)).toBe(true);
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
