/**
 * Spend-based tier evaluation. Writes users.discount_tier only when pricing_tier_source = auto (unless forced).
 */

const usersService = require('./usersService');
const companiesService = require('./companiesService');
const dataService = require('./dataService');
const pricingTiersService = require('./pricingTiersService');

const EXCLUDED_ORDER_STATUSES = new Set(['cancelled', 'abandoned', 'pending_payment']);

function orderCountsForPricing(o) {
  const st = (o.status || '').toLowerCase();
  return !EXCLUDED_ORDER_STATUSES.has(st);
}

/**
 * @param {Array<object>} orders - company-scoped orders (same as account summary)
 * @param {Date} now
 */
function computeSpendMetrics(orders, now = new Date()) {
  const list = (orders || []).filter(orderCountsForPricing);
  const t = now.getTime();
  const d30 = new Date(t - 30 * 86400000).toISOString();
  const d60 = new Date(t - 60 * 86400000).toISOString();
  const d90 = new Date(t - 90 * 86400000).toISOString();
  const yStart = new Date(now.getFullYear(), 0, 1).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const sum = (arr) => arr.reduce((s, o) => s + (Number(o.total) || 0), 0);

  const trailing30 = sum(list.filter((o) => o.created_at >= d30));
  const trailing60 = sum(list.filter((o) => o.created_at >= d60));
  const trailing90 = sum(list.filter((o) => o.created_at >= d90));
  const ytd = sum(list.filter((o) => o.created_at >= yStart));
  const calendarMonth = sum(list.filter((o) => o.created_at >= monthStart));

  return {
    trailing_30: Math.round(trailing30 * 100) / 100,
    trailing_60: Math.round(trailing60 * 100) / 100,
    trailing_90: Math.round(trailing90 * 100) / 100,
    ytd: Math.round(ytd * 100) / 100,
    calendar_month: Math.round(calendarMonth * 100) / 100,
    order_count_countable: list.length,
  };
}

function tierMatches(tier, user, metrics) {
  if (tier.require_is_approved && !user.is_approved) return false;
  if (tier.min_spend_ytd != null && metrics.ytd < tier.min_spend_ytd) return false;
  if (tier.min_spend_trailing_30 != null && metrics.trailing_30 < tier.min_spend_trailing_30) return false;
  if (tier.min_spend_trailing_60 != null && metrics.trailing_60 < tier.min_spend_trailing_60) return false;
  if (tier.min_spend_trailing_90 != null && metrics.trailing_90 < tier.min_spend_trailing_90) return false;
  if (tier.min_spend_calendar_month != null && metrics.calendar_month < tier.min_spend_calendar_month) return false;
  return true;
}

function buildMatchReasons(tier, metrics) {
  const parts = [];
  if (tier.require_is_approved) parts.push('approved_account');
  if (tier.min_spend_ytd != null) parts.push(`ytd>=${tier.min_spend_ytd} (actual ${metrics.ytd})`);
  if (tier.min_spend_trailing_30 != null) parts.push(`trailing_30>=${tier.min_spend_trailing_30} (actual ${metrics.trailing_30})`);
  if (tier.min_spend_trailing_60 != null) parts.push(`trailing_60>=${tier.min_spend_trailing_60} (actual ${metrics.trailing_60})`);
  if (tier.min_spend_trailing_90 != null) parts.push(`trailing_90>=${tier.min_spend_trailing_90} (actual ${metrics.trailing_90})`);
  if (tier.min_spend_calendar_month != null) parts.push(`calendar_month>=${tier.min_spend_calendar_month} (actual ${metrics.calendar_month})`);
  if (parts.length === 0) parts.push('default_fallback');
  return parts;
}

/**
 * Pick highest-priority tier that matches (tiers pre-sorted desc priority).
 */
