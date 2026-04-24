import { z } from "zod";

/**
 * Legacy Express (`server.js`) cart line as returned by `GET /api/cart`
 * after enrichment (prices and product fields merged in memory).
 */
export const LegacyCartLineApiSchema = z.object({
  id: z.union([z.number(), z.string()]),
  /** catalog_v2.catalog_products.id */
  product_id: z.string().uuid(),
  size: z.string().nullable().optional(),
  quantity: z.number().int().nonnegative(),
  canonical_product_id: z.string().uuid().nullable().optional(),
  /** catalogos.products.id when present */
  listing_id: z.string().uuid().optional(),
  name: z.string().optional(),
  price: z.number().optional(),
  bulk_price: z.number().nullable().optional(),
  image_url: z.string().optional(),
  sku: z.string().optional(),
  variant_sku: z.string().optional(),
});

export type LegacyCartLineApi = z.infer<typeof LegacyCartLineApiSchema>;

/**
 * Order line as returned by order fetch endpoints after `_enrichOrderWithItems` (Express).
 */
export const LegacyOrderItemApiSchema = z.object({
  product_id: z.coerce.number(),
  quantity: z.number(),
  size: z.string().nullable().optional(),
  unit_price: z.number(),
  product_name: z.string().optional(),
  sku: z.string().optional(),
  canonical_product_id: z.string().uuid().nullable().optional(),
});

export type LegacyOrderItemApi = z.infer<typeof LegacyOrderItemApiSchema>;
