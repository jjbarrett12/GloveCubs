/**
 * Tests for live catalog query: offerPrice (sell price vs cost), filtering contract, P0 bounded behavior.
 */

import { describe, it, expect } from "vitest";
import { offerPrice, getFilteredProductIds } from "./query";

describe("catalog query", () => {
  describe("offerPrice", () => {
    it("uses sell_price when set and finite", () => {
      expect(offerPrice({ cost: 10, sell_price: 14.99 })).toBe(14.99);
      expect(offerPrice({ cost: 10, sell_price: 0 })).toBe(0);
    });
    it("falls back to cost when sell_price is null or undefined", () => {
      expect(offerPrice({ cost: 10 })).toBe(10);
      expect(offerPrice({ cost: 10, sell_price: null })).toBe(10);
      expect(offerPrice({ cost: 10, sell_price: undefined })).toBe(10);
    });
    it("falls back to cost when sell_price is not finite", () => {
      expect(offerPrice({ cost: 10, sell_price: NaN })).toBe(10);
      expect(offerPrice({ cost: 10, sell_price: Infinity })).toBe(10);
    });
  });

  describe("P0 catalog price/bounds", () => {
    it("getFilteredProductIds with no filters returns null (avoids unnecessary query)", async () => {
      const result = await getFilteredProductIds({});
      expect(result).toBeNull();
    });
  });
});
