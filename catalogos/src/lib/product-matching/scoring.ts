/**
 * Product Matching Agent — rules-first scoring.
 * Signals: UPC, brand, category, material, size, color, thickness_mil, powder, grade, packaging, case_qty, title similarity, compliance/work glove attrs.
 */

import type { CandidateEntry } from "./types";

/** Attribute keys used for matching (disposable gloves + universal). */
export const MATCH_ATTRIBUTE_KEYS = [
  "brand",
  "material",
  "size",
  "color",
  "thickness_mil",
  "powder",
  "grade",
  "packaging",
  "case_qty",
  "texture",
  "cuff_style",
  "sterility",
  "cut_level_ansi",
  "puncture_level",
  "abrasion_level",
  "flame_resistant",
  "arc_rating",
  "warm_cold_weather",
] as const;

/** Weights for attribute match (stronger signals first). */
const WEIGHTS: Record<string, number> = {
  brand: 1.2,
  material: 1.1,
  size: 1.1,
  color: 1.0,
  thickness_mil: 1.1,
  powder: 1.0,
  grade: 1.0,
  packaging: 1.0,
  case_qty: 1.0,
  texture: 0.8,
  cuff_style: 0.8,
  // CRITICAL: Sterility is safety-critical - must be weighted high to prevent false matches
  sterility: 1.3,
  cut_level_ansi: 1.0,
  puncture_level: 0.9,
  abrasion_level: 0.9,
  flame_resistant: 0.8,
  arc_rating: 0.8,
  warm_cold_weather: 0.8,
};

/**
 * Critical attributes that MUST match for auto-apply.
 * If any of these differ, the match should NOT be auto-applied even at high confidence.
 */
export const CRITICAL_SAFETY_ATTRIBUTES = ["material", "sterility", "size", "grade"] as const;

export interface MasterForScoring {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
}

export interface NormalizedForMatching {
  upc?: string | null;
  name?: string | null;
  supplier_sku?: string | null;
  brand?: string | null;
  /** Staged filter_attributes or normalized_data.filter_attributes */
  filter_attributes?: Record<string, unknown> | null;
}

export function normalizeUpc(v: string | undefined | null): string {
  if (v == null) return "";
  return String(v).replace(/\D/g, "").slice(0, 14);
}

/**
 * Compare one attribute value (handles string/number/array overlap for multi-select).
 */
function attrEqual(
  a: unknown,
  b: unknown
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const sa = Array.isArray(a) ? a.map(String) : [String(a)];
  const sb = Array.isArray(b) ? b.map(String) : [String(b)];
  const va = sa.map((x) => x.toLowerCase().trim());
  const vb = sb.map((x) => x.toLowerCase().trim());
  if (va.length === 1 && vb.length === 1) return va[0] === vb[0];
  return va.some((x) => vb.includes(x));
}

/**
 * Score a single master product against normalized row by attributes.
 */
export function scoreAttributes(
  normalized: NormalizedForMatching,
  master: MasterForScoring
): { score: number; matched_attrs: string[] } {
  const attrs = normalized.filter_attributes ?? {};
  const masterAttrs = (master.attributes ?? {}) as Record<string, unknown>;
  let weightedSum = 0;
  let weightTotal = 0;
  const matched_attrs: string[] = [];

  for (const key of MATCH_ATTRIBUTE_KEYS) {
    const v = attrs[key];
    const pv = masterAttrs[key];
    if (v == null && pv == null) continue;
    const w = WEIGHTS[key] ?? 1;
    weightTotal += w;
    if (attrEqual(v, pv)) {
      weightedSum += w;
      matched_attrs.push(key);
    }
  }

  if (weightTotal === 0) return { score: 0, matched_attrs };
  const score = Math.round((weightedSum / weightTotal) * 100) / 100;
  return { score, matched_attrs };
}

/**
 * Fuzzy title similarity: word overlap ratio, capped.
 */
export function scoreTitleSimilarity(title: string, masterName: string): number {
  if (!title || title.length < 3) return 0;
  const words = title.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const name = (masterName ?? "").toLowerCase();
  const matched = words.filter((w) => name.includes(w)).length;
  const ratio = words.length > 0 ? matched / words.length : 0;
  return Math.min(0.75, Math.round(ratio * 100) / 100);
}

