/**
 * Inbound /store query normalization — strip dead/unknown params so the visible URL matches parsed filter state.
 */

import { getAllCatalogFacetKeys } from "@/lib/catalog/catalog-facet-registry";
import { buildStoreCatalogHref, parseStoreCatalogParams } from "@/lib/catalog/store-url";
import type { StoreCatalogUrlState } from "@/lib/catalog/store-url";

const DEAD_STORE_PARAM_KEYS = new Set([
  "industry",
  "collection",
  "powderFree",
  "latexFree",
  "industry_quick",
]);

function storeQueryAllowlist(): Set<string> {
  return new Set([
    ...getAllCatalogFacetKeys(),
    "category",
    "price_min",
    "price_max",
    "q",
    "sort",
    "page",
    "limit",
    "compliance_certifications",
  ]);
}

function flattenSearchParamValue(v: string | string[] | undefined): string | null {
  if (v === undefined) return null;
  const raw = Array.isArray(v) ? (v[0] ?? null) : v;
  if (raw == null || raw === "") return null;
  return raw;
}

function sortedUrlSearchParamsString(sp: URLSearchParams): string {
  const keys = Array.from(new Set(Array.from(sp.keys()))).sort();
  const out = new URLSearchParams();
  for (const k of keys) {
    for (const v of sp.getAll(k)) out.append(k, v);
  }
  return out.toString();
}

/** Allowlisted keys only from the incoming record (first value per key). */
function allowlistedSearchParams(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const allow = storeQueryAllowlist();
  const u = new URLSearchParams();
  for (const key of Object.keys(sp)) {
    if (!allow.has(key)) continue;
    const val = flattenSearchParamValue(sp[key]);
    if (val != null) u.set(key, val);
  }
  return u;
}

function canonicalQueryStringFromState(state: StoreCatalogUrlState): string {
  const href = buildStoreCatalogHref(state);
  if (!href.startsWith("/store?")) return "";
  return href.slice("/store?".length);
}

/**
 * If the raw URL carries dead/unknown params or differs from the rebuilt canonical query, returns the
 * canonical `/store` href (via {@link buildStoreCatalogHref}). Otherwise null (no redirect).
 */
export function getCanonicalStoreHrefIfNeeded(
  searchParams: Record<string, string | string[] | undefined>
): string | null {
  const allow = storeQueryAllowlist();
  let hasDisallowedKey = false;
  for (const key of Object.keys(searchParams)) {
    if (DEAD_STORE_PARAM_KEYS.has(key)) {
      hasDisallowedKey = true;
      break;
    }
    if (!allow.has(key)) {
      hasDisallowedKey = true;
      break;
    }
  }

  const urlState = parseStoreCatalogParams(searchParams);
  const canonicalHref = buildStoreCatalogHref(urlState);
  const canonQs = canonicalQueryStringFromState(urlState);
  const canonSorted = sortedUrlSearchParamsString(new URLSearchParams(canonQs));

  if (hasDisallowedKey) return canonicalHref;

  const incomingSorted = sortedUrlSearchParamsString(allowlistedSearchParams(searchParams));
  if (incomingSorted !== canonSorted) return canonicalHref;

  return null;
}
