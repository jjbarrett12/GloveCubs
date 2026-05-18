"use client";

import Link from "next/link";
import { mergeStoreCatalogHref } from "@/lib/catalog/store-url";
import type { StoreCatalogUrlState } from "@/lib/catalog/store-url";
import { cn } from "@/lib/utils";

const SORT_OPTIONS: { value: StoreCatalogUrlState["sort"]; label: string; when?: (s: StoreCatalogUrlState) => boolean }[] = [
  { value: "newest", label: "Newest" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
  { value: "relevance", label: "Relevance", when: (s) => Boolean((s.q ?? "").trim()) },
];

function sortPillClass(active: boolean): string {
  return cn(
    "inline-flex min-h-9 items-center rounded-md px-2.5 py-1 text-[11px] font-semibold sm:text-xs",
    active ? "bg-[#f06232] text-white" : "text-white/70 hover:bg-white/5 hover:text-[#f06232]"
  );
}

export function StoreSortBar({ urlState, total }: { urlState: StoreCatalogUrlState; total: number }) {
  const sort = urlState.sort ?? "newest";
  const visible = SORT_OPTIONS.filter((o) => !o.when || o.when(urlState));

  return (
    <div className="flex flex-col gap-3 border-b border-white/10 pb-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-white/65">
        <span className="font-bold tabular-nums text-white">{total}</span>
        <span className="text-white/50"> listings</span>
      </p>
      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
        <span className="mr-1 w-full text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 sm:w-auto">Sort</span>
        {visible.map((o) => (
          <Link
            key={o.value ?? "newest"}
            href={mergeStoreCatalogHref(urlState, { sort: o.value, page: 1 })}
            className={sortPillClass(sort === o.value)}
          >
            {o.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
