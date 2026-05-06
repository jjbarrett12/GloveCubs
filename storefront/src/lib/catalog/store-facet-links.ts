/**
 * Client-safe facet link helpers — mirrors CatalogOS multi vs single facet semantics.
 */

import type { StoreCatalogUrlState } from "./store-filter-types";
import { getAllCatalogFacetKeys } from "./catalog-facet-registry";
import { GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS } from "./catalog-facet-registry";
import { mergeStoreCatalogHref } from "./store-url";

export function isFacetMultiSelect(key: string): boolean {
  return (GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS as readonly string[]).includes(key);
}

function currentFacetValues(state: StoreCatalogUrlState, key: string): string[] {
  const raw = (state as Record<string, unknown>)[key];
  return Array.isArray(raw) ? raw.map((x) => String(x).trim()).filter(Boolean) : [];
}

/** Toggle or replace facet value; resets page to 1 (CatalogOS-style). */
export function facetToggleHref(state: StoreCatalogUrlState, key: string, value: string): string {
  const multi = isFacetMultiSelect(key);
  const cur = currentFacetValues(state, key);
  const patch: Record<string, unknown> = { page: 1 };
  if (multi) {
    const i = cur.indexOf(value);
    const next = i >= 0 ? cur.filter((v) => v !== value) : [...cur, value];
    patch[key] = next;
    return mergeStoreCatalogHref(state, patch as Partial<StoreCatalogUrlState>);
  }
  const active = cur.length === 1 && cur[0] === value;
  patch[key] = active ? [] : [value];
  return mergeStoreCatalogHref(state, patch as Partial<StoreCatalogUrlState>);
}

export function facetValueSelected(state: StoreCatalogUrlState, key: string, value: string): boolean {
  return currentFacetValues(state, key).includes(value);
}

/** Keys to render in sidebar (union of registry + any key that has counts). */
export function orderedFacetKeysForUi(counts: Record<string, { value: string; count: number }[]>): string[] {
  const preferred = [
    "material",
    "size",
    "color",
    "thickness_mil",
    "powder",
    "grade",
    "industries",
    "certifications",
    "protection_tags",
    "uses",
  ];
  const keys = new Set(getAllCatalogFacetKeys());
  const withData = preferred.filter((k) => keys.has(k) && (counts[k]?.length ?? 0) > 0);
  const rest = Array.from(keys).filter((k) => !withData.includes(k) && (counts[k]?.length ?? 0) > 0);
  rest.sort();
  return [...withData, ...rest].filter((k) => k !== "brand");
}

export function hiddenFieldsPreservingFilters(
  state: StoreCatalogUrlState,
  options?: { resetPage?: boolean }
): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  const resetPage = options?.resetPage !== false;
  for (const key of getAllCatalogFacetKeys()) {
    const v = (state as Record<string, unknown>)[key];
    if (Array.isArray(v) && v.length) out.push({ name: key, value: v.join(",") });
  }
  if (state.price_min != null) out.push({ name: "price_min", value: String(state.price_min) });
  if (state.price_max != null) out.push({ name: "price_max", value: String(state.price_max) });
  if (state.category) out.push({ name: "category", value: state.category });
  if (state.industry_quick) out.push({ name: "industry_quick", value: state.industry_quick });
  if (state.sort) out.push({ name: "sort", value: state.sort });
  if (state.limit != null && state.limit !== 24) out.push({ name: "limit", value: String(state.limit) });
  if (!resetPage && state.page != null && state.page > 1) {
    out.push({ name: "page", value: String(state.page) });
  }
  return out;
}
