/**
 * Apply pricing rules (category, supplier, product) with fallback markup.
 * Rounds sell price to sensible commercial format (2 decimals; .25/.49/.99 optional).
 */

import type { PricingResult } from "./types";
import { getSupabaseCatalogos } from "@/lib/db/client";

const DEFAULT_MARKUP_PERCENT = 35;
const MAX_MARKUP_PERCENT = 200;

export interface PricingInput {
  cost: number;
  categoryId: string;
  supplierId?: string;
  productId?: string;
}

export interface PricingRuleRow {
  id: string;
  rule_type: string;
  scope_category_id: string | null;
  scope_supplier_id: string | null;
  scope_product_id: string | null;
  margin_percent: number | null;
  fixed_price: number | null;
  priority: number;
}

/**
 * Load pricing rules once (priority desc). Use with applyPricingRules in hot loops to avoid N+1.
 */
export async function loadPricingRules(): Promise<PricingRuleRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("pricing_rules")
    .select("id, rule_type, scope_category_id, scope_supplier_id, scope_product_id, margin_percent, fixed_price, priority")
    .order("priority", { ascending: false });

  if (error) return [];
  return (data ?? []) as PricingRuleRow[];
}

/**
 * Apply preloaded rules (synchronous). Same precedence as computeSellPrice.
 */
export function applyPricingRules(input: PricingInput, rules: PricingRuleRow[]): PricingResult {
  for (const r of rules) {
    if (r.rule_type === "product_fixed" && r.scope_product_id === input.productId && r.fixed_price != null) {
      const sell = Number(r.fixed_price);
      return { sellPrice: roundCommercial(sell), cost: input.cost, marginPercent: 0, ruleApplied: "product_fixed" };
    }
    if (r.rule_type === "supplier_margin" && r.scope_supplier_id === input.supplierId && r.margin_percent != null) {
      const pct = Number(r.margin_percent);
      const sell = input.cost * (1 + pct / 100);
      return { sellPrice: roundCommercial(sell), cost: input.cost, marginPercent: pct, ruleApplied: "supplier_margin" };
    }
    if (r.rule_type === "category_margin" && r.scope_category_id === input.categoryId && r.margin_percent != null) {
      const pct = Number(r.margin_percent);
      const sell = input.cost * (1 + pct / 100);
      return { sellPrice: roundCommercial(sell), cost: input.cost, marginPercent: pct, ruleApplied: "category_margin" };
    }
    if (r.rule_type === "default_margin" && r.margin_percent != null) {
      const pct = Number(r.margin_percent);
      const sell = input.cost * (1 + pct / 100);
      return { sellPrice: roundCommercial(sell), cost: input.cost, marginPercent: pct, ruleApplied: "default_margin" };
    }
  }

  const sell = input.cost * (1 + DEFAULT_MARKUP_PERCENT / 100);
  return {
    sellPrice: roundCommercial(sell),
    cost: input.cost,
    marginPercent: DEFAULT_MARKUP_PERCENT,
    ruleApplied: "default_fallback",
  };
}

/**
 * Compute sell price from cost and pricing rules (loads rules each call). Prefer loadPricingRules + applyPricingRules in ingestion loops.
 */
export async function computeSellPrice(input: PricingInput): Promise<PricingResult> {
  const rules = await loadPricingRules();
  return applyPricingRules(input, rules);
}

/** Round to 2 decimals; optional .25/.49/.99 could be added later. */
function roundCommercial(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100) / 100;
}

/** Threshold above which we flag suspiciously high markup (for anomaly). */
export function isSuspiciouslyHighMarkup(marginPercent: number): boolean {
  return marginPercent > MAX_MARKUP_PERCENT;
}
