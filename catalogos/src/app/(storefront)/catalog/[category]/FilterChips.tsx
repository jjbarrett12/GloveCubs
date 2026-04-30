"use client";

import Link from "next/link";
import { buildCatalogSearchString } from "@/lib/catalog/params";
import type { StorefrontFilterParams } from "@/lib/catalog/types";
import { Badge } from "@/components/ui/badge";
import { getAllCatalogFacetKeys } from "@/lib/product-types";

const FILTER_KEYS = getAllCatalogFacetKeys();

interface FilterChipsProps {
  basePath: string;
  selectedParams: StorefrontFilterParams;
}

function formatLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function FilterChips({ basePath, selectedParams }: FilterChipsProps) {
  const chips: { key: string; value: string; label: string }[] = [];
  for (const key of FILTER_KEYS) {
    const arr = selectedParams[key as keyof StorefrontFilterParams];
    if (!Array.isArray(arr) || arr.length === 0) continue;
    for (const value of arr) {
      chips.push({ key, value, label: `${formatKey(key)}: ${formatLabel(value)}` });
    }
  }
  if (selectedParams.price_min != null || selectedParams.price_max != null) {
    const min = selectedParams.price_min ?? 0;
    const max = selectedParams.price_max ?? 0;
    chips.push({ key: "price", value: "range", label: `Price: $${min}–$${max}` });
  }
  const searchQ = selectedParams.q?.trim();
  if (searchQ) {
    chips.push({ key: "_search", value: searchQ, label: `Search: "${searchQ}"` });
  }
  if (chips.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Active:</span>
      {chips.map(({ key, value, label }) => {
        const newParams = { ...selectedParams };
        if (key === "_search") {
          const url =
            basePath +
            buildCatalogSearchString(newParams, {
              q: undefined,
              page: 1,
              sort: newParams.sort === "relevance" ? "newest" : undefined,
            });
          return (
            <Badge key="_search" variant="secondary" className="gap-1 pr-1">
              {label}
              <Link href={url} className="ml-0.5 rounded hover:bg-muted-foreground/20" aria-label={`Remove ${label}`}>
                ×
              </Link>
            </Badge>
          );
        }
        if (key === "price") {
          delete newParams.price_min;
          delete newParams.price_max;
        } else {
          const arr = (newParams[key as keyof StorefrontFilterParams] as string[]) ?? [];
          (newParams as unknown as Record<string, unknown>)[key] = arr.filter((v) => v !== value);
        }
        const url = basePath + buildCatalogSearchString(newParams, { page: 1 });
        return (
          <Badge key={`${key}-${value}`} variant="secondary" className="gap-1 pr-1">
            {label}
            <Link href={url} className="ml-0.5 rounded hover:bg-muted-foreground/20" aria-label={`Remove ${label}`}>
              ×
            </Link>
          </Badge>
        );
      })}
      <Link
        href={basePath}
        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        Clear all
      </Link>
    </div>
  );
}
