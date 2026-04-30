/**
 * Live catalog query: list products with filters, pagination, sort.
 * Uses product_attributes for faceted filtering; product_best_offer_price view for price (no full supplier_offers scan).
 */

import { getSupabaseCatalogos, getSupabase } from "@/lib/db/client";
import type { StorefrontFilterParams } from "./types";
import type { LiveProductItem, ProductListPayload } from "./types";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 24;
const SORT_OPTIONS = ["relevance", "price_asc", "price_desc", "newest", "price_per_glove_asc"] as const;
/** Max product IDs to consider for price filter/sort when not already constrained by other filters. */
const MAX_PRODUCT_IDS_FOR_PRICE = 10_000;
const MAX_VARIANT_ROWS_FOR_SIZE_FILTER = 50_000;
/** Bound categories/brands list queries. */
const MAX_CATEGORIES_OR_BRANDS = 500;

import { getAttributeDefinitionIdsByKeys } from "../publish/product-attribute-sync";
import { getAllFilterableFacetKeys, GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS } from "@/lib/product-types";
import { normalizeStorefrontFilterParams } from "./params";
import { getProductIdsMatchingSearch, sanitizeSearchTerm } from "./search";

/**
 * Product IDs that have attribute_definition_id in defIds and value_text in values.
 * Bounded: in() lists are limited by caller; product_attributes query is indexed.
 */
async function productIdsForFilter(
  attributeDefinitionIds: string[],
  values: string[],
  _multi: boolean
): Promise<Set<string>> {
  if (attributeDefinitionIds.length === 0 || values.length === 0) return new Set();
  const supabase = getSupabaseCatalogos(true);
  const { data } = await supabase
    .from("product_attributes")
    .select("product_id")
    .in("attribute_definition_id", attributeDefinitionIds)
    .in("value_text", values)
    .limit(MAX_PRODUCT_IDS_FOR_PRICE);
  return new Set((data ?? []).map((r: { product_id: string }) => r.product_id));
}

function coalesceSizeParam(raw: string[] | string | undefined): string[] {
  const arr = Array.isArray(raw) ? raw : raw != null && String(raw).trim() !== "" ? [String(raw)] : [];
  return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))];
}

/** Widen filter tokens so DB rows match regardless of size_code casing (e.g. S vs s). */
function expandSizeCodesForDbMatch(codes: string[]): string[] {
  const out = new Set<string>();
  for (const t of codes) {
    if (!t) continue;
    out.add(t);
    out.add(t.toLowerCase());
    out.add(t.toUpperCase());
  }
  return [...out];
}

/**
 * Parent catalog_product ids that have at least one active variant whose size_code matches any of the given values (OR).
 * Size is not read from product_attributes.
 */
