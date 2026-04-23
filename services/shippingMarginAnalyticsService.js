/**
 * Read-only decision support: order economics vs shipping thresholds (does not change checkout).
 * Source: gc_commerce.orders / order_lines (minor units); COGS from line snapshots or products.cost.
 * Carrier modeling prefers orders.estimated_fulfillment_cost_usd; else ANALYTICS_ASSUMED_* env.
 */

'use strict';

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const commerceShipping = require('../lib/commerce-shipping');
const { resolveLineCogs, gcOrderLineToLegacyCogsShape } = require('../lib/orderLineCogs');
const { normalizeCanonicalUuidInput } = require('../lib/resolve-canonical-product-id');
const shippingPolicyService = require('./shippingPolicyService');

const GC = 'gc_commerce';

const FREE_SHIP_SCENARIOS = [300, 400, 500, 600];
const MIN_ORDER_SCENARIOS = [100, 150, 200, 250];
/** Max share of sample (completed orders) below a proposed minimum before we suggest that minimum as “stricter”. */
const MIN_ORDER_MAX_HISTORICAL_EXCLUSION_PCT = 8;

const SUBTOTAL_BANDS = [
  { label: '$0–99.99', min: 0, max: 100 },
  { label: '$100–199.99', min: 100, max: 200 },
  { label: '$200–299.99', min: 200, max: 300 },
  { label: '$300–399.99', min: 300, max: 400 },
  { label: '$400–499.99', min: 400, max: 500 },
  { label: '$500–749.99', min: 500, max: 750 },
  { label: '$750+', min: 750, max: Infinity }
];

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function parseOptionalCost(key) {
  const v = process.env[key];
  if (v == null || v === '') return null;
  const x = parseFloat(v);
  return Number.isFinite(x) && x >= 0 ? x : null;
}

function getAnalyticsAssumptions() {
  const whenPaid = parseOptionalCost('ANALYTICS_ASSUMED_CARRIER_COST_WHEN_CUSTOMER_PAYS_SHIPPING');
  const whenFree = parseOptionalCost('ANALYTICS_ASSUMED_CARRIER_COST_WHEN_FREE_SHIPPING_TO_CUSTOMER');
  return {
    carrier_cost_when_customer_pays_shipping_usd: whenPaid,
    carrier_cost_when_order_shipped_free_to_customer_usd: whenFree,
    notes: [
      'These env vars are optional and affect this report only — not live checkout.',
      'If unset, carrier-side profitability is not modeled; we still show shipping collected and goods margin (where cost exists).'
    ]
  };
}

function netSubtotal(order) {
  return round2(Number(order.subtotal || 0) - Number(order.discount || 0));
}

/** Normalize a gc_commerce.orders row to dollar fields used by this report. */
function gcOrderToAnalyticsShape(o) {
  const m2 = (x) => round2(Number(x || 0) / 100);
  return {
    id: o.id,
    subtotal: m2(o.subtotal_minor),
    discount: m2(o.discount_minor),
    shipping: m2(o.shipping_minor),
    tax: m2(o.tax_minor),
    total: m2(o.total_minor),
    status: o.status,
    created_at: o.created_at,
    order_number: o.order_number,
    is_free_shipping_at_order: o.is_free_shipping_at_order,
    shipping_threshold_at_order: o.shipping_threshold_at_order,
    shipping_flat_rate_at_order: o.shipping_flat_rate_at_order,
    shipping_min_order_at_order: o.shipping_min_order_at_order,
    shipping_policy_version: o.shipping_policy_version,
    shipping_policy_version_id: o.shipping_policy_version_id,
    estimated_fulfillment_cost_usd: o.estimated_fulfillment_cost_usd,
  };
}

function simulateShipping(subtotalNet, freeThreshold, flatRate) {
  return commerceShipping.computeShippingFromSubtotal(subtotalNet, {
    freeShippingThreshold: Math.max(0, freeThreshold),
    flatShippingRate: Math.max(0, flatRate),
    minOrderAmount: 0
  });
}

function estimateCarrierCostForOrder(shippingCharged, assumptions) {
  const s = Number(shippingCharged);
  if (!Number.isFinite(s) || s < 0) return { usd: null, known: false, reason: 'invalid_shipping' };
  if (s > 0) {
    if (assumptions.carrier_cost_when_customer_pays_shipping_usd == null) {
      return { usd: null, known: false, reason: 'ANALYTICS_ASSUMED_CARRIER_COST_WHEN_CUSTOMER_PAYS_SHIPPING not set' };
    }
    return { usd: assumptions.carrier_cost_when_customer_pays_shipping_usd, known: true, reason: null };
  }
  if (assumptions.carrier_cost_when_order_shipped_free_to_customer_usd == null) {
    return { usd: null, known: false, reason: 'ANALYTICS_ASSUMED_CARRIER_COST_WHEN_FREE_SHIPPING_TO_CUSTOMER not set' };
  }
  return { usd: assumptions.carrier_cost_when_order_shipped_free_to_customer_usd, known: true, reason: null };
}

/**
 * Counterfactual evaluation: carrier $ follows simulated customer shipping (paid vs free), not order snapshots.
 */
