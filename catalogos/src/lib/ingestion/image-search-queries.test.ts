import { describe, it, expect } from "vitest";
import { buildRuleBasedImageSearchQueries } from "./image-search-queries";

describe("buildRuleBasedImageSearchQueries", () => {
  it("orders exact SKU and base SKU phrases for glove family", () => {
    const q = buildRuleBasedImageSearchQueries({
      supplier_sku: "N125M",
      base_sku: "N125",
      brand: "Acme",
      title: "Nitrile exam glove medium",
      categorySlug: "disposable_gloves",
      variant_axis: "size",
      variant_value: "m",
    });
    expect(q.length).toBeGreaterThan(0);
    expect(q[0].tier).toBe("exact_sku");
    expect(q[0].text.toLowerCase()).toContain("n125m");
    expect(q.some((x) => x.tier === "base_sku_family" && x.text.includes("N125"))).toBe(true);
    expect(q.some((x) => x.tier === "category_generic")).toBe(true);
  });

  it("dedupes identical phrases", () => {
    const q = buildRuleBasedImageSearchQueries({
      supplier_sku: "X",
      base_sku: null,
      brand: "",
      title: "",
      categorySlug: null,
      variant_axis: null,
      variant_value: null,
    });
    const texts = q.map((x) => x.text.toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
  });
});
