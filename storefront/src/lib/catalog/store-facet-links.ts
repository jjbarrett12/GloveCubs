/**
 * Client-safe facet link helpers — mirrors CatalogOS multi vs single facet semantics.
 */

import type { StoreCatalogUrlState } from "./store-filter-types";
import type { StoreFacetCounts } from "./store-filter-types";
import type { StoreFacetMeta } from "./store-products";
import {
  getCustomerFacingCatalogFacetKeys,
  isCustomerFacingFacetKey,
  GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS,
} from "./catalog-facet-registry";
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

const UNIVERSAL_FACET_ORDER = [
  "material",
  "grade",
  "size",
  "color",
  "units_per_case",
  "cases_per_pallet",
  "pallet_pricing_available",
  "certifications",
  "industries",
  "uses",
  "protection_tags",
  "thickness_mil",
  "powder",
  "texture",
  "cuff_style",
  "cut_level_ansi",
  "coating",
  "liner",
  "gauge",
] as const;

const DISPOSABLE_FACET_ORDER = [
  "material",
  "grade",
  "thickness_mil",
  "powder",
  "texture",
  "size",
  "color",
  "units_per_case",
  "cases_per_pallet",
  "pallet_pricing_available",
  "certifications",
  "industries",
  "uses",
  "protection_tags",
  "cuff_style",
  "hand_orientation",
  "sterility",
] as const;

const REUSABLE_FACET_ORDER = [
  "protection_tags",
  "cut_level_ansi",
  "material",
  "coating",
  "liner",
  "gauge",
  "texture",
  "cuff_style",
  "size",
  "units_per_case",
  "cases_per_pallet",
  "pallet_pricing_available",
  "certifications",
  "industries",
  "uses",
  "puncture_level",
  "abrasion_level",
  "flame_resistant",
  "arc_rating",
  "warm_cold_weather",
] as const;

/** Category-aware facet sidebar order (brand + price range are separate UI blocks). */
export function getFacetOrderForStoreCategory(category?: string | null): readonly string[] {
  if (category === "disposable_gloves") return DISPOSABLE_FACET_ORDER;
  if (category === "reusable_work_gloves") return REUSABLE_FACET_ORDER;
  return UNIVERSAL_FACET_ORDER;
}

/** Keys to render in sidebar (union of registry + any key that has counts). */
export function orderedFacetKeysForUi(
  counts: Record<string, { value: string; count: number }[]>,
  category?: string | null
): string[] {
  const preferred = getFacetOrderForStoreCategory(category);
  const keys = new Set(getCustomerFacingCatalogFacetKeys());
  const withData = preferred.filter((k) => keys.has(k) && (counts[k]?.length ?? 0) > 0);
  const rest = Array.from(keys).filter(
    (k) => !withData.includes(k) && (counts[k]?.length ?? 0) > 0 && isCustomerFacingFacetKey(k)
  );
  rest.sort();
  return [...withData, ...rest].filter((k) => k !== "brand" && isCustomerFacingFacetKey(k));
}

/** Sidebar sections grouped by attribute_definitions.display_group when present. */
export function facetKeysGroupedForUi(
  counts: StoreFacetCounts,
  meta: StoreFacetMeta,
  category?: string | null
): { groupLabel: string; keys: string[] }[] {
  const keys = orderedFacetKeysForUi(counts, category);
  const byGroup = new Map<string, string[]>();
  for (const key of keys) {
    const label = meta[key]?.displayGroup?.trim() || "Product specifications";
    const bucket = byGroup.get(label) ?? [];
    bucket.push(key);
    byGroup.set(label, bucket);
  }
  const preferredOrder = ["Product specifications", "Use & environment", "Compliance", "Physical"];
  const out: { groupLabel: string; keys: string[] }[] = [];
  for (const g of preferredOrder) {
    const k = byGroup.get(g);
    if (k?.length) {
      out.push({ groupLabel: g, keys: k });
      byGroup.delete(g);
    }
  }
  for (const [groupLabel, groupKeys] of Array.from(byGroup.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push({ groupLabel, keys: groupKeys });
  }
  return out;
}

export function hiddenFieldsPreservingFilters(
  state: StoreCatalogUrlState,
  options?: { resetPage?: boolean }
): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  const resetPage = options?.resetPage !== false;
  for (const key of getCustomerFacingCatalogFacetKeys()) {
    const v = (state as Record<string, unknown>)[key];
    if (Array.isArray(v) && v.length) out.push({ name: key, value: v.join(",") });
  }
  if (state.price_min != null) out.push({ name: "price_min", value: String(state.price_min) });
  if (state.price_max != null) out.push({ name: "price_max", value: String(state.price_max) });
  if (state.category) out.push({ name: "category", value: state.category });
  if (state.sort) out.push({ name: "sort", value: state.sort });
  if (state.limit != null && state.limit !== 24) out.push({ name: "limit", value: String(state.limit) });
  if (!resetPage && state.page != null && state.page > 1) {
    out.push({ name: "page", value: String(state.page) });
  }
  return out;
}
