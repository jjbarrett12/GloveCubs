/**
 * Automatic tier + list pricing for supplier import rows (post-normalization).
 * landed_cost = supplier_cost + shipping_estimate + payment_fee_estimate
 * payment_fee_estimate = supplier_cost * paymentFeeRate (default 3%)
 * tier_a_price = landed_cost / 0.80, … tier_d = landed / 0.65
 * list_price = tier_d_price * listPriceMultiplier (default 1.15)
 */

import {
  IMPORT_MIN_GROSS_MARGIN,
  IMPORT_PRICING_RULE_VERSION,
  loadImportPricingConfig,
  type ImportPricingRuntimeConfig,
} from "./import-pricing-config";

export interface ImportPricingManualOverride {
  list_price?: number;
  tier_a_price?: number;
  tier_b_price?: number;
  tier_c_price?: number;
  tier_d_price?: number;
  updated_at?: string;
}

export interface ImportAutoPricingSnapshot {
  supplier_cost: number;
  shipping_estimate: number;
  payment_fee_estimate: number;
  landed_cost: number;
  tier_a_price: number;
  tier_b_price: number;
  tier_c_price: number;
  tier_d_price: number;
  /** Same as tier_d_price; list is always derived from tier D × multiplier. */
  display_tier_price: number;
  display_tier: "D";
  list_price: number;
  list_price_multiplier: number;
  pricing_rule_version: string;
  /** Admin edits in review UI; effective values from {@link effectiveImportPricing}. */
  pricing_manual_override?: ImportPricingManualOverride | null;
}

export type ImportAutoPricingWithOverride = ImportAutoPricingSnapshot & {
  pricing_manual_override?: ImportPricingManualOverride | null;
};

export interface EffectiveImportPrices {
  tier_a_price: number;
  tier_b_price: number;
  tier_c_price: number;
  tier_d_price: number;
  list_price: number;
  min_price_margin_floor: number;
  is_overridden: boolean;
}

