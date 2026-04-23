import { describe, it, expect } from "vitest";
import {
  applyImportPricingOverride,
  computeImportAutoPricing,
  effectiveImportPricing,
  estimateImportShipping,
  listPriceMarkupOnLandedPercent,
  minPriceForGrossMargin,
} from "./import-pricing";
import type { ImportPricingRuntimeConfig } from "./import-pricing-config";

const cfg: ImportPricingRuntimeConfig = {
  shipping: {
    nitrileExam: 0.7,
    vinylExam: 0.65,
    latexExam: 0.7,
    poly: 0.4,
    reusableLight: 0.5,
    reusableHeavy: 0.8,
    cutResistant: 0.75,
    chemical: 0.85,
    defaultRate: 0.65,
  },
  paymentFeeRate: 0.03,
  listPriceMultiplier: 1.15,
  tierDivisorA: 0.8,
  tierDivisorB: 0.75,
  tierDivisorC: 0.7,
  tierDivisorD: 0.65,
};

describe("estimateImportShipping", () => {
  it("nitrile disposable → nitrile exam rate", () => {
    expect(estimateImportShipping("disposable_gloves", { product_type: "nitrile" }, cfg)).toBe(0.7);
  });

  it("vinyl disposable → vinyl exam rate", () => {
    expect(estimateImportShipping("disposable_gloves", { product_type: "vinyl" }, cfg)).toBe(0.65);
  });

  it("latex disposable → latex exam rate", () => {
    expect(estimateImportShipping("disposable_gloves", { product_type: "latex" }, cfg)).toBe(0.7);
  });

  it("polyethylene → poly rate", () => {
    expect(estimateImportShipping("disposable_gloves", { material: "polyethylene" }, cfg)).toBe(0.4);
  });

  it("cut resistant → cut rate", () => {
    expect(estimateImportShipping("work_gloves", { product_type: "cut resistant" }, cfg)).toBe(0.75);
  });

  it("chemical → chemical rate", () => {
    expect(estimateImportShipping("work_gloves", { product_type: "chemical resistant" }, cfg)).toBe(0.85);
  });

  it("leather → reusable heavy", () => {
    expect(estimateImportShipping("work_gloves", { product_type: "leather palm" }, cfg)).toBe(0.8);
  });

  it("string knit work → reusable light", () => {
    expect(estimateImportShipping("work_gloves", { product_type: "string knit" }, cfg)).toBe(0.5);
  });

  it("unknown → default", () => {
    expect(estimateImportShipping("misc", {}, cfg)).toBe(0.65);
  });
});

describe("computeImportAutoPricing", () => {
  it("returns null for non-positive cost", () => {
    expect(computeImportAutoPricing({ supplierCost: 0, categorySlug: "x", filterAttributes: {}, config: cfg })).toBeNull();
  });

  it("fee is 3% of supplier_cost, list = tier_d × 1.15", () => {
    const snap = computeImportAutoPricing({
      supplierCost: 10,
      categorySlug: "disposable_gloves",
      filterAttributes: { product_type: "nitrile" },
      config: cfg,
    });
    expect(snap).not.toBeNull();
    if (!snap) return;
    expect(snap.shipping_estimate).toBe(0.7);
    expect(snap.payment_fee_estimate).toBeCloseTo(0.3, 5);
    expect(snap.landed_cost).toBe(11);
    const tierD = 11 / 0.65;
    expect(snap.tier_d_price).toBeCloseTo(tierD, 2);
    expect(snap.list_price).toBeCloseTo(tierD * 1.15, 2);
    expect(snap.display_tier).toBe("D");
  });

  it("tier divisors match spec", () => {
    const snap = computeImportAutoPricing({
      supplierCost: 1,
      categorySlug: "x",
      filterAttributes: {},
      config: { ...cfg, shipping: { ...cfg.shipping, defaultRate: 0 } },
    });
    expect(snap).not.toBeNull();
    if (!snap) return;
    expect(snap.landed_cost).toBeCloseTo(1.03, 5);
    const landed = snap.landed_cost;
    expect(snap.tier_a_price).toBeCloseTo(landed / 0.8, 2);
    expect(snap.tier_b_price).toBeCloseTo(landed / 0.75, 2);
    expect(snap.tier_c_price).toBeCloseTo(landed / 0.7, 2);
    expect(snap.tier_d_price).toBeCloseTo(landed / 0.65, 2);
  });
});

describe("manual override + margin floor", () => {
  it("clamps list below floor", () => {
    const base = computeImportAutoPricing({
      supplierCost: 10,
      categorySlug: "misc",
      filterAttributes: {},
      config: cfg,
    });
    expect(base).not.toBeNull();
    if (!base) return;
    const floor = minPriceForGrossMargin(base.landed_cost);
    const patched = applyImportPricingOverride(base, { list_price: 0.01 });
    expect(patched.pricing_manual_override?.list_price).toBe(floor);
    const eff = effectiveImportPricing(patched);
    expect(eff.list_price).toBe(floor);
  });

  it("clear removes override", () => {
    const base = computeImportAutoPricing({
      supplierCost: 10,
      categorySlug: "misc",
      filterAttributes: {},
      config: cfg,
    });
    expect(base).not.toBeNull();
    if (!base) return;
    const patched = applyImportPricingOverride(base, { list_price: 99 });
    const cleared = { ...patched, pricing_manual_override: null };
    const eff = effectiveImportPricing(cleared);
    expect(eff.list_price).toBe(base.list_price);
    expect(eff.is_overridden).toBe(false);
  });
});

describe("listPriceMarkupOnLandedPercent", () => {
  it("uses effective list", () => {
    const snap = computeImportAutoPricing({
      supplierCost: 20,
      categorySlug: "disposable_gloves",
      filterAttributes: { product_type: "nitrile" },
      config: cfg,
    });
    expect(snap).not.toBeNull();
    if (!snap) return;
    const p = listPriceMarkupOnLandedPercent(snap);
    expect(p).toBeGreaterThan(0);
  });
});