function evaluateFreeShippingThresholdScenario(orderRows, thr, flat, assumptions) {
  let sumSimShip = 0;
  let sumCarrier = 0;
  let qualify = 0;
  let sumModeledContrib = 0;
  let nContrib = 0;
  let nCarrierKnown = 0;
  const n = orderRows.length;
  for (const r of orderRows) {
    const sim = simulateShipping(r.netS, thr, flat);
    sumSimShip += sim;
    if (r.netS >= thr) qualify++;
    const car = estimateCarrierCostForOrder(sim, assumptions);
    if (car.known) {
      nCarrierKnown++;
      sumCarrier += car.usd;
    }
    if (r.goodsMargin != null && car.known) {
      sumModeledContrib += r.goodsMargin + sim - car.usd;
      nContrib++;
    }
  }
  return {
    threshold_usd: thr,
    pct_orders_qualifying_free: n ? round2((100 * qualify) / n) : 0,
    sum_simulated_shipping_collected_usd: round2(sumSimShip),
    sum_assumed_carrier_cost_usd: round2(sumCarrier),
    sum_modeled_contribution_usd: nContrib === n ? round2(sumModeledContrib) : null,
    modeled_contribution_orders_included: nContrib,
    orders_carrier_modeled: nCarrierKnown,
  };
}

function buildFreeShippingThresholdCandidates(baselineThr, medianNet, orderRows) {
  const nets = orderRows.map((r) => r.netS).sort((a, b) => a - b);
  const pQuant = (q) => {
    if (!nets.length) return null;
    const idx = Math.min(nets.length - 1, Math.max(0, Math.floor((q / 100) * (nets.length - 1))));
    return nets[idx];
  };
  const rounded = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x / 25) * 25);
  const cands = new Set(FREE_SHIP_SCENARIOS);
  cands.add(Math.max(0, Math.round(Number(baselineThr) || 0)));
  const m = rounded(medianNet);
  if (m != null) cands.add(m);
  const p55 = rounded(pQuant(55));
  const p70 = rounded(pQuant(70));
  if (p55 != null) cands.add(p55);
  if (p70 != null) cands.add(p70);
  return [...cands]
    .filter((t) => Number.isFinite(t) && t >= 0 && t <= 5000)
    .sort((a, b) => a - b);
}

function confidenceForRecommendations(n, ordersFullyCosted, carrierModelComplete, contribFullSample) {
  const reasons = [];
  let level = 'high';
  if (n < 20) {
    level = 'low';
    reasons.push('Fewer than 20 orders in sample — wide confidence intervals.');
  } else if (n < 100) {
    if (level === 'high') level = 'medium';
    reasons.push('Under 100 orders — directional only.');
  }
  if (ordersFullyCosted < n) {
    if (level === 'high') level = 'medium';
    reasons.push('Not every order has full line-level COGS; contribution uses fully costed orders only.');
  }
  if (!carrierModelComplete) {
    level = 'low';
    reasons.push('ANALYTICS_ASSUMED_* carrier costs not fully set — free-ship threshold ranking is disabled.');
  } else if (!contribFullSample) {
    if (level === 'high') level = 'medium';
    reasons.push('Modeled contribution not computed on 100% of orders (missing margin on some lines).');
  }
  reasons.push('Counterfactual: no demand elasticity; past net subtotals held fixed.');
  reasons.push('Completed orders only — minimum-order effects do not observe abandoned carts.');
  return { level, reasons };
}

/**
 * @param {object} p
 * @returns {object} recommendations block for API
 */
