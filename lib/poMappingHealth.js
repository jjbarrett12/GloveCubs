/**
 * PO mapping health report (operator / go-live checklist).
 * Backed by public.po_mapping_health_report() when migrated; surfaces same codes as lib/poLineBuilder.js.
 */

const { getSupabaseAdmin } = require('./supabaseAdmin');

/**
 * @param {{ limit?: number, issueCode?: string | null, summary?: boolean }} options
 */
async function runPoMappingHealthReport(options = {}) {
  const supabase = getSupabaseAdmin();
  const limit = Math.min(Math.max(Number(options.limit) || 50000, 1), 200000);
  const issueCode = options.issueCode ? String(options.issueCode).trim() : null;

  const { count: activeCatalogCount, error: countErr } = await supabase
    .schema('catalogos')
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  if (countErr) {
    console.warn('[po-mapping-health] catalogos.products count failed:', countErr.message);
  }

  const { data, error } = await supabase.rpc('po_mapping_health_report', { p_limit: limit });

  if (error) {
    const err = new Error(error.message || 'po_mapping_health_report RPC failed');
    err.code = 'PO_MAPPING_HEALTH_RPC_ERROR';
    err.details = error;
    throw err;
  }

  let rows = Array.isArray(data) ? data : [];
  if (issueCode) {
    rows = rows.filter((r) => r && r.issue_code === issueCode);
  }

  const byCode = {};
  for (const r of rows) {
    const c = r.issue_code || 'UNKNOWN';
    byCode[c] = (byCode[c] || 0) + 1;
  }

  const distinctVariants = new Set(rows.map((r) => r.catalog_product_id).filter(Boolean));

  const base = {
    generated_at: new Date().toISOString(),
    scan_limit: limit,
    active_catalog_products: typeof activeCatalogCount === 'number' ? activeCatalogCount : null,
    issue_row_count: rows.length,
    distinct_variant_count: distinctVariants.size,
    by_code: byCode,
  };

  if (options.summary) {
    return {
      ...base,
      ready_for_po_catalog:
        rows.length === 0 && (activeCatalogCount === 0 || typeof activeCatalogCount === 'number'),
      hints: {
        full_report: '/api/admin/po-mapping-health',
        filter_no_offers: '/api/admin/po-mapping-health?issue_code=NO_ACTIVE_OFFERS',
      },
    };
  }

  return {
    ...base,
    issues: rows,
  };
}

module.exports = { runPoMappingHealthReport };
