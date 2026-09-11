/**
 * Cost vs published list semantics (GloveCubs).
 *
 * LANDED COST → MIN SAFE LIST → OPERATOR APPROVAL → PUBLISHED LIST → PA V2
 * - catalogos.supplier_offers.cost = operator/import-provided landed case cost (internal).
 *   This helper does not compose freight; it treats stored cost as landed-cost authority.
 * - catalogos.supplier_offers.sell_price = public list SOT only after operator approval.
 * - Approval: sell_price > 0 AND sell_price_verified_at IS NOT NULL. Unverified rows
 *   (including historical sell_price = cost copies) are unpublished.
 * - variant_best_offer_price = min approved mapped active sell_price. No cost fallback.
 * - PA V2 Cub/Grizzly/Kodiak remain 10/20/30% off that approved list.
 * - Launch floor: Kodiak GM ≥ 20% ⇒ list ≥ cost / 0.56. Formula is never auto-written to sell_price.
 */

export const PA_V2_LIST_DISCOUNT = {
  cub: 0.1,
  grizzly: 0.2,
  kodiak: 0.3,
} as const;

/** Launch policy: deepest tier (Kodiak) must keep at least 20% GM vs landed cost. */
export const KODIAK_LAUNCH_MIN_GROSS_MARGIN = 0.2;

/** 0.70 × (1 − 0.20) = 0.56. list ≥ cost / 0.56. */
export const KODIAK_LAUNCH_LIST_OVER_COST_DENOM =
  (1 - PA_V2_LIST_DISCOUNT.kodiak) * (1 - KODIAK_LAUNCH_MIN_GROSS_MARGIN);

export type PaV2TierCode = keyof typeof PA_V2_LIST_DISCOUNT;

export type PublishedListApprovalReason = "landed_cost_required" | "list_invalid" | "below_minimum_margin";

export type PublishedListApprovalResult =
  | {
      ok: true;
      cost: number;
      sellPrice: number;
      minimumSafeList: number;
      kodiak: number;
      kodiakGmPercent: number;
    }
  | {
      ok: false;
      reason: PublishedListApprovalReason;
      cost: number | null;
      sellPrice: number | null;
      minimumSafeList: number | null;
      kodiak: number | null;
      kodiakGmPercent: number | null;
    };

export function roundUsdMajor(n: number): number {
  return Math.round(n * 100) / 100;
}

export function usdMajorToCents(major: number): number {
  return Math.round(major * 100);
}

export function centsToUsdMajor(cents: number): number {
  return cents / 100;
}

function finitePositiveMajor(n: unknown): number | null {
  if (n == null) return null;
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return null;
  return x;
}

export function isApprovedPublishedList(args: {
  sellPrice: number | null | undefined;
  verifiedAt: string | null | undefined;
}): boolean {
  if (args.verifiedAt == null || String(args.verifiedAt).trim() === "") return false;
  return finitePositiveMajor(args.sellPrice) != null;
}

export function requireApprovedListToMap(args: {
  sellPrice: number | null | undefined;
  verifiedAt: string | null | undefined;
}): { ok: true } | { ok: false; reason: "list_unapproved" } {
  return isApprovedPublishedList(args) ? { ok: true } : { ok: false, reason: "list_unapproved" };
}

export function paV2TierPricesFromList(list: number): { cub: number; grizzly: number; kodiak: number } | null {
  if (!Number.isFinite(list) || list <= 0) return null;
  return {
    cub: roundUsdMajor(list * (1 - PA_V2_LIST_DISCOUNT.cub)),
    grizzly: roundUsdMajor(list * (1 - PA_V2_LIST_DISCOUNT.grizzly)),
    kodiak: roundUsdMajor(list * (1 - PA_V2_LIST_DISCOUNT.kodiak)),
  };
}

export function grossMarginVsCost(
  price: number | null | undefined,
  cost: number | null | undefined
): { dollars: number | null; percent: number | null } {
  const p = price == null ? NaN : Number(price);
  const c = cost == null ? NaN : Number(cost);
  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(c)) return { dollars: null, percent: null };
  const dollars = roundUsdMajor(p - c);
  return { dollars, percent: (dollars / p) * 100 };
}

/**
 * Smallest USD-major list that still satisfies list ≥ cost / (0.70 × (1 − m)).
 * Ceiling in cents so the displayed minimum is actually approvable
 * (cost $85 → $151.79 is allowed; $151.78 is not).
 */
