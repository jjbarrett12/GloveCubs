import { describe, expect, it } from "vitest";
import {
  poLinesReadyForWarehouseReceive,
  resolvePoLineVariants,
} from "./po-line-variant-resolution";

describe("po-line-variant-resolution", () => {
  const multiSizeCandidates = [
    { catalog_variant_id: "v-s", variant_sku: "G-S", size_code: "S" },
    { catalog_variant_id: "v-m", variant_sku: "G-M", size_code: "M" },
  ];

  it("blocks multi-variant product without explicit assignment", () => {
    const resolved = resolvePoLineVariants(
      [{ canonical_product_id: "prod-1", quantity: 10 }],
      new Map([["prod-1", multiSizeCandidates]]),
    );
    expect(resolved[0]?.needs_sku_assignment).toBe(true);
    expect(resolved[0]?.catalog_variant_id).toBeNull();
    expect(poLinesReadyForWarehouseReceive(resolved)).toBe(false);
  });

  it("auto-maps single-variant product", () => {
    const resolved = resolvePoLineVariants(
      [{ canonical_product_id: "prod-2", quantity: 5 }],
      new Map([["prod-2", [{ catalog_variant_id: "only-one", variant_sku: "G-ONE", size_code: "M" }]]]),
    );
    expect(resolved[0]?.needs_sku_assignment).toBe(false);
    expect(resolved[0]?.catalog_variant_id).toBe("only-one");
    expect(poLinesReadyForWarehouseReceive(resolved)).toBe(true);
  });

  it("respects explicit catalog_variant_id on line", () => {
    const resolved = resolvePoLineVariants(
      [{ catalog_variant_id: "v-m", canonical_product_id: "prod-1", quantity: 3 }],
      new Map([["prod-1", multiSizeCandidates]]),
    );
    expect(resolved[0]?.needs_sku_assignment).toBe(false);
    expect(resolved[0]?.catalog_variant_id).toBe("v-m");
  });
});
