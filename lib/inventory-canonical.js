/**
 * Resolve catalog UUID for inventory / stock_history events (V2: explicit UUID only).
 */

const { normalizeCanonicalUuidInput } = require('./resolve-canonical-product-id');

/**
 * @param {string} context
 * @param {number} productId
 * @param {string} [detail]
 */
function logInventoryWriteWithoutCanonical(context, productId, detail = '') {
  const tail = detail ? ` ${detail}` : '';
  console.warn(`[inventory-canonical] write_without_resolved_canonical context=${context} hint=${productId}${tail}`);
}

/**
 * @param {number} productId - unused except for logs when resolution fails
 * @param {{ explicitLine?: unknown, explicitRow?: unknown }} hints
 * @param {string} context
 * @returns {Promise<{ uuid: string | null, source: 'explicit_line' | 'inventory_row' | null }>}
 */
async function resolveCanonicalForInventoryEvent(productId, hints, context) {
  const fromLine = normalizeCanonicalUuidInput(hints?.explicitLine);
  if (fromLine) {
    return { uuid: fromLine, source: 'explicit_line' };
  }
  const fromRow = normalizeCanonicalUuidInput(hints?.explicitRow);
  if (fromRow) {
    return { uuid: fromRow, source: 'inventory_row' };
  }
  logInventoryWriteWithoutCanonical(context, productId, 'missing_canonical_product_id');
  return { uuid: null, source: null };
}

module.exports = {
  logInventoryWriteWithoutCanonical,
  resolveCanonicalForInventoryEvent,
};
