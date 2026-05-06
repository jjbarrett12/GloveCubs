/**
 * URL ⇄ filter params — mirror of `catalogos/src/lib/catalog/params.ts`.
 */

import type { StorefrontFilterParams } from "./store-filter-types";
import { getAllCatalogFacetKeys } from "./catalog-facet-registry";

function parseArrayParam(v: string | null): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseNum(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function normalizeStorefrontFilterParams(params: StorefrontFilterParams): StorefrontFilterParams {
  const merged = Array.from(
    new Set(
      [...(params.certifications ?? []), ...(params.compliance_certifications ?? [])]
        .map((s) => String(s).trim())
        .filter(Boolean)
    )
  );
  return {
    ...params,
    certifications: merged.length ? merged : params.certifications,
    compliance_certifications: undefined,
  };
}

export function parseCatalogSearchParams(
  searchParams: Record<string, string | string[] | undefined>
): StorefrontFilterParams {
  const get = (key: string) => {
    const v = searchParams[key];
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  };
  const facetKeys = getAllCatalogFacetKeys();
  const fromFacets = {} as Record<string, string[]>;
  for (const key of facetKeys) {
    fromFacets[key] = parseArrayParam(get(key));
  }
  const legacyCompliance = parseArrayParam(get("compliance_certifications"));
  if (legacyCompliance.length) {
    const cur = fromFacets.certifications ?? [];
    fromFacets.certifications = Array.from(
      new Set([...cur, ...legacyCompliance].map((s) => s.trim()).filter(Boolean))
    );
  }
  const sortRaw = get("sort");
  const allowedSort = new Set([
    "relevance",
    "price_asc",
    "price_desc",
    "newest",
    "price_per_glove_asc",
    "name_asc",
    "name_desc",
  ]);
  const sort = (sortRaw && allowedSort.has(sortRaw) ? sortRaw : "newest") as StorefrontFilterParams["sort"];
  return {
    ...fromFacets,
    category: get("category") ?? undefined,
    price_min: parseNum(get("price_min")),
    price_max: parseNum(get("price_max")),
    q: get("q") ?? undefined,
    sort: sort as StorefrontFilterParams["sort"],
    page: parseNum(get("page")) ?? 1,
    limit: parseNum(get("limit")) ?? 24,
    industry_quick: get("industry_quick") ?? undefined,
  } as StorefrontFilterParams;
}

export function buildCatalogSearchString(
  params: Partial<StorefrontFilterParams>,
  overrides?: Partial<StorefrontFilterParams>
): string {
  const p = { ...params, ...overrides };
  const q = new URLSearchParams();
  if (p.category) q.set("category", p.category);
  const arrayKeys = getAllCatalogFacetKeys() as (keyof StorefrontFilterParams)[];
  for (const key of arrayKeys) {
    const val = p[key];
    if (Array.isArray(val) && val.length) q.set(String(key), val.join(","));
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