function buildRecommendationsBlock(p) {
  const {
    orderRows,
    shipCfg,
    flat,
    assumptions,
    medianNet,
    n,
    ordersFullyCosted,
    smallSample,
    bandCountsDetailed,
    minOrderScenarioRows,
  } = p;

  const baselineMin = Math.max(0, Number(shipCfg.minOrderAmount) || 0);
  const baselineThr = Math.max(0, Number(shipCfg.freeShippingThreshold) || 0);
  const carrierModelComplete =
    assumptions.carrier_cost_when_customer_pays_shipping_usd != null &&
    assumptions.carrier_cost_when_order_shipped_free_to_customer_usd != null;

  const thresholdCandidates = buildFreeShippingThresholdCandidates(baselineThr, medianNet, orderRows);
  const evalByThr = new Map();
  for (const thr of thresholdCandidates) {
    evalByThr.set(thr, evaluateFreeShippingThresholdScenario(orderRows, thr, flat, assumptions));
  }
  if (!evalByThr.has(baselineThr)) {
    evalByThr.set(baselineThr, evaluateFreeShippingThresholdScenario(orderRows, baselineThr, flat, assumptions));
  }
  const baselineEval = evalByThr.get(baselineThr);

  let recommendedThr = baselineThr;
  let freeObjective = 'hold_current';
  let freePickNote = null;

  if (n >= 1 && carrierModelComplete) {
    let bestThr = baselineThr;
    let bestScore = -Infinity;
    for (const thr of [...evalByThr.keys()].sort((a, b) => a - b)) {
      const e = evalByThr.get(thr);
      if (e.sum_modeled_contribution_usd == null) continue;
      const score = e.sum_modeled_contribution_usd;
      if (score > bestScore + 0.01) {
        bestScore = score;
        bestThr = thr;
      } else if (Math.abs(score - bestScore) <= 0.01 && Math.abs(thr - baselineThr) < Math.abs(bestThr - baselineThr)) {
        bestThr = thr;
      }
    }
    if (bestScore > -Infinity) {
      recommendedThr = bestThr;
      freeObjective = 'maximize_sum_modeled_contribution_goods_plus_simulated_shipping_minus_assumed_carrier';
    } else {
      freeObjective = 'hold_current_incomplete_goods_margin_on_sample';
      freePickNote =
        'Modeled contribution needs full line-level COGS on every order in the sample to rank thresholds; until then the engine keeps the live threshold.';
    }
  } else if (n >= 1) {
    freeObjective = 'hold_current_missing_carrier_assumptions';
    freePickNote =
      'Set ANALYTICS_ASSUMED_CARRIER_COST_WHEN_CUSTOMER_PAYS_SHIPPING and ANALYTICS_ASSUMED_CARRIER_COST_WHEN_FREE_SHIPPING_TO_CUSTOMER to rank thresholds by modeled contribution.';
  }

  const recEval = evalByThr.get(recommendedThr) || baselineEval;
  const pctPtsDelta = round2(recEval.pct_orders_qualifying_free - baselineEval.pct_orders_qualifying_free);
  const deltaShip = round2(recEval.sum_simulated_shipping_collected_usd - baselineEval.sum_simulated_shipping_collected_usd);
  let deltaContrib = null;
  if (
    recEval.sum_modeled_contribution_usd != null &&
    baselineEval.sum_modeled_contribution_usd != null &&
    recEval.modeled_contribution_orders_included === n &&
    baselineEval.modeled_contribution_orders_included === n
  ) {
    deltaContrib = round2(recEval.sum_modeled_contribution_usd - baselineEval.sum_modeled_contribution_usd);
  }

  const relQualifyPct =
    baselineEval.pct_orders_qualifying_free > 0
      ? round2(
          (100 * (recEval.pct_orders_qualifying_free - baselineEval.pct_orders_qualifying_free)) /
            baselineEval.pct_orders_qualifying_free
        )
      : null;

  const freeSummaryLine =
    freeObjective === 'hold_current_missing_carrier_assumptions'
      ? 'Recommended free-shipping threshold: keep current $' + baselineThr + ' (set ANALYTICS_ASSUMED_* carrier costs to rank options).'
      : freeObjective === 'hold_current_incomplete_goods_margin_on_sample'
        ? 'Recommended free-shipping threshold: keep current $' + baselineThr + ' (full line-level COGS on every order in the sample is required to rank thresholds).'
        : recommendedThr === baselineThr
          ? 'Recommended free-shipping threshold: $' + baselineThr + ' (best among candidates; matches current policy).'
          : 'Recommended free-shipping threshold: $' + recommendedThr + ' (vs modeled baseline $' + baselineThr + ').';

  const freeImpactLine =
    'Expected impact (counterfactual on this sample, same flat $' +
    flat +
    '): ' +
    (pctPtsDelta >= 0 ? '+' : '') +
    pctPtsDelta +
    ' pp of orders qualifying for free; ' +
    (deltaShip <= 0 ? '−' : '+') +
    '$' +
    Math.abs(deltaShip) +
    ' modeled shipping revenue vs baseline threshold; ' +
    (deltaContrib == null
      ? 'modeled contribution change not computed for full sample.'
      : (deltaContrib >= 0 ? '+' : '−') + '$' + Math.abs(deltaContrib) + ' modeled contribution (goods + sim. shipping − assumed carrier).');

  const contribFullSample =
    carrierModelComplete &&
    baselineEval.modeled_contribution_orders_included === n &&
    recEval.modeled_contribution_orders_included === n;

  const { level: confidenceLevel, reasons: confidenceReasons } = confidenceForRecommendations(
    n,
    ordersFullyCosted,
    carrierModelComplete,
    !!contribFullSample
  );

  /** Minimum order: bands below $200 vs global margin — suggest stricter floor only when small baskets drag margin. */
  let recommendedMin = baselineMin;
  let minObjective = 'hold_current';
  let minPickNote = null;
  const lowBands = bandCountsDetailed.filter((b) => b.max <= 200);
  let lowOrders = 0;
  let lowMarginSum = 0;
  let lowMarginOrders = 0;
  for (const b of lowBands) {
    lowOrders += b.order_count;
    lowMarginSum += b.sum_goods_margin_fully_costed_usd || 0;
    lowMarginOrders += b.orders_fully_costed_in_band || 0;
  }
  const globalAvgMargin =
    ordersFullyCosted > 0 ? round2(sumGoodsMargin / ordersFullyCosted) : null;
  const lowAvgMargin = lowMarginOrders > 0 ? round2(lowMarginSum / lowMarginOrders) : null;
  const lowShare = n > 0 ? round2((100 * lowOrders) / n) : 0;

  const minCandidates = [...new Set([...MIN_ORDER_SCENARIOS, baselineMin, 50, 75, 125, 175, 225, 300])]
    .filter((m) => Number.isFinite(m) && m >= 0 && m <= 5000)
    .sort((a, b) => a - b);

  let bestStrictM = baselineMin;
  for (const m of minCandidates) {
    if (m < baselineMin) continue;
    const row = minOrderScenarioRows.find((r) => r.minimum_order_subtotal_usd === m);
    const pctBelow = row ? row.pct_of_sample_orders : n ? round2((100 * orderRows.filter((r) => r.netS < m).length) / n) : 0;
    if (pctBelow <= MIN_ORDER_MAX_HISTORICAL_EXCLUSION_PCT && m >= bestStrictM) {
      bestStrictM = m;
    }
  }

  if (
    globalAvgMargin != null &&
    lowAvgMargin != null &&
    lowAvgMargin < globalAvgMargin * 0.65 &&
    lowShare >= 12 &&
    lowOrders >= 8 &&
    bestStrictM > baselineMin
  ) {
    recommendedMin = bestStrictM;
    minObjective = 'raise_floor_small_basket_margin_drag';
    minPickNote =
      'Small-basket bands (net subtotal under $200) show lower per-order goods margin than the sample average; strictest candidate minimum keeps at most ~' +
      MIN_ORDER_MAX_HISTORICAL_EXCLUSION_PCT +
      '% of historical nets below the proposed floor (completed orders only).';
  } else {
    recommendedMin = baselineMin;
    minObjective = 'hold_current';
    minPickNote =
      'No strong signal to change minimum order; if tightening, use the stress-test table and accept that history only shows completed checkouts.';
  }

  const baselineBelowMin = n ? round2((100 * orderRows.filter((r) => r.netS < baselineMin).length) / n) : 0;
  const recBelowMin = n ? round2((100 * orderRows.filter((r) => r.netS < recommendedMin).length) / n) : 0;
  const minPctPtsDelta = round2(recBelowMin - baselineBelowMin);

  const minSummaryLine =
    recommendedMin === baselineMin
      ? 'Recommended minimum order: keep current $' + baselineMin + '.'
      : 'Recommended minimum order: $' + recommendedMin + ' (current $' + baselineMin + ').';

  const minImpactLine =
    'Expected impact (historical net subtotals only): ~' +
    recBelowMin +
    '% of sample orders had net subtotal below $' +
    recommendedMin +
    ' vs ~' +
    baselineBelowMin +
    '% below current $' +
    baselineMin +
    ' — interpret as structural friction proxy, not lost-revenue forecast.';

  return {
    auto_apply: false,
    available: true,
    not_prescriptive_for_checkout: true,
    confidence: {
      level: confidenceLevel,
      label:
        confidenceLevel === 'high'
          ? 'Higher confidence (large sample, full carrier model)'
          : confidenceLevel === 'medium'
            ? 'Medium confidence — validate before changing policy'
            : 'Low confidence — exploratory only',
      reasons: confidenceReasons,
    },
    assumptions_used: {
      flat_shipping_rate_usd: flat,
      carrier_cost_when_customer_pays_shipping_usd: assumptions.carrier_cost_when_customer_pays_shipping_usd,
      carrier_cost_when_order_shipped_free_to_customer_usd: assumptions.carrier_cost_when_order_shipped_free_to_customer_usd,
      counterfactual_carrier_from_simulated_customer_shipping:
        'Assumed carrier $ follows simulated shipping (paid vs free), not orders.estimated_fulfillment_cost_usd.',
      goods_margin_from: 'order line COGS (snapshot then product cost) for modeled contribution term.',
      threshold_candidates_usd: [...evalByThr.keys()].sort((a, b) => a - b),
      threshold_search_method:
        'Candidates: fixed grid (300–600), live threshold, median net subtotal, ~55th/70th percentile nets (rounded to $25). Gap-to-threshold stats in guidance inform qualitative review only.',
      minimum_order_search_method:
        'Stricter minimum only if small-basket bands (net subtotal under $200) show materially lower avg goods margin than the sample and a higher floor keeps ≤8% of historical nets below the proposed minimum.',
    },
    limitations: [
      'Does not auto-apply; create a new shipping policy version in Admin when you decide.',
      'Elasticity ignored: customers may add/remove items if thresholds change.',
      'Minimum-order recommendation uses completed orders; abandonment is not observed.',
      'Modeled contribution excludes tax; carrier numbers are analytics assumptions unless you tune env vars.',
    ],
    free_shipping_threshold: {
      recommended_threshold_usd: recommendedThr,
      baseline_threshold_usd: baselineThr,
      summary_line: freeSummaryLine,
      expected_impact: {
        delta_orders_qualifying_free_pct_points: pctPtsDelta,
        delta_orders_qualifying_free_relative_pct: relQualifyPct,
        delta_modeled_shipping_revenue_usd: deltaShip,
        delta_modeled_contribution_usd: deltaContrib,
        narrative_line: freeImpactLine,
      },
      objective: freeObjective,
      note: freePickNote,
      evaluation_at_recommended: recEval,
      evaluation_at_baseline: baselineEval,
    },
    minimum_order: {
      recommended_minimum_usd: recommendedMin,
      baseline_minimum_usd: baselineMin,
      summary_line: minSummaryLine,
      expected_impact: {
        pct_sample_below_recommended: recBelowMin,
        pct_sample_below_baseline: baselineBelowMin,
        delta_pct_points_sample_below: minPctPtsDelta,
        narrative_line: minImpactLine,
      },
      objective: minObjective,
      note: minPickNote,
      small_basket_context: {
        orders_in_bands_net_subtotal_below_200: lowOrders,
        pct_of_sample_in_those_bands: lowShare,
        avg_goods_margin_fully_costed_small_baskets_usd: lowAvgMargin,
        avg_goods_margin_fully_costed_sample_usd: globalAvgMargin,
      },
    },
    small_sample_flag: smallSample,
  };
}

