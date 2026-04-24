/**
 * Catalog text search over normalized product fields (name, description, SKU) and brand name.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

const MAX_TERM_LEN = 120;
const MAX_BRAND_MATCH = 80;
const MAX_IDS_PER_QUERY = 8000;

/** Strip characters that break PostgREST ilike filters or explode result sets. */
export function sanitizeSearchTerm(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw
    .trim()
    .slice(0, MAX_TERM_LEN)
    .replace(/%/g, "")
    .replace(/_/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Product IDs matching search term within optional category slug.
 */
export async function getProductIdsMatchingSearch(term: string, categorySlug?: string): Promise<Set<string>> {
  const q = sanitizeSearchTerm(term);
  if (!q) return new Set();

  const supabase = getSupabaseCatalogos(true);
  let categoryId: string | null = null;
  if (categorySlug) {
    const { data: cat } = await supabase.from("categories").select("id").eq("slug", categorySlug).single();
    categoryId = cat ? (cat as { id: string }).id : null;
    if (!categoryId) return new Set();
  }

  const pattern = `%${q}%`;
  const ids = new Set<string>();

  const baseProducts = () => {
    let pq = supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id")
      .eq("status", "active")
      .limit(MAX_IDS_PER_QUERY);
    if (categoryId) pq = pq.contains("metadata", { category_id: categoryId });
    return pq;
  };

  const merge = (rows: { id: string }[] | null | undefined) => {
    for (const r of rows ?? []) ids.add(r.id);
  };

  const [n1, n2, n3] = await Promise.all([
    baseProducts().ilike("name", pattern),
    baseProducts().ilike("internal_sku", pattern),
    baseProducts().not("description", "is", null).ilike("description", pattern),
  ]);
  merge(n1.data as { id: string }[]);
  merge(n2.data as { id: string }[]);
  merge(n3.data as { id: string }[]);

  const { data: brandRows } = await supabase
    .from("brands")
    .select("id")
    .ilike("name", pattern)
    .limit(MAX_BRAND_MATCH);
  const brandIds = (brandRows ?? []).map((b: { id: string }) => b.id).filter(Boolean);
  if (brandIds.length > 0) {
    let bq = supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id")
      .eq("status", "active")
      .in("brand_id", brandIds)
      .limit(MAX_IDS_PER_QUERY);
    if (categoryId) bq = bq.contains("metadata", { category_id: categoryId });
    const { data: byBrand } = await bq;
    merge(byBrand as { id: string }[]);
  }

  return ids;
}