export async function productIdsForActiveVariantSizes(sizeParams: string[] | string | undefined): Promise<Set<string>> {
  const trimmed = coalesceSizeParam(sizeParams);
  if (trimmed.length === 0) return new Set();
  const sizeCodes = expandSizeCodesForDbMatch(trimmed);
  const admin = getSupabase(true);
  const { data, error } = await admin
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

/** Best available offer price: sell_price when set, else cost (for storefront display and filtering). Exported for tests. */
export function offerPrice(row: { cost: number; sell_price?: number | null }): number {
  return row.sell_price != null && Number.isFinite(row.sell_price) ? row.sell_price : row.cost;
}

/** Intersect product ID sets; if first is null, return second. */
function intersectIds(a: Set<string> | null, b: Set<string>): Set<string> | null {
  if (a === null) return b;
  const out = new Set<string>();
  for (const id of b) if (a.has(id)) out.add(id);
  return out;
}

/** Product-attribute facet keys only (excludes variant-backed facets like `size`). */
function storefrontFacetFilterKeys(): readonly string[] {
  return getAllFilterableFacetKeys();
}

/**
 * Product IDs matching attribute facets only (no text search).
 * Exported for advanced use; prefer `getCatalogConstraintProductIds` for listings + facets.
 */
export async function getFilteredProductIds(params: StorefrontFilterParams): Promise<Set<string> | null> {
  const effectiveParams = normalizeStorefrontFilterParams(params);
  const filterKeys = storefrontFacetFilterKeys();
  const multiKeys = new Set(GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS);
  const keysWithValues: Array<{ key: (typeof filterKeys)[number]; values: string[] }> = [];
  for (const key of filterKeys) {
    const raw = effectiveParams[key as keyof StorefrontFilterParams];
    const values = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
    if (values.length > 0) keysWithValues.push({ key, values });
  }

  let productIds: Set<string> | null = null;
  if (keysWithValues.length > 0) {
    const defIdsByKey = await getAttributeDefinitionIdsByKeys(keysWithValues.map((k) => k.key));
    const results = await Promise.all(
      keysWithValues.map(({ key, values }) =>
        productIdsForFilter(defIdsByKey.get(key) ?? [], values, multiKeys.has(key))
      )
    );
    for (const ids of results) {
      productIds = intersectIds(productIds, ids);
      if (productIds && productIds.size === 0) return productIds;
    }
  }

  const sizeValues = coalesceSizeParam(effectiveParams.size);
  if (sizeValues.length > 0) {
    const variantProductIds = await productIdsForActiveVariantSizes(sizeValues);
    productIds = intersectIds(productIds, variantProductIds);
    if (productIds && productIds.size === 0) return productIds;
  }

  if (keysWithValues.length === 0 && sizeValues.length === 0) return null;
  return productIds;
}

/**
 * Intersection of facet filters + text search `q` (normalized catalog search).
 * Used for listings, facet counts, and price bounds so all surfaces stay consistent.
 */
export async function getCatalogConstraintProductIds(params: StorefrontFilterParams): Promise<Set<string> | null> {
  const normalized = normalizeStorefrontFilterParams(params);
  let ids = await getFilteredProductIds(normalized);
  const q = sanitizeSearchTerm(normalized.q);
  if (q) {
    const searchIds = await getProductIdsMatchingSearch(q, normalized.category);
    ids = intersectIds(ids, searchIds);
  }
  return ids;
}

function searchRelevanceScore(name: string, description: string | null, sku: string, q: string): number {
  const lower = q.toLowerCase();
  const n = name.toLowerCase();
  const d = (description ?? "").toLowerCase();
  const s = sku.toLowerCase();
  if (n === lower) return 100;
  if (n.startsWith(lower)) return 85;
  if (n.includes(lower)) return 70;
  if (s.includes(lower)) return 55;
  if (d.includes(lower)) return 40;
  return 10;
}

export async function listLiveProducts(params: StorefrontFilterParams): Promise<ProductListPayload> {
  const supabase = getSupabaseCatalogos(true);
  const admin = getSupabase(true);
  const page = Math.max(1, params.page ?? DEFAULT_PAGE);
  const limit = Math.min(50, Math.max(1, params.limit ?? DEFAULT_LIMIT));
  const rawSort = params.sort ?? "newest";
  const sort = SORT_OPTIONS.includes(rawSort) ? rawSort : "newest";
  const usePricePerGloveSort = sort === "price_per_glove_asc";
  const searchQ = sanitizeSearchTerm(params.q);
  const useRelevanceSort = sort === "relevance" && Boolean(searchQ);
  const effectiveSort =
    usePricePerGloveSort || useRelevanceSort || (sort === "relevance" && !searchQ) ? "newest" : sort;

  let query = admin
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, internal_sku, slug, name, description, brand_id, status, metadata, updated_at", { count: "exact" })
    .eq("status", "active");

  /* category filter omitted in v2 cutover — catalog_products has no category_id */

  let filteredIds = await getCatalogConstraintProductIds(params);
  if (params.price_min != null || params.price_max != null) {
    const priceMin = params.price_min ?? 0;
    const priceMax = params.price_max ?? Infinity;
    let priceQuery = supabase
      .from("product_best_offer_price")
      .select("product_id")
      .gte("best_price", priceMin)
      .lte("best_price", priceMax)
      .limit(MAX_PRODUCT_IDS_FOR_PRICE);
    const { data: priceRows } = await priceQuery;
    const inPriceRange = new Set((priceRows ?? []).map((r: { product_id: string }) => r.product_id));
    filteredIds = intersectIds(filteredIds, inPriceRange);
  }
  if (filteredIds !== null) {
    if (filteredIds.size === 0) {
      return { items: [], total: 0, page, limit, total_pages: 0 };
    }
    query = query.in("id", [...filteredIds]);
  }

  const from = (page - 1) * limit;

  if (effectiveSort === "price_asc" || effectiveSort === "price_desc") {
    let priceQuery = supabase
      .from("product_best_offer_price")
      .select("product_id, best_price, offer_count")
      .order("best_price", { ascending: effectiveSort === "price_asc" })
      .range(from, from + limit - 1);
    if (filteredIds !== null && filteredIds.size > 0) {
      const idList = [...filteredIds];
      if (idList.length > MAX_PRODUCT_IDS_FOR_PRICE) {
        const trimmed = idList.slice(0, MAX_PRODUCT_IDS_FOR_PRICE);
        priceQuery = priceQuery.in("product_id", trimmed);
      } else {
        priceQuery = priceQuery.in("product_id", idList);
      }
    }
    const { data: pricePage, error: priceErr } = await priceQuery;
    if (priceErr) throw new Error(priceErr.message);
    const priceRows = (pricePage ?? []) as { product_id: string; best_price: number; offer_count: number }[];
    if (priceRows.length === 0) {
      let total: number;
      if (filteredIds !== null && filteredIds.size > 0) {
        total = filteredIds.size;
      } else {
        const { count: totalCount } = await supabase
          .from("product_best_offer_price")
          .select("product_id", { count: "exact", head: true });
        total = totalCount ?? 0;
      }
      return { items: [], total, page, limit, total_pages: Math.ceil(total / limit) || 1 };
    }
    const pageIds = priceRows.map((r) => r.product_id);
    const bestPriceByProduct = new Map(priceRows.map((r) => [r.product_id, r.best_price]));
    const offerCountByProduct = new Map(priceRows.map((r) => [r.product_id, r.offer_count]));
    const { data: products, error: listErr } = await admin
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, internal_sku, slug, name, description, brand_id, status, metadata, updated_at")
      .eq("status", "active")
      .in("id", pageIds);
    if (listErr) throw new Error(listErr.message);
    const list = (products ?? []) as {
      id: string;
      internal_sku: string | null;
      slug: string | null;
      name: string;
      description: string | null;
      brand_id: string | null;
      metadata: Record<string, unknown> | null;
      updated_at: string | null;
    }[];
    const orderMap = new Map(pageIds.map((id, i) => [id, i]));
    list.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
    const total =
      filteredIds !== null && filteredIds.size > 0
        ? filteredIds.size
        : ((await supabase.from("product_best_offer_price").select("product_id", { count: "exact", head: true })).count ?? 0);
    const [categoriesRes, brandsRes] = await Promise.all([
      supabase.from("categories").select("id, slug").limit(MAX_CATEGORIES_OR_BRANDS),
      supabase.from("brands").select("id, name").limit(MAX_CATEGORIES_OR_BRANDS),
    ]);
    const categoryMap = new Map((categoriesRes.data ?? []).map((c: { id: string; slug: string }) => [c.id, c.slug]));
    const brandMap = new Map((brandsRes.data ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));
    const items: LiveProductItem[] = list.map((p) => ({
      id: p.id,
      sku: p.internal_sku ?? "",
      slug: p.slug,
      name: p.name,
      description: p.description,
      category_id: "",
      category_slug: undefined,
      brand_id: p.brand_id,
      brand_name: p.brand_id ? brandMap.get(p.brand_id) ?? null : null,
      attributes: (p.metadata?.facet_attributes as Record<string, unknown>) ?? p.metadata ?? {},
      best_price: bestPriceByProduct.get(p.id) ?? null,
      supplier_count: offerCountByProduct.get(p.id) ?? 0,
      published_at: p.updated_at,
    }));
    return {
      items,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit) || 1,
    };
  }

  if (effectiveSort === "newest") query = query.order("updated_at", { ascending: false, nullsFirst: false });
  query = query.range(from, from + limit - 1);

  const { data: products, error, count } = await query;
  if (error) throw new Error(error.message);

  const list = (products ?? []) as {
    id: string;
    internal_sku: string | null;
    slug: string | null;
    name: string;
    description: string | null;
    brand_id: string | null;
    metadata: Record<string, unknown> | null;
    updated_at: string | null;
  }[];
  if (useRelevanceSort && searchQ) {
    list.sort(
      (a, b) =>
        searchRelevanceScore(b.name, b.description, b.internal_sku ?? "", searchQ) -
        searchRelevanceScore(a.name, a.description, a.internal_sku ?? "", searchQ)
    );
  }
  const productIds = list.map((p) => p.id);

  const [priceRes, categoriesRes, brandsRes] = await Promise.all([
    productIds.length
      ? supabase.from("product_best_offer_price").select("product_id, best_price, offer_count").in("product_id", productIds)
      : { data: [] as { product_id: string; best_price: number; offer_count: number }[] },
    supabase.from("categories").select("id, slug").limit(MAX_CATEGORIES_OR_BRANDS),
    supabase.from("brands").select("id, name").limit(MAX_CATEGORIES_OR_BRANDS),
  ]);

  const bestPriceByProduct = new Map((priceRes.data ?? []).map((r: { product_id: string; best_price: number }) => [r.product_id, r.best_price]));
  const offerCountByProduct = new Map((priceRes.data ?? []).map((r: { product_id: string; offer_count: number }) => [r.product_id, r.offer_count]));
  const categoryMap = new Map((categoriesRes.data ?? []).map((c: { id: string; slug: string }) => [c.id, c.slug]));
  const brandMap = new Map((brandsRes.data ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));

  const items: LiveProductItem[] = list.map((p) => ({
    id: p.id,
    sku: p.internal_sku ?? "",
    slug: p.slug,
    name: p.name,
    description: p.description,
    category_id: "",
    category_slug: undefined,
    brand_id: p.brand_id,
    brand_name: p.brand_id ? brandMap.get(p.brand_id) ?? null : null,
    attributes: (p.metadata?.facet_attributes as Record<string, unknown>) ?? p.metadata ?? {},
    best_price: bestPriceByProduct.get(p.id) ?? null,
    supplier_count: offerCountByProduct.get(p.id) ?? 0,
    published_at: p.updated_at,
  }));

  const total = count ?? 0;
  return {
    items,
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit) || 1,
  };
}

