/**
 * Product Search Service
 *
 * Implements reliable product search using Postgres full-text search
 * with trigram matching for fuzzy relevance.
 * Productionization: defensive handling for empty offers, null trust scores,
 * malformed filters, and RPC result shape; uses catalogos.products for fallback paths.
 */

import { supabaseAdmin, getSupabaseCatalogos } from '../jobs/supabase';
import {
  flattenCatalogosProductRow,
  mapCanonicalRowToSearchFacets,
  searchFacetsToLegacyAttributes,
} from '../catalog/canonical-read-model';
import {
  normalizeSearchQuery as normalizeSearchQueryForLine,
  parseSearchTokens as parseSearchTokensForLine,
  type ParsedSearchTokens,
} from '../catalog/search-query';

// ============================================================================
// TYPES
// ============================================================================

export type { ParsedSearchTokens };

export interface ProductSearchResult {
  product_id: string;
  canonical_name: string;
  normalized_name?: string;
  sku?: string;
  attributes: {
    material?: string;
    /** @deprecated use primary_variant_style — retained for API compatibility */
    glove_type?: string;
    /** Semantic facet name (hand-protection: exam/industrial; other lines: product_type, etc.) */
    primary_variant_style?: string;
    product_line_code?: string;
    size?: string;
    color?: string;
    pack_size?: number;
    category?: string;
  };
  supplier_offer_count: number;
  trusted_best_price?: number;
  trusted_best_supplier?: string;
  relevance_score: number;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  filters?: {
    material?: string;
    size?: string;
    glove_type?: string;
    category?: string;
    /** Restrict query token classification & optional result filter */
    product_line_code?: string;
    min_price?: number;
    max_price?: number;
    in_stock_only?: boolean;
  };
  include_offers?: boolean;
}

export interface SearchResponse {
  results: ProductSearchResult[];
  total_count: number;
  query: string;
  took_ms: number;
}

// ============================================================================
// SEARCH NORMALIZATION
// ============================================================================

/**
 * Normalize search query for better matching.
 * Handles common variations, pluralization, etc.
 */
export function normalizeSearchQuery(query: string): string {
  let normalized = query.toLowerCase().trim();
  
  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, ' ');
  
  // Handle common pluralization (gloves -> glove anywhere in query)
  normalized = normalized.replace(/\bgloves\b/g, 'glove');
  
  // Common abbreviations and synonyms
  const synonyms: Record<string, string> = {
    'pf': 'powder-free',
    'powderfree': 'powder-free',
    'powder free': 'powder-free',
    'sm': 'small',
    'med': 'medium',
    'lg': 'large',
    'xl': 'x-large',
    'xxl': '2x-large',
    'xs': 'x-small',
    'lrg': 'large',
    'sml': 'small',
  };
  
  for (const [abbrev, full] of Object.entries(synonyms)) {
    if (normalized.includes(abbrev)) {
      normalized = normalized.replace(new RegExp(`\\b${abbrev}\\b`, 'g'), full);
    }
  }
  
  return normalized;
}

/**
 * Parse search tokens for building queries.
 */
export function parseSearchTokens(query: string): {
  terms: string[];
  materials: string[];
  sizes: string[];
  types: string[];
} {
  const normalized = normalizeSearchQuery(query);
  const tokens = normalized.split(' ').filter(t => t.length > 1);
  
  const materials = ['nitrile', 'latex', 'vinyl', 'neoprene', 'polyethylene', 'poly'];
  const sizes = ['x-small', 'small', 'medium', 'large', 'x-large', '2x-large'];
  const types = ['exam', 'surgical', 'industrial', 'food', 'safety', 'disposable', 'reusable'];
  
  return {
    terms: tokens,
    materials: tokens.filter(t => materials.some(m => t.includes(m))),
    sizes: tokens.filter(t => sizes.some(s => t.includes(s))),
    types: tokens.filter(t => types.some(tp => t.includes(tp))),
  };
}

// ============================================================================
// CORE SEARCH
// ============================================================================

/**
 * Search products using full-text search with relevance ranking.
 */
