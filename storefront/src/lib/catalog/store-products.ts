import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import type { StoreCatalogUrlState } from "@/lib/catalog/store-url";
import { storeCatalogPageLimit } from "@/lib/catalog/store-url";
import { normalizeStorefrontFilterParams } from "@/lib/catalog/store-params";
import {
  getStoreCatalogConstraintProductIds,
  sanitizeSearchTerm,
} from "@/lib/catalog/store-catalog-constraints";
import { getStoreFacetCounts } from "@/lib/catalog/store-facet-counts";
import type { StoreFacetCounts } from "@/lib/catalog/store-filter-types";
import { getAttributeDefinitionIdsByKeys } from "@/lib/catalog/store-attribute-defs";
import { commerceDisplayFromProductMetadata } from "@/lib/catalog/store-product-commerce";
import { catalogBestOfferPriceQuery } from "@/lib/catalog/store-best-offer-price-query";

const MAX_PRODUCT_IDS_FOR_PRICE = 10_000;
const MAX_CATEGORIES_OR_BRANDS = 500;
const MAX_ATTR_QUERY_ROWS = 20_000;

const COMMERCIAL_ATTR_KEYS = ["uses", "industries", "protection_tags", "certifications"] as const;

export type StoreProductCommercialAttrs = {
  uses: string[];
  industries: string[];
  protection_tags: string[];
  certifications: string[];
};

type CommercialAttrBucket = StoreProductCommercialAttrs;

function emptyCommercialBucket(): CommercialAttrBucket {
  return { uses: [], industries: [], protection_tags: [], certifications: [] };
}

/** Row for /store listing + Add to Quote — catalog_v2 products; pricing from catalogos view. */
export type StoreProductRow = {
  id: string;
  name: string;
  slug: string;
  brandName: string | null;
  brandId: string | null;
  imageUrl: string | null;
  internalSku: string | null;
  catalogVariantId: string | null;
  variantSku: string | null;
  sizeCode: string | null;
  materialHint: string | null;
  badges: string[];
  /** From `catalogos.product_best_offer_price.best_price` when finite & > 0. */
  bestPrice: number | null;
  /** Case sell price from commerce_packaging or bestPrice fallback. */
  casePrice: number | null;
  caseListPrice: number | null;
  caseOnSale: boolean;
  palletPrice: number | null;
  palletListPrice: number | null;
  palletOnSale: boolean;
  unitsPerCase: number | null;
  unitNoun: "gloves" | "pairs" | "units";
  palletPricingAvailable: boolean;
  caseLabel: string | null;
  palletLabel: string | null;
  /** Batched from `product_attributes` (uses facet); max two values joined for scan line. */
  commercialUseSummary: string | null;
  /** Up to two distinct certification values for card scan. */
  certificationHints: string[];
  /** First protection tag if any. */
  protectionHint: string | null;
  /** Active catalog_variants count for this product (server-derived). */
  activeVariantCount: number;
};

export type StoreBrandOption = {
  id: string;
  name: string;
  productCount: number;
};

export type StoreFacetMeta = Record<string, { label: string; displayGroup: string | null }>;

export type StoreCatalogPageResult = {
  products: StoreProductRow[];
  total: number;
  page: number;
  limit: number;
  brands: StoreBrandOption[];
  facetCounts: StoreFacetCounts;
  facetMeta: StoreFacetMeta;
  /**
   * Reserved for internal/diagnostic use only — never render `error` to shoppers.
   * Use `catalogUnavailable` for user-facing fallback UI.
   */
  error: string | null;
  /** Catalog service misconfigured or failed; show commercial fallback (no raw messages). */
  catalogUnavailable?: boolean;
};

function logStoreCatalogFailure(context: string, detail: unknown): void {
  const message = detail instanceof Error ? detail.message : String(detail);
  console.error(`[store-catalog] ${context}: ${message}`);
}

type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  brand_id: string | null;
  status: string;
  internal_sku: string | null;
  metadata: Record<string, unknown> | null;
  description: string | null;
  updated_at: string | null;
};

