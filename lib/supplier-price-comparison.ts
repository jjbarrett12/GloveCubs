/**
 * Pure supplier acquisition price comparison (normalized unit fields only).
 * Commercial default: full case ("case"). No DB access, no catalog_v2.metadata for money.
 */

import type { SupplierOfferNormalizationConfidence } from "./supplier-offer-normalization";

export type SupplierPriceComparisonFlag =
  | "derived_case_from_each"
  | "no_case_comparable_price"
  | "no_baseline"
  | "baseline_uom_mismatch"
  | "no_incumbent";

export type BaselineFieldResolved = "bulk_price_minor" | "list_price_minor";

export interface SupplierPriceComparisonConfig {
  /** Target commercial UOM for comparison (e.g. full case for gloves). */
  commercial_uom: string;
  /** Minimum confidence rank required (low < medium < high). */
  min_confidence: SupplierOfferNormalizationConfidence;
  /** When false, offers with normalization_confidence "low" are always excluded. */
  allow_low_confidence: boolean;
  /** When true, "each" offers with positive pack_qty may be converted to case minor for the case bucket. */
  allow_derive_case_from_each: boolean;
}

export interface SupplierPriceComparisonConfigUsed extends SupplierPriceComparisonConfig {
  /** Which sellable column supplied baseline_price_minor (bulk preferred over list when non-null). */
  baseline_field: BaselineFieldResolved | null;
}

export interface SupplierPriceComparisonInputOffer {
  id: string;
  supplier_id: string;
  normalized_unit_cost_minor: number | bigint | null | undefined;
  normalized_unit_uom: string | null | undefined;
  normalization_confidence: SupplierOfferNormalizationConfidence;
  pack_qty?: number | null;
  is_active?: boolean;
}

export interface SupplierPriceComparisonSellableInput {
  bulk_price_minor?: number | bigint | null;
  list_price_minor?: number | bigint | null;
}

export interface SupplierPriceComparisonDto {
  catalog_product_id: string;
  normalized_unit_uom: string;
  commercial_uom: string;
  eligible_offer_count: number;
  supplier_count: number;
  best_price_supplier_id: string | null;
  best_offer_id: string | null;
  best_price_minor: bigint | null;
  best_normalization_confidence: SupplierOfferNormalizationConfidence | null;
  baseline_field: BaselineFieldResolved | null;
  baseline_price_minor: bigint | null;
  delta_baseline_minor: bigint | null;
  spread_minor: bigint | null;
  incumbent_supplier_id: string | null;
  incumbent_min_price_minor: bigint | null;
  incumbent_overpriced_vs_market: boolean;
  flags: SupplierPriceComparisonFlag[];
  computed_at: string;
  config_used: SupplierPriceComparisonConfigUsed;
}

export const DEFAULT_GLOVE_SUPPLIER_PRICE_COMPARISON_CONFIG: SupplierPriceComparisonConfig = {
  commercial_uom: "case",
  min_confidence: "medium",
  allow_low_confidence: false,
  allow_derive_case_from_each: false,
};

const CONF_RANK: Record<SupplierOfferNormalizationConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function toBigIntMinor(v: number | bigint): bigint {
  if (typeof v === "bigint") return v;
  if (!Number.isFinite(v)) throw new Error("minor value must be finite");
  return BigInt(Math.round(v));
}

function minorPositive(v: number | bigint | null | undefined): boolean {
  if (v === null || v === undefined) return false;
  const b = toBigIntMinor(v);
  return b > 0n;
}

function confidenceAllowed(
  c: SupplierOfferNormalizationConfidence,
  config: SupplierPriceComparisonConfig
): boolean {
  if (!config.allow_low_confidence && c === "low") return false;
  return CONF_RANK[c] >= CONF_RANK[config.min_confidence];
}

function uomNonEmpty(u: string | null | undefined): u is string {
  return u != null && String(u).trim() !== "";
}

