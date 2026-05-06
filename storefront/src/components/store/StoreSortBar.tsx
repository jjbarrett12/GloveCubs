"use client";

import Link from "next/link";
import { mergeStoreCatalogHref } from "@/lib/catalog/store-url";
import type { StoreCatalogUrlState } from "@/lib/catalog/store-url";

export function StoreSortBar({ urlState, total }: { urlState: StoreCatalogUrlState; total: number }) {
  const sort = urlState.sort ?? "newest";

  return (
    <div className="flex flex-col gap-3 border-b border-white/10 pb-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-white/65">
        <span className="font-semibold text-white">{total}</span> products
      </p>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <span className="w-full text-[11px] font-semibold uppercase tracking-wide text-white/45 sm:w-auto">Sort</span>
        <Link
          href={mergeStoreCatalogHref(urlState, { sort: "newest", page: 1 })}
          className={`rounded-md px-2 py-1 text-[11px] font-semibold sm:px-2.5 sm:text-xs ${
            sort === "newest" ? "bg-[#FF5500] text-white" : "text-white/70 hover:text-[#FF5500]"
          }`}
        >
          Newest
        </Link>
        <Link
          href={mergeStoreCatalogHref(urlState, { sort: "name_asc", page: 1 })}
          className={`rounded-md px-2 py-1 text-[11px] font-semibold sm:px-2.5 sm:text-xs ${
            sort === "name_asc" ? "bg-[#FF5500] text-white" : "text-white/70 hover:text-[#FF5500]"
          }`}
        >
          Name A–Z
        </Link>
        <Link
          href={mergeStoreCatalogHref(urlState, { sort: "name_desc", page: 1 })}
          className={`rounded-md px-2 py-1 text-[11px] font-semibold sm:px-2.5 sm:text-xs ${
            sort === "name_desc" ? "bg-[#FF5500] text-white" : "text-white/70 hover:text-[#FF5500]"
          }`}
        >
          Name Z–A
        </Link>
        <Link
          href={mergeStoreCatalogHref(urlState, { sort: "price_asc", page: 1 })}
          className={`rounded-md px-2 py-1 text-[11px] font-semibold sm:px-2.5 sm:text-xs ${
            sort === "price_asc" ? "bg-[#FF5500] text-white" : "text-white/70 hover:text-[#FF5500]"
          }`}
        >
          Price ↑
        </Link>
        <Link
          href={mergeStoreCatalogHref(urlState, { sort: "price_desc", page: 1 })}
          className={`rounded-md px-2 py-1 text-[11px] font-semibold sm:px-2.5 sm:text-xs ${
            sort === "price_desc" ? "bg-[#FF5500] text-white" : "text-white/70 hover:text-[#FF5500]"
          }`}
        >
          Price ↓
        </Link>
        {(urlState.q ?? "").trim() ? (
          <Link
            href={mergeStoreCatalogHref(urlState, { sort: "relevance", page: 1 })}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold sm:px-2.5 sm:text-xs ${
              sort === "relevance" ? "bg-[#FF5500] text-white" : "text-white/70 hover:text-[#FF5500]"
            }`}
          >
            Relevance
          </Link>
        ) : null}
      </div>
    </div>
  );
}
