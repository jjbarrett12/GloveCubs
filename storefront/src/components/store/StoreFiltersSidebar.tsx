"use client";

import Link from "next/link";
import { mergeStoreCatalogHref } from "@/lib/catalog/store-url";
import type { StoreCatalogUrlState } from "@/lib/catalog/store-url";
import type { StoreBrandOption, StoreFacetMeta } from "@/lib/catalog/store-products";
import type { StoreFacetCounts } from "@/lib/catalog/store-filter-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  facetToggleHref,
  facetValueSelected,
  hiddenFieldsPreservingFilters,
  orderedFacetKeysForUi,
} from "@/lib/catalog/store-facet-links";

type Props = {
  urlState: StoreCatalogUrlState;
  brands: StoreBrandOption[];
  facetCounts: StoreFacetCounts;
  facetMeta: StoreFacetMeta;
  dense?: boolean;
  onNavigate?: () => void;
};

function facetSectionTitle(key: string, meta: StoreFacetMeta): string {
  return meta[key]?.label ?? key.replace(/_/g, " ");
}

export function StoreFiltersSidebar({ urlState, brands, facetCounts, facetMeta, dense, onNavigate }: Props) {
  const pad = dense ? "pr-1" : "pr-2";
  const hiddenForSearch = hiddenFieldsPreservingFilters(urlState, { resetPage: true });

  return (
    <div className={`space-y-4 ${pad}`}>
      <section className="rounded-lg border border-white/10 bg-[#111]/90 p-3">
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#FF7A00]">Search</h3>
        <form action="/store" method="get" className="flex flex-col gap-2">
          <Input
            name="q"
            defaultValue={urlState.q ?? ""}
            placeholder="Style, SKU, name…"
            className="h-9 border-white/15 bg-black/40 text-sm text-white placeholder:text-white/40"
            aria-label="Search catalog"
          />
          <input type="hidden" name="page" value="1" />
          {hiddenForSearch.map((h) => (
            <input key={h.name} type="hidden" name={h.name} value={h.value} />
          ))}
          <Button type="submit" size="sm" className="w-full bg-[#FF7A00] text-white hover:bg-[#e56e00]">
            Apply
          </Button>
        </form>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#111]/90 p-3">
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#FF7A00]">Brand</h3>
        <div className="max-h-48 space-y-0 overflow-y-auto overscroll-y-contain pr-1">
          <Link
            href={mergeStoreCatalogHref(urlState, { brand: [], page: 1 })}
            className={`mb-1 block rounded-md px-2 py-1.5 text-[13px] font-medium ${
              !(urlState.brand && urlState.brand.length)
                ? "bg-[#FF7A00]/20 text-[#FF7A00]"
                : "text-white/80 hover:bg-white/5 hover:text-white"
            }`}
            onClick={() => onNavigate?.()}
          >
            All brands
          </Link>
          {brands.map((b) => {
            const selected = facetValueSelected(urlState, "brand", b.id);
            return (
              <Link
                key={b.id}
                href={facetToggleHref(urlState, "brand", b.id)}
                className={`mb-0.5 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] ${
                  selected ? "bg-[#FF7A00]/20 font-semibold text-[#FF7A00]" : "text-white/80 hover:bg-white/5 hover:text-white"
                }`}
                onClick={() => onNavigate?.()}
              >
                <span className="min-w-0 truncate">{b.name}</span>
                <span className="shrink-0 text-[11px] text-white/45">({b.productCount})</span>
              </Link>
            );
          })}
        </div>
      </section>

      {orderedFacetKeysForUi(facetCounts).map((key) => {
        const rows = facetCounts[key] ?? [];
        if (rows.length === 0) return null;
        return (
          <details
            key={key}
            open={!dense}
            className="rounded-lg border border-white/10 bg-[#111]/90 [&_summary]:marker:text-white/40"
          >
            <summary className="cursor-pointer select-none px-3 py-2.5 text-[12px] font-bold uppercase tracking-wide text-[#FF7A00]">
              {facetSectionTitle(key, facetMeta)}
              <span className="ml-1 font-normal normal-case text-white/40">({rows.length})</span>
            </summary>
            <div className="max-h-52 space-y-0 overflow-y-auto overscroll-y-contain border-t border-white/5 px-2 py-2">
              {rows.map((row) => {
                const selected = facetValueSelected(urlState, key, row.value);
                return (
                  <Link
                    key={`${key}:${row.value}`}
                    href={facetToggleHref(urlState, key, row.value)}
                    className={`mb-0.5 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[12px] ${
                      selected ? "bg-[#FF7A00]/15 font-medium text-[#FF7A00]" : "text-white/75 hover:bg-white/5 hover:text-white"
                    }`}
                    onClick={() => onNavigate?.()}
                  >
                    <span className="min-w-0 truncate" title={row.value}>
                      {row.label ?? row.value}
                    </span>
                    <span className="shrink-0 text-[11px] text-white/40">{row.count}</span>
                  </Link>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
