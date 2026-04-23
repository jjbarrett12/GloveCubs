/**
 * Supplier cost → list / bulk / reference tier prices (margin + MAP + floor).
 * Uses same margin formula as lib/pricing.js: sell = cost / (1 - margin/100).
 */

const { computeSellPrice } = require('./pricing');

const DEFAULT_RULES = {
  list_margin_percent: 45,
  bulk_margin_percent: 35,
  tier2_margin_percent: 38,
  tier3_margin_percent: 40,
  list_price_multiplier: null,
  map_policy: 'floor_for_list',
  min_price_floor_multiplier: 1,
  map_applies_to_bulk: false,
  update_case_qty_from_import: true,
  update_brand_from_import: false,
  merge_shipping_attributes: true
};

function roundMoney(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return NaN;
  return Math.round(x * 100) / 100;
}

function marginPercentAchieved(cost, price) {
  const c = Number(cost);
  const p = Number(price);
  if (p <= 0 || c < 0 || Number.isNaN(p) || Number.isNaN(c)) return null;
  return roundMoney(((p - c) / p) * 100);
}

/**
 * Merge partial rules with defaults and coerce types.
 * @param {object} partial
 * @returns {object}
 */
function normalizeRules(partial) {
  const r = { ...DEFAULT_RULES, ...(partial && typeof partial === 'object' ? partial : {}) };
  const num = (k, fallback) => {
    const v = r[k];
    if (v == null || v === '') return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    list_margin_percent: num('list_margin_percent', DEFAULT_RULES.list_margin_percent),
    bulk_margin_percent: num('bulk_margin_percent', DEFAULT_RULES.bulk_margin_percent),
    tier2_margin_percent: r.tier2_margin_percent == null ? null : num('tier2_margin_percent', null),
    tier3_margin_percent: r.tier3_margin_percent == null ? null : num('tier3_margin_percent', null),
    list_price_multiplier: r.list_price_multiplier == null || r.list_price_multiplier === '' ? null : num('list_price_multiplier', null),
    map_policy: r.map_policy === 'none' ? 'none' : 'floor_for_list',
    min_price_floor_multiplier: Math.max(0.01, num('min_price_floor_multiplier', 1)),
    map_applies_to_bulk: Boolean(r.map_applies_to_bulk),
    update_case_qty_from_import: r.update_case_qty_from_import !== false,
    update_brand_from_import: Boolean(r.update_brand_from_import),
    merge_shipping_attributes: r.merge_shipping_attributes !== false
  };
}

function validateRules(rules) {
  const errs = [];
  const r = normalizeRules(rules);
  ['list_margin_percent', 'bulk_margin_percent'].forEach((k) => {
    const m = r[k];
    if (m < 0 || m >= 100) errs.push(`${k} must be in [0, 100)`);
  });
  if (r.tier2_margin_percent != null && (r.tier2_margin_percent < 0 || r.tier2_margin_percent >= 100)) {
    errs.push('tier2_margin_percent must be in [0, 100) or null');
  }
  if (r.tier3_margin_percent != null && (r.tier3_margin_percent < 0 || r.tier3_margin_percent >= 100)) {
    errs.push('tier3_margin_percent must be in [0, 100) or null');
  }
  if (r.list_price_multiplier != null && r.list_price_multiplier <= 0) {
    errs.push('list_price_multiplier must be positive or null');
  }
  return { ok: errs.length === 0, errors: errs, rules: r };
}

/**
 * @param {number} cost
 * @param {number|null|undefined} mapPrice
 * @param {object} rulesNormalized - output of normalizeRules
 * @returns {{ error?: string, price?: number, bulk_price?: number, tier2_reference?: number|null, tier3_reference?: number|null, steps: object[], list_margin_achieved?: number|null, bulk_margin_achieved?: number|null }}
 */
function computeDerivedPricing(cost, mapPrice, rulesNormalized) {
  const steps = [];
  const c = Number(cost);
  if (!Number.isFinite(c) || c <= 0) {
    return { error: 'invalid_cost', steps: [] };
  }

  const r = rulesNormalized;
  const fromMargin = (pct) => {
    const p = computeSellPrice(c, pct);
    return Number.isFinite(p) ? p : NaN;
  };

  const mList = fromMargin(r.list_margin_percent);
  const mult = r.list_price_multiplier != null && r.list_price_multiplier > 0 ? c * r.list_price_multiplier : NaN;

  let listBase;
  if (Number.isFinite(mList) && Number.isFinite(mult)) {
    listBase = Math.max(mList, mult);
    steps.push({
      step: 'list_base',
      detail: `max(margin ${r.list_margin_percent}%, cost×${r.list_price_multiplier})`,
      value: roundMoney(listBase)
    });
  } else if (Number.isFinite(mList)) {
    listBase = mList;
    steps.push({ step: 'list_base', detail: `list margin ${r.list_margin_percent}%`, value: roundMoney(listBase) });
  } else if (Number.isFinite(mult)) {
    listBase = mult;
    steps.push({ step: 'list_base', detail: `list multiplier ×${r.list_price_multiplier}`, value: roundMoney(listBase) });
  } else {
    listBase = c;
    steps.push({ step: 'list_base', detail: 'fallback cost (no valid list rule)', value: roundMoney(listBase) });
  }

  let list = roundMoney(listBase);
  const map = mapPrice != null && Number(mapPrice) > 0 ? Number(mapPrice) : null;

  if (r.map_policy === 'floor_for_list' && map != null && list < map) {
    steps.push({ step: 'map_floor_list', detail: `raise list to MAP ${map}`, value: map });
    list = roundMoney(map);
  }

  const floor = roundMoney(c * r.min_price_floor_multiplier);
  if (list < floor) {
    steps.push({ step: 'min_floor_list', detail: `cost×${r.min_price_floor_multiplier}`, value: floor });
    list = floor;
  }

  let bulkBase = fromMargin(r.bulk_margin_percent);
  if (!Number.isFinite(bulkBase)) {
    bulkBase = list * 0.9;
    steps.push({ step: 'bulk_fallback', detail: 'invalid bulk margin — 90% of list', value: roundMoney(bulkBase) });
  }

  let bulk = roundMoney(bulkBase);
  bulk = roundMoney(Math.min(list, Math.max(floor, bulk)));

  if (r.map_applies_to_bulk && map != null && bulk < map) {
    bulk = roundMoney(Math.min(list, Math.max(bulk, map)));
    steps.push({ step: 'map_floor_bulk', detail: `MAP ${map}`, value: bulk });
  }

  let tier2 = null;
  let tier3 = null;
  if (r.tier2_margin_percent != null) {
    const t2 = fromMargin(r.tier2_margin_percent);
    if (Number.isFinite(t2)) tier2 = roundMoney(Math.min(list, Math.max(floor, t2)));
  }
  if (r.tier3_margin_percent != null) {
    const t3 = fromMargin(r.tier3_margin_percent);
    if (Number.isFinite(t3)) tier3 = roundMoney(Math.min(list, Math.max(floor, t3)));
  }

  return {
    price: list,
    bulk_price: bulk,
    tier2_reference: tier2,
    tier3_reference: tier3,
    steps,
    list_margin_achieved: marginPercentAchieved(c, list),
    bulk_margin_achieved: marginPercentAchieved(c, bulk),
    source_cost: c,
    map_applied: map
  };
}

module.exports = {
  DEFAULT_RULES,
  normalizeRules,
  validateRules,
  computeDerivedPricing,
  roundMoney,
  marginPercentAchieved
};
