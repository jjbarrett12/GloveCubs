'use strict';

/**
 * catalog_v2.catalog_products.id is the only valid commerce product UUID.
 * Rejects unknown UUIDs — no catalogos.products bridge.
 */

const { getSupabaseAdmin } = require('./supabaseAdmin');
const { normalizeCanonicalUuidInput } = require('./resolve-canonical-product-id');

class CatalogV2ProductMappingError extends Error {
  constructor(message, opts = {}) {
    super(message);
    this.name = 'CatalogV2ProductMappingError';
    this.catalogosProductId = opts.catalogosProductId;
  }
}

/**
 * @param {unknown} catalogProductId - must exist in catalog_v2.catalog_products
 * @returns {Promise<string>} same id (lowercase UUID)
 */
async function resolveCatalogV2ProductId(catalogProductId) {
  const id = normalizeCanonicalUuidInput(catalogProductId);
  if (!id) {
    throw new CatalogV2ProductMappingError('resolveCatalogV2ProductId: invalid or missing catalog_v2 product id', {
      catalogosProductId: catalogProductId,
    });
  }

  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase
    .schema('catalog_v2')
    .from('catalog_products')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new CatalogV2ProductMappingError(
      `resolveCatalogV2ProductId: catalog_v2.catalog_products lookup failed: ${error.message}`,
      { catalogosProductId: id },
    );
  }
  if (!row) {
    throw new CatalogV2ProductMappingError(`resolveCatalogV2ProductId: unknown catalog_v2.catalog_products id=${id}`, {
      catalogosProductId: id,
    });
  }

  return id;
}

module.exports = {
  resolveCatalogV2ProductId,
  CatalogV2ProductMappingError,
};