function tryMinorField(v: number | bigint | null | undefined): bigint | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  try {
    return toBigIntMinor(v);
  } catch {
    return null;
  }
}

function resolveBaselineField(sellable: SupplierPriceComparisonSellableInput | null | undefined): {
  field: BaselineFieldResolved | null;
  value: bigint | null;
} {
  if (!sellable) return { field: null, value: null };
  const bulk = tryMinorField(sellable.bulk_price_minor);
  if (bulk != null && bulk > 0n) {
    return { field: "bulk_price_minor", value: bulk };
  }
  const list = tryMinorField(sellable.list_price_minor);
  if (list != null && list > 0n) {
    return { field: "list_price_minor", value: list };
  }
  return { field: null, value: null };
}

type CaseCandidate = {
  supplier_id: string;
  offer_id: string;
  case_price_minor: bigint;
  confidence: SupplierOfferNormalizationConfidence;
  derived_from_each: boolean;
};

function packQtyPositive(pack: number | null | undefined): number | null {
  if (pack == null || !Number.isFinite(Number(pack))) return null;
  const n = Math.round(Number(pack));
  return n > 0 ? n : null;
}

function buildCaseCandidates(
  offers: SupplierPriceComparisonInputOffer[],
  config: SupplierPriceComparisonConfig,
  flagsOut: Set<SupplierPriceComparisonFlag>
): CaseCandidate[] {
  const activeOffers = offers.filter((o) => o.is_active !== false);
  const candidates: CaseCandidate[] = [];

  for (const o of activeOffers) {
    if (!minorPositive(o.normalized_unit_cost_minor)) continue;
    if (!uomNonEmpty(o.normalized_unit_uom)) continue;
    if (!confidenceAllowed(o.normalization_confidence, config)) continue;

    const uom = String(o.normalized_unit_uom).trim();
    const minor = toBigIntMinor(o.normalized_unit_cost_minor as number | bigint);

    if (uom === config.commercial_uom) {
      candidates.push({
        supplier_id: o.supplier_id,
        offer_id: o.id,
        case_price_minor: minor,
        confidence: o.normalization_confidence,
        derived_from_each: false,
      });
      continue;
    }

    if (uom === "each" && config.allow_derive_case_from_each) {
      const pq = packQtyPositive(o.pack_qty);
      if (pq != null) {
        flagsOut.add("derived_case_from_each");
        candidates.push({
          supplier_id: o.supplier_id,
          offer_id: o.id,
          case_price_minor: minor * BigInt(pq),
          confidence: o.normalization_confidence,
          derived_from_each: true,
        });
      }
    }
  }

  return candidates;
}

function pickBest(candidates: CaseCandidate[]): CaseCandidate | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    if (a.case_price_minor < b.case_price_minor) return -1;
    if (a.case_price_minor > b.case_price_minor) return 1;
    if (a.supplier_id < b.supplier_id) return -1;
    if (a.supplier_id > b.supplier_id) return 1;
    if (a.offer_id < b.offer_id) return -1;
    if (a.offer_id > b.offer_id) return 1;
    return 0;
  });
  return sorted[0] ?? null;
}

function minForSupplier(candidates: CaseCandidate[], supplierId: string): CaseCandidate | null {
  const subset = candidates.filter((c) => c.supplier_id === supplierId);
  return pickBest(subset);
}

