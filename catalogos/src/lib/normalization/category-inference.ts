/**
 * Infer product category (product type key) from raw row.
 * Uses keyword scoring from the product type registry (disambiguation group).
 */

import type { CategorySlug } from "@/lib/catalogos/attribute-dictionary-types";
import { getDisambiguationGroupMembers, DEFAULT_PRODUCT_TYPE_KEY } from "@/lib/product-types";
import { combinedText } from "./normalization-utils";

export type RawRow = Record<string, unknown>;

/** Default disambiguation group for glove lines (extend with more groups as new families ship). */
const DEFAULT_DISAMBIGUATION_GROUP = "gloves";

/** Structured result of category inference. */
export interface CategoryInferenceResult {
  category_slug: CategorySlug;
  confidence: number;
  reason: string;
  ambiguous_candidates: CategorySlug[];
}

/** Minimum confidence below which we add a review flag (do not silently trust). */
export const CATEGORY_CONFIDENCE_THRESHOLD = 0.6;

function scoreText(text: string, strong: string[], weak: string[]): number {
  const lower = text.toLowerCase();
  let s = 0;
  for (const k of strong) {
    if (lower.includes(k.toLowerCase())) s += 2;
  }
  for (const k of weak) {
    if (lower.includes(k.toLowerCase())) s += 1;
  }
  return s;
}

/**
 * Infer category with structured result: category_slug, confidence, reason, ambiguous_candidates.
 * Uses keyword scoring; confidence is 0–1. When evidence is weak or tied, ambiguous_candidates is non-empty.
 */
export function inferCategoryWithResult(row: RawRow, hint?: CategorySlug): CategoryInferenceResult {
  const text = combinedText(row);
  const members = getDisambiguationGroupMembers(DEFAULT_DISAMBIGUATION_GROUP);
  if (members.length === 0) {
    const chosen = hint ?? DEFAULT_PRODUCT_TYPE_KEY;
    return {
      category_slug: chosen,
      confidence: 0,
      reason: "no_disambiguation_members",
      ambiguous_candidates: [],
    };
  }

  const scores = new Map<CategorySlug, number>();
  for (const m of members) {
    scores.set(m.key, scoreText(text, [...m.strong], [...m.weak]));
  }

  const entries = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  if (total === 0) {
    const chosen = hint ?? DEFAULT_PRODUCT_TYPE_KEY;
    return {
      category_slug: chosen,
      confidence: 0,
      reason: "no_category_signals",
      ambiguous_candidates: entries.map(([k]) => k),
    };
  }

  const topScore = entries[0]![1];
  const tiedAtTop = entries.filter(([, s]) => s === topScore).map(([k]) => k);

  if (tiedAtTop.length > 1) {
    const chosen = hint ?? DEFAULT_PRODUCT_TYPE_KEY;
    return {
      category_slug: chosen,
      confidence: 0.5,
      reason: "tied_keyword_scores",
      ambiguous_candidates: tiedAtTop,
    };
  }

  const winner = entries[0]![0];
  const winnerScore = topScore;
  const loserScore = entries[1]?.[1] ?? 0;

  const closeScores = Math.abs(winnerScore - loserScore) <= 1 && winnerScore >= 1;
  if (closeScores) {
    return {
      category_slug: winner,
      confidence: Math.min(0.65, 0.5 + (winnerScore - loserScore) * 0.1),
      reason: "close_keyword_scores",
      ambiguous_candidates: entries.map(([k]) => k),
    };
  }

  const ratio = winnerScore / (loserScore + 1);
  const confidence = Math.min(0.98, Math.max(0.55, 0.5 + ratio * 0.15));
  const reason =
    winner === "reusable_work_gloves" ? "keyword_match_work_gloves" : "keyword_match_disposable";
  const hintScore = hint ? scores.get(hint) ?? 0 : 0;
  const hintSupports = Boolean(hint && hintScore > 0);
  const finalReason = hintSupports ? `${reason}_with_hint` : reason;

  return {
    category_slug: winner,
    confidence,
    reason: finalReason,
    ambiguous_candidates: [],
  };
}

/**
 * Infer category from row content (simple slug for backward compatibility).
 * Prefer inferCategoryWithResult() when confidence and review flags are needed.
 */
export function inferCategory(row: RawRow, hint?: CategorySlug): CategorySlug {
  return inferCategoryWithResult(row, hint).category_slug;
}
