import { describe, expect, it } from "vitest";
import { GLOVE_BASIS_PER_100, normalizeGlovePriceBasis } from "@/lib/procurement/glove-uom-normalization";

describe("normalizeGlovePriceBasis", () => {
  it("normalizes to per-100 gloves deterministically", () => {
    const r = normalizeGlovePriceBasis({
      unitPrice: 12,
      unitsPerLineUom: 100,
      basis: GLOVE_BASIS_PER_100,
    });
    expect(r).toEqual({ ok: true, normalizedUnitPrice: 12, basis_uom: GLOVE_BASIS_PER_100 });
  });

  /** Price is per line qty=1; 200 comparable units in that UOM → per-100 = unitPrice/units*100 */
  it("normalizes box/case-style line (200 gloves per line unit) to per-100", () => {
    const r = normalizeGlovePriceBasis({
      unitPrice: 50,
      unitsPerLineUom: 200,
      basis: GLOVE_BASIS_PER_100,
    });
    expect(r).toEqual({ ok: true, normalizedUnitPrice: 25, basis_uom: GLOVE_BASIS_PER_100 });
  });

  /**
   * There is no implicit case↔each conversion: wrong `units_per_line_uom` yields wrong economics
   * but still finite. Governance must supply correct comparable units; zero/missing member UOM
   * is blocked upstream in savings-opportunity-service (missing_units_per_line_uom).
   */
  it("is deterministic and repeatable for the same inputs", () => {
    const input = { unitPrice: 18.75, unitsPerLineUom: 150, basis: GLOVE_BASIS_PER_100 };
    const a = normalizeGlovePriceBasis(input);
    const b = normalizeGlovePriceBasis(input);
    expect(a).toEqual(b);
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.normalizedUnitPrice).toBeCloseTo(12.5, 10);
  });

  it("blocks zero units_per_line_uom", () => {
    const r = normalizeGlovePriceBasis({
      unitPrice: 10,
      unitsPerLineUom: 0,
      basis: GLOVE_BASIS_PER_100,
    });
    expect(r).toEqual({ ok: false, reason: "invalid_units_per_line_uom" });
  });

  it("blocks non-positive unit price", () => {
    const r = normalizeGlovePriceBasis({
      unitPrice: 0,
      unitsPerLineUom: 50,
      basis: GLOVE_BASIS_PER_100,
    });
    expect(r).toEqual({ ok: false, reason: "invalid_unit_price" });
  });

  it("blocks NaN / non-finite inputs (pair vs each style mistakes surface as non-finite)", () => {
    expect(normalizeGlovePriceBasis({ unitPrice: NaN, unitsPerLineUom: 1, basis: GLOVE_BASIS_PER_100 })).toEqual({
      ok: false,
      reason: "non_finite_input",
    });
    expect(normalizeGlovePriceBasis({ unitPrice: 10, unitsPerLineUom: Number.NaN, basis: GLOVE_BASIS_PER_100 })).toEqual({
      ok: false,
      reason: "non_finite_input",
    });
  });

  it("blocks unsupported basis id", () => {
    const r = normalizeGlovePriceBasis({
      unitPrice: 10,
      unitsPerLineUom: 100,
      basis: "per_case" as unknown as typeof GLOVE_BASIS_PER_100,
    });
    expect(r).toEqual({ ok: false, reason: "unsupported_basis" });
  });
});
