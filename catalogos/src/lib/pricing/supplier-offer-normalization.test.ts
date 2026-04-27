import { describe, it, expect } from "vitest";
import {
  assertSupplierOfferCurrencyUsdOnly,
  derivePerCaseUnitNormalization,
  ALLOWED_SUPPLIER_OFFER_CURRENCY,
  SUPPLIER_OFFER_COST_BASES,
  normalizeSupplierOfferPricing,
  buildSupplierOfferUpsertRow,
  parseSupplierOfferCostBasis,
  assertSupplierOfferWritePayloadHasNormalization,
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

  it("normalizeSupplierOfferPricing: per_case with units → medium confidence", () => {
    const p = normalizeSupplierOfferPricing({
      currency_code: ALLOWED_SUPPLIER_OFFER_CURRENCY,
      cost_basis: "per_case",
      cost: 100,
      units_per_case: 50,
    });
    expect(p.normalization_confidence).toBe("medium");
    expect(p.pack_qty).toBe(50);
    expect(p.normalized_unit_cost_minor).toBe(200);
  });

  it("normalizeSupplierOfferPricing: per_case missing units → low confidence", () => {
    const p = normalizeSupplierOfferPricing({
      currency_code: ALLOWED_SUPPLIER_OFFER_CURRENCY,
      cost_basis: "per_case",
      cost: 100,
      units_per_case: null,
    });
    expect(p.normalization_confidence).toBe("low");
    expect(p.normalized_unit_cost_minor).toBeNull();
  });

  it("normalizeSupplierOfferPricing: rejects non-USD currency", () => {
    expect(() =>
      normalizeSupplierOfferPricing({
        currency_code: "EUR",
        cost_basis: "per_each",
        cost: 1,
      })
    ).toThrow(/USD/);
  });

  it("buildSupplierOfferUpsertRow: writer payload includes all normalization keys", () => {
    const row = buildSupplierOfferUpsertRow(
      { supplier_id: "a", product_id: "b", supplier_sku: "s", cost: 10, sell_price: 10, is_active: true },
      { currency_code: "USD", cost_basis: "per_each", cost: 10 }
    );
    expect(() => assertSupplierOfferWritePayloadHasNormalization(row)).not.toThrow();
  });

  it("parseSupplierOfferCostBasis: rejects empty and invalid", () => {
    expect(() => parseSupplierOfferCostBasis("")).toThrow();
    expect(() => parseSupplierOfferCostBasis("per_kg")).toThrow();
    expect(parseSupplierOfferCostBasis("per_case")).toBe("per_case");
  });
});