function pickTier(tiers, user, metrics) {
  for (const tier of tiers) {
    if (!tierMatches(tier, user, metrics)) continue;
    return {
      code: tier.code,
      display_name: tier.display_name,
      discount_percent: tier.discount_percent,
      matched_tier: tier,
      reasons: buildMatchReasons(tier, metrics),
    };
  }
  return {
    code: 'standard',
    display_name: 'Standard',
    discount_percent: 0,
    matched_tier: null,
    reasons: ['no_tier_row_matched'],
  };
}

/**
 * @returns {Promise<{ metrics: object, recommended: object, current_tier: string, source: string }>}
 */
async function previewEvaluationForUser(userId) {
  const user = await usersService.getUserById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  const tiers = await pricingTiersService.listActiveTiersForEvaluation();
  const companyIds = await companiesService.getCompanyIdsForUser(user);
  const orders = await dataService.getOrdersByCompanyId(companyIds, userId);
  const metrics = computeSpendMetrics(orders);
  const recommended = pickTier(tiers, user, metrics);
  return {
    metrics,
    recommended: {
      code: recommended.code,
      display_name: recommended.display_name,
      discount_percent: recommended.discount_percent,
      reasons: recommended.reasons,
    },
    current_tier: user.discount_tier || 'standard',
    source: user.pricing_tier_source || 'manual',
  };
}

/**
 * Apply recommended tier if allowed. Returns { changed, from, to, skipped_reason }.
 */
async function evaluateAndApplyUserTier(userId, options = {}) {
  const source = options.source || 'scheduled';
  const force = options.force === true;
  const user = await usersService.getUserById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  if (!force && user.pricing_tier_source !== 'auto') {
    return { changed: false, from: user.discount_tier, to: user.discount_tier, skipped_reason: 'manual_source' };
  }

  const { metrics, recommended } = await previewEvaluationForUser(userId);
  const newCode = String(recommended.code || 'standard').toLowerCase();
  const oldCode = String(user.discount_tier || 'standard').toLowerCase();

  const evaluatedAt = new Date().toISOString();
  if (newCode === oldCode) {
    await usersService.updateUser(userId, { pricing_tier_evaluated_at: evaluatedAt });
    return {
      changed: false,
      from: oldCode,
      to: newCode,
      metrics,
      recommended,
      skipped_reason: 'already_on_tier',
    };
  }

  await usersService.updateUser(userId, {
    discount_tier: newCode,
    pricing_tier_evaluated_at: evaluatedAt,
  });

  const reason =
    source === 'post_order'
      ? `Auto after order: rules matched ${newCode}`
      : source === 'admin_reevaluate'
        ? `Admin re-evaluation: ${newCode}`
        : `Automatic: ${newCode}`;

  await pricingTiersService.insertAuditLog({
    userId,
    oldTier: oldCode,
    newTier: newCode,
    reason,
    source,
    metricsSnapshot: { metrics, reasons: recommended.reasons, recommended_display: recommended.display_name },
  });

  return {
    changed: true,
    from: oldCode,
    to: newCode,
    metrics,
    recommended,
  };
}

async function evaluateAllAutoUsers(options = {}) {
  const supabase = require('../lib/supabaseAdmin').getSupabaseAdmin();
  const { data: rows, error } = await supabase.from('users').select('id').eq('pricing_tier_source', 'auto');
  if (error) throw error;
  const results = { processed: 0, changed: 0, errors: [] };
  for (const r of rows || []) {
    try {
      const out = await evaluateAndApplyUserTier(r.id, { source: options.source || 'admin_bulk' });
      results.processed += 1;
      if (out.changed) results.changed += 1;
    } catch (e) {
      results.errors.push({ user_id: r.id, error: e.message || String(e) });
    }
  }
  return results;
}

module.exports = {
  computeSpendMetrics,
  pickTier,
  previewEvaluationForUser,
  evaluateAndApplyUserTier,
  evaluateAllAutoUsers,
  tierMatches,
};
