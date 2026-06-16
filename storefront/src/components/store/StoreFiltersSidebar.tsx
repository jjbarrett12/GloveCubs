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
  facetKeysGroupedForUi,
  hiddenFieldsPreservingFilters,
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

function FacetSectionBlock({
  facetKey,
  rows,
  urlState,
  facetMeta,
  dense,
  onNavigate,
}: {
  facetKey: string;
  rows: { value: string; count: number; label?: string }[];
  urlState: StoreCatalogUrlState;
  facetMeta: StoreFacetMeta;
  dense?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <details
      open={!dense}
      className="rounded-lg border border-white/10 bg-[#111]/90 [&_summary]:marker:text-white/40"
    >
      <summary className="cursor-pointer select-none px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[#f06232]">
        {facetSectionTitle(facetKey, facetMeta)}
        <span className="ml-1 font-normal normal-case text-white/40">({rows.length})</span>
      </summary>
      <div className="max-h-52 space-y-0 overflow-y-auto overscroll-y-contain border-t border-white/5 px-2 py-2">
        {rows.map((row) => {
          const selected = facetValueSelected(urlState, facetKey, row.value);
          return (
            <Link
              key={`${facetKey}:${row.value}`}
              href={facetToggleHref(urlState, facetKey, row.value)}
              className={`mb-0.5 flex min-h-9 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[12px] ${
                selected ? "bg-[#f06232]/15 font-medium text-[#f06232]" : "text-white/75 hover:bg-white/5 hover:text-white"
              }`}
              onClick={() => onNavigate?.()}
            >
              <span className="min-w-0 truncate" title={row.label ?? row.value}>
                {row.label ?? row.value}
              </span>
              <span className="shrink-0 tabular-nums text-[11px] text-white/40">{row.count}</span>
            </Link>
          );
        })}
      </div>
    </details>
  );
}

export function StoreFiltersSidebar({ urlState, brands, facetCounts, facetMeta, dense, onNavigate }: Props) {
  const pad = dense ? "pr-1" : "pr-2";
  const hiddenForSearch = hiddenFieldsPreservingFilters(urlState, { resetPage: true });
  const facetGroups = facetKeysGroupedForUi(facetCounts, facetMeta, urlState.category);

  return (
    <div className={`space-y-4 ${pad}`}>
      <section className="rounded-lg border border-white/10 bg-[#111]/90 p-3">
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#f06232]">Search</h3>
        <form action="/store" method="get" className="flex flex-col gap-2">
          <Input
            name="q"
            defaultValue={urlState.q ?? ""}
            placeholder="Style, SKU, brand, ANSI, mil…"
            className="h-10 border-white/15 bg-black/40 text-sm text-white placeholder:text-white/40"
            aria-label="Search catalog"
          />
          <input type="hidden" name="page" value="1" />
          {hiddenForSearch.map((h) => (
            <input key={h.name} type="hidden" name={h.name} value={h.value} />
          ))}
          <Button type="submit" size="sm" className="min-h-10 w-full bg-[#f06232] text-white hover:bg-[#f06232]">
            Apply search
          </Button>
        </form>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#111]/90 p-3">
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#f06232]">Brand</h3>
        <div className="max-h-48 space-y-0 overflow-y-auto overscroll-y-contain pr-1">
          <Link
            href={mergeStoreCatalogHref(urlState, { brand: [], page: 1 })}
            className={`mb-1 flex min-h-9 items-center rounded-md px-2 py-1.5 text-[13px] font-medium ${
              !(urlState.brand && urlState.brand.length)
                ? "bg-[#f06232]/20 text-[#f06232]"
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
                className={`mb-0.5 flex min-h-9 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] ${
                  selected ? "bg-[#f06232]/20 font-semibold text-[#f06232]" : "text-white/80 hover:bg-white/5 hover:text-white"
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

      {facetGroups.map((group) => (
        <div key={group.groupLabel} className="space-y-2">
          <p className="px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">{group.groupLabel}</p>
          {group.keys.map((key) => {
            const rows = facetCounts[key] ?? [];
            if (rows.length === 0) return null;
            return (
              <FacetSectionBlock
                key={key}
                facetKey={key}
                rows={rows}
                urlState={urlState}
                facetMeta={facetMeta}
                dense={dense}
                onNavigate={onNavigate}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
