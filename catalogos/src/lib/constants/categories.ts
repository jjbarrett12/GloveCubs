/**
 * Product category slugs: implemented types come from the product type registry;
 * additional slugs are roadmap-only until a registry entry + DB category exist.
 */

import {
  IMPLEMENTED_PRODUCT_TYPE_KEYS,
  DEFAULT_PRODUCT_TYPE_KEY,
  type ProductTypeKey,
} from "@/lib/product-types";

/** Re-export for callers that branch on implemented glove types. */
export type { ProductTypeKey };

/** Categories with a full registry definition (storefront + ingestion) today. */
export const IMPLEMENTED_CATEGORIES = IMPLEMENTED_PRODUCT_TYPE_KEYS;

const ROADMAP_CATEGORIES = [
  "industrial_gloves",
  "safety_glasses",
  "face_masks",
  "disposable_apparel",
  "hand_hygiene",
  "wipers",
  "liners",
] as const;

/** All known category slugs (implemented + planned). */
export const CATEGORIES = [...IMPLEMENTED_PRODUCT_TYPE_KEYS, ...ROADMAP_CATEGORIES] as const;

export type ProductCategory = (typeof CATEGORIES)[number];

export const DEFAULT_CATEGORY = DEFAULT_PRODUCT_TYPE_KEY;