/**
 * @param {{ maxOrders?: number, sinceDays?: number, excludeCancelled?: boolean }} opts
 */
async function buildShippingMarginReport(opts = {}) {
  const maxOrders = Math.min(5000, Math.max(50, Number(opts.maxOrders) || 800));
  const sinceDays = Math.min(1095, Math.max(30, Number(opts.sinceDays) || 365));
  const excludeCancelled = opts.excludeCancelled !== false;

  const shipCfg = await shippingPolicyService.resolveShippingConfigForCheckout();

  const sb = getSupabaseAdmin();
  const sinceIso = new Date(Date.now() - sinceDays * 86400000).toISOString();

  let q = sb
    .schema(GC)
    .from('orders')
    .select(
      'id,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,status,created_at,order_number,is_free_shipping_at_order,shipping_threshold_at_order,shipping_flat_rate_at_order,shipping_min_order_at_order,shipping_policy_version,shipping_policy_version_id,estimated_fulfillment_cost_usd'
    )
    .gte('placed_at', sinceIso)
    .order('placed_at', { ascending: false })
    .limit(maxOrders);

  if (excludeCancelled) q = q.neq('status', 'cancelled');

  const { data: orders, error: oErr } = await q;
  if (oErr) throw oErr;
  const list = (orders || []).map(gcOrderToAnalyticsShape);
  const orderIds = list.map((o) => o.id);
  if (orderIds.length === 0) {
    return emptyReport(sinceDays, maxOrders, excludeCancelled, shipCfg);
  }

  const { data: items, error: iErr } = await sb
    .schema(GC)
    .from('order_lines')
    .select('order_id,quantity,line_subtotal_minor,discount_minor,product_snapshot')
    .in('order_id', orderIds);
  if (iErr) throw iErr;
  const itemRows = items || [];

  const catalogIds = [
    ...new Set(
      itemRows
        .map((r) => {
          const snap = r.product_snapshot && typeof r.product_snapshot === 'object' ? r.product_snapshot : {};
          return normalizeCanonicalUuidInput(snap.catalog_product_id);
        })
        .filter(Boolean),
    ),
  ];
  const costByProduct = new Map();
  for (let j = 0; j < catalogIds.length; j += 200) {
    const chunk = catalogIds.slice(j, j + 200);
    const { data: rows, error: pErr } = await sb
      .schema('catalogos')
      .from('products')
      .select('id, attributes')
      .in('id', chunk);
    if (pErr) throw pErr;
    for (const p of rows || []) {
      const idKey = normalizeCanonicalUuidInput(p.id);
      if (!idKey) continue;
      const attrs = p.attributes && typeof p.attributes === 'object' ? p.attributes : {};
      const c =
        attrs.unit_cost != null ? Number(attrs.unit_cost) : attrs.cost != null ? Number(attrs.cost) : null;
      costByProduct.set(idKey, Number.isFinite(c) ? c : null);
    }
  }

  const itemsByOrder = new Map();
  for (const row of itemRows) {
    if (!itemsByOrder.has(row.order_id)) itemsByOrder.set(row.order_id, []);
    itemsByOrder.get(row.order_id).push(row);
  }

  const assumptions = getAnalyticsAssumptions();

  const byPolicy = new Map();

  let sumSubtotalNet = 0;
  let sumShippingCollected = 0;
  let sumTax = 0;
  let sumCogsKnown = 0;
  let sumGoodsMargin = 0;
  let ordersFullyCosted = 0;
  let ordersPartialCost = 0;
  let ordersNoItems = 0;
  let linesMissingCost = 0;
  let linesWithCost = 0;
  let linesCogsFromSnapshot = 0;
  let linesCogsFromCurrentProduct = 0;
  let sumCarrierCostEstimated = 0;
  let ordersWithCarrierEstimate = 0;
  let ordersCarrierUnknown = 0;
  let ordersCarrierFromSnapshot = 0;
  let sumContributionAfterShipping = 0;
  let ordersWithFullContributionEstimate = 0;

  const gapsToFree = [];
  const bandCounts = SUBTOTAL_BANDS.map((b) => ({
    ...b,
    order_count: 0,
    subtotal_net_sum: 0,
    sum_goods_margin_fully_costed_usd: 0,
    orders_fully_costed_in_band: 0,
  }));
  const orderRows = [];

  for (const o of list) {
    const netS = netSubtotal(o);
    sumSubtotalNet += netS;
    const shipCol = round2(Number(o.shipping || 0));
    sumShippingCollected += shipCol;
    sumTax += round2(Number(o.tax || 0));

    const oItems = itemsByOrder.get(o.id) || [];
    if (oItems.length === 0) ordersNoItems++;

    let cogs = 0;
    let missing = false;
    for (const li of oItems) {
      const { cogs: lineCogs, source } = resolveLineCogs(gcOrderLineToLegacyCogsShape(li), costByProduct);
      if (lineCogs == null) {
        missing = true;
        linesMissingCost++;
      } else {
        linesWithCost++;
        cogs += lineCogs;
        if (source === 'snapshot_total' || source === 'snapshot_unit') linesCogsFromSnapshot++;
        else if (source === 'current_product') linesCogsFromCurrentProduct++;
      }
    }
    cogs = round2(cogs);
    const fully = oItems.length > 0 && !missing;
    if (fully) {
      ordersFullyCosted++;
      sumCogsKnown += cogs;
      sumGoodsMargin += round2(netS - cogs);
    } else if (oItems.length > 0) {
      ordersPartialCost++;
    }

    let carrierUsd = null;
    let carrierKnown = false;
    const snapFulfill = o.estimated_fulfillment_cost_usd;
    if (snapFulfill != null && snapFulfill !== '' && Number.isFinite(Number(snapFulfill))) {
      carrierUsd = round2(Number(snapFulfill));
      carrierKnown = true;
      ordersCarrierFromSnapshot++;
    } else {
      const carrier = estimateCarrierCostForOrder(shipCol, assumptions);
      carrierUsd = carrier.usd;
      carrierKnown = carrier.known;
    }
    if (carrierKnown) {
      sumCarrierCostEstimated += carrierUsd;
      ordersWithCarrierEstimate++;
    } else {
      ordersCarrierUnknown++;
    }

    const goodsMarginThis = fully ? round2(netS - cogs) : null;
    const contribAfterShip =
      goodsMarginThis != null && carrierKnown ? round2(goodsMarginThis + shipCol - carrierUsd) : null;
    if (contribAfterShip != null) {
      sumContributionAfterShipping += contribAfterShip;
      ordersWithFullContributionEstimate++;
    }

    const pKey =
      o.shipping_policy_version_id != null ? String(o.shipping_policy_version_id) : 'legacy_unversioned';
    if (!byPolicy.has(pKey)) {
      byPolicy.set(pKey, {
        shipping_policy_version_id: o.shipping_policy_version_id,
        order_count: 0,
        sum_net_subtotal_usd: 0,
        sum_shipping_collected_usd: 0,
        sum_tax_collected_usd: 0,
        sum_goods_gross_margin_fully_costed_usd: 0,
        orders_fully_costed_in_bucket: 0,
      });
    }
    const pb = byPolicy.get(pKey);
    pb.order_count += 1;
    pb.sum_net_subtotal_usd = round2(pb.sum_net_subtotal_usd + netS);
    pb.sum_shipping_collected_usd = round2(pb.sum_shipping_collected_usd + shipCol);
    pb.sum_tax_collected_usd = round2(pb.sum_tax_collected_usd + round2(Number(o.tax || 0)));
    if (fully && goodsMarginThis != null) {
      pb.orders_fully_costed_in_bucket += 1;
      pb.sum_goods_gross_margin_fully_costed_usd = round2(
        pb.sum_goods_gross_margin_fully_costed_usd + goodsMarginThis
      );
    }

    const thrForGap =
      o.shipping_threshold_at_order != null && Number.isFinite(Number(o.shipping_threshold_at_order))
        ? Number(o.shipping_threshold_at_order)
        : shipCfg.freeShippingThreshold;
    if (thrForGap > 0 && netS < thrForGap) {
      gapsToFree.push(round2(thrForGap - netS));
    }

    for (const b of bandCounts) {
      if (netS >= b.min && netS < b.max) {
        b.order_count++;
        b.subtotal_net_sum = round2(b.subtotal_net_sum + netS);
        if (fully && goodsMarginThis != null) {
          b.sum_goods_margin_fully_costed_usd = round2(b.sum_goods_margin_fully_costed_usd + goodsMarginThis);
          b.orders_fully_costed_in_band += 1;
        }
        break;
      }
    }

    orderRows.push({ netS, goodsMargin: fully && goodsMarginThis != null ? goodsMarginThis : null });
  }

  const versionIdsForLookup = [...byPolicy.keys()]
    .filter((k) => k !== 'legacy_unversioned')
    .map((k) => Number(k))
    .filter((id) => Number.isFinite(id));
  const policyDefById = new Map();
  if (versionIdsForLookup.length > 0) {
    const { data: policyRows, error: policyLookupErr } = await sb
      .from('shipping_policy_versions')
      .select('id, free_shipping_threshold, flat_shipping_rate, min_order_amount, effective_at, notes')
      .in('id', versionIdsForLookup);
    if (!policyLookupErr && policyRows) {
      for (const pr of policyRows) {
        policyDefById.set(Number(pr.id), pr);
      }
    }
  }

  const byShippingPolicyVersion = [...byPolicy.entries()]
    .map(([key, pb]) => {
      const avgShip =
        pb.order_count > 0 ? round2(pb.sum_shipping_collected_usd / pb.order_count) : null;
      const idNum = key === 'legacy_unversioned' ? null : Number(key);
      const def = idNum != null ? policyDefById.get(idNum) : null;
      let label;
      if (key === 'legacy_unversioned') {
        label = 'Legacy (no shipping_policy_version_id)';
      } else if (!def) {
        label = '#' + key + ' — version row not found in DB';
      } else {
        const eff = def.effective_at ? String(def.effective_at).slice(0, 10) : '';
        label =
          '#' +
          key +
          ' · free≥$' +
          def.free_shipping_threshold +
          ' · flat $' +
          def.flat_shipping_rate +
          ' · min $' +
          def.min_order_amount +
          (eff ? ' · eff ' + eff : '');
      }
      return {
        shipping_policy_version_id: pb.shipping_policy_version_id,
        label,
        order_count: pb.order_count,
        sum_net_subtotal_usd: round2(pb.sum_net_subtotal_usd),
        sum_shipping_collected_usd: round2(pb.sum_shipping_collected_usd),
        average_shipping_collected_usd: avgShip,
        sum_tax_collected_usd: round2(pb.sum_tax_collected_usd),
        sum_goods_gross_margin_fully_costed_usd: round2(pb.sum_goods_gross_margin_fully_costed_usd),
        orders_fully_costed_in_bucket: pb.orders_fully_costed_in_bucket,
        policy_definition:
          def != null
            ? {
                free_shipping_threshold: Number(def.free_shipping_threshold),
                flat_shipping_rate: Number(def.flat_shipping_rate),
                min_order_amount: Number(def.min_order_amount),
                effective_at: def.effective_at,
                notes: def.notes,
              }
            : null,
      };
    })
    .sort((a, b) => {
      if (a.shipping_policy_version_id == null && b.shipping_policy_version_id == null) return 0;
      if (a.shipping_policy_version_id == null) return 1;
      if (b.shipping_policy_version_id == null) return -1;
      return b.shipping_policy_version_id - a.shipping_policy_version_id;
    });

  const n = list.length;
  const avgOrderValue = n ? round2(sumSubtotalNet / n) : 0;
  const medianOrderValue = median(list.map((o) => netSubtotal(o)));

  const avgGapFree =
    gapsToFree.length > 0 ? round2(gapsToFree.reduce((a, b) => a + b, 0) / gapsToFree.length) : null;
  const medianGapFree = gapsToFree.length > 0 ? median(gapsToFree.slice().sort((a, b) => a - b)) : null;

  const flat = shipCfg.flatShippingRate;

  const freeShipScenarios = FREE_SHIP_SCENARIOS.map((thr) => {
    let simShippingSum = 0;
    let wouldQualifyFree = 0;
    for (const o of list) {
      const ns = netSubtotal(o);
      const sim = simulateShipping(ns, thr, flat);
      simShippingSum += sim;
      if (ns >= thr) wouldQualifyFree++;
    }
    const actualShippingSum = round2(list.reduce((a, o) => a + Number(o.shipping || 0), 0));
    return {
      free_shipping_threshold_usd: thr,
      orders_qualifying_free_shipping: wouldQualifyFree,
      orders_not_qualifying: n - wouldQualifyFree,
      simulated_total_shipping_collected_usd: round2(simShippingSum),
      actual_total_shipping_collected_usd_in_sample: actualShippingSum,
      delta_vs_actual_shipping_collected_usd: round2(simShippingSum - actualShippingSum),
      caveat:
        'Counterfactual: applies today’s flat rate and each threshold to historical net subtotals. Past policy may have differed; customer behavior would change if thresholds changed.'
    };
  });

  const minOrderScenarios = MIN_ORDER_SCENARIOS.map((m) => {
    let below = 0;
    for (const o of list) {
      if (netSubtotal(o) < m) below++;
    }
    return {
      minimum_order_subtotal_usd: m,
      orders_in_sample_below_this_subtotal: below,
      pct_of_sample_orders: n ? round2((100 * below) / n) : 0,
      caveat:
        'Orders in sample still completed under historical rules. This counts how many would sit below a hypothetical minimum — useful stress-test, not a forecast of lost revenue.'
    };
  });

  const minOrderScenarioRowsExtended = minOrderScenarios.slice();
  const extraMinGrid = new Set([
    50,
    75,
    125,
    175,
    225,
    300,
    Math.max(0, Math.round(Number(shipCfg.minOrderAmount) || 0)),
  ]);
  for (const m of extraMinGrid) {
    if (minOrderScenarioRowsExtended.some((r) => r.minimum_order_subtotal_usd === m)) continue;
    let below = 0;
    for (const o of list) {
      if (netSubtotal(o) < m) below++;
    }
    minOrderScenarioRowsExtended.push({
      minimum_order_subtotal_usd: m,
      orders_in_sample_below_this_subtotal: below,
      pct_of_sample_orders: n ? round2((100 * below) / n) : 0,
      caveat: 'Extended grid for recommendation search only.',
    });
  }

  const recommendations = buildRecommendationsBlock({
    orderRows,
    shipCfg,
    flat,
    assumptions,
    medianNet: medianOrderValue,
    n,
    ordersFullyCosted,
    sumGoodsMargin,
    smallSample: n < 20,
    bandCountsDetailed: bandCounts,
    minOrderScenarioRows: minOrderScenarioRowsExtended,
  });

  const marginPctOfSubtotal =
    sumSubtotalNet > 0 && ordersFullyCosted === n ? round2((100 * sumGoodsMargin) / sumSubtotalNet) : null;

  const contributionAggKnown =
    ordersFullyCosted === n && ordersCarrierUnknown === 0
      ? round2(sumGoodsMargin + sumShippingCollected - sumCarrierCostEstimated)
      : null;

  return {
    generated_at: new Date().toISOString(),
    sample: {
      orders_analyzed: n,
      since_days: sinceDays,
      max_orders_cap: maxOrders,
      excluded_cancelled: excludeCancelled,
      orders_with_no_line_items: ordersNoItems,
      small_sample_warning: n < 20
    },
    honesty: {
      product_cost_basis:
        'COGS prefers order_items.unit_cost_at_order / total_cost_at_order captured at checkout; lines without snapshots fall back to current public.products.cost. Pre-snapshot orders use live cost only.',
      shipping_carrier_cost_basis:
        'Prefers orders.estimated_fulfillment_cost_usd captured at order time (same optional env assumptions as today). If null on older orders, falls back to ANALYTICS_ASSUMED_* at report time.',
      tax_excluded:
        'Goods margin and shipping contribution here exclude sales tax (tax is pass-through / jurisdiction-specific).'
    },
    current_policy: {
      free_shipping_threshold_usd: shipCfg.freeShippingThreshold,
      flat_shipping_rate_usd: shipCfg.flatShippingRate,
      min_order_amount_usd: shipCfg.minOrderAmount,
      shipping_policy_version_id: shipCfg.shipping_policy_version_id,
      policy_source:
        shipCfg.policy_source === 'database'
          ? 'shipping_policy_versions (active row in database)'
          : 'environment variables (FREE_SHIPPING_THRESHOLD, FLAT_SHIPPING_RATE, MIN_ORDER_AMOUNT) — no DB row',
    },
    by_shipping_policy_version: byShippingPolicyVersion,
    assumptions: assumptions,
    aggregates: {
      sum_net_subtotal_usd: round2(sumSubtotalNet),
      average_order_value_net_subtotal_usd: avgOrderValue,
      median_order_value_net_subtotal_usd: medianOrderValue,
      sum_shipping_collected_usd: round2(sumShippingCollected),
      sum_tax_collected_usd: round2(sumTax),
      sum_cogs_est_known_lines_usd: round2(sumCogsKnown),
      sum_goods_gross_margin_usd_orders_fully_costed_only: round2(sumGoodsMargin),
      margin_pct_of_subtotal_goods_only:
        marginPctOfSubtotal != null
          ? marginPctOfSubtotal
          : null,
      margin_pct_not_computed_reason:
        ordersFullyCosted < n
          ? 'Some orders missing product cost on one or more lines — aggregate margin % omitted to avoid fake precision.'
          : null,
      orders_fully_costed: ordersFullyCosted,
      orders_partial_or_missing_cost: ordersPartialCost,
      line_items_with_cost: linesWithCost,
      line_items_missing_cost: linesMissingCost,
      line_items_cogs_from_order_snapshot: linesCogsFromSnapshot,
      line_items_cogs_from_current_product_cost: linesCogsFromCurrentProduct,
      estimated_carrier_cost_sum_usd: round2(sumCarrierCostEstimated),
      orders_with_carrier_cost_estimate: ordersWithCarrierEstimate,
      orders_carrier_cost_from_order_snapshot: ordersCarrierFromSnapshot,
      orders_with_unknown_carrier_cost_component: ordersCarrierUnknown,
      contribution_goods_plus_shipping_minus_assumed_carrier_usd_order_sum: contributionAggKnown,
      contribution_order_level_not_computed_reason:
        contributionAggKnown == null
          ? 'Computed only when every order has full line-level cost and a carrier assumption for that order’s shipping type (paid vs free). Otherwise omitted to avoid false totals.'
          : null
    },
    guidance: {
      average_gap_to_current_free_shipping_usd: avgGapFree,
      median_gap_to_current_free_shipping_usd: medianGapFree,
      orders_below_current_free_shipping_threshold: gapsToFree.length,
      orders_at_or_above_current_free_shipping_threshold: shipCfg.freeShippingThreshold > 0 ? n - gapsToFree.length : n,
      note:
        shipCfg.freeShippingThreshold <= 0
          ? 'Free shipping threshold is 0 (always free) or disabled — gap metrics are not applicable.'
          : null
    },
    distribution_subtotal_bands: bandCounts.map((b) => ({
      label: b.label,
      order_count: b.order_count,
      sum_net_subtotal_usd: round2(b.subtotal_net_sum),
      orders_fully_costed_in_band: b.orders_fully_costed_in_band,
      avg_goods_margin_fully_costed_per_order_usd:
        b.orders_fully_costed_in_band > 0
          ? round2(b.sum_goods_margin_fully_costed_usd / b.orders_fully_costed_in_band)
          : null,
    })),
    scenarios_free_shipping_thresholds: freeShipScenarios,
    scenarios_minimum_order_subtotals: minOrderScenarios,
    recommendations,
    production_logic_unchanged:
      'Live checkout uses the active row in shipping_policy_versions when Supabase is configured (latest effective_at ≤ now); otherwise env vars. Create versions in Admin → Shipping policy.'
  };
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : round2((s[m - 1] + s[m]) / 2);
}

