"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { mergeStoreCatalogHref } from "@/lib/catalog/store-url";
import type { StoreCatalogUrlState } from "@/lib/catalog/store-url";
import type { StoreBrandOption } from "@/lib/catalog/store-products";
import type { StoreFacetMeta } from "@/lib/catalog/store-products";
import { getAllCatalogFacetKeys } from "@/lib/catalog/catalog-facet-registry";

function removeOneFacetValue(state: StoreCatalogUrlState, key: string, value: string): Partial<StoreCatalogUrlState> {
  const raw = (state as Record<string, unknown>)[key];
  const cur = Array.isArray(raw) ? raw.map(String) : [];
  const next = cur.filter((v) => v !== value);
  return { [key]: next, page: 1 } as Partial<StoreCatalogUrlState>;
}

export function StoreFilterChips({
  urlState,
  brands,
  facetMeta,
}: {
  urlState: StoreCatalogUrlState;
  brands: StoreBrandOption[];
  facetMeta: StoreFacetMeta;
}) {
  const chips: { label: string; href: string }[] = [];

  const qTrim = (urlState.q ?? "").trim();
  if (qTrim) {
    chips.push({
      label: `Search: ${qTrim}`,
      href: mergeStoreCatalogHref(urlState, { q: "", page: 1 }),
    });
  }

  for (const key of getAllCatalogFacetKeys()) {
    const raw = (urlState as Record<string, unknown>)[key];
    if (!Array.isArray(raw) || raw.length === 0) continue;
    const title = facetMeta[key]?.label ?? key.replace(/_/g, " ");
    for (const val of raw.map(String)) {
      const display =
        key === "brand" ? (brands.find((b) => b.id === val)?.name ?? "Brand") : `${title}: ${val}`;
      chips.push({
        label: display,
        href: mergeStoreCatalogHref(urlState, removeOneFacetValue(urlState, key, val)),
      });
    }
  }

  if (urlState.price_min != null || urlState.price_max != null) {
    const lo = urlState.price_min != null ? `$${urlState.price_min}` : "—";
    const hi = urlState.price_max != null ? `$${urlState.price_max}` : "—";
    chips.push({
      label: `Price: ${lo} – ${hi}`,
      href: mergeStoreCatalogHref(urlState, { price_min: undefined, price_max: undefined, page: 1 }),
    });
  }

  if (urlState.category) {
    chips.push({
      label: `Category: ${urlState.category}`,
      href: mergeStoreCatalogHref(urlState, { category: undefined, page: 1 }),
    });
  }

  if (urlState.sort != null && urlState.sort !== "newest") {
    const labels: Record<string, string> = {
      name_asc: "Sort: Name A–Z",
      name_desc: "Sort: Name Z–A",
      price_asc: "Sort: Price low → high",
      price_desc: "Sort: Price high → low",
      relevance: "Sort: Relevance",
      price_per_glove_asc: "Sort: Price per glove",
    };
    chips.push({
      label: labels[urlState.sort] ?? `Sort: ${urlState.sort}`,
      href: mergeStoreCatalogHref(urlState, { sort: "newest", page: 1 }),
    });
  }

  if (!chips.length) return null;

  const clearHref = "/store";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Active</span>
      {chips.map((c) => (
        <Link
          key={c.href + c.label}
          href={c.href}
          className="inline-flex items-center gap-1 rounded-full border border-[#f06232]/40 bg-[#f06232]/10 px-2.5 py-1 text-xs font-medium text-[#f06232] hover:border-[#f06232]/60"
        >
          {c.label}
          <X className="h-3 w-3 opacity-80" aria-hidden />
        </Link>
      ))}
      <Link href={clearHref} className="text-[11px] font-semibold text-white/50 underline-offset-2 hover:text-[#f06232] hover:underline">
        Clear all
      </Link>
    </div>
  );
}
