import { describe, expect, it } from "vitest";
import { sumComputableLineTotals, totalsNeedReview } from "./extractValidation";

describe("totalsNeedReview", () => {
  it("flags missing total_amount", () => {
    expect(
      totalsNeedReview(null, [{ quantity: 2, unit_price: 5, total: 10 }])
    ).toBe(true);
  });

  it("passes when total matches line totals", () => {
    expect(
      totalsNeedReview(25, [
        { quantity: 2, unit_price: 5, total: 10 },
        { quantity: 3, unit_price: 5, total: 15 },
      ])
    ).toBe(false);
  });

  it("flags large mismatch", () => {
    expect(
      totalsNeedReview(100, [{ quantity: 1, unit_price: 5, total: 5 }])
    ).toBe(true);
  });
});

describe("sumComputableLineTotals", () => {
  it("sums from line totals", () => {
    expect(
      sumComputableLineTotals([
        { quantity: 1, unit_price: null, total: 7 },
        { quantity: 2, unit_price: 3, total: 6 },
      ])
    ).toBe(13);
  });

  it("returns null when a line lacks computable amount", () => {
    expect(
      sumComputableLineTotals([{ quantity: 2, unit_price: null, total: null }])
    ).toBe(null);
  });
});