export async function getProductBySlug(slug: string): Promise<LiveProductItem | null> {
  const detail = await getProductDetailBySlug(slug);
  return detail;
}

/** Offers summary for a product (storefront: use sell_price when set for best_price). */
export async function getOffersSummaryByProductId(productId: string): Promise<{
  offers: { supplier_id: string; supplier_sku: string; cost: number; sell_price?: number | null; lead_time_days: number | null }[];
  best_price: number;
  offer_count: number;
}> {
  const supabase = getSupabaseCatalogos(true);
  const { data: rows } = await supabase
    .from("supplier_offers")
    .select("supplier_id, supplier_sku, cost, sell_price, lead_time_days")
    .eq("product_id", productId)
    .eq("is_active", true);
  const offers = (rows ?? []).map((r: { supplier_id: string; supplier_sku: string; cost: number; sell_price?: number | null; lead_time_days: number | null }) => ({
    supplier_id: r.supplier_id,
    supplier_sku: r.supplier_sku,
    cost: r.cost,
    sell_price: r.sell_price,
    lead_time_days: r.lead_time_days,
  }));
  const prices = offers.map((o) => offerPrice(o));
  const best_price = prices.length ? Math.min(...prices) : 0;
  return { offers, best_price, offer_count: offers.length };
}

/** First image URL per product (for grid thumbnails). Returns product_id -> url. */
export async function getFirstImageByProductIds(productIds: string[]): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map();
  const admin = getSupabase(true);
  const { data: rows } = await admin
    .schema("catalog_v2")
    .from("catalog_product_images")
    .select("catalog_product_id, url, sort_order")
    .in("catalog_product_id", productIds)
    .order("sort_order", { ascending: true });
  const map = new Map<string, string>();
  for (const r of rows ?? []) {
    const row = r as { catalog_product_id: string; url: string };
    if (!map.has(row.catalog_product_id)) map.set(row.catalog_product_id, row.url);
  }
  return map;
}

