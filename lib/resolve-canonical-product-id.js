'use strict';

/**
 * V2 commerce: catalogos.products.id (UUID) is the only product line identity.
 * No live_product_id bridge, no bigint product_id resolution, no public.canonical_products fallback.
 */

const CANONICAL_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** @type {Record<string, string>} */
const SIZE_SYNONYMS = {
  'x-small': 'xs',
  xsmall: 'xs',
  'extra small': 'xs',
  small: 's',
  medium: 'm',
  med: 'm',
  large: 'l',
  'x-large': 'xl',
  xlarge: 'xl',
  'extra large': 'xl',
  'x large': 'xl',
  '2x-large': 'xxl',
  '2xlarge': 'xxl',
  '2xl': 'xxl',
  '3x-large': 'xxxl',
  '4x-large': '4xl',
};

const STRICT_VARIANT_SIZE_TOKENS = new Set(['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '4xl']);

class MissingCanonicalProductIdError extends Error {
  /** @param {string} context */
  constructor(context) {
    super(
      `V2 commerce requires canonical_product_id (catalogos.products UUID) on every line (context=${context}).`,
    );
    this.name = 'MissingCanonicalProductIdError';
    this.context = context;
    this.statusCode = 422;
  }
}

class MissingVariantCanonicalProductIdError extends Error {
  /**
   * @param {string} context
   * @param {unknown} [size]
   */
  constructor(context, size) {
    super(`V2 commerce requires canonical_product_id for sized cart/order lines (context=${context}).`);
    this.name = 'MissingVariantCanonicalProductIdError';
    this.context = context;
    this.size = size;
    this.statusCode = 422;
  }
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function normalizeCommerceSize(raw) {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (SIZE_SYNONYMS[lower]) return SIZE_SYNONYMS[lower];
  if (/^xs$/i.test(t)) return 'xs';
  if (/^s$/i.test(t)) return 's';
  if (/^m$/i.test(t)) return 'm';
  if (/^l$/i.test(t)) return 'l';
  if (/^xl$/i.test(t)) return 'xl';
  if (/^xxl$/i.test(t)) return 'xxl';
  if (/^xxxl$/i.test(t)) return 'xxxl';
  return lower;
}

/**
 * @param {string | null} norm
 * @returns {boolean}
 */
function isStrictVariantSizeToken(norm) {
  return norm != null && STRICT_VARIANT_SIZE_TOKENS.has(norm);
}

/**
 * @param {unknown} raw
 * @returns {string | null} lowercase UUID or null
 */
function normalizeCanonicalUuidInput(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (!CANONICAL_UUID_RE.test(s)) return null;
  return s.toLowerCase();
}

/**
 * @param {{ product_id?: unknown, canonical_product_id?: unknown }} line
 * @returns {string | null}
 */
function resolveLineCatalogProductId(line) {
  const a = normalizeCanonicalUuidInput(line && line.canonical_product_id);
  if (a) return a;
  return normalizeCanonicalUuidInput(line && line.product_id);
}

/**
 * Mutate lines in place: require catalog UUID on each line (canonical_product_id or UUID-shaped product_id).
 * @param {Array<{ product_id?: unknown, canonical_product_id?: unknown, size?: unknown }>} lines
 * @param {string} context
 */
async function ensureCommerceLinesHaveCanonical(lines, context) {
  const list = Array.isArray(lines) ? lines : [];
  for (const line of list) {
    const uuid = resolveLineCatalogProductId(line);
    if (!uuid) {
      const hasSize = line.size != null && String(line.size).trim() !== '';
      const norm = hasSize ? normalizeCommerceSize(line.size) : null;
      if (hasSize && isStrictVariantSizeToken(norm)) {
        throw new MissingVariantCanonicalProductIdError(context, line.size);
      }
      throw new MissingCanonicalProductIdError(context);
    }
    line.canonical_product_id = uuid;
    line.product_id = uuid;
  }
  return list;
}

/**
 * Build legacy order_items-shaped rows (tests / rare callers). V2: canonical_product_id only; product_id is 0 when unset.
 * @param {string|number} orderId
 * @param {Array<{ product_id?: unknown, quantity?: unknown, size?: unknown, unit_price?: unknown, canonical_product_id?: unknown }>} items
 * @param {unknown} [_unusedMap]
 * @param {{ requireCanonical?: boolean, context?: string }} [options]
 */
async function buildOrderItemRowsForInsert(orderId, items, _unusedMap, options = {}) {
  const { requireCanonical = false, context = 'order_items_insert' } = options;
  const list = items || [];
  return Promise.all(
    list.map(async (i) => {
      const canonical =
        normalizeCanonicalUuidInput(i.canonical_product_id) || normalizeCanonicalUuidInput(i.product_id);
      if (!canonical && requireCanonical) {
        throw new MissingCanonicalProductIdError(context);
      }
      const row = {
        order_id: orderId,
        product_id: 0,
        quantity: i.quantity || 1,
        size: i.size ?? null,
        unit_price: i.unit_price ?? 0,
      };
      if (canonical) row.canonical_product_id = canonical;
      if (i.unit_cost_at_order != null && i.unit_cost_at_order !== '') {
        const u = Number(i.unit_cost_at_order);
        if (Number.isFinite(u) && u >= 0) {
          row.unit_cost_at_order = Math.round(u * 10000) / 10000;
          const qty = row.quantity || 1;
          if (i.total_cost_at_order != null && i.total_cost_at_order !== '') {
            const t = Number(i.total_cost_at_order);
            row.total_cost_at_order =
              Number.isFinite(t) && t >= 0 ? Math.round(t * 100) / 100 : Math.round(u * qty * 100) / 100;
          } else {
            row.total_cost_at_order = Math.round(u * qty * 100) / 100;
          }
        }
      }
      return row;
    }),
  );
}

module.exports = {
  CANONICAL_UUID_RE,
  MissingCanonicalProductIdError,
  MissingVariantCanonicalProductIdError,
  normalizeCanonicalUuidInput,
  normalizeCommerceSize,
  isStrictVariantSizeToken,
  resolveLineCatalogProductId,
  ensureCommerceLinesHaveCanonical,
  buildOrderItemRowsForInsert,
};
