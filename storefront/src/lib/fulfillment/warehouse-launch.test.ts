import { describe, expect, it } from "vitest";
import { isVariantPurchasableAtZeroLocalStock, fulfillmentConfigFromRow } from "@/lib/fulfillment/variant-fulfillment-config";
import { defaultStorefrontHidesQuantity, resolveStorefrontInventoryDisplay } from "@/lib/fulfillment/storefront-inventory-display";
import { poLinesReadyForWarehouseReceive, resolvePoLineVariants } from "@/lib/fulfillment/po-line-variant-resolution";

describe("warehouse launch corrections", () => {
  it("multi-variant PO line cannot receive without explicit variant", () => {
    const resolved = resolvePoLineVariants(
      [{ canonical_product_id: "p1", quantity: 10 }],
      new Map([
        [
          "p1",
          [
            { catalog_variant_id: "a", variant_sku: "A-S", size_code: "S" },
            { catalog_variant_id: "b", variant_sku: "A-M", size_code: "M" },
          ],
        ],
      ]),
    );
    expect(poLinesReadyForWarehouseReceive(resolved)).toBe(false);
  });

  it("dropship SKU quotable at zero inventory", () => {
    expect(isVariantPurchasableAtZeroLocalStock(fulfillmentConfigFromRow({ fulfillment_mode: "dropship" }))).toBe(true);
  });

  it("storefront quantity hidden by default", () => {
    expect(defaultStorefrontHidesQuantity()).toBe(true);
    expect(resolveStorefrontInventoryDisplay({}, 100).showQuantity).toBe(false);
  });
});
