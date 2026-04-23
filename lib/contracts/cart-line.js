/**
 * Cart line normalization for Express cart routes (server.js).
 * V2: catalogos.products.id (UUID) is the only product identity on persisted cart JSON.
 */
const { z } = require('zod');

const Uuid = z.string().uuid();

const CartLinePersistSchema = z.object({
  id: z.union([z.number(), z.string()]),
  /** Catalog product UUID (same as canonical_product_id for V2). */
  product_id: Uuid,
  size: z.string().nullable().optional(),
  quantity: z.number().int().positive(),
  canonical_product_id: Uuid,
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
 * @param {{ product_id: unknown, size?: unknown, quantity?: unknown, canonical_product_id?: unknown }} body
 * @param {number} [lineId]
 */
function newCartLineFromBody(body, lineId = Date.now()) {
  const qty = Math.max(1, parseInt(String(body.quantity), 10) || 1);
  const canon = Uuid.parse(String(body.canonical_product_id ?? body.product_id ?? ''));
  return {
    id: lineId,
    product_id: canon,
    size: body.size != null && body.size !== '' ? String(body.size) : null,
    quantity: qty,
    canonical_product_id: canon,
  };
}

module.exports = {
  CartLinePersistSchema,
  CartLineWithCanonicalSchema,
  parsePersistedCartLine,
  newCartLineFromBody,
};
