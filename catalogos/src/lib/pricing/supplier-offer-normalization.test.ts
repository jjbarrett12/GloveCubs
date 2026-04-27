import { describe, it, expect } from "vitest";
import {
  assertSupplierOfferCurrencyUsdOnly,
  derivePerCaseUnitNormalization,
  ALLOWED_SUPPLIER_OFFER_CURRENCY,
  SUPPLIER_OFFER_COST_BASES,
} from "./supplier-offer-normalization";

describe("supplier-offer-normalization", () => {
  it("per_case: derives normalized_unit_cost_minor from cost and units_per_case", () => {
    const r = derivePerCaseUnitNormalization({ cost: 50, units_per_case: 100 });
    expect(r.pack_qty).toBe(100);
    expect(r.normalized_unit_cost_minor).toBe(50);
    expect(r.normalized_unit_uom).toBe("each");
    expect(r.normalization_confidence).toBe("medium");
    expect(r.normalization_notes.some((n) => n.code === "assumed_cost_per_case")).toBe(true);
  });

  it("per_case: missing units_per_case → low confidence, null normalized fields", () => {
    const r = derivePerCaseUnitNormalization({ cost: 50, units_per_case: null });
    expect(r.pack_qty).toBeNull();
    expect(r.normalized_unit_cost_minor).toBeNull();
    expect(r.normalized_unit_uom).toBeNull();
    expect(r.normalization_confidence).toBe("low");
    expect(r.normalization_notes.some((n) => n.code === "missing_units_per_case")).toBe(true);
  });

  it("per_case: zero units_per_case → low confidence", () => {
    const r = derivePerCaseUnitNormalization({ cost: 50, units_per_case: 0 });
    expect(r.normalization_confidence).toBe("low");
    expect(r.normalized_unit_cost_minor).toBeNull();
  });

  it("USD-only enforcement for future writes", () => {
    expect(() => assertSupplierOfferCurrencyUsdOnly("USD")).not.toThrow();
    expect(() => assertSupplierOfferCurrencyUsdOnly("EUR")).toThrow(/USD/);
  });

  it("contract: only offer scalars in — no catalog metadata parameter", () => {
    const input = { cost: 12.34, units_per_case: 10 };
    expect(Object.keys(input).sort()).toEqual(["cost", "units_per_case"]);
    expect(derivePerCaseUnitNormalization(input).normalized_unit_cost_minor).toBe(123);
    expect(SUPPLIER_OFFER_COST_BASES).toEqual(["per_case", "per_each", "per_pair"]);
  });
});