const UPC_EXACT_CONFIDENCE = 0.98;
const HIGH_ATTR_THRESHOLD = 0.85;
const LOW_CONFIDENCE_THRESHOLD = 0.6;
const MAX_CANDIDATES = 10;

/**
 * Full match: UPC exact → attribute match → fuzzy title. Returns best match with candidate list.
 */
export function computeMatch(
  normalized: NormalizedForMatching,
  masters: MasterForScoring[],
  duplicateProductIds: Set<string>
): {
  suggested_master_product_id: string | null;
  confidence: number;
  reason: "upc_exact" | "attribute_match" | "fuzzy_title" | "no_match" | "no_candidates";
  candidate_list: CandidateEntry[];
  duplicate_warning: boolean;
  requires_review: boolean;
} {
  const candidate_list: CandidateEntry[] = [];
  if (masters.length === 0) {
    return {
      suggested_master_product_id: null,
      confidence: 0,
      reason: "no_candidates",
      candidate_list: [],
      duplicate_warning: false,
      requires_review: true,
    };
  }

  const upc = normalizeUpc(normalized.upc);
  if (upc) {
    const byUpc = masters.find((p) => {
      const a = (p.attributes ?? {}) as Record<string, unknown>;
      const pu = normalizeUpc(String(a.upc ?? a.gtin ?? ""));
      return pu && pu === upc;
    });
    if (byUpc) {
      return {
        suggested_master_product_id: byUpc.id,
        confidence: UPC_EXACT_CONFIDENCE,
        reason: "upc_exact",
        candidate_list: [{ product_id: byUpc.id, score: UPC_EXACT_CONFIDENCE, matched_attrs: ["upc"] }],
        duplicate_warning: duplicateProductIds.has(byUpc.id),
        requires_review: duplicateProductIds.has(byUpc.id),
      };
    }
  }

  const title = normalized.name ?? "";
  const scored: { id: string; attrScore: number; titleScore: number; matched_attrs: string[] }[] = [];

  for (const p of masters) {
    const { score: attrScore, matched_attrs } = scoreAttributes(normalized, p);
    const titleScore = scoreTitleSimilarity(title, p.name);
    scored.push({ id: p.id, attrScore, titleScore, matched_attrs });
  }

  const combined = scored.map((s) => ({
    ...s,
    combined: s.attrScore >= 0.5 ? s.attrScore * 0.8 + s.titleScore * 0.2 : s.titleScore,
  }));
  combined.sort((a, b) => b.combined - a.combined);

  const top = combined.slice(0, MAX_CANDIDATES).map((s) => ({
    product_id: s.id,
    score: Math.round(s.combined * 100) / 100,
    matched_attrs: s.matched_attrs,
  }));
  candidate_list.push(...top);

  const best = combined[0];
  if (!best || best.combined < 0.3) {
    return {
      suggested_master_product_id: top[0]?.product_id ?? null,
      confidence: top[0]?.score ?? 0,
      reason: "no_match",
      candidate_list: top,
      duplicate_warning: false,
      requires_review: true,
    };
  }

  let reason: "attribute_match" | "fuzzy_title" | "no_match" = "no_match";
  let confidence = best.combined;
  if (best.attrScore >= 0.5) {
    reason = "attribute_match";
    if (confidence < HIGH_ATTR_THRESHOLD) confidence = Math.min(confidence, 0.82);
  } else if (best.titleScore >= 0.5) {
    reason = "fuzzy_title";
    confidence = Math.min(best.titleScore, 0.75);
  }

  const duplicate_warning = duplicateProductIds.has(best.id);
  const requires_review =
    duplicate_warning || confidence < LOW_CONFIDENCE_THRESHOLD || reason === "fuzzy_title";

  return {
    suggested_master_product_id: best.id,
    confidence: Math.round(confidence * 100) / 100,
    reason,
    candidate_list: top,
    duplicate_warning,
    requires_review,
  };
}
