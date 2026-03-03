import { describe, it, expect } from "vitest";
import { scoreGloves, topNWithAlternatives } from "./scoring";
import type { GloveProduct, GloveRiskProfile, RecommendAnswers } from "./types";

function mockProduct(overrides: Partial<GloveProduct> = {}): GloveProduct {
  return {
    id: "id-" + Math.random().toString(36).slice(2),
    sku: "SKU-" + (overrides.sku ?? "1"),
    name: overrides.name ?? "Test Glove",
    description: null,
    glove_type: overrides.glove_type ?? "disposable",
    material: overrides.material ?? "nitrile",
    thickness_mil: overrides.thickness_mil ?? 5,
    cut_level: overrides.cut_level ?? null,
    impact_rating: overrides.impact_rating ?? false,
    chemical_resistance: overrides.chemical_resistance ?? {},
    heat_resistance_c: null,
    cold_rating: overrides.cold_rating ?? null,
    grip: overrides.grip ?? null,
    lining: null,
    coating: null,
    waterproof: overrides.waterproof ?? false,
    food_safe: overrides.food_safe ?? false,
    medical_grade: overrides.medical_grade ?? false,
    chemo_rated: false,
    powder_free: true,
    sterile: false,
    cuff_length_mm: null,
    durability_score: overrides.durability_score ?? 50,
    dexterity_score: overrides.dexterity_score ?? 50,
    protection_score: overrides.protection_score ?? 50,
    price_cents: overrides.price_cents ?? 2000,
    image_url: null,
    active: true,
    ...overrides,
  };
}

function mockRisk(key: string, weights: Record<string, number> = {}): GloveRiskProfile {
  return {
    id: "risk-" + key,
    key,
    label: key,
    description: null,
    weights: { protection: 0.5, dexterity: 0.3, durability: 0.4, ...weights },
  };
}

describe("scoreGloves", () => {
  it("prefers disposable when answer is disposable", () => {
    const products: GloveProduct[] = [
      mockProduct({ sku: "D1", glove_type: "disposable" }),
      mockProduct({ sku: "R1", glove_type: "reusable" }),
    ];
    const risks = [{ risk: mockRisk("dexterity_high"), severity: 2 }];
    const answers: RecommendAnswers = {
      gloveTypePreference: "disposable",
      chemicalsLevel: "none",
      chemicalsType: [],
      cutAbrasionLevel: "none",
      biohazard: false,
      foodContact: false,
      coldEnvironment: false,
      dexterityImportance: "med",
      budgetSensitivity: "balanced",
      quantity: "single_box",
    };
    const scored = scoreGloves(products, risks, answers);
    expect(scored[0].product.glove_type).toBe("disposable");
    expect(scored[0].total).toBeGreaterThan(scored[1].total);
  });

  it("penalizes non-food-safe when foodContact is true", () => {
    const products: GloveProduct[] = [
      mockProduct({ sku: "F1", food_safe: true }),
      mockProduct({ sku: "N1", food_safe: false }),
    ];
    const answers: RecommendAnswers = {
      gloveTypePreference: "either",
      chemicalsLevel: "none",
      chemicalsType: [],
      cutAbrasionLevel: "none",
      biohazard: false,
      foodContact: true,
      coldEnvironment: false,
      dexterityImportance: "med",
      budgetSensitivity: "balanced",
      quantity: "single_box",
    };
    const scored = scoreGloves(products, [], answers);
    const foodSafe = scored.find((s) => s.product.food_safe);
    const notFoodSafe = scored.find((s) => !s.product.food_safe);
    expect(foodSafe).toBeDefined();
    expect(notFoodSafe).toBeDefined();
    expect(foodSafe!.total).toBeGreaterThan(notFoodSafe!.total);
  });

  it("returns sorted by total descending", () => {
    const products: GloveProduct[] = [
      mockProduct({ sku: "A", protection_score: 90 }),
      mockProduct({ sku: "B", protection_score: 50 }),
      mockProduct({ sku: "C", protection_score: 70 }),
    ];
    const scored = scoreGloves(products, [], {
      gloveTypePreference: "either",
      chemicalsLevel: "none",
      chemicalsType: [],
      cutAbrasionLevel: "none",
      biohazard: false,
      foodContact: false,
      coldEnvironment: false,
      dexterityImportance: "med",
      budgetSensitivity: "best_protection",
      quantity: "single_box",
    });
    expect(scored[0].total).toBeGreaterThanOrEqual(scored[1].total);
    expect(scored[1].total).toBeGreaterThanOrEqual(scored[2].total);
  });
});

describe("topNWithAlternatives", () => {
  it("returns top N and alternative buckets", () => {
    const products: GloveProduct[] = [
      mockProduct({ sku: "1", price_cents: 1000, durability_score: 40, protection_score: 60 }),
      mockProduct({ sku: "2", price_cents: 500, durability_score: 80, protection_score: 50 }),
      mockProduct({ sku: "3", price_cents: 3000, durability_score: 50, protection_score: 90 }),
      mockProduct({ sku: "4", price_cents: 800, durability_score: 70, protection_score: 70 }),
    ];
    const scored = products.map((p) => ({
      product: p,
      total: 50,
      breakdown: {} as Record<string, number>,
    }));
    const { top, cheaper, moreDurable, moreProtection } = topNWithAlternatives(scored, 2);
    expect(top.length).toBe(2);
    expect(cheaper.length).toBeLessThanOrEqual(3);
    expect(moreDurable.length).toBeLessThanOrEqual(3);
    expect(moreProtection.length).toBeLessThanOrEqual(3);
  });
});
