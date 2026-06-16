import { describe, expect, it } from "vitest";
import {
  resolveCaseUnitPricing,
  resolveEffectiveCasePriceFromPackaging,
  resolvePalletUnitPricing,
} from "./pricing";

describe("commerce-packaging pricing", () => {
  it("uses sale price when lower than product price", () => {
    const pricing = resolveCaseUnitPricing({ case_price: 39.99, compare_at_case_price: 49.99 });
    expect(pricing.onSale).toBe(true);
    expect(pricing.listPrice).toBe(49.99);
    expect(pricing.effectivePrice).toBe(39.99);
  });

  it("uses product price alone when sale price is missing", () => {
    const pricing = resolveCaseUnitPricing({ case_price: null, compare_at_case_price: 49.99 });
    expect(pricing.onSale).toBe(false);
    expect(pricing.effectivePrice).toBe(49.99);
  });

  it("keeps legacy case_price-only products working", () => {
    const pricing = resolveCaseUnitPricing({ case_price: 42, compare_at_case_price: null });
    expect(pricing.onSale).toBe(false);
    expect(resolveEffectiveCasePriceFromPackaging({ case_price: 42, compare_at_case_price: null })).toBe(42);
  });

  it("resolves pallet sale pricing", () => {
    const pricing = resolvePalletUnitPricing({
      pallet_price: 2800,
      compare_at_pallet_price: 2950,
    });
    expect(pricing.onSale).toBe(true);
    expect(pricing.effectivePrice).toBe(2800);
  });
});
