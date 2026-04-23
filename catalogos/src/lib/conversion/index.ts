/**
 * Conversion engine: industry recommendations, value signals, price-per-glove, analytics.
 */

import type { LiveProductItem } from "@/lib/catalog/types";
import type { IndustryKey } from "./industries";
import { INDUSTRY_MAP, getIndustryBadgeForProduct } from "./industries";
import { computePricePerGlove, computePricePerGloveBatch, type PricePerGloveResult } from "./price-per-glove";
import {
  computeSignalsForProduct,
  addBestValueSignal,
  addMostPopularPlaceholder,
  type ValueSignal,
} from "./value-signals";
import { computeAuthorityBadge, type AuthorityBadge } from "./authority-signals";

export type { IndustryKey, IndustryOption } from "./industries";
export type { AuthorityBadge } from "./authority-signals";
export type { ValueSignal, ValueSignalKey } from "./value-signals";
export type { PricePerGloveResult } from "./price-per-glove";
export type { ConversionEventName } from "./analytics";
export { INDUSTRY_OPTIONS, INDUSTRY_MAP, getIndustryRecommendationProductIds } from "./industries";
export { trackConversionEvent } from "./analytics";
export { computePricePerGlove, computePricePerGloveBatch } from "./price-per-glove";

export interface EnrichedProduct {
  item: LiveProductItem;
  pricePerGlove: PricePerGloveResult;
  signals: ValueSignal[];
  industryBadge: string | null;
  recommendedForIndustry: boolean;
  authorityBadge: AuthorityBadge | null;
}

const MAX_FOR_PRICE_PER_GLOVE_SORT = 500;

/**
 * Enrich catalog items: price per glove, value signals, industry badge.
 * Call from server (catalog page) after listLiveProducts.
 */
export function enrichCatalogItems(
  items: LiveProductItem[],
  industryKey: IndustryKey | null
): EnrichedProduct[] {
  const priceMap = computePricePerGloveBatch(items);
  const industryOpt = industryKey ? INDUSTRY_MAP.get(industryKey as IndustryKey) : null;

  const enriched: EnrichedProduct[] = items.map((item) => {
    const pricePerGlove = priceMap.get(item.id) ?? computePricePerGlove(item);
    const signals = computeSignalsForProduct(item);
    const rawIndustries = item.attributes?.industries ?? item.attributes?.industry ?? item.attributes?.industry_options;
    const productIndustries = Array.isArray(rawIndustries)
      ? rawIndustries
      : rawIndustries != null
        ? [String(rawIndustries)]
        : [];
    const industryBadge = industryOpt
      ? getIndustryBadgeForProduct(industryKey as IndustryKey, productIndustries)
      : null;
    const recommendedForIndustry = !!industryBadge;
    const authorityBadge = computeAuthorityBadge(item);
    return {
      item,
      pricePerGlove,
      signals,
      industryBadge,
      recommendedForIndustry,
      authorityBadge,
    };
  });

  addBestValueSignal(
    enriched.map((e) => ({
      id: e.item.id,
      signals: e.signals,
      price_per_glove: e.pricePerGlove.price_per_glove,
    }))
  );
  addMostPopularPlaceholder(enriched.map((e) => ({ signals: e.signals })), 3);

  return enriched;
}

/**
 * Sort enriched items by price per glove (asc). Mutates order.
 */
export function sortByPricePerGlove(enriched: EnrichedProduct[]): void {
  enriched.sort((a, b) => {
    const pa = a.pricePerGlove.price_per_glove ?? Infinity;
    const pb = b.pricePerGlove.price_per_glove ?? Infinity;
    if (pa !== pb) return pa - pb;
    return (a.item.name ?? "").localeCompare(b.item.name ?? "");
  });
}

/**
 * When sort is price_per_glove_asc, caller should request a larger limit (e.g. MAX_FOR_PRICE_PER_GLOVE_SORT),
 * then we sort and slice to the desired page. Returns the slice and total (for pagination).
 */
export function sortEnrichedByPricePerGloveAndSlice(
  enriched: EnrichedProduct[],
  page: number,
  limit: number
): { slice: EnrichedProduct[]; total: number } {
  sortByPricePerGlove(enriched);
  const total = enriched.length;
  const start = (page - 1) * limit;
  const slice = enriched.slice(start, start + limit);
  return { slice, total };
}

export { MAX_FOR_PRICE_PER_GLOVE_SORT };
