import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listLiveProducts, getFirstImageByProductIds } from "@/lib/catalog/query";
import { getFacetCounts, getPriceBounds } from "@/lib/catalog/facets";
import { getCategoryIdBySlug, loadFacetDefinitionsForCategory } from "@/lib/catalogos/dictionary-service";
import { parseCatalogSearchParams } from "@/lib/catalog/params";
import type { StorefrontFilterParams } from "@/lib/catalog/types";
import {
  enrichCatalogItems,
  sortEnrichedByPricePerGloveAndSlice,
  MAX_FOR_PRICE_PER_GLOVE_SORT,
  type IndustryKey,
  type EnrichedProduct,
} from "@/lib/conversion";
import { INDUSTRY_MAP } from "@/lib/conversion";
import { CatalogPageClient } from "./CatalogPageClient";
import {
  isImplementedProductTypeKey,
  getDisplayNameForProductType,
  getSortValuesForProductType,
  type ProductTypeKey,
} from "@/lib/product-types";

const DEFAULT_LIMIT = 24;

export interface CatalogPageProps {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const label = getDisplayNameForProductType(category);
  const description = `Browse ${label} with faceted filters and request quotes — GloveCubs B2B catalog.`;
  return {
    title: `${label} | GloveCubs Catalog`,
    description,
    alternates: { canonical: `/catalog/${category}` },
    openGraph: {
      title: `${label} | GloveCubs`,
      description,
      type: "website",
      url: `/catalog/${category}`,
    },
    robots: { index: true, follow: true },
  };
}

export default async function CatalogPage({ params, searchParams }: CatalogPageProps) {
  const { category: categorySlug } = await params;
  if (!isImplementedProductTypeKey(categorySlug)) {
    notFound();
  }
  const resolved = await parseCatalogSearchParams(await searchParams);
  const industryKey = (resolved.industry_quick && INDUSTRY_MAP.has(resolved.industry_quick as IndustryKey))
    ? (resolved.industry_quick as IndustryKey)
    : null;
  const industriesFromQuick = industryKey ? INDUSTRY_MAP.get(industryKey)?.filterValues ?? [] : [];
  const paramsWithCategory: StorefrontFilterParams = {
    ...resolved,
    category: resolved.category ?? categorySlug,
    limit: Math.min(50, Math.max(1, resolved.limit ?? DEFAULT_LIMIT)),
    industries: resolved.industries?.length ? resolved.industries : industriesFromQuick.length ? industriesFromQuick : undefined,
  };

  const categoryId = await getCategoryIdBySlug(categorySlug);
  if (!categoryId) notFound();

  const sortByPricePerGlove = resolved.sort === "price_per_glove_asc";
  const fetchLimit = sortByPricePerGlove ? Math.min(MAX_FOR_PRICE_PER_GLOVE_SORT, paramsWithCategory.limit! * 20) : paramsWithCategory.limit!;
  const fetchPage = sortByPricePerGlove ? 1 : paramsWithCategory.page ?? 1;

  const [productsPayload, facets, priceBounds, facetDefs] = await Promise.all([
    listLiveProducts({ ...paramsWithCategory, page: fetchPage, limit: fetchLimit }),
    getFacetCounts(paramsWithCategory),
    getPriceBounds(paramsWithCategory),
    loadFacetDefinitionsForCategory(categoryId),
  ]);

  let items = productsPayload.items;
  let total = productsPayload.total;
  let totalPages = productsPayload.total_pages;
  const page = paramsWithCategory.page ?? 1;
  const limit = paramsWithCategory.limit ?? DEFAULT_LIMIT;

  const enriched = enrichCatalogItems(items, industryKey);
  if (industryKey && !sortByPricePerGlove) {
    enriched.sort((a, b) => (a.recommendedForIndustry === b.recommendedForIndustry ? 0 : a.recommendedForIndustry ? -1 : 1));
  }
  if (sortByPricePerGlove && enriched.length > 0) {
    if (industryKey) {
      enriched.sort((a, b) => {
        if (a.recommendedForIndustry !== b.recommendedForIndustry) return a.recommendedForIndustry ? -1 : 1;
        const pa = a.pricePerGlove.price_per_glove ?? Infinity;
        const pb = b.pricePerGlove.price_per_glove ?? Infinity;
        return pa !== pb ? pa - pb : (a.item.name ?? "").localeCompare(b.item.name ?? "");
      });
    } else {
      sortEnrichedByPricePerGloveAndSlice(enriched, 1, enriched.length);
    }
    const start = (page - 1) * limit;
    const slice = enriched.slice(start, start + limit);
    items = slice.map((e) => e.item);
    total = Math.min(productsPayload.total, enriched.length);
    totalPages = Math.ceil(total / limit) || 1;
  } else {
    items = enriched.map((e) => e.item);
  }

  const productIds = items.map((p) => p.id);
  const imageByProductId = await getFirstImageByProductIds(productIds);

  const facetDefinitions = facetDefs.map((d) => ({
    attribute_key: d.attribute_key,
    label: d.label,
    display_group: d.display_group,
    sort_order: d.sort_order,
    cardinality: d.cardinality,
  }));

  const enrichedMap = new Map(enriched.map((e) => [e.item.id, e]));
  const enrichedForPage: Record<string, { pricePerGlove: EnrichedProduct["pricePerGlove"]; signals: EnrichedProduct["signals"]; industryBadge: string | null; recommendedForIndustry: boolean; authorityBadge: EnrichedProduct["authorityBadge"] }> = {};
  for (const p of items) {
    const e = enrichedMap.get(p.id);
    if (e) enrichedForPage[p.id] = { pricePerGlove: e.pricePerGlove, signals: e.signals, industryBadge: e.industryBadge, recommendedForIndustry: e.recommendedForIndustry, authorityBadge: e.authorityBadge };
  }

  return (
    <CatalogPageClient
      categorySlug={categorySlug}
      categoryLabel={getDisplayNameForProductType(categorySlug)}
      items={items}
      imageByProductId={Object.fromEntries(imageByProductId)}
      total={total}
      page={page}
      limit={limit}
      totalPages={totalPages}
      facets={facets}
      priceBounds={priceBounds}
      facetDefinitions={facetDefinitions}
      selectedParams={{ ...paramsWithCategory, page, industry_quick: industryKey ?? undefined }}
      sortOptions={getSortValuesForProductType(categorySlug as ProductTypeKey)}
      industryKey={industryKey}
      enrichedByProductId={enrichedForPage}
    />
  );
}