function roundMoney(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/** Minimum unit price that keeps gross margin >= `margin` on `landed`: price >= landed / (1 - margin). */
export function minPriceForGrossMargin(landed: number, margin: number = IMPORT_MIN_GROSS_MARGIN): number {
  if (!Number.isFinite(landed) || landed <= 0) return 0;
  const m = Math.min(0.95, Math.max(0.01, margin));
  return roundMoney(landed / (1 - m));
}

function tierFromLanded(landed: number, divisor: number): number {
  const d = Math.min(0.99, Math.max(0.01, divisor));
  return roundMoney(landed / d);
}

/**
 * Category-based shipping estimate (USD per unit). First matching rule wins.
 */
export function estimateImportShipping(
  categorySlug: string,
  filterAttributes: Record<string, unknown>,
  cfg: ImportPricingRuntimeConfig
): number {
  const s = haystack(categorySlug, filterAttributes);

  if (matchesChemical(s)) return roundMoney(cfg.shipping.chemical);
  if (matchesCutResistant(s)) return roundMoney(cfg.shipping.cutResistant);

  if (matchesNitrileExam(s)) return roundMoney(cfg.shipping.nitrileExam);
  if (matchesVinylExam(s)) return roundMoney(cfg.shipping.vinylExam);
  if (matchesLatexExam(s)) return roundMoney(cfg.shipping.latexExam);

  if (matchesPoly(s)) return roundMoney(cfg.shipping.poly);

  if (matchesReusableHeavy(s)) return roundMoney(cfg.shipping.reusableHeavy);
  if (matchesReusableLight(s)) return roundMoney(cfg.shipping.reusableLight);

  return roundMoney(cfg.shipping.defaultRate);
}

function haystack(categorySlug: string, filterAttributes: Record<string, unknown>): string {
  const parts: string[] = [String(categorySlug ?? "")];
  for (const v of Object.values(filterAttributes ?? {})) {
    if (v == null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      parts.push(String(v));
    }
  }
  return parts.join(" ").toLowerCase();
}

function matchesChemical(s: string): boolean {
  return (
    /\bchemical[\s_-]?resistant\b/.test(s) ||
    /\bchemical[\s_-]?glove/.test(s) ||
    /\bneoprene\b/.test(s) ||
    /\bbutyl\b/.test(s) ||
    /\bviton\b/.test(s) ||
    (/\bchemical\b/.test(s) && /\bglove/.test(s))
  );
}

function matchesCutResistant(s: string): boolean {
  return (
    /\bcut[\s_-]?resistant\b/.test(s) ||
    /\bansi[\s_-]?cut\b/.test(s) ||
    /\bcut[\s_-]?level\b/.test(s) ||
    /\blevel[\s_-]?([34556789]|a[1-9])\b/.test(s)
  );
}

function matchesNitrileExam(s: string): boolean {
  if (!/\bnitrile\b/.test(s)) return false;
  return (
    /\bexam\b/.test(s) ||
    /\bexamination\b/.test(s) ||
    /\bdisposable\b/.test(s) ||
    /\bpowder[\s_-]?free\b/.test(s) ||
    /\bnon[\s_-]?latex\b/.test(s) ||
    /disposable[\s_-]?glove/.test(s) ||
    /\bnitrile_exam\b/.test(s)
  );
}

function matchesVinylExam(s: string): boolean {
  if (!/\bvinyl\b/.test(s)) return false;
  return (
    /\bexam\b/.test(s) ||
    /\bexamination\b/.test(s) ||
    /\bdisposable\b/.test(s) ||
    /\bpvc\b/.test(s) ||
    /disposable[\s_-]?glove/.test(s)
  );
}

function matchesLatexExam(s: string): boolean {
  if (!/\blatex\b/.test(s)) return false;
  return (
    /\bexam\b/.test(s) ||
    /\bexamination\b/.test(s) ||
    /\bdisposable\b/.test(s) ||
    /\bpowdered\b/.test(s) ||
    /\bpowder[\s_-]?free\b/.test(s) ||
    /disposable[\s_-]?glove/.test(s)
  );
}

function matchesPoly(s: string): boolean {
  if (/\bnitrile\b/.test(s) || /\bvinyl\b/.test(s) || /\blatex\b/.test(s)) return false;
  return (
    /\bpolyethylene\b/.test(s) ||
    /\bpoly[\s_-]?glove/.test(s) ||
    /\bpe[\s_-]?glove/.test(s) ||
    (/\bpoly\b/.test(s) && /\bglove/.test(s)) ||
    (/\bpe\b/.test(s) && /\bdisposable\b/.test(s))
  );
}

function matchesReusableHeavy(s: string): boolean {
  return (
    /\bleather\b/.test(s) ||
    /\bweld/.test(s) ||
    /\bgauntlet\b/.test(s) ||
    /\bheavy[\s_-]?duty\b/.test(s) ||
    (/\breusable\b/.test(s) && /\bheavy\b/.test(s))
  );
}

function matchesReusableLight(s: string): boolean {
  return (
    /\breusable\b/.test(s) ||
    /\bflock[\s_-]?lined\b/.test(s) ||
    /\bstring[\s_-]?knit\b/.test(s) ||
    /\bwork[\s_-]?glove\b/.test(s) ||
    /\bcotton\b/.test(s) ||
    /\bjersey\b/.test(s)
  );
}

/**
 * Full snapshot from supplier unit cost, or null if cost is missing / non-positive.
 */
export function computeImportAutoPricing(args: {
  supplierCost: number;
  categorySlug: string;
  filterAttributes: Record<string, unknown>;
  config?: ImportPricingRuntimeConfig;
}): ImportAutoPricingSnapshot | null {
  const cost = Number(args.supplierCost);
  if (!Number.isFinite(cost) || cost <= 0) return null;

  const cfg = args.config ?? loadImportPricingConfig();
  const shipping = estimateImportShipping(args.categorySlug, args.filterAttributes, cfg);
  const paymentFee = roundMoney(cost * cfg.paymentFeeRate);
  const landed = roundMoney(cost + shipping + paymentFee);

  const tierA = tierFromLanded(landed, cfg.tierDivisorA);
  const tierB = tierFromLanded(landed, cfg.tierDivisorB);
  const tierC = tierFromLanded(landed, cfg.tierDivisorC);
  const tierD = tierFromLanded(landed, cfg.tierDivisorD);

  const listMult = cfg.listPriceMultiplier;
  const listPrice = roundMoney(tierD * listMult);

  return {
    supplier_cost: roundMoney(cost),
    shipping_estimate: shipping,
    payment_fee_estimate: paymentFee,
    landed_cost: landed,
    tier_a_price: tierA,
    tier_b_price: tierB,
    tier_c_price: tierC,
    tier_d_price: tierD,
    display_tier_price: tierD,
    display_tier: "D",
    list_price: listPrice,
    list_price_multiplier: listMult,
    pricing_rule_version: IMPORT_PRICING_RULE_VERSION,
  };
}

/** Effective customer-facing prices after optional manual override, clamped to margin floor. */
export function effectiveImportPricing(ap: ImportAutoPricingWithOverride): EffectiveImportPrices {
  const floor = minPriceForGrossMargin(ap.landed_cost);
  const o = ap.pricing_manual_override;

  const tierA = roundMoney(Math.max(o?.tier_a_price ?? ap.tier_a_price, floor));
  const tierB = roundMoney(Math.max(o?.tier_b_price ?? ap.tier_b_price, floor));
  const tierC = roundMoney(Math.max(o?.tier_c_price ?? ap.tier_c_price, floor));
  const tierD = roundMoney(Math.max(o?.tier_d_price ?? ap.tier_d_price, floor));
  const list = roundMoney(Math.max(o?.list_price ?? ap.list_price, floor));

  const isOverridden =
    o != null &&
    (o.list_price != null ||
      o.tier_a_price != null ||
      o.tier_b_price != null ||
      o.tier_c_price != null ||
      o.tier_d_price != null);

  return {
    tier_a_price: tierA,
    tier_b_price: tierB,
    tier_c_price: tierC,
    tier_d_price: tierD,
    list_price: list,
    min_price_margin_floor: floor,
    is_overridden: Boolean(isOverridden),
  };
}

/** Markup on landed cost implied by effective list price (for anomaly heuristics). */
export function listPriceMarkupOnLandedPercent(snapshot: ImportAutoPricingWithOverride): number {
  const eff = effectiveImportPricing(snapshot);
  if (snapshot.landed_cost <= 0) return 0;
  return (eff.list_price / snapshot.landed_cost - 1) * 100;
}

const OVERRIDE_PRICE_KEYS = [
  "list_price",
  "tier_a_price",
  "tier_b_price",
  "tier_c_price",
  "tier_d_price",
] as const satisfies readonly (keyof ImportPricingManualOverride)[];

export type ImportPricingOverridePatch = Partial<
  Record<(typeof OVERRIDE_PRICE_KEYS)[number], number | null>
>;

/**
 * Updates `pricing_manual_override` only; import-time tier_* and list_price stay as computed baselines.
 * Each provided field is clamped to the gross margin floor. Pass `null` for a key to clear that override.
 */
export function applyImportPricingOverride(
  base: ImportAutoPricingSnapshot,
  partial: ImportPricingOverridePatch
): ImportAutoPricingSnapshot {
  const floor = minPriceForGrossMargin(base.landed_cost);
  const prev: ImportPricingManualOverride = { ...(base.pricing_manual_override ?? {}) };

  for (const key of OVERRIDE_PRICE_KEYS) {
    if (!(key in partial)) continue;
    const v = partial[key];
    if (v === null) {
      delete prev[key];
      continue;
    }
    if (v === undefined) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    prev[key] = roundMoney(Math.max(n, floor));
  }

  const hasAny = OVERRIDE_PRICE_KEYS.some((k) => prev[k] != null && prev[k] !== undefined);
  return {
    ...base,
    pricing_manual_override: hasAny ? { ...prev, updated_at: new Date().toISOString() } : null,
  };
}

/** Drop manual overrides; effective prices match stored import baseline again. */
export function clearImportPricingOverride(base: ImportAutoPricingSnapshot): ImportAutoPricingSnapshot {
  return { ...base, pricing_manual_override: null };
}
