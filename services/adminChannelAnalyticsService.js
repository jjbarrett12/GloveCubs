'use strict';

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');

const GC = 'gc_commerce';

/** Same revenue exclusions as adminOperationsDashboardService (gc_commerce.orders). */
const EXCLUDED_REVENUE_STATUSES = ['cancelled', 'pending_payment', 'abandoned', 'expired'];

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function channelKey(att) {
  if (!att || typeof att !== 'object') return '(no attribution)';
  const src = (att.utm_source || '').trim() || '(direct / none)';
  const med = (att.utm_medium || '').trim() || '—';
  return src + ' / ' + med;
}

function campaignLabel(att) {
  if (!att || typeof att !== 'object') return '—';
  return (att.utm_campaign || '').trim() || '—';
}

/**
 * Aggregates for admin marketing view (bounded scan).
 */
async function getChannelAnalytics(opts = {}) {
  const limit = Math.min(20000, Math.max(1000, Number(opts.limit) || 12000));
  const sb = getSupabaseAdmin();
  const { data: rows, error } = await sb
    .schema(GC)
    .from('orders')
    .select('id, total_minor, company_id, placed_at, created_at, status, marketing_attribution')
    .order('placed_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  const list = (rows || []).filter((o) => !EXCLUDED_REVENUE_STATUSES.includes(String(o.status || '').toLowerCase()));

  const byChannel = new Map();
  const byCampaign = new Map();
  let withAttr = 0;
  let withoutAttr = 0;

  const sampleSortedAsc = [...list].sort(
    (a, b) => new Date(a.placed_at || a.created_at) - new Date(b.placed_at || b.created_at),
  );
  const firstOrderIdInSample = new Map();
  for (const o of sampleSortedAsc) {
    if (o.company_id == null) continue;
    const cid = String(o.company_id);
    if (!firstOrderIdInSample.has(cid)) firstOrderIdInSample.set(cid, o.id);
  }

  let newCustomerOrders = 0;
  let repeatCustomerOrders = 0;

  for (const o of list) {
    const att = o.marketing_attribution;
    if (att && typeof att === 'object' && Object.keys(att).length > 0) withAttr += 1;
    else withoutAttr += 1;

    const ch = channelKey(att);
    const cur = byChannel.get(ch) || { revenue: 0, orders: 0 };
    cur.revenue = round2(cur.revenue + (Number(o.total_minor) || 0) / 100);
    cur.orders += 1;
    byChannel.set(ch, cur);

    const camp = campaignLabel(att);
    const ck = ch + ' :: ' + camp;
    const c2 = byCampaign.get(ck) || { channel: ch, campaign: camp, revenue: 0, orders: 0 };
    c2.revenue = round2(c2.revenue + (Number(o.total_minor) || 0) / 100);
    c2.orders += 1;
    byCampaign.set(ck, c2);

    if (o.company_id != null) {
      const cid = String(o.company_id);
      if (firstOrderIdInSample.get(cid) === o.id) newCustomerOrders += 1;
      else repeatCustomerOrders += 1;
    }
  }

  const channels = [...byChannel.entries()]
    .map(([key, v]) => ({
      channel: key,
      revenue: v.revenue,
      orders: v.orders,
      aov: v.orders > 0 ? round2(v.revenue / v.orders) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const campaigns = [...byCampaign.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 25);

  return {
    ok: true,
    meta: {
      orders_scanned: list.length,
      limit,
      note:
        'Only the most recent N orders are scanned. Orders without marketing_attribution appear under "(no attribution)". New vs repeat = first vs subsequent order per company_id within this sample only (not lifetime).',
    },
    totals: {
      orders_in_sample: list.length,
      orders_with_attribution: withAttr,
      orders_without_attribution: withoutAttr,
      new_customer_orders_approx: newCustomerOrders,
      repeat_customer_orders_approx: repeatCustomerOrders,
    },
    channels,
    top_campaigns: campaigns,
  };
}

module.exports = { getChannelAnalytics };