type CatalogVariant = {
  id: string;
  catalog_product_id: string;
  variant_sku: string;
  sort_order: number;
  is_active: boolean;
  size_code: string | null;
  metadata: Record<string, unknown> | null;
};

function activeVariantCountByProduct(variants: CatalogVariant[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of variants) {
    if (!v.is_active) continue;
    counts.set(v.catalog_product_id, (counts.get(v.catalog_product_id) ?? 0) + 1);
  }
  return counts;
}

type ProductImage = {
  catalog_product_id: string;
  url: string;
  is_primary: boolean;
  sort_order: number | null;
};

function strFromMetadata(meta: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!meta || typeof meta !== "object") return null;
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function badgesFromProductMetadata(metadata: Record<string, unknown> | null | undefined): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const out: string[] = [];
  if (metadata.featured === true || metadata.b2b_featured === true) out.push("Featured");
  const raw = metadata.storefront_badges;
  if (Array.isArray(raw)) {
    for (const x of raw) {
      if (typeof x === "string" && x.trim()) out.push(x.trim());
    }
  }
  return Array.from(new Set(out));
}

function materialHint(productMeta: Record<string, unknown> | null, variantMeta: Record<string, unknown> | null): string | null {
  return (
    strFromMetadata(productMeta, ["material", "primary_material", "glove_material"]) ??
    strFromMetadata(variantMeta, ["material", "primary_material", "glove_material"])
  );
}

function pickDefaultVariant(variants: CatalogVariant[], productId: string): CatalogVariant | null {
  const rows = variants
    .filter((v) => v.catalog_product_id === productId && v.is_active)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return rows[0] ?? null;
}

async function fetchCommercialAttrBucketsByProductIds(
  supabase: any,
  productIds: string[]
): Promise<Map<string, CommercialAttrBucket>> {
  const map = new Map<string, CommercialAttrBucket>();
  if (productIds.length === 0) return map;
  for (const id of productIds) map.set(id, emptyCommercialBucket());

  const defMap = await getAttributeDefinitionIdsByKeys(supabase, [...COMMERCIAL_ATTR_KEYS]);
  const defIds: string[] = [];
  const defIdToKey = new Map<string, (typeof COMMERCIAL_ATTR_KEYS)[number]>();
  for (const key of COMMERCIAL_ATTR_KEYS) {
    for (const defId of defMap.get(key) ?? []) {
      defIds.push(defId);
      defIdToKey.set(defId, key);
    }
  }
  if (defIds.length === 0) return map;

  const { data: rows } = await supabase
    .schema("catalogos")
    .from("product_attributes")
    .select("product_id, attribute_definition_id, value_text")
    .in("product_id", productIds)
    .in("attribute_definition_id", defIds)
    .not("value_text", "is", null)
    .limit(MAX_ATTR_QUERY_ROWS);

  for (const r of rows ?? []) {
    const row = r as { product_id: string; attribute_definition_id: string; value_text: string | null };
    const key = defIdToKey.get(row.attribute_definition_id);
    if (!key || !row.value_text?.trim()) continue;
    const bucket = map.get(row.product_id) ?? emptyCommercialBucket();
    const val = row.value_text.trim();
    const arr = bucket[key] as string[];
    if (!arr.includes(val)) arr.push(val);
    map.set(row.product_id, bucket);
  }
  return map;
}

function commercialCardFieldsFromBucket(bucket: CommercialAttrBucket | undefined): {
  commercialUseSummary: string | null;
  certificationHints: string[];
  protectionHint: string | null;
} {
  if (!bucket) {
    return { commercialUseSummary: null, certificationHints: [], protectionHint: null };
  }
  const useSummary =
    bucket.uses.length > 0
      ? bucket.uses.slice(0, 2).join(" · ")
      : bucket.industries.length > 0
        ? bucket.industries.slice(0, 2).join(" · ")
        : null;
  const certificationHints = bucket.certifications.slice(0, 2);
  const protectionHint = bucket.protection_tags[0] ?? null;
  return { commercialUseSummary: useSummary, certificationHints, protectionHint };
}

