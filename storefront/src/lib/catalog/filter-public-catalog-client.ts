import type { StoreCatalogUrlState } from "@/lib/catalog/store-url";
import type { StoreBrandOption, StoreFacetMeta, StoreProductRow } from "@/lib/catalog/store-products";
import type { StoreFacetCounts } from "@/lib/catalog/store-filter-types";
import { getAllCatalogFacetKeys } from "@/lib/catalog/catalog-facet-registry";
import { storeCatalogPageLimit } from "@/lib/catalog/store-url";

export type PublicCatalogSlice = {
  products: StoreProductRow[];
  total: number;
  limit: number;
  brands: StoreBrandOption[];
  facetCounts: StoreFacetCounts;
  facetMeta: StoreFacetMeta;
  catalogUnavailable?: boolean;
};

function productSearchBlob(p: StoreProductRow): string {
  return [
    p.name,
    p.slug,
    p.brandName,
    p.internalSku,
    p.variantSku,
    p.materialHint,
    p.description,
    p.commercialUseSummary,
    p.protectionHint,
    ...(p.badges ?? []),
    ...(p.certificationHints ?? []),
    ...(p.availableSizeCodes ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function productMatchesFacet(p: StoreProductRow, key: string, values: string[]): boolean {
  if (!values.length) return true;
  const blob = productSearchBlob(p);
  const brandId = (p.brandId ?? "").toLowerCase();
  if (key === "brand") {
    return values.some((v) => brandId === v.toLowerCase() || blob.includes(v.toLowerCase()));
  }
  return values.some((v) => blob.includes(String(v).toLowerCase()));
}

function sortProducts(products: StoreProductRow[], sort: StoreCatalogUrlState["sort"]): StoreProductRow[] {
  const list = [...products];
  switch (sort) {
    case "price_asc":
      return list.sort((a, b) => (a.bestPrice ?? Number.POSITIVE_INFINITY) - (b.bestPrice ?? Number.POSITIVE_INFINITY));
    case "price_desc":
      return list.sort((a, b) => (b.bestPrice ?? Number.NEGATIVE_INFINITY) - (a.bestPrice ?? Number.NEGATIVE_INFINITY));
    case "name_asc":
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case "name_desc":
      return list.sort((a, b) => b.name.localeCompare(a.name));
    case "price_per_glove_asc":
      return list.sort((a, b) => {
        const ap = a.unitsPerCase && a.casePrice ? a.casePrice / a.unitsPerCase : a.bestPrice ?? Number.POSITIVE_INFINITY;
        const bp = b.unitsPerCase && b.casePrice ? b.casePrice / b.unitsPerCase : b.bestPrice ?? Number.POSITIVE_INFINITY;
        return ap - bp;
      });
    case "newest":
    case "relevance":
    default:
      return list;
  }
}

/**
 * Apply allowlisted /store URL state against an in-memory public catalog snapshot.
 * Unknown facet keys are ignored (cannot invent cache variants — filtering is local).
 */
export function filterPublicCatalogClient(
  dataset: PublicCatalogSlice,
  urlState: StoreCatalogUrlState,
): PublicCatalogSlice {
  if (dataset.catalogUnavailable) {
    return {
      ...dataset,
      products: [],
      total: 0,
      limit: storeCatalogPageLimit(urlState),
    };
  }

  const limit = storeCatalogPageLimit(urlState);
  const page = Math.max(1, urlState.page ?? 1);
  const q = (urlState.q ?? "").trim().toLowerCase();

  let filtered = dataset.products;

  if (q) {
    filtered = filtered.filter((p) => productSearchBlob(p).includes(q));
  }

  if (urlState.brand?.length) {
    filtered = filtered.filter((p) => productMatchesFacet(p, "brand", urlState.brand!));
  }

  if (urlState.category) {
    const cat = urlState.category.toLowerCase();
    filtered = filtered.filter((p) => productSearchBlob(p).includes(cat));
  }

  if (urlState.price_min != null) {
    filtered = filtered.filter((p) => p.bestPrice != null && p.bestPrice >= urlState.price_min!);
  }
  if (urlState.price_max != null) {
    filtered = filtered.filter((p) => p.bestPrice != null && p.bestPrice <= urlState.price_max!);
  }

  for (const key of getAllCatalogFacetKeys()) {
    if (key === "brand") continue;
    const vals = (urlState as Record<string, unknown>)[key];
    if (!Array.isArray(vals) || vals.length === 0) continue;
    filtered = filtered.filter((p) => productMatchesFacet(p, key, vals.map(String)));
  }

  filtered = sortProducts(filtered, urlState.sort ?? "newest");

  const total = filtered.length;
  const from = (page - 1) * limit;
  const pageProducts = filtered.slice(from, from + limit);

  return {
    products: pageProducts,
    total,
    limit,
    brands: dataset.brands,
    facetCounts: dataset.facetCounts,
    facetMeta: dataset.facetMeta,
    catalogUnavailable: false,
  };
}
