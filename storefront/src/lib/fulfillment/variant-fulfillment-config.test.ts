import { describe, expect, it } from "vitest";
import {
  deriveInventoryTracking,
  fulfillmentConfigFromRow,
  isVariantPurchasableAtZeroLocalStock,
  shouldReserveWarehouseStock,
} from "./variant-fulfillment-config";

describe("variant-fulfillment-config launch", () => {
  it("defaults to dropship with inventory_tracking false", () => {
    const cfg = fulfillmentConfigFromRow({});
    expect(cfg.fulfillmentMode).toBe("dropship");
    expect(cfg.inventoryTracking).toBe(false);
  });

  it("maps legacy hybrid to dropship", () => {
    expect(fulfillmentConfigFromRow({ fulfillment_mode: "hybrid" }).fulfillmentMode).toBe("dropship");
  });

  it("stocked tracks inventory", () => {
    expect(deriveInventoryTracking("stocked")).toBe(true);
    expect(deriveInventoryTracking("dropship")).toBe(false);
  });

  it("dropship zero-stock eligibility unless stock_enforcement", () => {
    expect(isVariantPurchasableAtZeroLocalStock(fulfillmentConfigFromRow({ fulfillment_mode: "dropship" }))).toBe(true);
    expect(
      isVariantPurchasableAtZeroLocalStock(
        fulfillmentConfigFromRow({ fulfillment_mode: "dropship", stock_enforcement: true }),
      ),
    ).toBe(false);
  });

  it("only stocked variants reserve warehouse stock", () => {
    expect(shouldReserveWarehouseStock(fulfillmentConfigFromRow({ fulfillment_mode: "stocked" }))).toBe(true);
    expect(shouldReserveWarehouseStock(fulfillmentConfigFromRow({ fulfillment_mode: "dropship" }))).toBe(false);
  });
});