function intersectIdSet(a: Set<string> | null, b: Set<string>): Set<string> | null {
  if (a === null) return b;
  const out = new Set<string>();
  for (const id of Array.from(b)) if (a.has(id)) out.add(id);
  return out;
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

function validDisplayPrice(bestPrice: number | null | undefined): number | null {
  if (bestPrice == null || !Number.isFinite(bestPrice) || bestPrice <= 0) return null;
  return bestPrice;
}

async function fetchFacetMeta(supabase: any): Promise<StoreFacetMeta> {
  const { data } = await supabase
    .schema("catalogos")
    .from("attribute_definitions")
    .select("attribute_key, label, display_group, sort_order")
    .limit(5000);
  const byKey = new Map<string, { label: string; displayGroup: string | null; sort: number }>();
  for (const r of data ?? []) {
    const row = r as {
      attribute_key: string;
      label: string | null;
      display_group: string | null;
      sort_order: number | null;
    };
    const sort = row.sort_order ?? 9999;
    const prev = byKey.get(row.attribute_key);
    if (!prev || sort < prev.sort) {
      byKey.set(row.attribute_key, {
        label: (row.label && row.label.trim()) || row.attribute_key,
        displayGroup: row.display_group,
        sort,
      });
    }
  }
  const out: StoreFacetMeta = {};
  for (const [k, v] of Array.from(byKey.entries())) {
    out[k] = { label: v.label, displayGroup: v.displayGroup };
  }
  return out;
}

async function fetchBrandOptions(supabase: any): Promise<StoreBrandOption[]> {
  const { data: idRows } = (await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("brand_id")
    .eq("status", "active")
    .not("brand_id", "is", null)) as { data: { brand_id: string }[] | null };

  const counts = new Map<string, number>();
  for (const r of idRows ?? []) {
    if (!r.brand_id) continue;
    counts.set(r.brand_id, (counts.get(r.brand_id) ?? 0) + 1);
  }

  const ids = Array.from(counts.keys());
  if (ids.length === 0) return [];

  const { data: brands } = (await supabase
    .schema("catalogos")
    .from("brands")
    .select("id, name")
    .in("id", ids)
    .order("name")) as { data: { id: string; name: string }[] | null };

  return (brands ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    productCount: counts.get(b.id) ?? 0,
  }));
}

async function applyPriceBoundsToIds(
  supabase: any,
  filteredIds: Set<string> | null,
  priceMin?: number,
  priceMax?: number
): Promise<Set<string> | null> {
  if (priceMin == null && priceMax == null) return filteredIds;
  const lo = priceMin ?? 0;
  const hi = priceMax ?? Number.MAX_VALUE;
  let priceQuery = catalogBestOfferPriceQuery(supabase)
    .select("product_id")
    .gte("best_price", lo)
    .lte("best_price", hi)
    .limit(MAX_PRODUCT_IDS_FOR_PRICE);
  const { data: priceRows } = await priceQuery;
  const inPriceRange = new Set<string>((priceRows ?? []).map((r: { product_id: string }) => r.product_id));
  return intersectIdSet(filteredIds, inPriceRange);
}

function mapProductsToRows(
  products: CatalogProduct[],
  variants: CatalogVariant[],
  imageByProduct: Map<string, string>,
  brandMap: Map<string, string>,
  bestPriceByProduct: Map<string, number>,
  commercialByProduct: Map<string, CommercialAttrBucket>
): StoreProductRow[] {
  const variantCounts = activeVariantCountByProduct(variants);
  return products.map((p) => {
    const meta = (p.metadata ?? null) as Record<string, unknown> | null;
    const v = pickDefaultVariant(variants, p.id);
    const vMeta = (v?.metadata ?? null) as Record<string, unknown> | null;
    const card = commercialCardFieldsFromBucket(commercialByProduct.get(p.id));
    const activeVariantCount = variantCounts.get(p.id) ?? 0;
    const bestPrice = validDisplayPrice(bestPriceByProduct.get(p.id) ?? null);
    const commerce = commerceDisplayFromProductMetadata(meta, bestPrice);
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      brandName: p.brand_id ? brandMap.get(p.brand_id) ?? null : null,
      brandId: p.brand_id,
      imageUrl: imageByProduct.get(p.id) ?? null,
      internalSku: p.internal_sku,
      catalogVariantId: v?.id ?? null,
      variantSku: v?.variant_sku ?? null,
      sizeCode: v?.size_code ?? null,
      materialHint: materialHint(meta, vMeta),
      badges: badgesFromProductMetadata(meta),
      bestPrice,
      casePrice: commerce.casePrice,
      caseListPrice: commerce.caseListPrice,
      caseOnSale: commerce.caseOnSale,
      palletPrice: commerce.palletPrice,
      palletListPrice: commerce.palletListPrice,
      palletOnSale: commerce.palletOnSale,
      unitsPerCase: commerce.unitsPerCase,
      unitNoun: commerce.unitNoun,
      palletPricingAvailable: commerce.palletPricingAvailable,
      caseLabel: commerce.caseLabel,
      palletLabel: commerce.palletLabel,
      commercialUseSummary: card.commercialUseSummary,
      certificationHints: card.certificationHints,
      protectionHint: card.protectionHint,
      activeVariantCount,
    };
  });
}

