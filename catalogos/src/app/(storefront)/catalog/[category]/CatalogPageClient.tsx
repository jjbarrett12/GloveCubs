"use client";

import { useEffect } from "react";
import Link from "next/link";
import { trackConversionEvent } from "@/lib/conversion/analytics";
import { buildCatalogSearchString } from "@/lib/catalog/params";
import type { StorefrontFilterParams } from "@/lib/catalog/types";
import type { LiveProductItem } from "@/lib/catalog/types";
import type { FacetCounts } from "@/lib/catalog/types";
import type { IndustryKey } from "@/lib/conversion";
import type { ProductEnrichment } from "./ProductGrid";
import { FilterSidebar } from "./FilterSidebar";
import { FilterChips } from "./FilterChips";
import { ProductGrid } from "./ProductGrid";
import { IndustryQuickSelect } from "@/components/storefront/IndustryQuickSelect";
import { HelpMeChoosePanel } from "@/components/storefront/HelpMeChoosePanel";
import { CategoryAuthorityBanner } from "@/components/storefront/CategoryAuthorityBanner";
import { CatalogSearchBar } from "@/components/storefront/CatalogSearchBar";

interface FacetDef {
  attribute_key: string;
  label: string;
  display_group: string | null;
  sort_order: number;
  cardinality: string;
}

interface CatalogPageClientProps {
  categorySlug: string;
  categoryLabel: string;
  items: LiveProductItem[];
  imageByProductId: Record<string, string>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  facets: FacetCounts;
  priceBounds: { min: number; max: number };
  facetDefinitions: FacetDef[];
  selectedParams: StorefrontFilterParams;
  sortOptions: readonly string[];
  industryKey?: IndustryKey | null;
  enrichedByProductId?: Record<string, ProductEnrichment>;
}

export function CatalogPageClient({
  categorySlug,
  categoryLabel,
  items,
  imageByProductId,
  total,
  page,
  limit,
  totalPages,
  facets,
  priceBounds,
  facetDefinitions,
  selectedParams,
  sortOptions,
  industryKey = null,
  enrichedByProductId = {},
}: CatalogPageClientProps) {
  const basePath = `/catalog/${categorySlug}`;

  const searchQuery = selectedParams.q?.trim() ?? "";
  useEffect(() => {
    if (!searchQuery) return;
    trackConversionEvent("search_used", {
      q: searchQuery,
      category: categorySlug,
      result_count: total,
    });
  }, [searchQuery, categorySlug, total]);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <IndustryQuickSelect
        basePath={basePath}
        selectedParams={selectedParams}
        currentIndustryKey={industryKey}
        className="lg:col-span-full"
      />
      <aside className="w-full shrink-0 lg:w-64 lg:pr-6">
        <FilterSidebar
          basePath={basePath}
          facets={facets}
          facetDefinitions={facetDefinitions}
          selectedParams={selectedParams}
          priceBounds={priceBounds}
        />
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold capitalize sm:text-2xl">{categoryLabel}</h1>
              <HelpMeChoosePanel catalogBasePath={basePath} />
            </div>
            <CatalogSearchBar basePath={basePath} selectedParams={selectedParams} />
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{total} products</span>
            <SortSelect
              basePath={basePath}
              selectedParams={selectedParams}
              sortOptions={sortOptions}
            />
          </div>
        </div>

        <FilterChips basePath={basePath} selectedParams={selectedParams} />

        <CategoryAuthorityBanner className="mb-4" />

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-16 text-center text-muted-foreground">
            {searchQuery ? (
              <>
                <p className="font-medium text-foreground">No results for &quot;{searchQuery}&quot;</p>
                <p className="mt-2 text-sm">Try a shorter term, check spelling, or clear filters.</p>
              </>
            ) : (
              <p>No products match your filters. Try adjusting or clearing filters.</p>
            )}
          </div>
        ) : (
          <>
            <ProductGrid items={items} imageByProductId={imageByProductId} enrichedByProductId={enrichedByProductId} />
            {totalPages > 1 && (
              <Pagination basePath={basePath} selectedParams={selectedParams} page={page} totalPages={totalPages} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SortSelect({
  basePath,
  selectedParams,
  sortOptions,
}: {
  basePath: string;
  selectedParams: StorefrontFilterParams;
  sortOptions: readonly string[];
}) {
  const current = selectedParams.sort ?? "newest";
  return (
    <select
      value={current}
      onChange={(e) => {
        const sort = e.target.value as StorefrontFilterParams["sort"];
        const url = basePath + buildCatalogSearchString(selectedParams, { sort, page: 1 });
        window.location.href = url;
      }}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
    >
      {sortOptions.map((s) => (
        <option key={s} value={s}>
          {s === "newest"
            ? "Newest"
            : s === "price_asc"
              ? "Price (low to high)"
              : s === "price_desc"
                ? "Price (high to low)"
                : s === "price_per_glove_asc"
                  ? "Price per glove (low to high)"
                  : s === "relevance"
                    ? "Relevance (search)"
                    : s}
        </option>
      ))}
    </select>
  );
}

function Pagination({
  basePath,
  selectedParams,
  page,
  totalPages,
}: {
  basePath: string;
  selectedParams: StorefrontFilterParams;
  page: number;
  totalPages: number;
}) {
  const links = [];
  if (page > 1) {
    links.push(
      <Link key="prev" href={basePath + buildCatalogSearchString(selectedParams, { page: page - 1 })} className="text-primary hover:underline">
        ← Previous
      </Link>
    );
  }
  links.push(
    <span key="info" className="text-muted-foreground text-sm">
      Page {page} of {totalPages}
    </span>
  );
  if (page < totalPages) {
    links.push(
      <Link key="next" href={basePath + buildCatalogSearchString(selectedParams, { page: page + 1 })} className="text-primary hover:underline">
        Next →
      </Link>
    );
  }
  return (
    <nav className="mt-8 flex items-center justify-center gap-4 border-t border-border pt-6">
      {links}
    </nav>
  );
}
