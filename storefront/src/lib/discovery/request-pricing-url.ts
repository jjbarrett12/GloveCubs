/**
 * Canonical /request-pricing URL builder — must stay aligned with
 * `RequestPricingForm` query keys (useSearchParams reads).
 */

/** Keys accepted on `/request-pricing` (aligned with `RequestPricingForm`). */
export const REQUEST_PRICING_QUERY_KEYS = [
  "industry",
  "type",
  "material",
  "size",
  "volume",
  "case_range",
  "product",
  "source",
] as const;

const RFQ_QUERY_KEYS = new Set<string>(REQUEST_PRICING_QUERY_KEYS);

export type RequestPricingQueryParams = Partial<
  Record<
    "industry" | "type" | "material" | "size" | "volume" | "case_range" | "product" | "source",
    string
  >
>;

/** Build `/request-pricing` with only supported query keys (unknown keys dropped). */
export function buildRequestPricingHref(params: RequestPricingQueryParams): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    if (!RFQ_QUERY_KEYS.has(k)) continue;
    q.set(k, v);
  }
  const s = q.toString();
  return s ? `/request-pricing?${s}` : "/request-pricing";
}