export async function fetchStoreCatalogPage(params: StoreCatalogUrlState): Promise<StoreCatalogPageResult> {
  const limit = storeCatalogPageLimit(params);
  const page = Math.max(1, params.page ?? 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const normalized = normalizeStorefrontFilterParams(params);

  if (!isSupabaseConfigured()) {
    logStoreCatalogFailure("catalog_unavailable", "Supabase is not configured for this environment");
    return {
      products: [],
      total: 0,
      page: 1,
      limit,
      brands: [],
      facetCounts: {},
      facetMeta: {},
      error: null,
      catalogUnavailable: true,
    };
  }

  const supabase = getSupabaseAdmin() as any;

  let filteredIds: Set<string> | null = null;
  try {
    filteredIds = await getStoreCatalogConstraintProductIds(supabase, normalized);
  } catch (e) {
    logStoreCatalogFailure("constraint_query_failed", e);
    return {
      products: [],
      total: 0,
      page,
      limit,
      brands: [],
      facetCounts: {},
      facetMeta: {},
      error: null,
      catalogUnavailable: true,
    };
  }

  try {
    filteredIds = await applyPriceBoundsToIds(supabase, filteredIds, normalized.price_min, normalized.price_max);
    if (filteredIds !== null && filteredIds.size === 0) {
      const [brands, facetCounts, facetMeta] = await Promise.all([
        fetchBrandOptions(supabase),
        getStoreFacetCounts(supabase, normalized).catch(() => ({} as StoreFacetCounts)),
        fetchFacetMeta(supabase).catch(() => ({})),
      ]);
      return { products: [], total: 0, page, limit, brands, facetCounts, facetMeta, error: null };
    }

    const rawSort = normalized.sort ?? "newest";
    const sort = rawSort;
    const searchQ = sanitizeSearchTerm(normalized.q);
    const useRelevanceSort = sort === "relevance" && Boolean(searchQ);
    const effectiveSort =
      sort === "price_per_glove_asc" || useRelevanceSort || (sort === "relevance" && !searchQ) ? "newest" : sort;

    const [facetCounts, facetMeta, brands] = await Promise.all([
      getStoreFacetCounts(supabase, normalized).catch(() => ({} as StoreFacetCounts)),
      fetchFacetMeta(supabase).catch(() => ({})),
      fetchBrandOptions(supabase),
    ]);

    if (effectiveSort === "price_asc" || effectiveSort === "price_desc") {
      let priceQuery = catalogBestOfferPriceQuery(supabase)
        .select("product_id, best_price, offer_count")
        .order("best_price", { ascending: effectiveSort === "price_asc" })
        .range(from, to);
      if (filteredIds !== null && filteredIds.size > 0) {
        const idList = Array.from(filteredIds);
        if (idList.length > MAX_PRODUCT_IDS_FOR_PRICE) {
          priceQuery = priceQuery.in("product_id", idList.slice(0, MAX_PRODUCT_IDS_FOR_PRICE));
        } else {
          priceQuery = priceQuery.in("product_id", idList);
        }
      }
      const { data: pricePage, error: priceErr } = await priceQuery;
      if (priceErr) {
        logStoreCatalogFailure("price_sort_query_failed", priceErr.message);
        return {
          products: [],
          total: 0,
          page,
          limit,
          brands,
          facetCounts,
          facetMeta,
          error: null,
          catalogUnavailable: true,
        };
      }
      const priceRows = (pricePage ?? []) as { product_id: string; best_price: number; offer_count: number }[];
      if (priceRows.length === 0) {
        let total: number;
        if (filteredIds !== null && filteredIds.size > 0) {
          total = filteredIds.size;
        } else {
          const { count: totalCount } = await catalogBestOfferPriceQuery(supabase).select("product_id", {
            count: "exact",
            head: true,
          });
          total = totalCount ?? 0;
        }
        return { products: [], total, page, limit, brands, facetCounts, facetMeta, error: null };
      }
      const pageIds = priceRows.map((r) => r.product_id);
      const bestPriceByProduct = new Map<string, number>(priceRows.map((r) => [r.product_id, r.best_price]));
      const { data: productRows, error: listErr } = await supabase
        .schema("catalog_v2")
        .from("catalog_products")
        .select("id, internal_sku, slug, name, description, brand_id, status, metadata, updated_at")
        .eq("status", "active")
        .in("id", pageIds);
      if (listErr) {
        logStoreCatalogFailure("catalog_products_list_failed", listErr.message);
        return {
          products: [],
          total: 0,
          page,
          limit,
          brands,
          facetCounts,
          facetMeta,
          error: null,
          catalogUnavailable: true,
        };
      }
      const list = (productRows ?? []) as CatalogProduct[];
      const orderMap = new Map(pageIds.map((id, i) => [id, i]));
      list.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      const total =
        filteredIds !== null && filteredIds.size > 0
          ? filteredIds.size
          : ((await catalogBestOfferPriceQuery(supabase).select("product_id", { count: "exact", head: true }))
              .count ?? 0);

      const hydrated = await hydrateProductPage(supabase, list, bestPriceByProduct);
      return { ...hydrated, total, page, limit, brands, facetCounts, facetMeta, error: null };
    }

    let query = supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, internal_sku, slug, name, description, brand_id, status, metadata, updated_at", {
        count: "exact",
      })
      .eq("status", "active");

    if (filteredIds !== null) {
      query = query.in("id", Array.from(filteredIds));
    }

    if (effectiveSort === "name_asc" || effectiveSort === "name_desc") {
      query = query.order("name", { ascending: effectiveSort === "name_asc" });
    } else {
      query = query.order("updated_at", { ascending: false, nullsFirst: false });
    }

    query = query.range(from, to);

    const { data: products, error: productsError, count } = (await query) as {
      data: CatalogProduct[] | null;
      error: { message: string } | null;
      count: number | null;
    };

    if (productsError) {
      logStoreCatalogFailure("catalog_products_page_failed", productsError.message);
      return {
        products: [],
        total: 0,
        page,
        limit,
        brands,
        facetCounts,
        facetMeta,
        error: null,
        catalogUnavailable: true,
      };
    }

    const list = products ?? [];
    const total = count ?? 0;

    if (useRelevanceSort && searchQ) {
      list.sort(
        (a, b) =>
          searchRelevanceScore(b.name, b.description, b.internal_sku ?? "", searchQ) -
          searchRelevanceScore(a.name, a.description, a.internal_sku ?? "", searchQ)
      );
    }

    if (list.length === 0) {
      return { products: [], total, page, limit, brands, facetCounts, facetMeta, error: null };
    }

    const productIds = list.map((p) => p.id);
    const { data: priceRes } = await catalogBestOfferPriceQuery(supabase)
      .select("product_id, best_price")
      .in("product_id", productIds);
    const bestPriceByProduct = new Map<string, number>(
      (priceRes ?? []).map((r: { product_id: string; best_price: number }) => [r.product_id, r.best_price])
    );

    const hydrated = await hydrateProductPage(supabase, list, bestPriceByProduct);
    return { ...hydrated, total, page, limit, brands, facetCounts, facetMeta, error: null };
  } catch (e) {
    logStoreCatalogFailure("fetchStoreCatalogPage_failed", e);
    return {
      products: [],
      total: 0,
      page,
      limit,
      brands: [],
      facetCounts: {},
      facetMeta: {},
      error: null,
      catalogUnavailable: true,
    };
  }
}

