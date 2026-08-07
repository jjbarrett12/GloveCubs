import { describe, expect, it } from "vitest";
import { isStorefrontStockEligible } from "@/lib/catalog/store-quote-rules";

describe("store-quote-rules dropship eligibility", () => {
  it("allows quote at zero stock for dropship", () => {
    expect(
      isStorefrontStockEligible({
        fulfillmentMode: "dropship",
        localAvailableStock: 0,
        stockEnforcement: false,
      }),
    ).toBe(true);
  });

  it("blocks stocked SKU at zero cases", () => {
    expect(
      isStorefrontStockEligible({
        fulfillmentMode: "stocked",
        localAvailableStock: 0,
        stockEnforcement: false,
      }),
    ).toBe(false);
  });
});
