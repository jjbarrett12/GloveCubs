/**
 * Lead scoring: 0–100 from catalog/API/CSV/PDF signals and product categories.
 */

import type { RawLeadCandidate, CatalogSignal } from "./types";

const MAX_SCORE = 100;

/** Product categories we care about; presence boosts score. */
const RELEVANT_CATEGORIES = new Set([
  "gloves",
  "ppe",
  "safety",
  "nitrile",
  "disposable",
  "work gloves",
  "industrial",
  "medical",
  "food service",
]);

function normalizeCategories(cats: string[] | undefined): string[] {
  if (!Array.isArray(cats)) return [];
  return cats.map((c) => String(c).toLowerCase().trim()).filter(Boolean);
}

function categoryScore(categories: string[]): number {
  if (categories.length === 0) return 0;
  let score = 0;
  for (const c of categories) {
    const lower = c.toLowerCase();
    for (const rel of RELEVANT_CATEGORIES) {
      if (lower.includes(rel)) {
        score += 10;
        break;
      }
    }
  }
  return Math.min(score, 30);
}

/**
 * Compute lead_score 0–100 from candidate signals.
 * - Has website/domain: +15
 * - catalog_signals (product pages, catalog links): +10 per signal, max 25
 * - api_signal: +20
 * - csv_signal: +15
 * - pdf_catalog_signal: +15
 * - product_categories relevance: up to 30
 */
export function computeLeadScore(candidate: RawLeadCandidate): number {
  let score = 0;
  const hasDomain =
    (candidate.domain && candidate.domain.length > 0) ||
    (candidate.website && candidate.website.length > 0);
  if (hasDomain) score += 15;

  const signals: CatalogSignal[] = candidate.catalog_signals ?? [];
  if (signals.length > 0) {
    score += Math.min(signals.length * 10, 25);
  }
  if (candidate.api_signal) score += 20;
  if (candidate.csv_signal) score += 15;
  if (candidate.pdf_catalog_signal) score += 15;

  const categories = normalizeCategories(candidate.product_categories);
  score += categoryScore(categories);

  return Math.min(Math.round(score), MAX_SCORE);
}
