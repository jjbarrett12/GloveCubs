import type { CommercePackagingV1 } from "./types";

export const UNITS_PER_CASE_BUCKETS = [
  "50",
  "72",
  "100",
  "250",
  "500",
  "600",
  "720",
  "1000",
  "1500",
  "2000",
  "2500",
  "3000",
  "10000",
];
export const CASES_PER_PALLET_BUCKETS = [
  "40",
  "48",
  "50",
  "56",
  "60",
  "70",
  "72",
  "80",
  "84",
  "90",
  "96",
  "100",
  "120",
];

function nearestBucket(value: number, buckets: string[]): string {
  let best = buckets[0]!;
  let bestDist = Math.abs(value - Number(best));
  for (const b of buckets) {
    const dist = Math.abs(value - Number(b));
    if (dist < bestDist) {
      best = b;
      bestDist = dist;
    }
  }
  return best;
}

/** Map commerce_packaging to storefront filter attribute keys (units_per_case, not legacy box/case qty). */
export function commercePackagingToFilterAttributes(cp: CommercePackagingV1): Record<string, string> {
  const out: Record<string, string> = {};
  if (cp.units_per_case != null && cp.units_per_case > 0) {
    out.units_per_case = nearestBucket(cp.units_per_case, UNITS_PER_CASE_BUCKETS);
  }
  if (cp.cases_per_pallet != null && cp.cases_per_pallet > 0) {
    out.cases_per_pallet = nearestBucket(cp.cases_per_pallet, CASES_PER_PALLET_BUCKETS);
  }
  if (cp.sell_by_pallet_enabled && cp.pallet_price != null && cp.pallet_price > 0) {
    out.pallet_pricing_available = "yes";
  } else if (cp.sell_by_pallet_enabled && cp.cases_per_pallet != null) {
    out.pallet_pricing_available = "yes";
  }
  return out;
}

/** Fill only empty keys in target from source (operator/manual values win). */
export function mergeFilterAttributesAdditive(
  target: Record<string, string | string[]>,
  source: Record<string, string>
): Record<string, string | string[]> {
  const out = { ...target };
  for (const [key, val] of Object.entries(source)) {
    const existing = out[key];
    if (existing !== undefined && existing !== null && existing !== "") {
      if (!Array.isArray(existing) || existing.length > 0) continue;
    }
    out[key] = val;
  }
  return out;
}

/** CatalogOS staging: merge commerce_packaging filter attrs into filter_attributes without overwriting. */
export function mergeCommercePackagingIntoFilterAttributes(
  filterAttributes: Record<string, unknown>,
  cp: CommercePackagingV1 | null | undefined
): Record<string, unknown> {
  if (!cp) return filterAttributes;
  const cpAttrs = commercePackagingToFilterAttributes(cp);
  const out = { ...filterAttributes };
  for (const [key, val] of Object.entries(cpAttrs)) {
    const existing = out[key];
    if (existing != null && existing !== "" && !(Array.isArray(existing) && existing.length === 0)) {
      continue;
    }
    out[key] = val;
  }
  return out;
}
