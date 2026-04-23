import { describe, it, expect } from "vitest";
import { resolveOrderItemCatalogProductId } from "./resolve-catalog-product-id";

describe("resolveOrderItemCatalogProductId", () => {
  const map = new Map<number, string>([[99, "00000000-0000-0000-0000-000000000099"]]);

  it("prefers canonical_product_id", () => {
    expect(
      resolveOrderItemCatalogProductId(
        { canonical_product_id: "11111111-1111-1111-1111-111111111111", product_id: 99 },
        map
      )
    ).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("falls back to live map", () => {
    expect(resolveOrderItemCatalogProductId({ product_id: 99 }, map)).toBe("00000000-0000-0000-0000-000000000099");
  });

  it("returns null when unmapped", () => {
    expect(resolveOrderItemCatalogProductId({ product_id: 1 }, map)).toBeNull();
  });
});