async function hydrateProductPage(
  supabase: any,
  list: CatalogProduct[],
  bestPriceByProduct: Map<string, number>
): Promise<{ products: StoreProductRow[] }> {
  const productIds = list.map((p) => p.id);

  const [{ data: images }, { data: variantRows }, brandsRes, commercialByProduct] = await Promise.all([
    supabase
      .schema("catalog_v2")
      .from("catalog_product_images")
      .select("catalog_product_id, url, is_primary, sort_order")
      .in("catalog_product_id", productIds) as Promise<{ data: ProductImage[] | null }>,
    supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("id, catalog_product_id, variant_sku, sort_order, is_active, size_code, metadata")
      .in("catalog_product_id", productIds)
      .eq("is_active", true) as Promise<{ data: CatalogVariant[] | null }>,
    supabase
      .schema("catalogos")
      .from("brands")
      .select("id, name")
      .limit(MAX_CATEGORIES_OR_BRANDS) as Promise<{ data: { id: string; name: string }[] | null }>,
    fetchCommercialAttrBucketsByProductIds(supabase, productIds),
  ]);

  const imageByProduct = new Map<string, string>();
  const sortedImages = [...(images ?? [])].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
  for (const img of sortedImages) {
    if (!imageByProduct.has(img.catalog_product_id)) {
      imageByProduct.set(img.catalog_product_id, img.url);
    }
  }

  const variants = variantRows ?? [];
  const brandMap = new Map((brandsRes.data ?? []).map((b) => [b.id, b.name]));

  const products = mapProductsToRows(list, variants, imageByProduct, brandMap, bestPriceByProduct, commercialByProduct);
  return { products };
}