function emptyReport(sinceDays, maxOrders, excludeCancelled, liveResolved) {
  const shipCfg =
    liveResolved ||
    commerceShipping.getCommerceShippingConfig() ||
    {};
  const src =
    shipCfg.policy_source === 'database'
      ? 'shipping_policy_versions (DB)'
      : 'environment variables';
  return {
    generated_at: new Date().toISOString(),
    sample: { orders_analyzed: 0, since_days: sinceDays, max_orders_cap: maxOrders, excluded_cancelled: excludeCancelled, small_sample_warning: true },
    honesty: {
      product_cost_basis: 'N/A — no orders',
      shipping_carrier_cost_basis: 'N/A — no orders',
      tax_excluded: 'N/A'
    },
    current_policy: {
      free_shipping_threshold_usd: shipCfg.freeShippingThreshold,
      flat_shipping_rate_usd: shipCfg.flatShippingRate,
      min_order_amount_usd: shipCfg.minOrderAmount,
      shipping_policy_version_id: shipCfg.shipping_policy_version_id,
      policy_source: src,
    },
    by_shipping_policy_version: [],
    assumptions: getAnalyticsAssumptions(),
    aggregates: {},
    guidance: {},
    distribution_subtotal_bands: SUBTOTAL_BANDS.map((b) => ({
      label: b.label,
      order_count: 0,
      sum_net_subtotal_usd: 0,
      orders_fully_costed_in_band: 0,
      avg_goods_margin_fully_costed_per_order_usd: null,
    })),
    scenarios_free_shipping_thresholds: [],
    scenarios_minimum_order_subtotals: [],
    recommendations: {
      auto_apply: false,
      available: false,
      confidence: { level: 'low', label: 'No data', reasons: ['No orders in the selected window.'] },
      limitations: ['Run again after orders exist in range, or widen days / max_orders.'],
    },
    production_logic_unchanged: 'No orders in sample.'
  };
}

module.exports = {
  buildShippingMarginReport,
  FREE_SHIP_SCENARIOS,
  MIN_ORDER_SCENARIOS
};