/** Product detail by slug including images (catalog_v2 via catalogos.product_images view). */
export async function getProductDetailBySlug(slug: string): Promise<(LiveProductItem & { images: string[] }) | null> {
  const supabase = getSupabaseCatalogos(true);
  const admin = getSupabase(true);
  const { data: p, error } = await admin
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, internal_sku, slug, name, description, brand_id, metadata, updated_at")
    .eq("status", "active")
    .eq("slug", slug)
    .single();
  if (error || !p) return null;
  const product = p as {
    id: string;
    internal_sku: string | null;
    slug: string | null;
    name: string;
    description: string | null;
    brand_id: string | null;
    metadata: Record<string, unknown> | null;
    updated_at: string | null;
  };
  const [{ data: offers }, { data: brand }, { data: imgRows }, { data: priceRow }] = await Promise.all([
    supabase.from("supplier_offers").select("product_id, cost, sell_price").eq("product_id", product.id).eq("is_active", true),
    product.brand_id ? supabase.from("brands").select("id, name").eq("id", product.brand_id).single() : { data: null },
    admin
      .schema("catalog_v2")
      .from("catalog_product_images")
      .select("url, sort_order")
      .eq("catalog_product_id", product.id)
      .order("sort_order", { ascending: true }),
    supabase.from("product_best_offer_price").select("best_price, offer_count").eq("product_id", product.id).maybeSingle(),
  ]);
  const offerRows = (offers ?? []) as { cost: number; sell_price?: number | null }[];
  const prices = offerRows.map((o) => offerPrice(o));
  const fromView = priceRow as { best_price: number; offer_count: number } | null;
  const best_price =
    fromView != null && Number.isFinite(fromView.best_price)
      ? fromView.best_price
      : prices.length
        ? Math.min(...prices)
        : null;
  const supplier_count =
    fromView != null && typeof fromView.offer_count === "number" ? fromView.offer_count : offerRows.length;
  const images = (imgRows ?? [])
    .map((r: { url: string }) => r.url)
    .filter(Boolean);
  return {
    id: product.id,
    sku: product.internal_sku ?? "",
    slug: product.slug,
    name: product.name,
    description: product.description,
    category_id: "",
    category_slug: undefined,
    brand_id: product.brand_id,
    brand_name: brand ? (brand as { name: string }).name : null,
    attributes: (product.metadata?.facet_attributes as Record<string, unknown>) ?? product.metadata ?? {},
    best_price,
    supplier_count: (offers ?? []).length,
    published_at: product.updated_at,
    images,
  };
}
