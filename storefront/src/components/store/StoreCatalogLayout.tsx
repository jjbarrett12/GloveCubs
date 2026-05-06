"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StoreCatalogUrlState } from "@/lib/catalog/store-url";
import type { StoreBrandOption, StoreFacetMeta } from "@/lib/catalog/store-products";
import type { StoreFacetCounts } from "@/lib/catalog/store-filter-types";
import { StoreFiltersSidebar } from "@/components/store/StoreFiltersSidebar";

type Props = {
  urlState: StoreCatalogUrlState;
  brands: StoreBrandOption[];
  facetCounts: StoreFacetCounts;
  facetMeta: StoreFacetMeta;
  children: React.ReactNode;
};

/**
 * Dense B2B shop shell: fixed-width filter column + main (mirrors legacy .shop-layout / CatalogOS split).
 */
export function StoreCatalogLayout({ urlState, brands, facetCounts, facetMeta, children }: Props) {
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);

  return (
    <div className="mx-auto flex min-w-0 max-w-[1440px] flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
      <aside className="hidden w-[280px] shrink-0 lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-6.5rem)] overflow-y-auto overflow-x-hidden overscroll-y-contain pr-1">
          <StoreFiltersSidebar urlState={urlState} brands={brands} facetCounts={facetCounts} facetMeta={facetMeta} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center gap-2 lg:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[#FF5500]/50 text-white hover:bg-[#FF5500]/10"
            onClick={() => setMobileFiltersOpen(true)}
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Filters
          </Button>
        </div>

        {children}
      </div>

      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-[1200] lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/65"
            aria-label="Close filters"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <aside
            className="absolute left-0 top-0 flex h-[100dvh] w-[min(100vw,20rem)] flex-col border-r border-white/10 bg-[#0a0a0a] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="store-mobile-filters-title"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 id="store-mobile-filters-title" className="text-base font-semibold text-white">
                Filters
              </h2>
              <Button type="button" variant="ghost" size="sm" className="text-white/80" onClick={() => setMobileFiltersOpen(false)}>
                Close
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3">
              <StoreFiltersSidebar
                urlState={urlState}
                brands={brands}
                facetCounts={facetCounts}
                facetMeta={facetMeta}
                dense
                onNavigate={() => setMobileFiltersOpen(false)}
              />
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
