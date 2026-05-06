/**
 * Facet counts — ported from `catalogos/src/lib/catalog/facets.ts`.
 */

import type { StorefrontFilterParams } from "./store-filter-types";
import type { StoreFacetCounts } from "./store-filter-types";
import { getAllCatalogFacetKeys } from "./catalog-facet-registry";
import { getAttributeDefinitionIdsByKey } from "./store-attribute-defs";
import { getStoreCatalogConstraintProductIds } from "./store-catalog-constraints";

const MAX_VARIANT_ROWS_FOR_SIZE_FACETS = 100_000;

async function aggregateSizeFacetCountsFromVariants(
  supabase: any,
  productIds: Set<string> | null
): Promise<{ value: string; count: number }[]> {
  if (productIds !== null && productIds.size === 0) return [];
  let q = supabase
    .schema("catalog_v2")
    .from("catalog_variants")
    .select("catalog_product_id, size_code")
    .eq("is_active", true)
    .not("size_code", "is", null)
    .limit(MAX_VARIANT_ROWS_FOR_SIZE_FACETS);
  if (productIds !== null && productIds.size > 0) {
    q = q.in("catalog_product_id", Array.from(productIds));
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const bySize = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const r = row as { catalog_product_id: string; size_code: string | null };
    const sc = (r.size_code ?? "").trim().toLowerCase();
    if (!sc) continue;
    const pid = r.catalog_product_id;
    if (!bySize.has(sc)) bySize.set(sc, new Set());
    bySize.get(sc)!.add(pid);
  }
  return Array.from(bySize.entries())
    .map(([value, set]) => ({ value, count: set.size }))
    .sort((a, b) => b.count - a.count);
}

export async function getStoreFacetCounts(
  supabase: any,
  params: StorefrontFilterParams
): Promise<StoreFacetCounts> {
  const productIds = await getStoreCatalogConstraintProductIds(supabase, params);
  const result: StoreFacetCounts = {};
  const FACET_KEYS = getAllCatalogFacetKeys();

  for (const key of FACET_KEYS) {
    if (key === "size") {
      result.size = await aggregateSizeFacetCountsFromVariants(supabase, productIds);
      continue;
    }

    const defIds = await getAttributeDefinitionIdsByKey(supabase, key);
    if (defIds.length === 0) continue;

    let query = supabase
      .schema("catalogos")
      .from("product_attributes")
      .select("value_text")
      .in("attribute_definition_id", defIds)
      .not("value_text", "is", null);
    if (productIds !== null && productIds.size > 0) {
      query = query.in("product_id", Array.from(productIds));
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
    result[key] = Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  }

  return result;
}
