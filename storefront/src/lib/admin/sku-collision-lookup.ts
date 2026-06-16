export type SkuCollisionParentResult = {
  sku: string;
  exists: boolean;
  productId?: string;
};

export type SkuCollisionVariantResult = {
  sku: string;
  exists: boolean;
  variantId?: string;
  productId?: string;
};

export type SkuCollisionLookupResult = {
  parent: SkuCollisionParentResult | null;
  variants: SkuCollisionVariantResult[];
};

export type SkuCollisionQuery = {
  parentSku?: string | null;
  variantSkus?: string[];
  excludeProductId?: string | null;
  excludeVariantIds?: string[];
};

/** Normalize query inputs for collision lookup. */
export function normalizeSkuCollisionQuery(query: SkuCollisionQuery): {
  parentSku: string | null;
  variantSkus: string[];
  excludeProductId: string | null;
  excludeVariantIds: Set<string>;
} {
  const parentSku = query.parentSku?.trim().toUpperCase() || null;
  const seen = new Set<string>();
  const variantSkus: string[] = [];
  for (const raw of query.variantSkus ?? []) {
    const sku = raw.trim().toUpperCase();
    if (!sku || seen.has(sku)) continue;
    seen.add(sku);
    variantSkus.push(sku);
  }
  const excludeVariantIds = new Set(
    (query.excludeVariantIds ?? []).map((id) => id.trim()).filter(Boolean)
  );
  return {
    parentSku,
    variantSkus,
    excludeProductId: query.excludeProductId?.trim() || null,
    excludeVariantIds,
  };
}

/** Build readiness collision sets, excluding the product/variants being edited. */
export function skuCollisionSetsForReadiness(
  result: SkuCollisionLookupResult,
  options?: { productId?: string | null; variantIds?: string[] }
): { existingParentSkus: Set<string>; existingVariantSkus: Set<string> } {
  const productId = options?.productId?.trim() || null;
  const variantIds = new Set((options?.variantIds ?? []).map((id) => id.trim()).filter(Boolean));

  const existingParentSkus = new Set<string>();
  if (
    result.parent?.exists &&
    result.parent.sku &&
    result.parent.productId !== productId
  ) {
    existingParentSkus.add(result.parent.sku);
  }

  const existingVariantSkus = new Set<string>();
  for (const row of result.variants) {
    if (!row.exists || !row.sku) continue;
    if (row.variantId && variantIds.has(row.variantId)) continue;
    existingVariantSkus.add(row.sku);
  }

  return { existingParentSkus, existingVariantSkus };
}

export function emptySkuCollisionResult(): SkuCollisionLookupResult {
  return { parent: null, variants: [] };
}

/** Server-side SKU collision lookup against catalog_v2. */
export async function lookupSkuCollisions(
  query: ReturnType<typeof normalizeSkuCollisionQuery>
): Promise<SkuCollisionLookupResult> {
  const { getSupabaseAdmin } = await import("@/lib/supabase/server");

  if (!query.parentSku && query.variantSkus.length === 0) {
    return emptySkuCollisionResult();
  }

  const supabase = getSupabaseAdmin() as any;
  const result: SkuCollisionLookupResult = { parent: null, variants: [] };

  if (query.parentSku) {
    let parentQuery = supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, internal_sku")
      .eq("internal_sku", query.parentSku)
      .limit(1);
    if (query.excludeProductId) {
      parentQuery = parentQuery.neq("id", query.excludeProductId);
    }
    const { data: parentRow } = await parentQuery.maybeSingle();
    result.parent = {
      sku: query.parentSku,
      exists: Boolean(parentRow),
      productId: (parentRow as { id?: string } | null)?.id,
    };
  }

  for (const sku of query.variantSkus) {
    const { data: variantRow } = await supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("id, variant_sku, catalog_product_id")
      .eq("variant_sku", sku)
      .maybeSingle();

    const row = variantRow as { id?: string; catalog_product_id?: string } | null;
    const excluded = row?.id && query.excludeVariantIds.has(row.id);
    result.variants.push({
      sku,
      exists: Boolean(row) && !excluded,
      variantId: row?.id,
      productId: row?.catalog_product_id,
    });
  }

  return result;
}
