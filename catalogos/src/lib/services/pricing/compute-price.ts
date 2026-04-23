import type { PricingRule } from "@/types/catalogos";

export interface PriceInput {
  cost: number;
  category: string;
  supplier_id?: number;
  master_product_id?: number;
}

export interface PriceResult {
  sell_price: number;
  margin_percent: number;
  rule_applied: string;
}

const DEFAULT_MARGIN_PERCENT = 35;

/**
 * Compute sell price from cost and pricing rules.
 * Priority: product_fixed > supplier_margin > category_margin > default_margin.
 */
export function computeSellPrice(
  input: PriceInput,
  rules: PricingRule[]
): PriceResult {
  const sorted = [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const r of sorted) {
    if (r.rule_type === "product_fixed" && r.scope_master_product_id === input.master_product_id && r.fixed_price != null) {
      return { sell_price: Number(r.fixed_price), margin_percent: 0, rule_applied: "product_fixed" };
    }
    if (r.rule_type === "supplier_margin" && r.scope_supplier_id === input.supplier_id && r.margin_percent != null) {
      const sell = input.cost * (1 + Number(r.margin_percent) / 100);
      return { sell_price: Math.round(sell * 100) / 100, margin_percent: Number(r.margin_percent), rule_applied: "supplier_margin" };
    }
    if (r.rule_type === "category_margin" && r.scope_category === input.category && r.margin_percent != null) {
      const sell = input.cost * (1 + Number(r.margin_percent) / 100);
      return { sell_price: Math.round(sell * 100) / 100, margin_percent: Number(r.margin_percent), rule_applied: "category_margin" };
    }
    if (r.rule_type === "default_margin" && r.margin_percent != null) {
      const sell = input.cost * (1 + Number(r.margin_percent) / 100);
      return { sell_price: Math.round(sell * 100) / 100, margin_percent: Number(r.margin_percent), rule_applied: "default_margin" };
    }
  }

  const sell = input.cost * (1 + DEFAULT_MARGIN_PERCENT / 100);
  return {
    sell_price: Math.round(sell * 100) / 100,
    margin_percent: DEFAULT_MARGIN_PERCENT,
    rule_applied: "default_fallback",
  };
}
