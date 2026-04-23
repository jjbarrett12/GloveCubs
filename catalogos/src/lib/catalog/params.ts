/**
 * Parse URL searchParams into StorefrontFilterParams.
 * Shared between API routes and server-rendered catalog pages.
 */

import type { StorefrontFilterParams } from "./types";
import { getAllFilterableFacetKeys } from "@/lib/product-types";

function parseArrayParam(v: string | null): string[] {
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseNum(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function parseCatalogSearchParams(searchParams: Record<string, string | string[] | undefined>): StorefrontFilterParams {
  const get = (key: string) => {
    const v = searchParams[key];
    return Array.isArray(v) ? v[0] ?? null : (v ?? null);
  };
  const facetKeys = getAllFilterableFacetKeys();
  const fromFacets = {} as Record<string, string[]>;
  for (const key of facetKeys) {
    fromFacets[key] = parseArrayParam(get(key));
  }
  return {
    ...fromFacets,
    category: get("category") ?? undefined,
    price_min: parseNum(get("price_min")),
    price_max: parseNum(get("price_max")),
    q: get("q") ?? undefined,
    sort: (get("sort") as StorefrontFilterParams["sort"]) ?? "newest",
    page: parseNum(get("page")) ?? 1,
    limit: parseNum(get("limit")) ?? 24,
    industry_quick: get("industry_quick") ?? undefined,
  } as StorefrontFilterParams;
}

/** Build URL search string from filter params (for links). */
export function buildCatalogSearchString(params: Partial<StorefrontFilterParams>, overrides?: Partial<StorefrontFilterParams>): string {
  const p = { ...params, ...overrides };
  const q = new URLSearchParams();
  if (p.category) q.set("category", p.category);
  const arrayKeys = getAllFilterableFacetKeys() as (keyof StorefrontFilterParams)[];
  for (const key of arrayKeys) {
    const val = p[key];
    if (Array.isArray(val) && val.length) q.set(key, val.join(","));
  }
  if (p.price_min != null) q.set("price_min", String(p.price_min));
  if (p.price_max != null) q.set("price_max", String(p.price_max));
  if (p.q) q.set("q", p.q);
  if (p.sort) q.set("sort", p.sort);
  if (p.page != null && p.page > 1) q.set("page", String(p.page));
  if (p.limit != null && p.limit !== 24) q.set("limit", String(p.limit));
  if (p.industry_quick) q.set("industry_quick", p.industry_quick);
  const s = q.toString();
  return s ? `?${s}` : "";
}