export async function searchProducts(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  const startTime = Date.now();
  const limit = options.limit || 20;
  const offset = options.offset || 0;
  
  if (!query || query.trim().length < 2) {
    return {
      results: [],
      total_count: 0,
      query,
      took_ms: Date.now() - startTime,
    };
  }
  
  const normalizedQuery = normalizeSearchQuery(query);
  const tokens = parseSearchTokens(query);
  
  // Build search pattern for ILIKE
  const searchPattern = `%${normalizedQuery.replace(/ /g, '%')}%`;
  
  // Search using multiple matching strategies
  const results = await executeSearch(normalizedQuery, searchPattern, tokens, limit, offset, options);
  
  // Get total count
  const totalCount = await getSearchCount(normalizedQuery, searchPattern, tokens, options);
  
  return {
    results,
    total_count: totalCount,
    query,
    took_ms: Date.now() - startTime,
  };
}

/**
 * Execute the search query with relevance scoring.
 */
async function executeSearch(
  normalizedQuery: string,
  searchPattern: string,
  tokens: ReturnType<typeof parseSearchTokens>,
  limit: number,
  offset: number,
  options: SearchOptions
): Promise<ProductSearchResult[]> {
  try {
    return await executeFullTextSearch(normalizedQuery, searchPattern, tokens, limit, offset, options);
  } catch (err) {
    try {
      const { logSearchFailure } = await import('../hardening/telemetry');
      await logSearchFailure(err instanceof Error ? err.message : 'Search failed', {
        query: normalizedQuery.slice(0, 200),
        phase: 'fts',
        error_code: err instanceof Error ? err.name : 'Unknown',
      });
    } catch {
      // non-fatal
    }
    return await executeFallbackSearch(searchPattern, tokens, limit, offset, options);
  }
}

/**
 * Full-text search using Postgres ts_vector and ts_rank.
 */
async function executeFullTextSearch(
  normalizedQuery: string,
  searchPattern: string,
  tokens: ReturnType<typeof parseSearchTokens>,
  limit: number,
  offset: number,
  options: SearchOptions
): Promise<ProductSearchResult[]> {
  // Create ts_query from normalized tokens
  const tsQueryTerms = tokens.terms.map(t => `${t}:*`).join(' & ');
  
  const { data: products, error } = await supabaseAdmin.rpc('search_products_fts', {
    p_search_query: tsQueryTerms || normalizedQuery,
    p_search_pattern: searchPattern,
    p_limit: limit,
    p_offset: offset,
    p_material: options.filters?.material ?? null,
    p_size: options.filters?.size ?? null,
    p_category: options.filters?.category ?? null,
  });

  if (error) throw error;

  const rows = Array.isArray(products) ? products : products != null ? [products] : [];
  return rows.filter((r): r is Record<string, unknown> => r != null && typeof r === 'object').map(mapProductToResult);
}

/**
 * Map matched product rows to storefront listing ids (one primary per family).
 */
async function resolveProductIdsToListingIds(productIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const safeIds = productIds.filter((id) => typeof id === 'string' && id.length > 0).slice(0, 500);
  if (safeIds.length === 0) return map;

  const cat = getSupabaseCatalogos();
  const { data: rows } = await cat
    .from('products')
    .select('id, family_id, sku, created_at')
    .in('id', safeIds)
    .eq('is_active', true);

  const familyIds = Array.from(
    new Set(
      (rows ?? [])
        .map((r) => r.family_id)
        .filter((x): x is string => typeof x === 'string' && x.length > 0)
    )
  );

  const primaryByFamily = new Map<string, string>();
  if (familyIds.length > 0) {
    const { data: variants } = await cat
      .from('products')
      .select('id, family_id, sku, created_at')
      .in('family_id', familyIds)
      .eq('is_active', true);
    const byFamily = new Map<string, NonNullable<typeof rows>>();
    for (const v of variants ?? []) {
      const fid = v.family_id as string | null;
      if (!fid) continue;
      const list = byFamily.get(fid) ?? [];
      list.push(v);
      byFamily.set(fid, list);
    }
    for (const [fid, list] of Array.from(byFamily.entries())) {
      const sorted = [...list].sort(
        (a, b) =>
          String(a.sku ?? '').localeCompare(String(b.sku ?? '')) ||
          String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
      );
      const first = sorted[0]?.id as string | undefined;
      if (first) primaryByFamily.set(fid, first);
    }
  }

  for (const r of rows ?? []) {
    const rid = r.id as string;
    const fid = r.family_id as string | null;
    const lid = fid ? primaryByFamily.get(fid) ?? rid : rid;
    map.set(rid, lid);
  }
  return map;
}

