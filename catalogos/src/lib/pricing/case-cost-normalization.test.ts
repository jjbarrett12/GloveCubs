/**
 * Tests for case-cost normalization: box/each/pack/case conversion, validation, flags.
 */

import { describe, it, expect } from "vitest";
import { normalizeToCaseCost, SELL_UNIT } from "./case-cost-normalization";

describe("case-cost-normalization", () => {
  it("already-case pricing passes through", () => {
    const r = normalizeToCaseCost({
      raw: { cost: 100, case_price: 100 },
      supplier_cost: 100,
    });
    expect(r.supplier_price_basis).toBe("case");
    expect(r.normalized_case_cost).toBe(100);
    expect(r.sell_unit).toBe(SELL_UNIT);
    expect(r.pricing_confidence).toBeGreaterThan(0);
    expect(r.flags).toHaveLength(0);
  });

  it("box to case conversion", () => {
    const r = normalizeToCaseCost({
      raw: { price: 10, price_per: "box", boxes_per_case: 10 },
      supplier_cost: 10,
    });
    expect(r.supplier_price_basis).toBe("box");
    expect(r.boxes_per_case).toBe(10);
    expect(r.normalized_case_cost).toBe(100);
    expect(r.conversion_formula).toMatch(/\$10\.00\/box × 10/);
  });

  it("each to case conversion", () => {
    const r = normalizeToCaseCost({
      raw: { unit_cost: 0.12, price_per: "each", case_qty: 1000 },
      supplier_cost: 0.12,
      case_qty: 1000,
    });
    expect(r.supplier_price_basis).toBe("each");
    expect(r.normalized_case_cost).toBe(120);
    expect(r.conversion_formula).toMatch(/0\.12.*each.*1000/);
  });

  it("pack to case conversion", () => {
    const r = normalizeToCaseCost({
      raw: { cost: 25, price_per: "pack", packs_per_case: 4 },
      supplier_cost: 25,
    });
    expect(r.supplier_price_basis).toBe("pack");
    expect(r.packs_per_case).toBe(4);
    expect(r.normalized_case_cost).toBe(100);
  });

  it("missing conversion data adds error flag and null case cost", () => {
    const r = normalizeToCaseCost({
      raw: { price: 10, price_per: "box" },
      supplier_cost: 10,
    });
    expect(r.supplier_price_basis).toBe("box");
    expect(r.normalized_case_cost).toBeNull();
    expect(r.pricing_confidence).toBe(0);
    expect(r.flags.some((f) => f.code === "missing_case_conversion_data")).toBe(true);
  });

  it("invalid negative price adds invalid_supplier_price flag", () => {
    const r = normalizeToCaseCost({
      raw: { cost: -5 },
      supplier_cost: -5,
    });
    expect(r.flags.some((f) => f.code === "invalid_supplier_price")).toBe(true);
    expect(r.normalized_case_cost).toBeNull();
  });

  it("zero supplier cost is valid for case basis", () => {
    const r = normalizeToCaseCost({
      raw: { cost: 0, case_qty: 100 },
      supplier_cost: 0,
    });
    expect(r.normalized_case_cost).toBe(0);
    expect(r.flags.some((f) => f.code === "invalid_supplier_price")).toBe(false);
  });

  it("ambiguous price basis adds warning when basis assumed", () => {
    const r = normalizeToCaseCost({
      raw: { cost: 50 },
      supplier_cost: 50,
    });
    expect(r.supplier_price_basis).toBe("case");
    expect(r.normalized_case_cost).toBe(50);
    expect(r.flags.some((f) => f.code === "ambiguous_price_basis")).toBe(true);
  });

  it("pair to case conversion uses eaches_per_case / 2", () => {
    const r = normalizeToCaseCost({
      raw: { price: 2, price_per: "pair", eaches_per_case: 1000 },
      supplier_cost: 2,
      case_qty: 1000,
    });
    expect(r.supplier_price_basis).toBe("pair");
    expect(r.normalized_case_cost).toBe(1000);
    expect(r.conversion_formula).toMatch(/pair/);
  });

  it("inconsistent packaging quantities add warning flag", () => {
    const r = normalizeToCaseCost({
      raw: {
        cost: 10,
        price_per: "box",
        boxes_per_case: 10,
        eaches_per_box: 90,
        eaches_per_case: 1000,
      },
      supplier_cost: 10,
    });
    expect(r.normalized_case_cost).toBe(100);
    expect(r.flags.some((f) => f.code === "inconsistent_case_quantity")).toBe(true);
  });
});
