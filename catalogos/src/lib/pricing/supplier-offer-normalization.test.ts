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
  withResolvedCatalogVariantId,
  omitUnapprovedSellPriceFromOfferWrite,
  withOperatorApprovedSellPrice,
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

  it("unresolved upsert omits catalog_variant_id so an existing mapping is preserved", () => {
    const existing = { catalog_variant_id: "variant-A", supplier_sku: "GL-N125F-L" };
    const payload = withResolvedCatalogVariantId(
      { supplier_sku: "GL-N125F-L", cost: 10 },
      null
    );
    expect(payload).not.toHaveProperty("catalog_variant_id");
    expect({ ...existing, ...payload }.catalog_variant_id).toBe("variant-A");
  });

  it("resolved upsert writes catalog_variant_id (idempotent retry keeps same FK)", () => {
    const existing = { catalog_variant_id: "variant-A" };
    const first = withResolvedCatalogVariantId({ supplier_sku: "GL-N125F-L" }, "variant-A");
    const retry = withResolvedCatalogVariantId(first, "variant-A");
    expect(first.catalog_variant_id).toBe("variant-A");
    expect(retry.catalog_variant_id).toBe("variant-A");
    expect({ ...existing, ...retry }.catalog_variant_id).toBe("variant-A");
  });

  it("resolved upsert can update mapping to a new variant id", () => {
    const existing = { catalog_variant_id: "variant-A" };
    const payload = withResolvedCatalogVariantId({ supplier_sku: "GL-N125F-L" }, "variant-B");
    expect({ ...existing, ...payload }.catalog_variant_id).toBe("variant-B");
  });

  it("strips an accidental null catalog_variant_id key from a row", () => {
    const payload = withResolvedCatalogVariantId(
      { supplier_sku: "X", catalog_variant_id: null },
      null
    );
    expect(payload).not.toHaveProperty("catalog_variant_id");
  });
});

describe("published list omit / operator approve", () => {
  it("omits sell_price so re-ingest cannot clobber an approved list", () => {
    const existing = { sell_price: 199, sell_price_verified_at: "2026-09-11T00:00:00.000Z" };
    const payload = omitUnapprovedSellPriceFromOfferWrite({
      supplier_sku: "GL-N125F-L",
      cost: 85,
      sell_price: 85,
    });
    expect(payload).not.toHaveProperty("sell_price");
    expect(payload).not.toHaveProperty("sell_price_verified_at");
    expect(payload.cost).toBe(85);
    expect({ ...existing, ...payload }.sell_price).toBe(199);
  });

  it("operator approve writes sell_price and verified_at; clear writes null", () => {
    const approved = withOperatorApprovedSellPrice(
      { cost: 85 },
      { sellPrice: 120, verifiedBy: "op@glovecubs.com", verifiedAt: "2026-09-11T12:00:00.000Z" }
    );
    expect(approved.sell_price).toBe(120);
    expect(approved.sell_price_verified_at).toBe("2026-09-11T12:00:00.000Z");
    expect(approved.sell_price_verified_by).toBe("op@glovecubs.com");
    const cleared = withOperatorApprovedSellPrice({ cost: 85, sell_price: 120 }, { sellPrice: null, verifiedBy: "op" });
    expect(cleared.sell_price).toBeNull();
    expect(cleared.sell_price_verified_at).toBeNull();
  });
});
