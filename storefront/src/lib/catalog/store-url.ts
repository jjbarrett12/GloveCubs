/**
 * URL state for /store — parse/build aligned with CatalogOS `params.ts` + `/store` path.
 */

import type { StoreCatalogUrlState } from "./store-filter-types";
import { normalizeStorefrontFilterParams, parseCatalogSearchParams, buildCatalogSearchString } from "./store-params";

export type { StoreCatalogUrlState } from "./store-filter-types";

export function storeCatalogPageLimit(state?: StoreCatalogUrlState): number {
  const lim = state?.limit;
  return lim != null && lim > 0 ? Math.min(50, lim) : 24;
}

export function parseStoreCatalogParams(sp: Record<string, string | string[] | undefined>): StoreCatalogUrlState {
  const raw = parseCatalogSearchParams(sp);
  const normalized = normalizeStorefrontFilterParams(raw);
  const pageRaw = normalized.page ?? 1;
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  return {
    ...normalized,
    q: (normalized.q ?? "").trim(),
    page,
    limit: storeCatalogPageLimit(normalized),
    sort: normalized.sort ?? "newest",
  };
}

export function buildStoreCatalogHref(state: Partial<StoreCatalogUrlState>): string {
  const s = buildCatalogSearchString(state);
  return s ? `/store${s}` : "/store";
}

export function mergeStoreCatalogHref(
  current: StoreCatalogUrlState,
  patch: Partial<StoreCatalogUrlState>
): string {
  const next: StoreCatalogUrlState = {
    ...current,
    ...patch,
  };
  return buildStoreCatalogHref(next);
}
