/**
 * Cart line normalization for Express cart routes (server.js).
 * Persisted: canonical_product_id + product_id = catalog_v2.catalog_products.id;
 * optional listing_id = catalogos.products.id for pricing / UI.
 */
const { z } = require('zod');

const Uuid = z.string().uuid();

const CartLinePersistSchema = z.object({
  id: z.union([z.number(), z.string()]),
  /** catalog_v2.catalog_products.id (same as canonical_product_id). */
  product_id: Uuid,
  size: z.string().nullable().optional(),
  quantity: z.number().int().positive(),
  canonical_product_id: Uuid,
  /** catalogos.products.id when known (listing fetch). */
  listing_id: Uuid.optional(),
});

/** Strict shape for lines after server normalization (checkout-ready). */
const CartLineWithCanonicalSchema = CartLinePersistSchema;

/**
 * @param {unknown} raw
 * @returns {z.infer<typeof CartLinePersistSchema>}
 */
function parsePersistedCartLine(raw) {
  return CartLinePersistSchema.parse(raw);
}

/**
 * Build a new persisted cart line from request body (POST /api/cart).
 * @param {{ product_id: unknown, size?: unknown, quantity?: unknown, canonical_product_id?: unknown, listing_id?: unknown }} body
 * @param {number} [lineId]
 */
function newCartLineFromBody(body, lineId = Date.now()) {
  const qty = Math.max(1, parseInt(String(body.quantity), 10) || 1);
  const canon = Uuid.parse(String(body.canonical_product_id ?? body.product_id ?? ''));
  const listingRaw = body.listing_id != null && String(body.listing_id).trim() !== '' ? String(body.listing_id) : null;
  const out = {
    id: lineId,
    product_id: canon,
    size: body.size != null && body.size !== '' ? String(body.size) : null,
    quantity: qty,
    canonical_product_id: canon,
  };
  if (listingRaw) out.listing_id = Uuid.parse(listingRaw);
  return out;
}

module.exports = {
  CartLinePersistSchema,
  CartLineWithCanonicalSchema,
  parsePersistedCartLine,
  newCartLineFromBody,
};
