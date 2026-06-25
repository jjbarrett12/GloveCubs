'use strict';

const { getSupabaseAdmin } = require('./supabaseAdmin');
const { normalizeCanonicalUuidInput } = require('./resolve-canonical-product-id');

/**
 * Thrown when a product UUID is not a catalog_v2.catalog_products.id, or when a
 * catalogos.products.id is supplied where inventory / commerce expects catalog_v2.
 */
class InvalidCatalogV2ProductIdError extends Error {
  /**
   * @param {string} message
   * @param {{ context?: string, product_id?: string, typedCode?: string, statusCode?: number }} [opts]
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = 'InvalidCatalogV2ProductIdError';
    this.context = opts.context;
    this.product_id = opts.product_id;
    this.typedCode = opts.typedCode || 'INVALID_CATALOG_PRODUCT_ID';
    this.statusCode = opts.statusCode != null ? opts.statusCode : 422;
  }
}

/**
 * Require that rawUuid is a primary key in catalog_v2.catalog_products (inventory / checkout truth).
 *
 * @param {unknown} rawUuid
 * @param {string} context - e.g. cart_post, checkout_cart_lines, inventory_reserve
 * @returns {Promise<string>} normalized lowercase UUID
 */
async function assertCatalogV2ProductIdForCommerce(rawUuid, context) {
  const id = normalizeCanonicalUuidInput(rawUuid);
  if (!id) {
    throw new InvalidCatalogV2ProductIdError('Product id must be a valid UUID.', {
      context,
      product_id: rawUuid != null ? String(rawUuid) : '',
      typedCode: 'INVALID_PRODUCT_UUID',
      statusCode: 422,
    });
  }

  const supabase = getSupabaseAdmin();
  const { data: cp, error: cpErr } = await supabase
    .schema('catalog_v2')
    .from('catalog_products')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (cpErr) throw cpErr;
  if (cp && cp.id) return normalizeCanonicalUuidInput(cp.id) || id;

  throw new InvalidCatalogV2ProductIdError('Unknown catalog product: no row in catalog_v2.catalog_products.', {
    context,
    product_id: id,
    typedCode: 'NOT_FOUND_IN_CATALOG_V2',
    statusCode: 422,
  });
}

module.exports = {
  assertCatalogV2ProductIdForCommerce,
  InvalidCatalogV2ProductIdError,
};
