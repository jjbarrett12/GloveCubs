import { describe, expect, it } from "vitest";
import {
  normalizeSkuCollisionQuery,
  skuCollisionSetsForReadiness,
} from "@/lib/admin/sku-collision-lookup";

describe("sku-collision-lookup", () => {
  it("dedupes variant SKU inputs", () => {
    const q = normalizeSkuCollisionQuery({
      variantSkus: ["GLV-A", "glv-a", "GLV-B", ""],
    });
    expect(q.variantSkus).toEqual(["GLV-A", "GLV-B"]);
  });

  it("builds readiness sets excluding current product and variants", () => {
    const sets = skuCollisionSetsForReadiness(
      {
        parent: { sku: "GLV-GL-N125", exists: true, productId: "prod-self" },
        variants: [
          { sku: "GLV-GL-N125M", exists: true, variantId: "var-self", productId: "prod-self" },
          { sku: "GLV-GL-N125L", exists: true, variantId: "var-other", productId: "prod-other" },
        ],
      },
      { productId: "prod-self", variantIds: ["var-self"] }
    );
    expect(sets.existingParentSkus.size).toBe(0);
    expect(sets.existingVariantSkus.has("GLV-GL-N125L")).toBe(true);
    expect(sets.existingVariantSkus.has("GLV-GL-N125M")).toBe(false);
  });

  it("returns empty parent when no query params", () => {
    const q = normalizeSkuCollisionQuery({});
    expect(q.parentSku).toBeNull();
    expect(q.variantSkus).toEqual([]);
  });
});