/** Hydrate listing rows for a set of catalog_v2 product ids (e.g. PDP related products). */
export async function fetchStoreProductRowsByIds(productIds: string[]): Promise<StoreProductRow[]> {
  const ids = Array.from(new Set(productIds)).filter(Boolean);
  if (ids.length === 0 || !isSupabaseConfigured()) return [];

  const supabase = getSupabaseAdmin() as any;
  const { data: products, error } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, internal_sku, slug, name, description, brand_id, status, metadata, updated_at")
    .eq("status", "active")
    .in("id", ids);

  if (error || !products?.length) return [];

  const list = products as CatalogProduct[];
  const { data: priceRes } = await catalogBestOfferPriceQuery(supabase)
    .select("product_id, best_price")
    .in(
      "product_id",
      ids.length > MAX_PRODUCT_IDS_FOR_PRICE ? ids.slice(0, MAX_PRODUCT_IDS_FOR_PRICE) : ids
    );
  const bestPriceByProduct = new Map<string, number>(
    (priceRes ?? []).map((r: { product_id: string; best_price: number }) => [r.product_id, r.best_price])
  );

  const { products: rows } = await hydrateProductPage(supabase, list, bestPriceByProduct);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((x): x is StoreProductRow => Boolean(x));
}

/** Governed commercial attributes for storefront matching (uses, industries, protection, certifications). */
export async function fetchStoreProductCommercialAttrsByProductIds(
  productIds: string[]
): Promise<Map<string, StoreProductCommercialAttrs>> {
  const ids = Array.from(new Set(productIds)).filter(Boolean);
  if (ids.length === 0 || !isSupabaseConfigured()) return new Map();
  const supabase = getSupabaseAdmin() as any;
  return fetchCommercialAttrBucketsByProductIds(supabase, ids);
}

export async function fetchStoreProducts(): Promise<{ products: StoreProductRow[]; error: string | null }> {
  const r = await fetchStoreCatalogPage({
    q: "",
    page: 1,
    sort: "newest",
    limit: 24,
  });
  return { products: r.products, error: null };
}
