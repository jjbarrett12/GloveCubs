/**
 * Owner Cockpit aggregates — gc_commerce orders/companies/members; read-only.
 */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const companiesService = require('./companiesService');

const GC = 'gc_commerce';
const PENDING_ORDER_STATUSES = ['pending', 'processing', 'pending_payment', 'invoiced'];

function emptyOverview(note) {
  return {
    ok: !!note,
    note: note || null,
    totals: {},
    recent_orders: [],
    recent_companies: [],
    inventory_summary: null,
    schema_gaps: ['stripe_customers', 'payment_methods', 'company_pricing_table'],
  };
}

function minorToDollars(m) {
  const n = Number(m);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n) / 100;
}

async function getOverviewSnapshot() {
  const sb = getSupabaseAdmin();
  const schemaGaps = [];
  schemaGaps.push('public.stripe_customers / payment_methods not used by this app — Stripe visibility via orders.stripe_payment_intent_id only');
  schemaGaps.push('company_pricing table not present — using companies.default_gross_margin_percent + customer_manufacturer_pricing');

  try {
    const [
      companiesCount,
      ordersCount,
      pendingOrdersCount,
      recentOrdersRows,
      productsHead,
      featuredHead,
      missingCostHead,
      usersAll,
      adminsHead,
      members,
      overrides,
      invRows,
      companiesRecent,
    ] = await Promise.all([
      sb.schema(GC).from('companies').select('id', { count: 'exact', head: true }),
      sb.schema(GC).from('orders').select('id', { count: 'exact', head: true }),
      sb
        .schema(GC)
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .in('status', PENDING_ORDER_STATUSES),
      sb
        .schema(GC)
        .from('orders')
        .select(
          'id, order_number, status, total_minor, created_at, company_id, stripe_payment_intent_id'
        )
        .order('created_at', { ascending: false })
        .limit(12),
      sb.schema('catalogos').from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
      sb.schema('catalogos').from('products').select('id', { count: 'exact', head: true }).eq('is_active', true).contains('attributes', { featured: 1 }),
      sb.schema('catalogos')
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .or('attributes.is.null,attributes->unit_cost.is.null'),
      sb.from('users').select('id, is_approved'),
      sb.from('app_admins').select('auth_user_id', { count: 'exact', head: true }),
      sb.schema(GC).from('company_members').select('company_id'),
      sb.schema(GC).from('customer_manufacturer_pricing').select('company_id'),
      sb.from('inventory').select('id, canonical_product_id, quantity_on_hand, reorder_point'),
      sb
        .schema(GC)
        .from('companies')
        .select('id, trade_name, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const err = (r) => r && r.error;
    if (err(companiesCount) || err(ordersCount)) {
      console.error('[ownerCockpit] overview partial', err(companiesCount) || err(ordersCount));
      return { ...emptyOverview('Partial load failure'), schema_gaps: schemaGaps };
    }

    const orders = recentOrdersRows.data || [];
    const totalOrders = ordersCount.count ?? 0;
    let pendingOrders = pendingOrdersCount.count;
    if (pendingOrdersCount.error) {
      pendingOrders = null;
      schemaGaps.push('pending order count: status filter may not match all DB values — check manually');
    }

    const memberCompanyIds = new Set((members.data || []).map((m) => m.company_id).filter(Boolean));
    let orderCompanyIds = new Set();
    const { data: orderCids } = await sb
      .schema(GC)
      .from('orders')
      .select('company_id')
      .not('company_id', 'is', null)
      .limit(15000);
    (orderCids || []).forEach((o) => {
      if (o.company_id != null) orderCompanyIds.add(o.company_id);
    });
    const activeCompanyIds = new Set([...memberCompanyIds, ...orderCompanyIds]);
    const totalCompanies = companiesCount.count ?? 0;

    const users = usersAll.data || [];
    const approvedUsers = users.filter((u) => Number(u.is_approved) === 1).length;
    const unapprovedUsers = users.length - approvedUsers;

    const overrideCompanyIds = new Set((overrides.data || []).map((o) => o.company_id).filter(Boolean));
    const pricingCoveragePct =
      totalCompanies > 0 ? Math.round((overrideCompanyIds.size / totalCompanies) * 100) : 0;

    let invTotalQty = 0;
    let invRowsCount = (invRows.data || []).length;
    if (invRows.error) {
      invRowsCount = 0;
      schemaGaps.push('inventory query failed: ' + (invRows.error.message || ''));
    } else {
      (invRows.data || []).forEach((r) => {
        invTotalQty += Number(r.quantity_on_hand) || 0;
      });
    }

    const companyNameMap = {};
    const { data: allCompanies } = await sb.schema(GC).from('companies').select('id, trade_name');
    (allCompanies || []).forEach((c) => {
      companyNameMap[c.id] = c.trade_name || 'Company';
    });

    const recentOrders = orders.map((o) => ({
      order_number: o.order_number,
      status: o.status,
      total: minorToDollars(o.total_minor),
      created_at: o.created_at,
      company_id: o.company_id,
      company_name: o.company_id ? companyNameMap[o.company_id] || String(o.company_id) : null,
      has_stripe_intent: !!(o.stripe_payment_intent_id && String(o.stripe_payment_intent_id).trim()),
    }));

    return {
      ok: true,
      totals: {
        total_companies: totalCompanies,
        active_companies: activeCompanyIds.size,
        total_orders: totalOrders,
        pending_orders: pendingOrders,
        total_products: productsHead.count ?? 0,
        featured_products: featuredHead.count ?? 0,
        products_missing_cost: missingCostHead.count ?? 0,
        company_pricing_override_coverage_pct: pricingCoveragePct,
        companies_with_mfg_overrides: overrideCompanyIds.size,
        app_admins_count: adminsHead.count ?? 0,
        approved_users: approvedUsers,
        unapproved_users: unapprovedUsers,
        total_users: users.length,
      },
      recent_orders: recentOrders,
      recent_companies: (companiesRecent.data || []).map((c) => ({
        id: c.id,
        name: c.trade_name || 'Company',
        created_at: c.created_at,
      })),
      inventory_summary: invRows.error
        ? null
        : {
            row_count: invRowsCount,
            total_quantity_on_hand: invTotalQty,
            integrity_note:
              'public.inventory.canonical_product_id → catalogos.products.id; legacy storefront product_id from live_product_id when set',
          },
      schema_gaps: schemaGaps,
    };
  } catch (e) {
    console.error('[ownerCockpit] getOverviewSnapshot', e);
    return emptyOverview(e.message || 'Overview failed');
  }
}

async function getCompaniesDirectory() {
  const sb = getSupabaseAdmin();
  const companies = await companiesService.getCompanies();
  const { data: members } = await sb.schema(GC).from('company_members').select('company_id, user_id');
  const { data: orders } = await sb
    .schema(GC)
    .from('orders')
    .select('company_id, created_at, stripe_payment_intent_id');

  const memberCount = {};
  (members || []).forEach((m) => {
    if (m.company_id == null) return;
    memberCount[m.company_id] = (memberCount[m.company_id] || 0) + 1;
  });

  const orderAgg = {};
  (orders || []).forEach((o) => {
    if (o.company_id == null) return;
    const id = o.company_id;
    if (!orderAgg[id]) orderAgg[id] = { count: 0, last_at: null, stripe_orders: 0 };
    orderAgg[id].count += 1;
    const ca = o.created_at;
    if (ca && (!orderAgg[id].last_at || ca > orderAgg[id].last_at)) orderAgg[id].last_at = ca;
    if (o.stripe_payment_intent_id && String(o.stripe_payment_intent_id).trim()) orderAgg[id].stripe_orders += 1;
  });

  const { data: overrideRows } = await sb
    .schema(GC)
    .from('customer_manufacturer_pricing')
    .select('company_id');
  const overrideCount = {};
  (overrideRows || []).forEach((r) => {
    if (r.company_id == null) return;
    overrideCount[r.company_id] = (overrideCount[r.company_id] || 0) + 1;
  });

  return companies.map((c) => {
    const agg = orderAgg[c.id] || { count: 0, last_at: null, stripe_orders: 0 };
    const oc = overrideCount[c.id] || 0;
    return {
      id: c.id,
      name: c.name,
      created_at: c.created_at,
      updated_at: c.updated_at,
      operational_status: (memberCount[c.id] || 0) > 0 || agg.count > 0 ? 'active' : 'no_activity',
      default_gross_margin_percent: c.default_gross_margin_percent,
      pricing_mode_label: oc > 0 ? 'default_margin_plus_' + oc + '_mfg_overrides' : 'default_margin_only',
      manufacturer_override_count: oc,
      stripe_orders_with_intent: agg.stripe_orders,
      payment_methods_count: null,
      payment_methods_schema_note: 'No public.payment_methods table in GloveCubs migrations — count unavailable',
      member_count: memberCount[c.id] || 0,
      order_count: agg.count,
      last_order_at: agg.last_at,
    };
  });
}

async function getPricingWorkspace() {
  const sb = getSupabaseAdmin();
  const companies = await companiesService.getCompanies();
  const { data: overrides, error: ovErr } = await sb
    .schema(GC)
    .from('customer_manufacturer_pricing')
    .select('*');
  if (ovErr) throw ovErr;
  const { data: manufacturers } = await sb.from('manufacturers').select('id, name').order('name');
  const mfgMap = {};
  (manufacturers || []).forEach((m) => {
    mfgMap[m.id] = m.name;
  });

  const overrideList = (overrides || []).map((r) => ({
    id: r.id,
    company_id: r.company_id,
    manufacturer_id: r.manufacturer_id,
    manufacturer_name: mfgMap[r.manufacturer_id] || 'Manufacturer #' + r.manufacturer_id,
    margin_percent: r.margin_percent != null ? Number(r.margin_percent) : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  const companiesWithOverrides = new Set(overrideList.map((o) => o.company_id));
  const missingOverrideCompanies = companies.filter((c) => !companiesWithOverrides.has(c.id));

  const { DEFAULT_RULES, normalizeRules } = require('../lib/supplierCostPricing');
  const supplier_cost_import = {
    default_rules: normalizeRules(DEFAULT_RULES),
    recent_runs: [],
    load_error: null,
  };
  try {
    const supplierCostImportService = require('./supplierCostImportService');
    supplier_cost_import.recent_runs = await supplierCostImportService.listRecentRuns(8);
  } catch (e) {
    supplier_cost_import.load_error = e.message || String(e);
  }

  return {
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      default_gross_margin_percent: c.default_gross_margin_percent,
      has_manufacturer_overrides: companiesWithOverrides.has(c.id),
    })),
    manufacturer_overrides: overrideList,
    manufacturers: (manufacturers || []).map((m) => ({ id: m.id, name: m.name })),
    summary: {
      total_companies: companies.length,
      companies_with_any_override: companiesWithOverrides.size,
      companies_default_margin_only: companies.length - companiesWithOverrides.size,
      total_override_rows: overrideList.length,
    },
    gross_margin_exceptions: overrideList,
    supplier_cost_import,
  };
}

async function getStripeVisibility() {
  const sb = getSupabaseAdmin();
  const { data: orders, error } = await sb
    .schema(GC)
    .from('orders')
    .select(
      'id, order_number, company_id, total_minor, stripe_payment_intent_id, payment_method, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;
  const withIntent = (orders || []).filter((o) => o.stripe_payment_intent_id && String(o.stripe_payment_intent_id).trim());
  const { data: companies } = await sb.schema(GC).from('companies').select('id, trade_name');
  const cmap = {};
  (companies || []).forEach((c) => {
    cmap[c.id] = c.trade_name || 'Company';
  });

  const byCompany = {};
  withIntent.forEach((o) => {
    const cid = o.company_id || '_no_company';
    if (!byCompany[cid]) {
      byCompany[cid] = {
        company_id: o.company_id,
        company_name: o.company_id ? cmap[o.company_id] : null,
        order_count: 0,
        last_at: null,
      };
    }
    byCompany[cid].order_count += 1;
    if (o.created_at && (!byCompany[cid].last_at || o.created_at > byCompany[cid].last_at)) {
      byCompany[cid].last_at = o.created_at;
    }
  });

  return {
    source: 'orders.stripe_payment_intent_id only (no stripe_customers table)',
    orders_with_payment_intent: withIntent.length,
    orders_total_sampled: (orders || []).length,
    recent_with_intent: withIntent.slice(0, 25).map((o) => ({
      order_number: o.order_number,
      company_id: o.company_id,
      company_name: o.company_id ? cmap[o.company_id] : null,
      total: minorToDollars(o.total_minor),
      created_at: o.created_at,
    })),
    by_company: Object.values(byCompany).sort((a, b) => b.order_count - a.order_count),
  };
}

async function getInventoryIntegrityPanel(limit = 400) {
  const sb = getSupabaseAdmin();
  const { data: rows, error } = await sb.from('inventory').select('*').order('id', { ascending: true }).limit(limit);
  if (error) return { rows: [], product_resolution: 'failed', error: error.message, integrity_note: error.message };

  const ids = [...new Set((rows || []).map((r) => r.canonical_product_id || r.product_id).filter((x) => x != null))];
  let productMap = {};
  let resolution = 'none';
  if (ids.length > 0) {
    const sample = ids.slice(0, 150);
    const { data: prods, error: perr } = await sb.schema('catalogos').from('products').select('id, sku, name').in('id', sample);
    if (!perr && prods && prods.length) {
      prods.forEach((p) => {
        productMap[p.id] = { sku: p.sku, name: p.name };
      });
      resolution = 'resolved_for_matching_ids';
    } else {
      resolution = perr ? 'products_join_error_' + (perr.code || 'unknown') : 'no_matching_product_rows_type_mismatch_possible';
    }
  }

  return {
    rows: (rows || []).map((r) => {
      const pk = r.canonical_product_id || r.product_id;
      return {
        id: r.id,
        product_id: pk,
        quantity_on_hand: r.quantity_on_hand,
        reorder_point: r.reorder_point,
        bin_location: r.bin_location || null,
        updated_at: r.updated_at,
        product_hint: productMap[pk] || null,
      };
    }),
    product_resolution: resolution,
    integrity_note:
      resolution !== 'resolved_for_matching_ids'
        ? 'If product_id type does not match products.id, enrichments will be empty — rows are still authoritative for stock.'
        : null,
    row_count_returned: (rows || []).length,
  };
}

module.exports = {
  getOverviewSnapshot,
  getCompaniesDirectory,
  getPricingWorkspace,
  getStripeVisibility,
  getInventoryIntegrityPanel,
};
