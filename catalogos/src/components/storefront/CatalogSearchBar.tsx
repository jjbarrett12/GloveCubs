"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildCatalogSearchString } from "@/lib/catalog/params";
import type { StorefrontFilterParams } from "@/lib/catalog/types";

interface CatalogSearchBarProps {
  basePath: string;
  selectedParams: StorefrontFilterParams;
}

export function CatalogSearchBar({ basePath, selectedParams }: CatalogSearchBarProps) {
  const router = useRouter();
  const [q, setQ] = useState(selectedParams.q ?? "");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = q.trim();
    const url =
      basePath +
      buildCatalogSearchString(selectedParams, {
        q: next || undefined,
        page: 1,
        sort: next ? "relevance" : selectedParams.sort,
      });
    router.push(url);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full max-w-xl flex-col gap-2 sm:flex-row sm:items-center"
      role="search"
      aria-label="Search catalog"
    >
      <label htmlFor="catalog-search-q" className="sr-only">
        Search products
      </label>
      <input
        id="catalog-search-q"
        type="search"
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, SKU, or brand…"
        autoComplete="off"
        className="h-10 min-h-[44px] flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="submit"
        className="h-10 min-h-[44px] shrink-0 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Search
      </button>
    </form>
  );
}
