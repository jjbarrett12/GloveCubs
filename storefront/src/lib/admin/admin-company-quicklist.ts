/**
 * Admin customer glove quicklist — gc_commerce.company_quicklist_items only.
 * No prices, no procurement_reorder_memory, no saved_lists / product_favorites.
 */

export type CompanyQuicklistItemRow = {
  id: string;
  catalog_product_id: string;
  catalog_variant_id: string;
  product_name: string;
  slug: string;
  brand_name: string | null;
  variant_sku: string;
  size_code: string | null;
  product_status: string;
  variant_is_active: boolean;
  sort_order: number;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

export type QuicklistCatalogSearchRow = {
  catalog_product_id: string;
  catalog_variant_id: string;
  product_name: string;
  slug: string;
  brand_name: string | null;
  variant_sku: string;
  size_code: string | null;
};

const SEARCH_LIMIT = 40;

function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function fetchCompanyQuicklistItems(
  supabase: any,
  companyId: string
): Promise<{ rows: CompanyQuicklistItemRow[]; error: string | null }> {
  const { data: items, error: iErr } = await supabase
    .schema("gc_commerce")
    .from("company_quicklist_items")
    .select("id, catalog_product_id, catalog_variant_id, sort_order, admin_note, created_at, updated_at")
    .eq("company_id", companyId)
    .is("valid_to", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (iErr) {
    return { rows: [], error: iErr.message };
  }

  const list = (items ?? []) as Array<{
    id: string;
    catalog_product_id: string;
    catalog_variant_id: string;
    sort_order: number;
    admin_note: string | null;
    created_at: string;
    updated_at: string;
  }>;

  if (list.length === 0) {
    return { rows: [], error: null };
  }

  const productIds = Array.from(new Set(list.map((r) => r.catalog_product_id)));
  const variantIds = Array.from(new Set(list.map((r) => r.catalog_variant_id)));

  const [{ data: products }, { data: variants }] = await Promise.all([
    supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, name, slug, status, brand_id")
      .in("id", productIds),
    supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("id, catalog_product_id, variant_sku, size_code, is_active")
      .in("id", variantIds),
  ]);

  const productById = new Map(
    ((products ?? []) as { id: string; name: string; slug: string; status: string; brand_id: string | null }[]).map(
      (p) => [p.id, p]
    )
  );
  const variantById = new Map(
    (
      (variants ?? []) as {
        id: string;
        catalog_product_id: string;
        variant_sku: string;
        size_code: string | null;
        is_active: boolean;
      }[]
    ).map((v) => [v.id, v])
  );

  const brandIds = Array.from(
    new Set(
      ((products ?? []) as { brand_id: string | null }[])
        .map((p) => p.brand_id)
        .filter((x): x is string => Boolean(x))
    )
  );
  const brandMap = new Map<string, string>();
  if (brandIds.length > 0) {
    const { data: brands } = await supabase.schema("catalogos").from("brands").select("id, name").in("id", brandIds);
    for (const b of (brands ?? []) as { id: string; name: string }[]) {
      brandMap.set(b.id, b.name);
    }
  }

  const rows: CompanyQuicklistItemRow[] = list.map((it) => {
    const p = productById.get(it.catalog_product_id);
    const v = variantById.get(it.catalog_variant_id);
    const product_name = p?.name?.trim() ? p.name : "Unknown product";
    const slug = p?.slug ?? "";
    const product_status = p?.status ?? "unknown";
    const variant_is_active = v?.is_active ?? false;
    const variant_sku = v?.variant_sku ?? "—";
    const size_code = v?.size_code ?? null;
    const brand_name = p?.brand_id ? brandMap.get(p.brand_id) ?? null : null;

    return {
      id: it.id,
      catalog_product_id: it.catalog_product_id,
      catalog_variant_id: it.catalog_variant_id,
      product_name,
      slug,
      brand_name,
      variant_sku,
      size_code,
      product_status,
      variant_is_active,
      sort_order: it.sort_order,
      admin_note: it.admin_note,
      created_at: it.created_at,
      updated_at: it.updated_at,
    };
  });

  return { rows, error: null };
}

export async function fetchCompanyQuicklistActiveCount(
  supabase: any,
  companyId: string
): Promise<number> {
  const { count, error } = await supabase
    .schema("gc_commerce")
    .from("company_quicklist_items")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("valid_to", null);
  if (error) return 0;
  return count ?? 0;
}

/**
 * Active catalog variants only (explicit variant rows). Broad active catalog — not procurement memory.
 * Returns variant-level rows only (no product-only picks).
 */
export async function searchQuicklistCatalogVariants(
  supabase: any,
  q: string,
  limit = SEARCH_LIMIT
): Promise<{ rows: QuicklistCatalogSearchRow[]; error: string | null }> {
  const raw = q.trim();
  if (!raw) {
    return { rows: [], error: null };
  }

  const pat = `%${escapeIlike(raw)}%`;

  const [np1, np2, np3] = await Promise.all([
    supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, name, slug, brand_id")
      .eq("status", "active")
      .ilike("name", pat)
      .limit(40),
    supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, name, slug, brand_id")
      .eq("status", "active")
      .ilike("slug", pat)
      .limit(40),
    supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, name, slug, brand_id")
      .eq("status", "active")
      .ilike("internal_sku", pat)
      .limit(40),
  ]);

  const pErr = np1.error || np2.error || np3.error;
  if (pErr) {
    return { rows: [], error: pErr.message };
  }

  const productMeta = new Map<
    string,
    { id: string; name: string; slug: string; brand_id: string | null }
  >();
  for (const arr of [np1.data, np2.data, np3.data]) {
    for (const r of (arr ?? []) as { id: string; name: string; slug: string; brand_id: string | null }[]) {
      productMeta.set(r.id, r);
    }
  }

  const nameProductIds = Array.from(productMeta.keys());

  const [vSku, vSize] = await Promise.all([
    supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("id, catalog_product_id, variant_sku, size_code")
      .eq("is_active", true)
      .ilike("variant_sku", pat)
      .limit(60),
    supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("id, catalog_product_id, variant_sku, size_code")
      .eq("is_active", true)
      .ilike("size_code", pat)
      .limit(60),
  ]);

  if (vSku.error || vSize.error) {
    return { rows: [], error: (vSku.error || vSize.error)!.message };
  }

  const variantById = new Map<
    string,
    { id: string; catalog_product_id: string; variant_sku: string; size_code: string | null }
  >();
  for (const arr of [vSku.data, vSize.data]) {
    for (const v of (arr ?? []) as {
      id: string;
      catalog_product_id: string;
      variant_sku: string;
      size_code: string | null;
    }[]) {
      variantById.set(v.id, v);
    }
  }

  const skuVariantProductIds = Array.from(new Set(Array.from(variantById.values()).map((v) => v.catalog_product_id)));
  const extraProductIds = skuVariantProductIds.filter((id) => !productMeta.has(id));
  if (extraProductIds.length > 0) {
    const { data: extraProds, error: exErr } = await supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, name, slug, brand_id")
      .eq("status", "active")
      .in("id", extraProductIds.slice(0, 120));
    if (exErr) {
      return { rows: [], error: exErr.message };
    }
    for (const r of (extraProds ?? []) as { id: string; name: string; slug: string; brand_id: string | null }[]) {
      productMeta.set(r.id, r);
    }
  }

  const variantCandidates: {
    id: string;
    catalog_product_id: string;
    variant_sku: string;
    size_code: string | null;
  }[] = [];

  if (nameProductIds.length > 0) {
    const { data: vForProducts, error: vfErr } = await supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("id, catalog_product_id, variant_sku, size_code")
      .eq("is_active", true)
      .in("catalog_product_id", nameProductIds.slice(0, 120))
      .limit(300);
    if (vfErr) {
      return { rows: [], error: vfErr.message };
    }
    for (const v of (vForProducts ?? []) as {
      id: string;
      catalog_product_id: string;
      variant_sku: string;
      size_code: string | null;
    }[]) {
      variantCandidates.push(v);
    }
  }

  for (const v of Array.from(variantById.values())) {
    if (productMeta.has(v.catalog_product_id)) {
      variantCandidates.push(v);
    }
  }

  const dedup = new Map<string, (typeof variantCandidates)[0]>();
  for (const v of variantCandidates) {
    dedup.set(v.id, v);
  }

  const merged = Array.from(dedup.values()).slice(0, limit);

  const brandIds = Array.from(
    new Set(merged.map((v) => productMeta.get(v.catalog_product_id)?.brand_id).filter(Boolean) as string[])
  );
  const brandMap = new Map<string, string>();
  if (brandIds.length > 0) {
    const { data: brands } = await supabase.schema("catalogos").from("brands").select("id, name").in("id", brandIds);
    for (const b of (brands ?? []) as { id: string; name: string }[]) {
      brandMap.set(b.id, b.name);
    }
  }

  const rows: QuicklistCatalogSearchRow[] = merged.map((v) => {
    const p = productMeta.get(v.catalog_product_id)!;
    return {
      catalog_product_id: v.catalog_product_id,
      catalog_variant_id: v.id,
      product_name: p.name,
      slug: p.slug,
      brand_name: p.brand_id ? brandMap.get(p.brand_id) ?? null : null,
      variant_sku: v.variant_sku,
      size_code: v.size_code,
    };
  });

  return { rows, error: null };
}
