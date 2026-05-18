"use client";

import * as React from "react";
import Link from "next/link";
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
      <aside className="hidden w-[288px] shrink-0 lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-6.5rem)] overflow-y-auto overflow-x-hidden overscroll-y-contain rounded-lg border border-white/[0.06] bg-[#0c0c0c]/80 pr-1">
          <StoreFiltersSidebar urlState={urlState} brands={brands} facetCounts={facetCounts} facetMeta={facetMeta} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center gap-2 lg:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10 border-[#f06232]/50 text-white hover:bg-[#f06232]/10"
            onClick={() => setMobileFiltersOpen(true)}
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Filters &amp; specs
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
            className="absolute left-0 top-0 flex h-[100dvh] w-[min(100vw,22rem)] flex-col border-r border-white/10 bg-[#0a0a0a] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="store-mobile-filters-title"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 id="store-mobile-filters-title" className="text-base font-semibold text-white">
                Procurement filters
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
            <div className="flex shrink-0 gap-2 border-t border-white/10 bg-[#0a0a0a] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button
                type="button"
                className="min-h-11 flex-1 bg-[#f06232] font-semibold text-white hover:bg-[#e5582d]"
                onClick={() => setMobileFiltersOpen(false)}
              >
                View results
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 border-white/20 text-white hover:bg-white/10"
                asChild
              >
                <Link href="/store" onClick={() => setMobileFiltersOpen(false)}>
                  Clear all
                </Link>
              </Button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
