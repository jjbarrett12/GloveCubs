/**
 * Shapes product objects for public GET /api/products* responses.
 * Strips cost and other internal pricing fields; never exposes margin inputs.
 */

'use strict';

/** Keys that must never appear on public storefront API responses. */
const FORBIDDEN_PUBLIC_KEYS = new Set([
  'cost',
  'supplier_cost',
  'landed_cost',
  'margin',
  'default_margin',
  'gross_margin',
  'net_margin',
  'customer_price_override',
]);

/**
 * Retail list price from DB only (never infer from cost).
 * @param {{ list_price?: unknown, price?: unknown, cost?: unknown }} product
 * @returns {number}
 */
function resolveListPriceForPublicApi(product) {
  if (product.list_price != null && product.list_price !== '') {
    const n = Number(product.list_price);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

/**
 * @param {Record<string, unknown>} product - full row from productsService
 * @param {{ isAdmin: boolean, isApprovedB2B: boolean, sellPrice?: number | null }} opts
 * @returns {Record<string, unknown>}
 */
function sanitizeProductForPublicApi(product, opts) {
  const { isAdmin, isApprovedB2B, sellPrice } = opts;
  if (isAdmin) {
    return { ...product };
  }

  const listPriceDisplay = resolveListPriceForPublicApi(product);

  /** @type {Record<string, unknown>} */
  const out = {
    id: product.id,
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    supplier_name: product.supplier_name,
    category: product.category,
    subcategory: product.subcategory,
    description: product.description,
    material: product.material,
    sizes: product.sizes,
    color: product.color,
    pack_qty: product.pack_qty,
    case_qty: product.case_qty,
    list_price: listPriceDisplay,
    price: listPriceDisplay,
    image_url: product.image_url,
    images: product.images,
    in_stock: product.in_stock,
    quantity_on_hand: product.quantity_on_hand,
    featured: product.featured,
    powder: product.powder,
    thickness: product.thickness,
    grade: product.grade,
    useCase: product.useCase,
    certifications: product.certifications,
    texture: product.texture,
    cuffStyle: product.cuffStyle,
    sterility: product.sterility,
    video_url: product.video_url,
    manufacturer_id: product.manufacturer_id,
    attributes: product.attributes,
    canonical_product_id: product.canonical_product_id,
    slug: product.slug,
    industry_tags: product.industry_tags,
    created_at: product.created_at,
    updated_at: product.updated_at,
    cut_level: product.cut_level,
    puncture_level: product.puncture_level,
    abrasion_level: product.abrasion_level,
    flame_resistant: product.flame_resistant,
    arc_level: product.arc_level,
    warm_rating: product.warm_rating,
    use_case: product.use_case,
    industry: product.industry,
  };

  Object.keys(out).forEach((k) => {
    if (out[k] === undefined) delete out[k];
  });

  const sp = sellPrice != null && sellPrice !== '' ? Number(sellPrice) : null;
  if (sp != null && Number.isFinite(sp)) {
    out.sell_price = sp;
  }

  if (isApprovedB2B && product.bulk_price != null && product.bulk_price !== '') {
    const b = Number(product.bulk_price);
    if (!Number.isNaN(b)) out.bulk_price = b;
  }

  return out;
}

/**
 * @param {Record<string, unknown>[]} products
 * @param {{ isAdmin: boolean, isApprovedB2B: boolean }} opts
 * @returns {Record<string, unknown>[]}
 */
function sanitizeProductsArrayForPublicApi(products, opts) {
  return (products || []).map((p) =>
    sanitizeProductForPublicApi(p, {
      ...opts,
      sellPrice: p.sell_price != null ? p.sell_price : null,
    })
  );
}

module.exports = {
  sanitizeProductForPublicApi,
  sanitizeProductsArrayForPublicApi,
  resolveListPriceForPublicApi,
  FORBIDDEN_PUBLIC_KEYS,
};
