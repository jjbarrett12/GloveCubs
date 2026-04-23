/**
 * Facet aggregation: counts per filter value for the current result set.
 * Supports dynamic counts based on current filters.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { getAttributeDefinitionIdsByKey } from "@/lib/publish/product-attribute-sync";
import type { StorefrontFilterParams } from "./types";
import type { FacetCounts } from "./types";

import { getCatalogConstraintProductIds } from "./query";
import { getAllFilterableFacetKeys } from "@/lib/product-types";

const FACET_KEYS = getAllFilterableFacetKeys();

/**
 * Return facet counts for the current filter state.
 * Counts are for the result set (products matching params), not global.
 */
export async function getFacetCounts(params: StorefrontFilterParams): Promise<FacetCounts> {
  const supabase = getSupabaseCatalogos(true);
  const productIds = await getCatalogConstraintProductIds(params);
  const result: FacetCounts = {};

  for (const key of FACET_KEYS) {
    const defIds = await getAttributeDefinitionIdsByKey(key);
    if (defIds.length === 0) continue;

    let query = supabase
      .from("product_attributes")
      .select("value_text")
      .in("attribute_definition_id", defIds)
      .not("value_text", "is", null);
    if (productIds !== null && productIds.size > 0) {
      query = query.in("product_id", [...productIds]);
    }

    const { data: rows } = await query;
    const counts = new Map<string, number>();
    for (const r of rows ?? []) {
      const row = r as { value_text: string };
      const val = row.value_text?.trim();
      if (!val) continue;
      if (key === "thickness_mil" && val === "7_plus") continue;
      counts.set(val, (counts.get(val) ?? 0) + 1);
    }
    result[key] = [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
  }

  return result;
}

const MAX_PRICE_BOUNDS_ROWS = 12_000;

/** Min/max best price from `product_best_offer_price` (same semantics as list/grid pricing). */
export async function getPriceBounds(params: StorefrontFilterParams): Promise<{ min: number; max: number }> {
  const supabase = getSupabaseCatalogos(true);
  const productIds = await getCatalogConstraintProductIds(params);
  let query = supabase.from("product_best_offer_price").select("best_price").limit(MAX_PRICE_BOUNDS_ROWS);
  if (productIds !== null && productIds.size > 0) {
    query = query.in("product_id", [...productIds]);
  }
  const { data: rows } = await query;
  const prices = (rows ?? [])
    .map((r: { best_price: number }) => r.best_price)
    .filter((p: number) => Number.isFinite(p) && p > 0);
  if (prices.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
