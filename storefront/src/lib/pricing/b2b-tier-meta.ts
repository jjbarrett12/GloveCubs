/**
 * Display metadata for gc_commerce.companies.b2b_pricing_tier_code.
 * Discount percentages must stay aligned with gc_commerce.resolve_buyer_unit_price (migration).
 */

export const B2B_TIER_CODES = ["cub", "grizzly", "kodiak"] as const;
export type B2bTierCode = (typeof B2B_TIER_CODES)[number];

export function isB2bTierCode(s: string): s is B2bTierCode {
  return (B2B_TIER_CODES as readonly string[]).includes(s);
}

export function b2bTierLabel(code: string): string {
  switch (code) {
    case "cub":
      return "Cub";
    case "grizzly":
      return "Grizzly";
    case "kodiak":
      return "Kodiak";
    default:
      return code;
  }
}

/** Narrative only; unit math is enforced server-side in resolve_buyer_unit_price. */
export function b2bTierSiteDiscountPercent(code: string): number | null {
  switch (code) {
    case "cub":
      return 10;
    case "grizzly":
      return 20;
    case "kodiak":
      return 30;
    default:
      return null;
  }
}
