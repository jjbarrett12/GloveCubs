/**
 * Live DB: every active catalog_v2.catalog_products row must have at least one active
 * gc_commerce.sellable_products row for the same catalog_product_id with integer list_price_minor >= 1.
 *
 * Used by scripts/validate-canonical-commerce-flow.js (RUN_CATALOG_SELLABLE_GUARD=1) and catalogos Vitest.
 */

'use strict';

const PAGE = 1000;
const ID_CHUNK = 150;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Array<{ catalog_product_id: string; slug: string | null; internal_sku: string | null; reason: string }>>}
 */
async function findCatalogV2SellableIntegrityViolations(supabase) {
  /** @type {{ id: string; slug: string | null; internal_sku: string | null }[]} */
  const products = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .schema('catalog_v2')
      .from('catalog_products')
      .select('id, slug, internal_sku')
      .eq('status', 'active')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    products.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  if (!products.length) return [];

  /** @type {Map<string, boolean>} */
  const hasValidSellable = new Map();
  for (const p of products) hasValidSellable.set(p.id, false);

  const ids = products.map((p) => p.id);
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunkIds = ids.slice(i, i + ID_CHUNK);
    const { data: sellables, error: sErr } = await supabase
      .schema('gc_commerce')
      .from('sellable_products')
      .select('catalog_product_id, list_price_minor, is_active')
      .in('catalog_product_id', chunkIds)
      .eq('is_active', true);
    if (sErr) throw sErr;
    for (const row of sellables ?? []) {
      const cid = row.catalog_product_id;
      if (!cid) continue;
      const lm = row.list_price_minor;
      const n = Number(lm);
      const valid = lm != null && Number.isFinite(n) && Number.isInteger(n) && n >= 1;
      if (valid) hasValidSellable.set(String(cid), true);
    }
  }

  /** @type {Array<{ catalog_product_id: string; slug: string | null; internal_sku: string | null; reason: string }>} */
  const violations = [];
  for (const p of products) {
    if (!hasValidSellable.get(p.id)) {
      violations.push({
        catalog_product_id: p.id,
        slug: p.slug ?? null,
        internal_sku: p.internal_sku ?? null,
        reason: 'missing_active_sellable_or_invalid_list_price_minor',
      });
    }
  }
  return violations;
}

/**
 * @param {Awaited<ReturnType<typeof findCatalogV2SellableIntegrityViolations>>} violations
 * @returns {string}
 */
function formatCatalogV2SellableIntegrityReport(violations) {
  if (!violations.length) {
    return 'OK: every active catalog_v2.catalog_products row has an active gc_commerce.sellable_products row with list_price_minor >= 1 (integer cents).';
  }
  const lines = violations.map(
    (v) =>
      `${v.catalog_product_id}\tslug=${v.slug ?? ''}\tinternal_sku=${v.internal_sku ?? ''}\t${v.reason}`,
  );
  return ['FAIL: active catalog_v2 products missing valid sellable pricing:', ...lines].join('\n');
}

module.exports = {
  findCatalogV2SellableIntegrityViolations,
  formatCatalogV2SellableIntegrityReport,
};
