import { describe, it, expect } from "vitest";
import { normalizeSearchQuery, parseSearchTokens } from "./search-query";

describe("search-query (product-line aware)", () => {
  it("applies glove pluralization only for ppe_gloves line", () => {
    expect(normalizeSearchQuery("nitrile gloves", "ppe_gloves")).toContain("glove");
    expect(normalizeSearchQuery("nitrile gloves", "ppe_eye")).toContain("gloves");
  });

  it("classifies materials from glove line facets", () => {
    const r = parseSearchTokens("nitrile exam glove", "ppe_gloves");
    expect(r.materials).toContain("nitrile");
    expect(r.types.some((t) => t.includes("exam"))).toBe(true);
  });

  it("uses eye-protection facets for ppe_eye", () => {
    const r = parseSearchTokens("polycarbonate z87 safety", "ppe_eye");
    expect(r.materials.some((m) => m.includes("polycarbonate"))).toBe(true);
    expect(r.types.some((t) => t.includes("z87"))).toBe(true);
  });

  it("defaults to ppe_gloves when line omitted", () => {
    const r = parseSearchTokens("large vinyl", null);
    expect(r.materials).toContain("vinyl");
    expect(r.sizes).toContain("large");
  });
});
