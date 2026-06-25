import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ORDER_FULFILLMENT_ACTIONS_UNAVAILABLE_CODE,
  ORDER_FULFILLMENT_ACTIONS_UNAVAILABLE_MESSAGE,
  ORDER_FULFILLMENT_DISABLED_CONTROL_HINT,
  isOrderFulfillmentAvailable,
  resolveOrderFulfillmentAvailability,
} from "./order-fulfillment-policy";

function stubBridgeEnv() {
  vi.stubEnv("NEXT_PUBLIC_GLOVECUBS_API", "http://localhost:3004");
  vi.stubEnv("JWT_SECRET", "test-secret-for-bridge-only");
}

describe("order-fulfillment-policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes the stable containment code and operator-safe message", () => {
    expect(ORDER_FULFILLMENT_ACTIONS_UNAVAILABLE_CODE).toBe("ORDER_FULFILLMENT_ACTIONS_UNAVAILABLE");
    expect(ORDER_FULFILLMENT_ACTIONS_UNAVAILABLE_MESSAGE).toBe(
      "Order fulfillment actions are temporarily unavailable. No changes were made.",
    );
    expect(ORDER_FULFILLMENT_DISABLED_CONTROL_HINT).toBe("Unavailable — fulfillment API not connected.");
  });

  it("fails closed when nothing is configured", () => {
    vi.stubEnv("ORDER_FULFILLMENT_BRIDGE_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_GLOVECUBS_API", "");
    vi.stubEnv("JWT_SECRET", "");

    const a = resolveOrderFulfillmentAvailability();
    expect(a.available).toBe(false);
    expect(isOrderFulfillmentAvailable()).toBe(false);
    if (!a.available) {
      expect(a.code).toBe(ORDER_FULFILLMENT_ACTIONS_UNAVAILABLE_CODE);
      expect(a.reason).toBe(ORDER_FULFILLMENT_DISABLED_CONTROL_HINT);
    }
  });

  it("stays unavailable when bridge env is present but not intentionally enabled", () => {
    vi.stubEnv("ORDER_FULFILLMENT_BRIDGE_ENABLED", "");
    stubBridgeEnv();

    expect(isOrderFulfillmentAvailable()).toBe(false);
  });

  it("stays unavailable when intentionally enabled but bridge env is missing", () => {
    vi.stubEnv("ORDER_FULFILLMENT_BRIDGE_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_GLOVECUBS_API", "");
    vi.stubEnv("JWT_SECRET", "");

    expect(isOrderFulfillmentAvailable()).toBe(false);
  });

  it("is available only when intentionally enabled AND bridge env configured", () => {
    vi.stubEnv("ORDER_FULFILLMENT_BRIDGE_ENABLED", "1");
    stubBridgeEnv();

    expect(resolveOrderFulfillmentAvailability().available).toBe(true);
    expect(isOrderFulfillmentAvailable()).toBe(true);
  });

  it("never exposes env names or host internals in the operator-safe surface", () => {
    const serialized = JSON.stringify(resolveOrderFulfillmentAvailability());
    expect(serialized).not.toContain("JWT_SECRET");
    expect(serialized).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
    expect(serialized).not.toContain("ORDER_FULFILLMENT_BRIDGE_ENABLED");
    expect(serialized.toLowerCase()).not.toContain("glovecubs.com");
  });
});
