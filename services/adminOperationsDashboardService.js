/**
 * Admin operations / commerce reporting — read-only, bounded queries.
 * Source of truth: gc_commerce (UUID companies, minor-unit money).
 */

'use strict';

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { resolveLineCogsGc, round2 } = require('../lib/orderLineCogs');
const { normalizeCanonicalUuidInput } = require('../lib/resolve-canonical-product-id');

const GC = 'gc_commerce';

const EXCLUDED_REVENUE_STATUSES = ['cancelled', 'pending_payment', 'abandoned', 'expired'];

function minorToDollars(minor) {
  return round2(Number(minor || 0) / 100);
}

function utcDayStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function utcMonthStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function iso(d) {
  return d.toISOString();
}

function qualifies(o) {
  const s = String(o.status || '').toLowerCase();
  return !EXCLUDED_REVENUE_STATUSES.includes(s);
}

/**
 * @returns {Promise<object>}
 */
async function getOperationsDashboard() {
  const sb = getSupabaseAdmin();
  const gc = () => sb.schema(GC);
  const now = new Date();
  const monthStart = utcMonthStart(now);
  const todayStart = utcDayStart(now);
  const monthStartIso = iso(monthStart);
  const todayStartIso = iso(todayStart);
  const staleDays = Math.min(365, Math.max(30, parseInt(process.env.OPS_STALE_CUSTOMER_DAYS, 10) || 90));
  const staleCutoff = new Date(now.getTime() - staleDays * 86400000).toISOString();

  const meta = {
    timezone_basis: 'UTC',
    revenue_order_definition:
      'Sum and count of gc_commerce.orders where status is not cancelled, pending_payment, abandoned, or expired. Amounts converted from total_minor (USD cents).',
    repeat_customer_definition:
      'Among distinct companies with a company_id on MTD qualifying orders: share that had at least one qualifying order before this calendar month (UTC).',
    reorder_rate_definition:
      'Share of MTD qualifying orders where the company had any qualifying order before the first day of this month (UTC).',
    margin_definition:
      'Goods margin on MTD qualifying orders in sample: (net merchandise subtotal − estimated COGS) / net merchandise subtotal on lines with a cost basis. COGS per line prefers snapshot fields in order_lines.product_snapshot; otherwise qty × current products.cost (legacy product id in snapshot).',
    margin_limitations: [
      'Lines without snapshot cost and without legacy_product_id + current product cost are excluded from COGS and covered revenue.',
      'Only MTD orders in the margin sample (max 400) are evaluated.',
      'Shipping, tax, and payment fees are not allocated to margin here.',
    ],
    last_activity_map_definition:
      'Latest qualifying order per company derived from the most recent 30k qualifying orders by placed_at (newest first).',
    ar_definition:
      'Outstanding AR: gc_commerce.companies.outstanding_balance; Net30 posting via glovecubs_apply_net30_order_ar_gc; payments in gc_commerce.ar_invoice_payments.',
    overdue_note:
      'Invoice due dates / aging buckets are not in schema — overdue accounts are not computed here.',
    top_products_definition:
      'MTD qualifying orders only; revenue from gc_commerce.order_lines (line_subtotal_minor − discount_minor), grouped by product_snapshot.legacy_product_id when present.',
  };

  const limitations = [];

  const { data: mtdRowsRaw, error: mtdErr } = await gc()
    .from('orders')
    .select('id, order_number, status, total_minor, subtotal_minor, discount_minor, company_id, placed_at, created_at')
    .gte('placed_at', monthStartIso)
    .neq('status', 'cancelled')
    .neq('status', 'pending_payment')
    .order('placed_at', { ascending: false })
    .limit(25000);

  if (mtdErr) throw mtdErr;

  const mtdRows = (mtdRowsRaw || []).filter(qualifies);
  const mtdTruncated = (mtdRowsRaw || []).length >= 25000;
  if (mtdTruncated) {
    limitations.push('MTD order rows capped at 25k — revenue/orders MTD may be understated in very high-volume months.');
  }

  const mtdOrderCount = mtdRows.length;
  let mtdRevenue = 0;
  let todayRevenue = 0;
  let todayOrderCount = 0;
  for (const o of mtdRows) {
    const t = minorToDollars(o.total_minor);
    mtdRevenue += t;
    const ca = o.placed_at ? new Date(o.placed_at).getTime() : 0;
    if (ca >= todayStart.getTime()) {
      todayRevenue += t;
      todayOrderCount += 1;
    }
  }
  mtdRevenue = round2(mtdRevenue);
  todayRevenue = round2(todayRevenue);
  const aovMtd = mtdOrderCount > 0 ? round2(mtdRevenue / mtdOrderCount) : null;

  const mtdCompanyIds = [...new Set(mtdRows.map((o) => o.company_id).filter((id) => id != null))];
  let repeatCompanies = 0;
  let reorderOrders = 0;
  const priorCompanySet = new Set();

  if (mtdCompanyIds.length > 0) {
    const chunkSize = 120;
    for (let i = 0; i < mtdCompanyIds.length; i += chunkSize) {
      const chunk = mtdCompanyIds.slice(i, i + chunkSize);
      const { data: prior, error: pErr } = await gc()
        .from('orders')
        .select('company_id, status')
        .in('company_id', chunk)
        .lt('placed_at', monthStartIso)
        .neq('status', 'cancelled')
        .neq('status', 'pending_payment');
      if (pErr) {
        limitations.push('Prior-order lookup failed for some companies: ' + (pErr.message || ''));
        break;
      }
      (prior || []).filter(qualifies).forEach((r) => {
        if (r.company_id != null) priorCompanySet.add(String(r.company_id));
      });
    }
    for (const cid of mtdCompanyIds) {
      if (priorCompanySet.has(String(cid))) repeatCompanies += 1;
    }
    for (const o of mtdRows) {
      if (o.company_id != null && priorCompanySet.has(String(o.company_id))) reorderOrders += 1;
    }
  }

  const repeatCustomerRatePct =
    mtdCompanyIds.length > 0 ? round2((repeatCompanies / mtdCompanyIds.length) * 100) : null;
  const reorderRatePct = mtdOrderCount > 0 ? round2((reorderOrders / mtdOrderCount) * 100) : null;

  const revByCompany = new Map();
  for (const o of mtdRows) {
    if (o.company_id == null) continue;
    const id = String(o.company_id);
    const cur = revByCompany.get(id) || { revenue: 0, orders: 0 };
    cur.revenue += minorToDollars(o.total_minor);
    cur.orders += 1;
    revByCompany.set(id, cur);
  }

  const companyNameMap = {};
  if (revByCompany.size > 0) {
    const ids = [...revByCompany.keys()];
    const { data: companies } = await gc().from('companies').select('id, trade_name').in('id', ids);
    (companies || []).forEach((c) => {
      companyNameMap[String(c.id)] = c.trade_name;
    });
  }

  const topCustomers = [...revByCompany.entries()]
    .map(([company_id, v]) => ({
      company_id,
      company_name: companyNameMap[company_id] || company_id,
      revenue_mtd: round2(v.revenue),
      orders_mtd: v.orders,
    }))
    .sort((a, b) => b.revenue_mtd - a.revenue_mtd)
    .slice(0, 12);

  const highValueCustomers = topCustomers.slice(0, 8);

  let topProducts = [];
  let lowMarginProducts = [];
  let lowMarginOrders = [];
  let marginSummary = {
    available: false,
    sample_orders: 0,
    net_merchandise_in_sample: null,
    cogs_in_sample: null,
    goods_margin_pct: null,
    lines_with_cost_pct: null,
    note: null,
  };

  const mtdIds = mtdRows.map((r) => r.id);
  if (mtdIds.length > 0) {
    const itemMap = new Map();
    const itemsByOrder = new Map();
    const productLineRows = new Map();
    const chunk = 400;
    for (let i = 0; i < mtdIds.length; i += chunk) {
      const slice = mtdIds.slice(i, i + chunk);
      const { data: items, error: iErr } = await gc()
        .from('order_lines')
        .select('order_id, quantity, unit_price_minor, line_subtotal_minor, discount_minor, product_snapshot')
        .in('order_id', slice);
      if (iErr) {
        limitations.push('order_lines batch failed: ' + (iErr.message || ''));
        break;
      }
      for (const row of items || []) {
        if (!itemsByOrder.has(row.order_id)) itemsByOrder.set(row.order_id, []);
        itemsByOrder.get(row.order_id).push(row);
        const snap = row.product_snapshot && typeof row.product_snapshot === 'object' ? row.product_snapshot : {};
        const catId = normalizeCanonicalUuidInput(snap.catalog_product_id);
        if (!catId) continue;
        const qty = Number(row.quantity) || 0;
        const netMinor = Math.max(0, Number(row.line_subtotal_minor) || 0) - (Number(row.discount_minor) || 0);
        const lineRev = round2(netMinor / 100);
        if (!itemMap.has(catId)) itemMap.set(catId, { catalog_product_id: catId, qty: 0, revenue: 0 });
        const agg = itemMap.get(catId);
        agg.qty += qty;
        agg.revenue = round2(agg.revenue + lineRev);
        if (!productLineRows.has(catId)) productLineRows.set(catId, []);
        productLineRows.get(catId).push(row);
      }
    }

    const productIds = [...itemMap.keys()];
    const productMeta = {};
    const costByProductId = new Map();
    if (productIds.length > 0) {
      for (let j = 0; j < productIds.length; j += 200) {
        const sl = productIds.slice(j, j + 200);
        const { data: prows } = await sb
          .schema('catalogos')
          .from('products')
          .select('id, sku, name, attributes')
          .in('id', sl);
        (prows || []).forEach((p) => {
          if (p?.id == null) return;
          const idKey = normalizeCanonicalUuidInput(p.id);
          if (!idKey) return;
          productMeta[idKey] = { id: p.id, sku: p.sku, name: p.name };
          const attrs = p.attributes && typeof p.attributes === 'object' ? p.attributes : {};
          const c =
            attrs.unit_cost != null
              ? Number(attrs.unit_cost)
              : attrs.cost != null
                ? Number(attrs.cost)
                : null;
          costByProductId.set(idKey, Number.isFinite(c) ? c : null);
        });
      }
    }

    topProducts = [...itemMap.values()]
      .map((x) => {
        const p = productMeta[x.catalog_product_id] || {};
        return {
          product_id: x.catalog_product_id,
          sku: p.sku || null,
          name: p.name || null,
          qty_mtd: x.qty,
          revenue_mtd: x.revenue,
        };
      })
      .sort((a, b) => b.revenue_mtd - a.revenue_mtd)
      .slice(0, 12);

    let prodMarginRows = [];
    for (const x of itemMap.values()) {
      const p = productMeta[x.catalog_product_id];
      const lines = productLineRows.get(x.catalog_product_id) || [];
      if (lines.length === 0) continue;
      let cogsSum = 0;
      let revCovered = 0;
      let allLinesHaveCogs = true;
      for (const ln of lines) {
        const { cogs } = resolveLineCogsGc(ln, costByProductId);
        const qty = Number(ln.quantity) || 0;
        const subM = Number(ln.line_subtotal_minor) || 0;
        const discM = Number(ln.discount_minor) || 0;
        const lineRev = round2(Math.max(0, subM - discM) / 100);
        if (cogs == null) {
          allLinesHaveCogs = false;
          break;
        }
        cogsSum = round2(cogsSum + cogs);
        revCovered = round2(revCovered + lineRev);
      }
      if (!allLinesHaveCogs) continue;
      const rev = x.revenue;
      const gm = revCovered > 0 ? round2(((revCovered - cogsSum) / revCovered) * 100) : null;
      prodMarginRows.push({
        product_id: x.catalog_product_id,
        sku: p.sku || null,
        name: p.name || null,
        revenue_mtd: rev,
        est_cogs_mtd: cogsSum,
        goods_margin_pct: gm,
      });
    }
    prodMarginRows.sort((a, b) => (a.goods_margin_pct ?? 0) - (b.goods_margin_pct ?? 0));
    lowMarginProducts = prodMarginRows.slice(0, 10);

    const marginSampleOrders = mtdRows.slice(0, 400);

    let sumNetMerch = 0;
    let sumCogs = 0;
    let sumNetForCovered = 0;
    let linesTotal = 0;
    let linesWithCost = 0;
    const orderMargins = [];

    for (const o of marginSampleOrders) {
      const lines = itemsByOrder.get(o.id) || [];
      let orderNet = round2(minorToDollars((Number(o.subtotal_minor) || 0) - (Number(o.discount_minor) || 0)));
      let orderCogs = 0;
      let coveredNet = 0;
      let lwc = 0;
      let lt = 0;
      for (const ln of lines) {
        lt += 1;
        const subM = Number(ln.line_subtotal_minor) || 0;
        const discM = Number(ln.discount_minor) || 0;
        const lineNet = round2(Math.max(0, subM - discM) / 100);
        const { cogs: lineCogs } = resolveLineCogsGc(ln, costByProductId);
        if (lineCogs != null) {
          orderCogs = round2(orderCogs + lineCogs);
          coveredNet = round2(coveredNet + lineNet);
          lwc += 1;
        }
      }
      linesTotal += lt;
      linesWithCost += lwc;
      sumNetMerch = round2(sumNetMerch + orderNet);
      sumCogs = round2(sumCogs + orderCogs);
      sumNetForCovered = round2(sumNetForCovered + coveredNet);
      const gmOrd = coveredNet > 0 ? round2(((coveredNet - orderCogs) / coveredNet) * 100) : null;
      if (coveredNet > 0 && lwc > 0) {
        orderMargins.push({
          order_id: o.id,
          order_number: o.order_number,
          created_at: o.created_at,
          company_id: o.company_id,
          company_name: o.company_id != null ? companyNameMap[String(o.company_id)] || null : null,
          goods_margin_pct: gmOrd,
          net_merchandise_covered: coveredNet,
        });
      }
    }

    orderMargins.sort((a, b) => (a.goods_margin_pct ?? 0) - (b.goods_margin_pct ?? 0));
    lowMarginOrders = orderMargins.slice(0, 10);

    const linesWithCostPct = linesTotal > 0 ? round2((linesWithCost / linesTotal) * 100) : null;
    const goodsMarginPct = sumNetForCovered > 0 ? round2(((sumNetForCovered - sumCogs) / sumNetForCovered) * 100) : null;
    marginSummary = {
      available: sumNetForCovered > 0 && linesWithCost > 0,
      sample_orders: marginSampleOrders.length,
      net_merchandise_subtotal_sample: sumNetMerch,
      net_merchandise_with_cost_basis: sumNetForCovered,
      cogs_in_sample: sumCogs,
      goods_margin_pct: goodsMarginPct,
      lines_with_cost_pct: linesWithCostPct,
      note:
        goodsMarginPct == null
          ? 'Insufficient cost coverage on MTD lines to compute goods margin.'
          : 'Margin uses lines with product cost only; see margin_limitations.',
    };
  }

  const lastOrderByCompany = new Map();
  const { data: recentForLast, error: rlErr } = await gc()
    .from('orders')
    .select('company_id, placed_at, status')
    .not('company_id', 'is', null)
    .neq('status', 'cancelled')
    .neq('status', 'pending_payment')
    .order('placed_at', { ascending: false })
    .limit(30000);

  if (!rlErr && recentForLast) {
    for (const r of recentForLast) {
      if (!qualifies(r)) continue;
      if (r.company_id == null) continue;
      const cid = String(r.company_id);
      if (!lastOrderByCompany.has(cid)) lastOrderByCompany.set(cid, r.placed_at);
    }
  } else if (rlErr) {
    limitations.push('Last-order map skipped: ' + (rlErr.message || ''));
  }

  let staleCustomers = [];
  if (lastOrderByCompany.size > 0) {
    const staleCandidates = [];
    for (const [cid, lastAt] of lastOrderByCompany) {
      if (!lastAt) continue;
      if (new Date(lastAt).getTime() < new Date(staleCutoff).getTime()) {
        staleCandidates.push({ company_id: cid, last_order_at: lastAt });
      }
    }
    const staleIds = staleCandidates.map((x) => x.company_id);
    const nameById = {};
    for (let i = 0; i < staleIds.length; i += 150) {
      const sl = staleIds.slice(i, i + 150);
      const { data: cn } = await gc().from('companies').select('id, trade_name').in('id', sl);
      (cn || []).forEach((c) => {
        nameById[String(c.id)] = c.trade_name;
      });
    }
    staleCustomers = staleCandidates
      .map((x) => ({
        company_id: x.company_id,
        company_name: nameById[x.company_id] || x.company_id,
        last_order_at: x.last_order_at,
        days_since_order: Math.floor((now.getTime() - new Date(x.last_order_at).getTime()) / 86400000),
      }))
      .sort((a, b) => new Date(a.last_order_at).getTime() - new Date(b.last_order_at).getTime())
      .slice(0, 20);
  }

  let ar = {
    outstanding_total: null,
    companies_with_balance: 0,
    on_hold_count: 0,
    pending_applications: null,
    overdue_accounts: null,
  };

  const { data: allCo, error: coErr } = await gc()
    .from('companies')
    .select('id, trade_name, outstanding_balance, net_terms_status, credit_limit');

  if (!coErr && allCo) {
    let sumOut = 0;
    let nBal = 0;
    let onHold = 0;
    for (const c of allCo) {
      const ob = Number(c.outstanding_balance) || 0;
      if (ob > 0.009) {
        sumOut = round2(sumOut + ob);
        nBal += 1;
      }
      if (String(c.net_terms_status || '').toLowerCase() === 'on_hold') onHold += 1;
    }
    ar.outstanding_total = round2(sumOut);
    ar.companies_with_balance = nBal;
    ar.on_hold_count = onHold;
  } else if (coErr) {
    limitations.push('Company AR snapshot failed: ' + (coErr.message || ''));
  }

  const { count: pendCount, error: appErr } = await gc()
    .from('net_terms_applications')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (!appErr) ar.pending_applications = pendCount ?? 0;
  else limitations.push('net_terms_applications count failed: ' + (appErr.message || ''));

  const recentOrdersOps = mtdRows.slice(0, 15).map((o) => ({
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    total: minorToDollars(o.total_minor),
    company_id: o.company_id,
    company_name: o.company_id ? companyNameMap[String(o.company_id)] || null : null,
    created_at: o.created_at,
    placed_at: o.placed_at,
  }));

  return {
    ok: true,
    generated_at: iso(now),
    meta,
    limitations,
    summary: {
      revenue_today: todayRevenue,
      orders_today: todayOrderCount,
      revenue_mtd: mtdRevenue,
      orders_mtd: mtdOrderCount,
      aov_mtd: aovMtd,
      repeat_customer_rate_pct: repeatCustomerRatePct,
      reorder_rate_pct: reorderRatePct,
      distinct_customers_mtd: mtdCompanyIds.length,
      stale_customer_days: staleDays,
    },
    ar,
    top_customers_mtd: topCustomers,
    high_value_customers_mtd: highValueCustomers,
    top_products_mtd: topProducts,
    low_margin_products_mtd: lowMarginProducts,
    low_margin_orders_mtd: lowMarginOrders,
    margin: marginSummary,
    stale_customers: staleCustomers,
    recent_orders_mtd: recentOrdersOps,
  };
}

module.exports = {
  getOperationsDashboard,
};
