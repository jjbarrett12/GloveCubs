import type { GloveProduct, GloveRiskProfile, RecommendAnswers } from "./types";

export interface RiskWithSeverity {
  risk: GloveRiskProfile;
  severity: number;
}

export interface ScoredProduct {
  product: GloveProduct;
  total: number;
  breakdown: Record<string, number>;
}

const CUT_LEVEL_ORDER = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"];

function cutLevelRank(level: string | null): number {
  if (!level) return 0;
  const i = CUT_LEVEL_ORDER.indexOf(level.toUpperCase());
  return i >= 0 ? i + 1 : 0;
}

function chemValue(str: string | undefined): number {
  if (!str) return 0;
  switch (str.toLowerCase()) {
    case "high":
      return 3;
    case "med":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

export function scoreGloves(
  products: GloveProduct[],
  riskProfiles: RiskWithSeverity[],
  answers: RecommendAnswers
): ScoredProduct[] {
  const results: ScoredProduct[] = [];

  for (const product of products) {
    const breakdown: Record<string, number> = {};
    let total = 0;

    // Glove type preference
    if (answers.gloveTypePreference !== "either") {
      const match =
        (answers.gloveTypePreference === "disposable" && product.glove_type === "disposable") ||
        (answers.gloveTypePreference === "reusable" && product.glove_type === "reusable");
      const typeScore = match ? 15 : -10;
      breakdown["glove_type"] = typeScore;
      total += typeScore;
    }

    // Chemical / disinfectant
    const chemRisk = riskProfiles.find(
      (r) =>
        r.risk.key.includes("chemicals_disinfectants") || r.risk.key.includes("chemicals")
    );
    if (chemRisk && (answers.chemicalsLevel !== "none" || chemRisk.severity >= 2)) {
      const chem = (product.chemical_resistance as Record<string, string>) ?? {};
      const disinfect = chemValue(chem.disinfectants) + chemValue(chem.acids) + chemValue(chem.bases);
      const need = answers.chemicalsLevel === "high" ? 3 : answers.chemicalsLevel === "med" ? 2 : 1;
      const chemScore = disinfect >= need ? 12 * chemRisk.severity : disinfect > 0 ? 4 : -8;
      breakdown["chemical_resistance"] = chemScore;
      total += chemScore;
    }

    // Food contact
    if (answers.foodContact && !product.food_safe) {
      breakdown["food_safe"] = -20;
      total -= 20;
    } else if (answers.foodContact && product.food_safe) {
      breakdown["food_safe"] = 15;
      total += 15;
    }

    // Medical / biohazard
    if (answers.biohazard && !product.medical_grade) {
      breakdown["medical_grade"] = -15;
      total -= 15;
    } else if (answers.biohazard && product.medical_grade) {
      breakdown["medical_grade"] = 12;
      total += 12;
    }

    // Cut/abrasion
    const cutRisk = riskProfiles.find(
      (r) => r.risk.key.startsWith("cuts_abrasion")
    );
    if (cutRisk && answers.cutAbrasionLevel !== "none") {
      const needRank =
        answers.cutAbrasionLevel === "high" ? 5 : answers.cutAbrasionLevel === "med" ? 3 : 1;
      const productRank = cutLevelRank(product.cut_level);
      const cutScore =
        productRank >= needRank ? 10 * cutRisk.severity : productRank > 0 ? 3 : -5;
      breakdown["cut_protection"] = cutScore;
      total += cutScore;
    }

    // Dexterity
    const dexRisk = riskProfiles.find((r) => r.risk.key === "dexterity_high");
    if (dexRisk && answers.dexterityImportance === "high") {
      const dexScore = Math.round((product.dexterity_score / 100) * 12 * dexRisk.severity);
      breakdown["dexterity"] = dexScore;
      total += dexScore;
    } else if (answers.dexterityImportance === "high") {
      const dexScore = Math.round((product.dexterity_score / 100) * 8);
      breakdown["dexterity"] = dexScore;
      total += dexScore;
    }

    // Durability (from risk weights or "daily heavy use" implied by quantity)
    if (answers.quantity === "ongoing_reorder" || answers.quantity === "cases") {
      const durScore = Math.round((product.durability_score / 100) * 6);
      breakdown["durability"] = durScore;
      total += durScore;
    }

    // Grip (wet/oily from oils_grease risk)
    const oilsRisk = riskProfiles.find((r) => r.risk.key.includes("oils_grease"));
    if (oilsRisk && product.grip) {
      const gripScore = ["oily", "wet", "dry"].includes(product.grip.toLowerCase()) ? 6 * oilsRisk.severity : 2;
      breakdown["grip"] = gripScore;
      total += gripScore;
    }

    // Cold
    if (answers.coldEnvironment) {
      if (product.cold_rating) {
        breakdown["cold"] = 8;
        total += 8;
      } else {
        breakdown["cold"] = -5;
        total -= 5;
      }
    }

    // Budget
    if (answers.budgetSensitivity === "lowest_price") {
      const priceNorm = Math.max(0, 100 - product.price_cents / 100);
      breakdown["budget"] = Math.round(priceNorm * 0.1);
      total += breakdown["budget"];
    } else if (answers.budgetSensitivity === "best_protection") {
      const protScore = Math.round((product.protection_score / 100) * 10);
      breakdown["protection"] = protScore;
      total += protScore;
    }

    // Base scores from product
    const base = (product.protection_score + product.dexterity_score + product.durability_score) / 3;
    breakdown["base_fit"] = Math.round(base * 0.2);
    total += breakdown["base_fit"];

    results.push({ product, total: Math.round(total), breakdown });
  }

  // Deterministic sort: by total desc, then by sku asc for stable ordering when scores tie
  results.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return (a.product.sku ?? "").localeCompare(b.product.sku ?? "");
  });
  return results;
}

export function topNWithAlternatives(
  scored: ScoredProduct[],
  topN: number = 9
): {
  top: ScoredProduct[];
  cheaper: GloveProduct[];
  moreDurable: GloveProduct[];
  moreProtection: GloveProduct[];
} {
  const top = scored.slice(0, topN);
  const rest = scored.slice(topN);
  const avgPrice = top.length ? top.reduce((s, t) => s + t.product.price_cents, 0) / top.length : 0;
  const avgDurability = top.length ? top.reduce((s, t) => s + t.product.durability_score, 0) / top.length : 0;
  const avgProtection = top.length ? top.reduce((s, t) => s + t.product.protection_score, 0) / top.length : 0;

  const cheaper = rest
    .filter((s) => s.product.price_cents < avgPrice)
    .sort((a, b) =>
      a.product.price_cents !== b.product.price_cents
        ? a.product.price_cents - b.product.price_cents
        : (a.product.sku ?? "").localeCompare(b.product.sku ?? "")
    )
    .slice(0, 3)
    .map((s) => s.product);

  const moreDurable = rest
    .filter((s) => s.product.durability_score > avgDurability)
    .sort((a, b) =>
      b.product.durability_score !== a.product.durability_score
        ? b.product.durability_score - a.product.durability_score
        : (a.product.sku ?? "").localeCompare(b.product.sku ?? "")
    )
    .slice(0, 3)
    .map((s) => s.product);

  const moreProtection = rest
    .filter((s) => s.product.protection_score > avgProtection)
    .sort((a, b) =>
      b.product.protection_score !== a.product.protection_score
        ? b.product.protection_score - a.product.protection_score
        : (a.product.sku ?? "").localeCompare(b.product.sku ?? "")
    )
    .slice(0, 3)
    .map((s) => s.product);

  return { top, cheaper, moreDurable, moreProtection };
}
