/**
 * Value signals engine: compute badges (Best Value, Heavy Duty, Food Safe, etc.)
 * from product attributes and context. Server-side; fail gracefully when attributes missing.
 */

import type { LiveProductItem } from "@/lib/catalog/types";

export type ValueSignalKey =
  | "best_value"
  | "most_popular"
  | "heavy_duty"
  | "food_safe"
  | "medical_grade"
  | "extra_thick";

export interface ValueSignal {
  key: ValueSignalKey;
  label: string;
}

function numAttr(attrs: Record<string, unknown>, key: string): number | null {
  const v = attrs?.[key];
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strAttr(attrs: Record<string, unknown>, key: string): string | null {
  const v = attrs?.[key];
  if (v == null) return null;
  return String(v).trim() || null;
}

/**
 * Compute value signals for a single product. Does not determine "best value" (needs context).
 */
export function computeSignalsForProduct(item: LiveProductItem): ValueSignal[] {
  const attrs = (item.attributes ?? {}) as Record<string, unknown>;
  const signals: ValueSignal[] = [];

  const thickness = numAttr(attrs, "thickness_mil");
  if (thickness != null && thickness >= 6) {
    signals.push({ key: "heavy_duty", label: "Heavy Duty" });
  }
  if (thickness != null && thickness >= 8) {
    signals.push({ key: "extra_thick", label: "Extra Thick" });
  }

  const grade = strAttr(attrs, "grade");
  if (grade === "food_service_grade" || grade === "food") {
    signals.push({ key: "food_safe", label: "Food Safe" });
  }
  if (grade === "medical_exam_grade" || grade === "medical") {
    signals.push({ key: "medical_grade", label: "Medical Grade" });
  }

  return signals;
}

/**
 * Given a list of items (e.g. current page), mark the one with lowest price_per_glove as "Best Value".
 * Call after computing price_per_glove for each.
 */
export function addBestValueSignal(
  items: Array<{ id: string; signals: ValueSignal[]; price_per_glove: number | null }>
): void {
  const withPrice = items.filter((i) => i.price_per_glove != null && i.price_per_glove > 0);
  if (withPrice.length === 0) return;
  const min = Math.min(...withPrice.map((i) => i.price_per_glove!));
  const best = withPrice.find((i) => i.price_per_glove === min);
  if (best && !best.signals.some((s) => s.key === "best_value")) {
    best.signals.unshift({ key: "best_value", label: "Best Value" });
  }
}

/** Optional: mark first N as "Most Popular" when we have no real popularity data. */
export function addMostPopularPlaceholder(
  items: Array<{ signals: ValueSignal[] }>,
  atMost: number
): void {
  items.slice(0, atMost).forEach((item) => {
    if (!item.signals.some((s) => s.key === "most_popular")) {
      item.signals.push({ key: "most_popular", label: "Most Popular" });
    }
  });
}
