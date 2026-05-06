/**
 * Catalog listing constraints — ported from `catalogos/src/lib/catalog/query.ts` + `search.ts`,
 * plus variant SKU search used by GloveCubs /store Phase 1 (catalog_v2 only).
 */

import type { StorefrontFilterParams } from "./store-filter-types";
import { getAllFilterableFacetKeys } from "./catalog-facet-registry";
import { getAttributeDefinitionIdsByKeys } from "./store-attribute-defs";
import { normalizeStorefrontFilterParams } from "./store-params";

const MAX_PRODUCT_IDS_FOR_PRICE = 10_000;
const MAX_VARIANT_ROWS_FOR_SIZE_FILTER = 50_000;
const MAX_IDS_PER_QUERY = 8000;
const MAX_TERM_LEN = 120;
const MAX_BRAND_MATCH = 80;

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

async function productIdsForFilter(
  supabase: any,
  attributeDefinitionIds: string[],
  values: string[]
): Promise<Set<string>> {
  if (attributeDefinitionIds.length === 0 || values.length === 0) return new Set();
  const { data } = await supabase
    .schema("catalogos")
    .from("product_attributes")
    .select("product_id")
    .in("attribute_definition_id", attributeDefinitionIds)
    .in("value_text", values)
    .limit(MAX_PRODUCT_IDS_FOR_PRICE);
  return new Set((data ?? []).map((r: { product_id: string }) => r.product_id));
}

function coalesceSizeParam(raw: string[] | string | undefined): string[] {
  const arr = Array.isArray(raw) ? raw : raw != null && String(raw).trim() !== "" ? [String(raw)] : [];
  return Array.from(new Set(arr.map((s) => String(s).trim()).filter(Boolean)));
}

function expandSizeCodesForDbMatch(codes: string[]): string[] {
  const out = new Set<string>();
  for (const t of codes) {
    if (!t) continue;
    out.add(t);
    out.add(t.toLowerCase());
    out.add(t.toUpperCase());
  }
  return Array.from(out);
}

export async function productIdsForActiveVariantSizes(
  supabase: any,
  sizeParams: string[] | string | undefined
): Promise<Set<string>> {
  const trimmed = coalesceSizeParam(sizeParams);
  if (trimmed.length === 0) return new Set();
  const sizeCodes = expandSizeCodesForDbMatch(trimmed);
  const { data, error } = await supabase
    .schema("catalog_v2")
    .from("catalog_variants")
    .select("catalog_product_id")
    .eq("is_active", true)
    .not("size_code", "is", null)
    .in("size_code", sizeCodes)
    .limit(MAX_VARIANT_ROWS_FOR_SIZE_FILTER);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r: { catalog_product_id: string }) => r.catalog_product_id));
}

function intersectIds(a: Set<string> | null, b: Set<string>): Set<string> | null {
  if (a === null) return b;
  const out = new Set<string>();
  for (const id of Array.from(b)) if (a.has(id)) out.add(id);
  return out;
}

function storefrontFacetFilterKeys(): readonly string[] {
  return getAllFilterableFacetKeys();
}

export async function getFilteredProductIds(
  supabase: any,
  params: StorefrontFilterParams
): Promise<Set<string> | null> {
  const effectiveParams = normalizeStorefrontFilterParams(params);
  const filterKeys = storefrontFacetFilterKeys();
  const keysWithValues: Array<{ key: (typeof filterKeys)[number]; values: string[] }> = [];
  for (const key of filterKeys) {
    const raw = effectiveParams[key as keyof StorefrontFilterParams];
    const values = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
    if (values.length > 0) keysWithValues.push({ key, values });
  }

  let productIds: Set<string> | null = null;
  if (keysWithValues.length > 0) {
    const defIdsByKey = await getAttributeDefinitionIdsByKeys(
      supabase,
      keysWithValues.map((k) => k.key)
    );
    const results = await Promise.all(
      keysWithValues.map(({ key, values }) =>
        productIdsForFilter(supabase, defIdsByKey.get(key) ?? [], values)
      )
    );
    for (const ids of results) {
      productIds = intersectIds(productIds, ids);
      if (productIds && productIds.size === 0) return productIds;
    }
  }

  const sizeValues = coalesceSizeParam(effectiveParams.size);
  if (sizeValues.length > 0) {
    const variantProductIds = await productIdsForActiveVariantSizes(supabase, sizeValues);
    productIds = intersectIds(productIds, variantProductIds);
    if (productIds && productIds.size === 0) return productIds;
  }

  if (keysWithValues.length === 0 && sizeValues.length === 0) return null;
  return productIds;
}

/**
 * Products whose `metadata.category_id` matches a row in `catalogos.categories` by slug.
 * Used for category-only /store URLs (no `q` required).
 */
export async function getProductIdsForCategorySlugOnly(supabase: any, categorySlug: string): Promise<Set<string>> {
  const slug = (categorySlug ?? "").trim().slice(0, 120);
  if (!slug) return new Set();
  const { data: cat } = await supabase
    .schema("catalogos")
    .from("categories")
    .select("id")
    .eq("slug", slug)
    .single();
  const categoryId = cat ? (cat as { id: string }).id : null;
  if (!categoryId) return new Set();

  const { data, error } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id")
    .eq("status", "active")
    .contains("metadata", { category_id: categoryId })
    .limit(MAX_IDS_PER_QUERY);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r: { id: string }) => r.id));
}

export async function getProductIdsMatchingSearch(
  supabase: any,
  term: string,
  categorySlug?: string
): Promise<Set<string>> {
  const q = sanitizeSearchTerm(term);
  if (!q) return new Set();

  let categoryId: string | null = null;
  if (categorySlug) {
    const { data: cat } = await supabase
      .schema("catalogos")
      .from("categories")
      .select("id")
      .eq("slug", categorySlug)
      .single();
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
    .schema("catalogos")
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

async function getProductIdsFromVariantSkuSearch(supabase: any, term: string): Promise<Set<string>> {
  const q = sanitizeSearchTerm(term);
  if (!q) return new Set();
  const ilikePat = `%${q.replace(/\\/g, "").replace(/%/g, "").replace(/_/g, "")}%` || "%";
  const { data } = await supabase
    .schema("catalog_v2")
    .from("catalog_variants")
    .select("catalog_product_id")
    .eq("is_active", true)
    .ilike("variant_sku", ilikePat)
    .limit(500);
  return new Set((data ?? []).map((r: { catalog_product_id: string }) => r.catalog_product_id));
}

/**
 * Intersection of facet filters + text search + variant SKU ILIKE (storefront extension).
 */
export async function getStoreCatalogConstraintProductIds(
  supabase: any,
  params: StorefrontFilterParams
): Promise<Set<string> | null> {
  const normalized = normalizeStorefrontFilterParams(params);
  let ids = await getFilteredProductIds(supabase, normalized);

  const categorySlug = normalized.category?.trim();
  if (categorySlug) {
    const categoryIds = await getProductIdsForCategorySlugOnly(supabase, categorySlug);
    ids = intersectIds(ids, categoryIds);
    if (ids && ids.size === 0) return ids;
  }

  const q = sanitizeSearchTerm(normalized.q);
  if (q) {
    const [searchIds, variantSkuIds] = await Promise.all([
      getProductIdsMatchingSearch(supabase, q, normalized.category),
      getProductIdsFromVariantSkuSearch(supabase, q),
    ]);
    const merged = new Set<string>([...Array.from(searchIds), ...Array.from(variantSkuIds)]);
    ids = intersectIds(ids, merged);
  }
  return ids;
}
