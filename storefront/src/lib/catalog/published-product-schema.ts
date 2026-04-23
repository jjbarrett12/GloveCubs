/**
 * Zod schemas for published-catalog invariants (admin / API guards).
 * Does not replace DB constraints; validates payloads before write or sync publish.
 */

import { z } from "zod";

export const productLineCodeSchema = z.enum([
  "ppe_gloves",
  "ppe_eye",
  "ppe_respiratory",
  "ppe_apparel",
  "facility_consumables",
]);

/** Minimum fields for a merchandisable published SKU (customer-facing) */
export const publishedProductCoreSchema = z.object({
  sku: z.string().min(1).max(120),
  name: z.string().min(1).max(500),
  product_line_code: productLineCodeSchema.default("ppe_gloves"),
  /** List / compare-at in minor units optional — caller may use decimal dollars */
  list_price: z.number().nonnegative().finite().optional(),
  cost: z.number().nonnegative().finite().optional(),
  is_active: z.boolean().default(true),
  attributes: z.record(z.unknown()).default({}),
});

export type PublishedProductCore = z.infer<typeof publishedProductCoreSchema>;

/**
 * Enforce pricing sanity when both cost and list are present (warn-level; use in admin only).
 */
export function validateMarginGuard(input: PublishedProductCore): { ok: true } | { ok: false; message: string } {
  if (input.cost != null && input.list_price != null && input.list_price > 0 && input.cost > input.list_price) {
    return { ok: false, message: "Cost exceeds list price — confirm before publish." };
  }
  return { ok: true };
}