export function kodiakListFloorForMinGrossMargin(cost: number, minGrossMargin: number): number | null {
  const c = finitePositiveMajor(cost);
  if (c == null) return null;
  if (!Number.isFinite(minGrossMargin) || minGrossMargin < 0 || minGrossMargin >= 1) return null;
  const denom = (1 - PA_V2_LIST_DISCOUNT.kodiak) * (1 - minGrossMargin);
  if (!(denom > 0)) return null;
  const minCents = Math.ceil(usdMajorToCents(c) / denom - 1e-9);
  return centsToUsdMajor(minCents);
}

/** Launch floor: Kodiak 20% GM. Recommended list uses this same number. */
export function minimumSafePublishedList(cost: number | null | undefined): number | null {
  const c = finitePositiveMajor(cost);
  if (c == null) return null;
  return kodiakListFloorForMinGrossMargin(c, KODIAK_LAUNCH_MIN_GROSS_MARGIN);
}

export function publishedListTierEconomics(args: {
  cost: number | null | undefined;
  sellPrice: number | null | undefined;
}): {
  cost: number | null;
  list: number | null;
  minimumSafeList: number | null;
  recommendedList: number | null;
  tiers: { cub: number; grizzly: number; kodiak: number } | null;
  margins: {
    list: { dollars: number | null; percent: number | null };
    cub: { dollars: number | null; percent: number | null };
    grizzly: { dollars: number | null; percent: number | null };
    kodiak: { dollars: number | null; percent: number | null };
  };
} {
  const cost = finitePositiveMajor(args.cost);
  const list = finitePositiveMajor(args.sellPrice);
  const min = minimumSafePublishedList(cost);
  const tiers = list != null ? paV2TierPricesFromList(list) : null;
  return {
    cost,
    list,
    minimumSafeList: min,
    recommendedList: min,
    tiers,
    margins: {
      list: grossMarginVsCost(list, cost),
      cub: grossMarginVsCost(tiers?.cub ?? null, cost),
      grizzly: grossMarginVsCost(tiers?.grizzly ?? null, cost),
      kodiak: grossMarginVsCost(tiers?.kodiak ?? null, cost),
    },
  };
}

function approvalEconomics(cost: number | null, sellPrice: number | null) {
  const min = minimumSafePublishedList(cost);
  const tiers = sellPrice != null ? paV2TierPricesFromList(sellPrice) : null;
  const kodiakGm = grossMarginVsCost(tiers?.kodiak ?? null, cost);
  return {
    cost,
    sellPrice,
    minimumSafeList: min,
    kodiak: tiers?.kodiak ?? null,
    kodiakGmPercent: kodiakGm.percent,
  };
}

/**
 * Operator approval of sell_price. Clear (null list) is not approval — callers skip this.
 * Compare list vs floor in cents so displayed $151.79 for cost $85 is allowed.
 */
export function validatePublishedListApproval(args: {
  cost: number | null | undefined;
  sellPrice: number | null | undefined;
}): PublishedListApprovalResult {
  const cost = finitePositiveMajor(args.cost);
  const sellPrice = finitePositiveMajor(args.sellPrice);
  if (cost == null) {
    return { ok: false, reason: "landed_cost_required", ...approvalEconomics(null, sellPrice) };
  }
  if (sellPrice == null) {
    return { ok: false, reason: "list_invalid", ...approvalEconomics(cost, null) };
  }
  const minimumSafeList = minimumSafePublishedList(cost)!;
  if (usdMajorToCents(sellPrice) < usdMajorToCents(minimumSafeList)) {
    return { ok: false, reason: "below_minimum_margin", ...approvalEconomics(cost, sellPrice) };
  }
  const eco = approvalEconomics(cost, sellPrice);
  return {
    ok: true,
    cost,
    sellPrice,
    minimumSafeList,
    kodiak: eco.kodiak as number,
    kodiakGmPercent: eco.kodiakGmPercent as number,
  };
}

/**
 * Approval input: approved list may be shown; unverified historical sell_price must not be the draft.
 * Unverified rows get the min-safe recommendation when landed cost is present, otherwise blank.
 */
export function publishedListApprovalInputValue(args: {
  sellPrice: number | null | undefined;
  verifiedAt: string | null | undefined;
  cost: number | null | undefined;
}): { input: string; unverifiedExistingList: number | null; minimumSafeList: number | null } {
  const minimumSafeList = minimumSafePublishedList(args.cost);
  if (isApprovedPublishedList({ sellPrice: args.sellPrice, verifiedAt: args.verifiedAt })) {
    return {
      input: String(args.sellPrice),
      unverifiedExistingList: null,
      minimumSafeList,
    };
  }
  const unverified = finitePositiveMajor(args.sellPrice);
  return {
    input: minimumSafeList != null ? minimumSafeList.toFixed(2) : "",
    unverifiedExistingList: unverified,
    minimumSafeList,
  };
}
