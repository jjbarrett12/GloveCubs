import { DISCOVERY_INTENTS } from "@/config/intents";
import type { StorefrontFilterParams } from "@/lib/catalog/store-filter-types";
import { buildStoreCatalogHref } from "@/lib/catalog/store-url";
import { buildRequestPricingHref, type RequestPricingQueryParams } from "@/lib/discovery/request-pricing-url";

export function isKnownIntentId(intentId: string): boolean {
  return Boolean(intentId && DISCOVERY_INTENTS[intentId]);
}

export function resolveIntentToStoreParams(intentId: string): Partial<StorefrontFilterParams> {
  const def = DISCOVERY_INTENTS[intentId];
  if (!def?.store) return {};
  return { ...def.store };
}

export function resolveIntentToRfqParams(intentId: string): RequestPricingQueryParams {
  const def = DISCOVERY_INTENTS[intentId];
  if (!def?.rfq) return {};
  return { ...def.rfq };
}

export function getStoreHrefForIntent(intentId: string): string {
  const params = resolveIntentToStoreParams(intentId);
  if (!intentId || Object.keys(params).length === 0) return "/store";
  return buildStoreCatalogHref(params);
}

export function getRequestPricingHrefForIntent(intentId: string): string {
  const p = resolveIntentToRfqParams(intentId);
  return buildRequestPricingHref(p);
}

/** Store listing from a brand display name — uses `q` (search), not brand facet IDs. */
export function getStoreHrefForBrandDisplayNameSearch(brandDisplayName: string): string {
  const q = brandDisplayName.trim();
  if (!q) return "/store";
  return buildStoreCatalogHref({ q });
}

/**
 * Store link for brand nav (header/home/footer patterns): search by display name, or
 * filter by catalog brand UUID via the `brand` facet when `catalogBrandId` is provided.
 */
export function getStoreHrefForBrandNav(brandDisplayName: string, catalogBrandId?: string): string {
  const id = catalogBrandId?.trim();
  if (id) return buildStoreCatalogHref({ brand: [id] });
  return getStoreHrefForBrandDisplayNameSearch(brandDisplayName);
}