/**
 * All active variant ids per listing (family), or [listing] when standalone.
 */
async function getVariantIdsByListingId(listingIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (listingIds.length === 0) return out;

  const cat = getSupabaseCatalogos();
  const { data: listings } = await cat.from('products').select('id, family_id').in('id', listingIds);

  const familyIds = Array.from(
    new Set(
      (listings ?? [])
        .map((l) => l.family_id)
        .filter((x): x is string => typeof x === 'string' && x.length > 0)
    )
  );

  const byFamily = new Map<string, string[]>();
  if (familyIds.length > 0) {
    const { data: variants } = await cat
      .from('products')
      .select('id, family_id')
      .in('family_id', familyIds)
      .eq('is_active', true);
    for (const v of variants ?? []) {
      const fid = v.family_id as string | null;
      if (!fid) continue;
      const list = byFamily.get(fid) ?? [];
      list.push(v.id as string);
      byFamily.set(fid, list);
    }
  }

  for (const l of listings ?? []) {
    const lid = l.id as string;
    const fid = l.family_id as string | null;
    if (fid) {
      out.set(lid, byFamily.get(fid) ?? [lid]);
    } else {
      out.set(lid, [lid]);
    }
  }
  return out;
}

function aggregateOffersAcrossVariants(
  variantIds: string[],
  offersData: Map<string, { count: number; best_price?: number; best_supplier?: string }>
): { count: number; best_price?: number; best_supplier?: string } {
  let count = 0;
  let best_price: number | undefined;
  let best_supplier: string | undefined;
  for (const vid of variantIds) {
    const o = offersData.get(vid);
    if (!o) continue;
    count += o.count;
    if (o.best_price != null && Number.isFinite(o.best_price)) {
      if (best_price == null || o.best_price < best_price) {
        best_price = o.best_price;
        best_supplier = o.best_supplier;
      }
    }
  }
  return { count, best_price, best_supplier };
}

/**
 * Fallback ILIKE search when FTS is unavailable.
 * Also searches supplier product names for matches.
 */
