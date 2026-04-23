/**
 * Price per glove: computed from best_price / gloves_per_box.
 * Uses attributes.box_qty, pack_size, or fallback. Server-side.
 */

import type { LiveProductItem } from "@/lib/catalog/types";

export interface PricePerGloveResult {
  price_per_glove: number | null;
  gloves_per_box: number | null;
  best_price: number | null;
  display_per_glove: string;
  display_case: string;
}

function glovesPerBox(attrs: Record<string, unknown>): number | null {
  const box = attrs?.box_qty ?? attrs?.pack_size ?? attrs?.qty_per_box ?? attrs?.gloves_per_box;
  if (box == null) return null;
  const n = Number(box);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/**
 * Compute price per glove for one product. Returns display strings and raw values.
 */
export function computePricePerGlove(item: LiveProductItem): PricePerGloveResult {
  const best = item.best_price != null && Number.isFinite(item.best_price) ? item.best_price : null;
  const attrs = (item.attributes ?? {}) as Record<string, unknown>;
  const gloves = glovesPerBox(attrs) ?? 100;

  const perGlove =
    best != null && gloves > 0 ? Math.round((best / gloves) * 100) / 100 : null;
  const displayPerGlove =
    perGlove != null ? `$${perGlove.toFixed(2)} / glove` : "—";
  const displayCase =
    best != null ? `$${Number(best).toFixed(0)} / case` : "—";

  return {
    price_per_glove: perGlove,
    gloves_per_box: gloves,
    best_price: best,
    display_per_glove: displayPerGlove,
    display_case: displayCase,
  };
}

/**
 * Batch compute for a list; also return a map for quick lookup.
 */
export function computePricePerGloveBatch(
  items: LiveProductItem[]
): Map<string, PricePerGloveResult> {
  const map = new Map<string, PricePerGloveResult>();
  for (const item of items) {
    map.set(item.id, computePricePerGlove(item));
  }
  return map;
}
