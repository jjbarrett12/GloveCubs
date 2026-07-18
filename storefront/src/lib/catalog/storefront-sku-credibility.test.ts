import { describe, expect, it } from "vitest";
import {
  isCustomerCredibleSku,
  isStorefrontCredibleProduct,
  storefrontCredibilityBlockReason,
} from "./storefront-sku-credibility";

describe("storefront-sku-credibility", () => {
  it("rejects launch and unknown SKUs", () => {
    expect(isCustomerCredibleSku("GLV-LAUNCH-JVOLXUM")).toBe(false);
    expect(isCustomerCredibleSku("UNKNOWN")).toBe(false);
    expect(isCustomerCredibleSku("N/A")).toBe(false);
    expect(isCustomerCredibleSku("")).toBe(false);
    expect(isCustomerCredibleSku("GLV-SZ-NIT-M")).toBe(true);
  });

  it("prefers variant SKU when present", () => {
    expect(
      isStorefrontCredibleProduct({
        internalSku: "GLV-LAUNCH-PARENT",
        variantSku: "GLV-SZ-NIT-M",
      })
    ).toBe(true);
    expect(
      isStorefrontCredibleProduct({
        internalSku: "GOOD-PARENT",
        variantSku: "UNKNOWN",
      })
    ).toBe(false);
    expect(storefrontCredibilityBlockReason({ variantSku: "GLV-LAUNCH-X" })).toBe("launch_sku");
  });
});
