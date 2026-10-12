import { describe, expect, it } from "vitest";
import { publicDtoContainsCost, publicSellPrice, toPublicOffersSummaryFromRows } from "./public-offers";

describe("public offers DTO", () => {
  it("omits supplier cost from serialized customer payload", () => {
    const summary = toPublicOffersSummaryFromRows("prod-1", [
      { supplier_id: "s1", supplier_sku: "SKU-1", sell_price: 24.5, lead_time_days: 5 },
      { supplier_id: "s2", supplier_sku: "SKU-2", sell_price: null, lead_time_days: null },
    ]);
    expect(summary.best_price).toBe(24.5);
    expect(summary.offers[0]).not.toHaveProperty("cost");
    expect(publicDtoContainsCost(summary)).toBe(false);
  });

  it("does not use cost as a public list price", () => {
    expect(publicSellPrice({ sell_price: 12 })).toBe(12);
    expect(publicSellPrice({ sell_price: null })).toBeNull();
  });
});