async function executeFallbackSearch(
  searchPattern: string,
  tokens: ReturnType<typeof parseSearchTokens>,
  limit: number,
  offset: number,
  options: SearchOptions
): Promise<ProductSearchResult[]> {
  const safePattern = typeof searchPattern === 'string' && searchPattern.length <= 500
    ? searchPattern
    : '%';

  const windowEnd = Math.min(offset + Math.max(limit, 1) * 50, 3000);

  const cat = getSupabaseCatalogos();
  let lineCategorySlugs: string[] | null = null;
  if (options.filters?.product_line_code) {
    const { data: lineRows } = await cat
      .from('category_product_line')
      .select('category_slug')
      .eq('product_line_code', String(options.filters.product_line_code).slice(0, 64));
    lineCategorySlugs = (lineRows ?? [])
      .map((r: { category_slug?: string }) => r.category_slug)
      .filter((s): s is string => typeof s === 'string' && s.length > 0);
  }

  let query = cat
    .from('products')
    .select('id,name,sku,description,attributes,family_id,is_active,categories(slug)')
    .eq('is_active', true)
    .or(`name.ilike.${safePattern},sku.ilike.${safePattern},description.ilike.${safePattern}`)
    .range(0, windowEnd - 1);

  const { data: rawProducts } = await query;
  let productList = (Array.isArray(rawProducts) ? rawProducts : []).map((r) =>
    flattenCatalogosProductRow(r as Record<string, unknown>)
  );

  if (options.filters?.category) {
    const catSlug = String(options.filters.category).slice(0, 100);
    productList = productList.filter((p) => String(p.category ?? '') === catSlug);
  }

  if (options.filters?.material) {
    const m = String(options.filters.material).slice(0, 100).toLowerCase();
    productList = productList.filter((p) => String(p.material ?? '').toLowerCase().includes(m));
  }
  if (options.filters?.size) {
    const sz = String(options.filters.size).slice(0, 50);
    productList = productList.filter((p) => p.size === sz);
  }
  if (lineCategorySlugs && lineCategorySlugs.length > 0) {
    const allow = new Set(lineCategorySlugs);
    productList = productList.filter((p) => p.category != null && allow.has(String(p.category)));
  }

  const { data: supplierMatches } = await supabaseAdmin
    .from('supplier_offers')
    .select('product_id')
    .eq('is_active', true)
    .or(`sku.ilike.${safePattern},product_name.ilike.${safePattern}`)
    .limit(50);
    
  const supplierMatchedIds = new Set(
    (Array.isArray(supplierMatches) ? supplierMatches : [])
      .map((m: { product_id?: string }) => m?.product_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );
  const directMatchIds = new Set(
    productList
      .map((p: { id?: string }) => p?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );
  const additionalIds = Array.from(supplierMatchedIds).filter((id) => !directMatchIds.has(id));

  let allProducts: Array<Record<string, unknown>> = productList;

  if (additionalIds.length > 0 && additionalIds.length <= 100) {
    const { data: additionalRaw } = await cat
      .from('products')
      .select('id,name,sku,description,attributes,family_id,is_active,categories(slug)')
      .eq('is_active', true)
      .in('id', additionalIds);

    if (Array.isArray(additionalRaw) && additionalRaw.length > 0) {
      allProducts = [
        ...allProducts,
        ...additionalRaw.map((r) => flattenCatalogosProductRow(r as Record<string, unknown>)),
      ];
    }
  }

  if (allProducts.length === 0) return [];

  const rawIds = allProducts
    .map((p) => p.id as string | undefined)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const idToListing = await resolveProductIdsToListingIds(rawIds);
  const listingIds = Array.from(new Set(Array.from(idToListing.values())));

  const { data: listingRaw } = await cat
    .from('products')
    .select('id,name,sku,description,attributes,family_id,is_active,categories(slug)')
    .in('id', listingIds)
    .eq('is_active', true);
  const listingRows = (Array.isArray(listingRaw) ? listingRaw : []).map((r) =>
    flattenCatalogosProductRow(r as Record<string, unknown>)
  );

  const displayById = new Map(listingRows.map((r) => [r.id as string, r as Record<string, unknown>]));

  const variantIdsByListing = await getVariantIdsByListingId(listingIds);
  const allVariantIds = Array.from(new Set(Array.from(variantIdsByListing.values()).flat()));
  const offersData = await getOfferData(allVariantIds);

  const relevanceByListing = new Map<string, number>();
  for (const product of allProducts) {
    const id = product?.id as string | undefined;
    if (!id) continue;
    const lid = idToListing.get(id) ?? id;
    let relevance = calculateRelevance(
      {
        name: product?.name as string,
        title: product?.title as string | undefined,
        sku: product?.sku as string | undefined,
        material: product?.material as string | undefined,
      },
      tokens
    );
    if (supplierMatchedIds.has(id)) relevance += 10;
    const prev = relevanceByListing.get(lid) ?? 0;
    if (relevance > prev) relevanceByListing.set(lid, relevance);
  }

  const merged: ProductSearchResult[] = [];
  for (const lid of listingIds) {
    const product = displayById.get(lid);
    if (!product) continue;
    const vids = variantIdsByListing.get(lid) ?? [lid];
    const agg = aggregateOffersAcrossVariants(vids, offersData);
    const facetRow = mapCanonicalRowToSearchFacets(product);
    const legacy = searchFacetsToLegacyAttributes(facetRow);
    merged.push({
      product_id: lid,
      canonical_name: (product?.name as string) ?? '',
      normalized_name: (product?.title as string) ?? undefined,
      sku: (product?.sku as string) ?? undefined,
      attributes: {
        ...legacy,
        primary_variant_style: facetRow.primaryVariantStyle,
        glove_type: legacy.glove_type,
      },
      supplier_offer_count: agg.count,
      trusted_best_price: agg.best_price,
      trusted_best_supplier: agg.best_supplier,
      relevance_score: relevanceByListing.get(lid) ?? 0,
    });
  }

  return merged
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(offset, offset + limit);
}

/**
 * Get offer count and best price for products.
 */
async function getOfferData(productIds: string[]): Promise<Map<string, {
  count: number;
  best_price?: number;
  best_supplier?: string;
}>> {
  const result = new Map<string, { count: number; best_price?: number; best_supplier?: string }>();
  
  if (productIds.length === 0) return result;
  
  const safeIds = productIds.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, 500);
  if (safeIds.length === 0) return result;

  const { data: offers } = await supabaseAdmin
    .from('supplier_offers')
    .select('product_id,price,cost,supplier_id,suppliers(name)')
    .in('product_id', safeIds)
    .eq('is_active', true);

  const offerList = Array.isArray(offers) ? offers : [];

  const { data: trustScores } = await supabaseAdmin
    .from('offer_trust_scores')
    .select('supplier_id, product_id, trust_band')
    .in('product_id', safeIds)
    .in('trust_band', ['high_trust', 'medium_trust']);

  const trustedSuppliers = new Set<string>();
  const trustList = Array.isArray(trustScores) ? trustScores : [];
  for (const ts of trustList) {
    if (ts?.supplier_id != null && ts?.product_id != null) {
      trustedSuppliers.add(`${ts.supplier_id}:${ts.product_id}`);
    }
  }

  for (const offer of offerList) {
    const pid = offer?.product_id;
    if (pid == null) continue;
    const existing = result.get(pid) ?? { count: 0 };
    existing.count += 1;
    const isTrusted = trustedSuppliers.has(`${offer.supplier_id}:${offer.product_id}`);
    const price = Number(offer?.price ?? offer?.cost ?? 0);
    if (Number.isFinite(price) && isTrusted && (existing.best_price == null || price < existing.best_price)) {
      existing.best_price = price;
      existing.best_supplier = (offer.suppliers as unknown as { name?: string })?.name ?? undefined;
    }
    result.set(pid, existing);
  }
  
  return result;
}

/**
 * Calculate relevance score for a product based on search tokens.
 */
function calculateRelevance(
  product: { name: string; title?: string; sku?: string; material?: string },
  tokens: ReturnType<typeof parseSearchTokens>
): number {
  let score = 0;
  
  const nameLower = product.name?.toLowerCase() || '';
  const titleLower = product.title?.toLowerCase() || '';
  const skuLower = product.sku?.toLowerCase() || '';
  const materialLower = product.material?.toLowerCase() || '';
  
  for (const term of tokens.terms) {
    // Exact name match
    if (nameLower === term) {
      score += 100;
    } else if (nameLower.includes(term)) {
      score += 50;
    }
    
    // Title match
    if (titleLower.includes(term)) {
      score += 30;
    }
    
    // SKU match
    if (skuLower.includes(term)) {
      score += 40;
    }
    
    // Material match
    if (materialLower.includes(term)) {
      score += 25;
    }
  }
  
  // Boost for material matches
  for (const material of tokens.materials) {
    if (materialLower.includes(material)) {
      score += 20;
    }
  }
  
  // Boost for size matches
  for (const size of tokens.sizes) {
    if (nameLower.includes(size) || titleLower.includes(size)) {
      score += 15;
    }
  }
  
  return score;
}

/**
 * Get total count for search.
 */
async function getSearchCount(
  normalizedQuery: string,
  searchPattern: string,
  tokens: ReturnType<typeof parseSearchTokens>,
  options: SearchOptions
): Promise<number> {
  const tsQueryTerms = tokens.terms.map((t) => `${t}:*`).join(' & ');
  try {
    const { data, error } = await supabaseAdmin.rpc('search_products_listing_count', {
      p_search_query: tsQueryTerms || normalizedQuery,
      p_search_pattern: searchPattern,
      p_material: options.filters?.material ?? null,
      p_size: options.filters?.size ?? null,
      p_category: options.filters?.category ?? null,
    });
    if (!error && data != null) {
      const n = typeof data === 'bigint' ? Number(data) : Number(data);
      return Number.isFinite(n) ? n : 0;
    }
  } catch {
    // fall through to approximate ILIKE + dedupe count
  }

  try {
    return await getFallbackListingCountApprox(searchPattern, options);
  } catch {
    return 0;
  }
}

async function getFallbackListingCountApprox(
  searchPattern: string,
  options: SearchOptions
): Promise<number> {
  const safePattern =
    typeof searchPattern === 'string' && searchPattern.length <= 500 ? searchPattern : '%';
  const cat = getSupabaseCatalogos();
  const { data: rawProducts } = await cat
    .from('products')
    .select('id,name,sku,description,attributes,family_id,is_active,categories(slug)')
    .eq('is_active', true)
    .or(`name.ilike.${safePattern},sku.ilike.${safePattern},description.ilike.${safePattern}`)
    .limit(5000);

  let productList = (Array.isArray(rawProducts) ? rawProducts : []).map((r) =>
    flattenCatalogosProductRow(r as Record<string, unknown>)
  );

  if (options.filters?.category) {
    const catSlug = String(options.filters.category).slice(0, 100);
    productList = productList.filter((p) => String(p.category ?? '') === catSlug);
  }
  if (options.filters?.material) {
    const m = String(options.filters.material).slice(0, 100).toLowerCase();
    productList = productList.filter((p) => String(p.material ?? '').toLowerCase().includes(m));
  }
  if (options.filters?.size) {
    const sz = String(options.filters.size).slice(0, 50);
    productList = productList.filter((p) => p.size === sz);
  }
  if (options.filters?.product_line_code) {
    const { data: lineRows } = await cat
      .from('category_product_line')
      .select('category_slug')
      .eq('product_line_code', String(options.filters.product_line_code).slice(0, 64));
    const allow = new Set(
      (lineRows ?? [])
        .map((r: { category_slug?: string }) => r.category_slug)
        .filter((s): s is string => typeof s === 'string' && s.length > 0)
    );
    if (allow.size > 0) {
      productList = productList.filter((p) => p.category != null && allow.has(String(p.category)));
    } else {
      productList = [];
    }
  }

  const ids = productList
    .map((p: { id?: string }) => p.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const { data: supplierMatches } = await supabaseAdmin
    .from('supplier_offers')
    .select('product_id')
    .eq('is_active', true)
    .or(`sku.ilike.${safePattern},product_name.ilike.${safePattern}`)
    .limit(200);

  const extra = (Array.isArray(supplierMatches) ? supplierMatches : [])
    .map((m: { product_id?: string }) => m.product_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0 && !ids.includes(id));

  const allIds = [...ids, ...extra.slice(0, 100)];
  if (allIds.length === 0) return 0;
  const idToListing = await resolveProductIdsToListingIds(allIds);
  return Array.from(new Set(Array.from(idToListing.values()))).length;
}

/**
 * Map RPC result to ProductSearchResult (defensive for null/missing fields).
 */
function mapProductToResult(row: Record<string, unknown>): ProductSearchResult {
  const num = (v: unknown): number => (v != null && Number.isFinite(Number(v)) ? Number(v) : 0);
  const facets = mapCanonicalRowToSearchFacets(row);
  const legacy = searchFacetsToLegacyAttributes(facets);
  return {
    product_id: row?.id != null ? String(row.id) : '',
    canonical_name: row?.name != null ? String(row.name) : '',
    normalized_name: row?.title != null ? String(row.title) : undefined,
    sku: row?.sku != null ? String(row.sku) : undefined,
    attributes: {
      ...legacy,
      primary_variant_style: facets.primaryVariantStyle,
      glove_type: legacy.glove_type,
    },
    supplier_offer_count: num(row?.offer_count),
    trusted_best_price: row?.best_price != null ? num(row.best_price) : undefined,
    trusted_best_supplier: row?.best_supplier != null ? String(row.best_supplier) : undefined,
    relevance_score: num(row?.relevance),
  };
}

// ============================================================================
// AUTOCOMPLETE
// ============================================================================

/**
 * Quick autocomplete suggestions.
 */
export async function getAutocompleteSuggestions(
  query: string,
  limit: number = 10
): Promise<Array<{ id: string; name: string; type: 'product' | 'material' | 'category' }>> {
  if (!query || query.length < 2) {
    return [];
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('search_products_autocomplete', {
      p_query: query,
      p_limit: limit,
    });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : data != null ? [data] : [];
    return rows
      .filter((r): r is Record<string, unknown> => r != null && typeof r === 'object')
      .map((r) => ({
        id: r.id != null ? String(r.id) : '',
        name: r.name != null ? String(r.name) : '',
        type: 'product' as const,
      }))
      .filter((r) => r.id.length > 0);
  } catch {
    const pattern = `%${query.toLowerCase()}%`;
    const cat = getSupabaseCatalogos();
    const { data: raw } = await cat
      .from('products')
      .select('id, name')
      .eq('is_active', true)
      .ilike('name', pattern)
      .limit(Math.min(limit * 8, 80));
    const rows = Array.isArray(raw) ? raw : [];
    const idToListing = await resolveProductIdsToListingIds(
      rows.map((p) => p.id as string).filter(Boolean)
    );
    const seen = new Set<string>();
    const out: Array<{ id: string; name: string; type: 'product' }> = [];
    for (const p of rows) {
      const pid = p.id as string;
      const lid = idToListing.get(pid) ?? pid;
      if (lid !== pid) continue;
      if (seen.has(lid)) continue;
      seen.add(lid);
      out.push({ id: lid, name: String(p.name ?? ''), type: 'product' as const });
      if (out.length >= limit) break;
    }
    return out;
  }
}

// ============================================================================
// RELATED/SIMILAR PRODUCTS
// ============================================================================

/**
 * Get similar products based on attributes.
 */
export async function getSimilarProducts(
  product_id: string,
  limit: number = 5
): Promise<ProductSearchResult[]> {
  const cat = getSupabaseCatalogos();
  const { data: rawSource } = await cat
    .from('products')
    .select('id, attributes, family_id, categories(slug)')
    .eq('id', product_id)
    .single();

  if (!rawSource) return [];

  const source = flattenCatalogosProductRow(rawSource as Record<string, unknown>);

  const listingId =
    (await resolveProductIdsToListingIds([product_id])).get(product_id) ?? product_id;

  const { data: rawPool } = await cat
    .from('products')
    .select('id, name, sku, description, attributes, family_id, is_active, categories(slug)')
    .eq('is_active', true)
    .neq('id', listingId)
    .limit(80);

  let pool = (Array.isArray(rawPool) ? rawPool : []).map((r) =>
    flattenCatalogosProductRow(r as Record<string, unknown>)
  );

  const fid = source.family_id as string | null | undefined;
  if (fid) {
    pool = pool.filter((p) => !p.family_id || String(p.family_id) !== String(fid));
  }

  if (source.product_line_code) {
    pool = pool.filter((p) => String(p.product_line_code ?? '') === String(source.product_line_code));
  }
  if (source.material) {
    pool = pool.filter((p) => String(p.material ?? '') === String(source.material));
  }
  if (source.category) {
    pool = pool.filter((p) => String(p.category ?? '') === String(source.category));
  }

  const listingIds = new Set<string>();
  const primaryRows: Record<string, unknown>[] = [];
  const idToListing = await resolveProductIdsToListingIds(
    pool.map((p) => p.id as string).filter((x): x is string => typeof x === 'string')
  );
  for (const p of pool) {
    const pid = p.id as string;
    const lid = idToListing.get(pid) ?? pid;
    if (lid !== pid) continue;
    if (listingIds.has(lid)) continue;
    listingIds.add(lid);
    primaryRows.push(p);
    if (primaryRows.length >= limit) break;
  }

  const productIds = primaryRows.map((p) => p.id as string);
  const offersData = await getOfferData(productIds);

  return primaryRows.map((p) => {
    const facetRow = mapCanonicalRowToSearchFacets(p);
    const legacy = searchFacetsToLegacyAttributes(facetRow);
    return {
      product_id: p.id as string,
      canonical_name: p.name as string,
      normalized_name: p.title as string | undefined,
      sku: p.sku as string | undefined,
      attributes: {
        ...legacy,
        primary_variant_style: facetRow.primaryVariantStyle,
        glove_type: legacy.glove_type,
      },
      supplier_offer_count: offersData.get(p.id as string)?.count || 0,
      trusted_best_price: offersData.get(p.id as string)?.best_price,
      trusted_best_supplier: offersData.get(p.id as string)?.best_supplier,
      relevance_score: 0,
    };
  });
}