export function compareSupplierNormalizedPrices(input: {
  catalog_product_id: string;
  offers: SupplierPriceComparisonInputOffer[];
  sellable: SupplierPriceComparisonSellableInput | null | undefined;
  config: SupplierPriceComparisonConfig;
  incumbent_supplier_id?: string | null;
  computed_at?: string;
}): SupplierPriceComparisonDto {
  const { catalog_product_id, offers, sellable, config } = input;
  const computed_at = input.computed_at ?? new Date().toISOString();
  const incumbent_supplier_id = input.incumbent_supplier_id ?? null;

  const flags = new Set<SupplierPriceComparisonFlag>();
  const candidates = buildCaseCandidates(offers, config, flags);

  const { field: baseline_field, value: baseline_raw } = resolveBaselineField(sellable ?? null);
  const baseline_price_minor =
    baseline_raw != null && baseline_field != null ? baseline_raw : null;

  if (baseline_price_minor === null || baseline_field === null) {
    flags.add("no_baseline");
  }

  if (incumbent_supplier_id == null || incumbent_supplier_id === "") {
    flags.add("no_incumbent");
  }

  if (candidates.length === 0) {
    flags.add("no_case_comparable_price");
    if (baseline_price_minor != null) {
      flags.add("baseline_uom_mismatch");
    }
    const config_used: SupplierPriceComparisonConfigUsed = {
      ...config,
      baseline_field,
    };
    return {
      catalog_product_id,
      normalized_unit_uom: config.commercial_uom,
      commercial_uom: config.commercial_uom,
      eligible_offer_count: 0,
      supplier_count: 0,
      best_price_supplier_id: null,
      best_offer_id: null,
      best_price_minor: null,
      best_normalization_confidence: null,
      baseline_field,
      baseline_price_minor,
      delta_baseline_minor: null,
      spread_minor: null,
      incumbent_supplier_id,
      incumbent_min_price_minor: null,
      incumbent_overpriced_vs_market: false,
      flags: sortFlags(flags),
      computed_at,
      config_used,
    };
  }

  const distinctOffers = new Set(candidates.map((c) => c.offer_id)).size;
  const supplier_count = new Set(candidates.map((c) => c.supplier_id)).size;

  const best = pickBest(candidates);
  if (!best) {
    throw new Error("invariant: candidates non-empty but no best");
  }

  let spread_minor: bigint | null = null;
  if (candidates.length >= 1) {
    let lo = candidates[0]!.case_price_minor;
    let hi = candidates[0]!.case_price_minor;
    for (const c of candidates) {
      if (c.case_price_minor < lo) lo = c.case_price_minor;
      if (c.case_price_minor > hi) hi = c.case_price_minor;
    }
    spread_minor = hi - lo;
  }

  let delta_baseline_minor: bigint | null = null;
  if (baseline_price_minor != null) {
    delta_baseline_minor = best.case_price_minor - baseline_price_minor;
  }

  let incumbent_min_price_minor: bigint | null = null;
  let incumbent_overpriced_vs_market = false;
  if (incumbent_supplier_id != null && incumbent_supplier_id !== "") {
    const inc = minForSupplier(candidates, incumbent_supplier_id);
    if (inc != null) {
      incumbent_min_price_minor = inc.case_price_minor;
      incumbent_overpriced_vs_market = inc.case_price_minor > best.case_price_minor;
    }
  }

  return {
    catalog_product_id,
    normalized_unit_uom: config.commercial_uom,
    commercial_uom: config.commercial_uom,
    eligible_offer_count: distinctOffers,
    supplier_count,
    best_price_supplier_id: best.supplier_id,
    best_offer_id: best.offer_id,
    best_price_minor: best.case_price_minor,
    best_normalization_confidence: best.confidence,
    baseline_field,
    baseline_price_minor,
    delta_baseline_minor,
    spread_minor,
    incumbent_supplier_id,
    incumbent_min_price_minor,
    incumbent_overpriced_vs_market,
    flags: sortFlags(flags),
    computed_at,
    config_used: {
      ...config,
      baseline_field,
    },
  };
}

function sortFlags(flags: Set<SupplierPriceComparisonFlag>): SupplierPriceComparisonFlag[] {
  const order: SupplierPriceComparisonFlag[] = [
    "derived_case_from_each",
    "no_case_comparable_price",
    "no_baseline",
    "baseline_uom_mismatch",
    "no_incumbent",
  ];
  return order.filter((f) => flags.has(f));
}
