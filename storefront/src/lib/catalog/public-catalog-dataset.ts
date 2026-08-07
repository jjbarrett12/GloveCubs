import { unstable_cache } from "next/cache";
import { fetchStoreCatalogPage, type StoreCatalogPageResult, type StoreProductRow } from "@/lib/catalog/store-products";
import { isCatalogSupabaseEmergencyDisabled } from "@/lib/catalog/emergency-catalog-kill-switch";

/** Cap anonymous public snapshot size — enough for client-side browse/filter, not unbounded. */
export const PUBLIC_ANONYMOUS_CATALOG_CAP = 200;

export type PublicAnonymousCatalogDataset = {
  products: StoreProductRow[];
  total: number;
  brands: StoreCatalogPageResult["brands"];
  facetCounts: StoreCatalogPageResult["facetCounts"];
  facetMeta: StoreCatalogPageResult["facetMeta"];
  catalogUnavailable: boolean;
  /** Always the public page size used by the store UI for local pagination. */
  limit: number;
  generatedAt: string;
};

function emptyDataset(unavailable: boolean): PublicAnonymousCatalogDataset {
  return {
    products: [],
    total: 0,
    brands: [],
    facetCounts: {},
    facetMeta: {},
    catalogUnavailable: unavailable,
    limit: 24,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Build one canonical public catalog payload (no request-scoped inputs).
 * Safe for CDN / Data Cache — never includes auth or customer-specific pricing enrichment.
 */
async function buildPublicAnonymousCatalogDataset(): Promise<PublicAnonymousCatalogDataset> {
  if (isCatalogSupabaseEmergencyDisabled()) {
    return emptyDataset(true);
  }

  const pageSize = 50;
  const first = await fetchStoreCatalogPage({
    q: "",
    page: 1,
    sort: "newest",
    limit: pageSize,
  });

  if (first.catalogUnavailable) {
    return emptyDataset(true);
  }

  const products = [...first.products];
  let page = 2;
  while (products.length < PUBLIC_ANONYMOUS_CATALOG_CAP && products.length < first.total) {
    const next = await fetchStoreCatalogPage({
      q: "",
      page,
      sort: "newest",
      limit: pageSize,
    });
    if (next.catalogUnavailable || next.products.length === 0) break;
    products.push(...next.products);
    if (next.products.length < pageSize) break;
    page += 1;
    if (page > 20) break;
  }

  const capped = products.slice(0, PUBLIC_ANONYMOUS_CATALOG_CAP);

  return {
    products: capped,
    total: first.total,
    brands: first.brands,
    facetCounts: first.facetCounts,
    facetMeta: first.facetMeta,
    catalogUnavailable: false,
    limit: 24,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Cached public catalog — shared across requests. Key has no query inputs so crawlers
 * cannot manufacture unbounded cache variants.
 */
export const getPublicAnonymousCatalogDataset = unstable_cache(
  buildPublicAnonymousCatalogDataset,
  ["public-anonymous-store-catalog-v1"],
  { revalidate: 300 },
);
