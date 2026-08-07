import { describe, expect, it } from "vitest";
import {
  defaultStorefrontHidesQuantity,
  resolveStorefrontInventoryDisplay,
} from "./storefront-inventory-display";

describe("storefront-inventory-display", () => {
  it("hides quantity by default", () => {
    const display = resolveStorefrontInventoryDisplay({}, 100);
    expect(display.showQuantity).toBe(false);
    expect(defaultStorefrontHidesQuantity()).toBe(true);
  });

  it("shows quantity only when visibility is quantity and stock exists", () => {
    const display = resolveStorefrontInventoryDisplay(
      { fulfillment_mode: "stocked", inventory_visibility: "quantity" },
      50,
    );
    expect(display.showQuantity).toBe(true);
  });

  it("never shows quantity at zero even when visibility is quantity", () => {
    const display = resolveStorefrontInventoryDisplay(
      { fulfillment_mode: "stocked", inventory_visibility: "quantity" },
      0,
    );
    expect(display.showQuantity).toBe(false);
  });

  it("dropship at zero remains purchasable", () => {
    const display = resolveStorefrontInventoryDisplay({ fulfillment_mode: "dropship" }, 0);
    expect(display.purchasableAtZeroStock).toBe(true);
  });
});
