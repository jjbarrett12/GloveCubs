'use strict';

const commerceShipping = require('../lib/commerce-shipping');
const { getSupabaseAdmin, isSupabaseAdminConfigured } = require('../lib/supabaseAdmin');

/**
 * @typedef {object} ResolvedShippingConfig
 * @property {number} freeShippingThreshold
 * @property {number} flatShippingRate
 * @property {number} minOrderAmount
 * @property {number|null} shipping_policy_version_id
 * @property {'database'|'environment'} policy_source
 * @property {string|null} effective_at
 */

/**
 * Active policy row at `asOf` (latest effective_at <= asOf).
 * @returns {Promise<object|null>}
 */
async function getActivePolicyVersionAt(asOf = new Date()) {
  if (!isSupabaseAdminConfigured()) return null;
  const sb = getSupabaseAdmin();
  const iso = asOf.toISOString();
  const { data, error } = await sb
    .from('shipping_policy_versions')
    .select('id, free_shipping_threshold, flat_shipping_rate, min_order_amount, effective_at, notes, created_at')
    .lte('effective_at', iso)
    .order('effective_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[shippingPolicyService] getActivePolicyVersionAt', error.message || error);
    return null;
  }
  return data || null;
}

/**
 * Config for checkout / quotes: DB version if available, else env (commerce-shipping defaults).
 * @returns {Promise<ResolvedShippingConfig>}
 */
async function resolveShippingConfigForCheckout(asOf = new Date()) {
  const envCfg = commerceShipping.getCommerceShippingConfig();
  const row = await getActivePolicyVersionAt(asOf);
  if (!row) {
    return {
      freeShippingThreshold: envCfg.freeShippingThreshold,
      flatShippingRate: envCfg.flatShippingRate,
      minOrderAmount: envCfg.minOrderAmount,
      shipping_policy_version_id: null,
      policy_source: 'environment',
      effective_at: null,
    };
  }
  return {
    freeShippingThreshold: Math.max(0, Number(row.free_shipping_threshold) || 0),
    flatShippingRate: Math.max(0, Number(row.flat_shipping_rate) || 0),
    minOrderAmount: Math.max(0, Number(row.min_order_amount) || 0),
    shipping_policy_version_id: Number(row.id),
    policy_source: 'database',
    effective_at: row.effective_at || null,
  };
}

async function listPolicyVersions({ limit = 100 } = {}) {
  if (!isSupabaseAdminConfigured()) return [];
  const sb = getSupabaseAdmin();
  const lim = Math.min(500, Math.max(1, Number(limit) || 100));
  const { data, error } = await sb
    .from('shipping_policy_versions')
    .select('id, free_shipping_threshold, flat_shipping_rate, min_order_amount, effective_at, notes, created_at')
    .order('effective_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(lim);
  if (error) throw error;
  return data || [];
}

async function createPolicyVersion(payload) {
  if (!isSupabaseAdminConfigured()) {
    const err = new Error('Supabase not configured');
    err.statusCode = 503;
    throw err;
  }
  const thr = payload.free_shipping_threshold != null ? Number(payload.free_shipping_threshold) : null;
  const flat = payload.flat_shipping_rate != null ? Number(payload.flat_shipping_rate) : null;
  const minA = payload.min_order_amount != null ? Number(payload.min_order_amount) : null;
  if (![thr, flat, minA].every((n) => Number.isFinite(n) && n >= 0)) {
    const err = new Error('free_shipping_threshold, flat_shipping_rate, min_order_amount must be non-negative numbers');
    err.statusCode = 400;
    throw err;
  }
  let effectiveAt = payload.effective_at != null ? new Date(payload.effective_at) : new Date();
  if (Number.isNaN(effectiveAt.getTime())) {
    const err = new Error('Invalid effective_at');
    err.statusCode = 400;
    throw err;
  }
  const sb = getSupabaseAdmin();
  const row = {
    free_shipping_threshold: thr,
    flat_shipping_rate: flat,
    min_order_amount: minA,
    effective_at: effectiveAt.toISOString(),
    notes: payload.notes != null ? String(payload.notes).slice(0, 2000) : null,
  };
  const { data, error } = await sb.from('shipping_policy_versions').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

/**
 * Append a new row identical to `id` with effective_at = now() so it becomes active (audit-friendly).
 */
async function activatePolicyVersion(id) {
  if (!isSupabaseAdminConfigured()) {
    const err = new Error('Supabase not configured');
    err.statusCode = 503;
    throw err;
  }
  const idNum = parseInt(id, 10);
  if (Number.isNaN(idNum)) {
    const err = new Error('Invalid id');
    err.statusCode = 400;
    throw err;
  }
  const sb = getSupabaseAdmin();
  const { data: src, error: gErr } = await sb
    .from('shipping_policy_versions')
    .select('*')
    .eq('id', idNum)
    .maybeSingle();
  if (gErr) throw gErr;
  if (!src) {
    const err = new Error('Policy version not found');
    err.statusCode = 404;
    throw err;
  }
  return createPolicyVersion({
    free_shipping_threshold: src.free_shipping_threshold,
    flat_shipping_rate: src.flat_shipping_rate,
    min_order_amount: src.min_order_amount,
    effective_at: new Date().toISOString(),
    notes: `Activated from version #${idNum}` + (src.notes ? ` — ${src.notes}` : ''),
  });
}

/**
 * Attach order_count per version (head-only counts; bounded list sizes).
 */
async function enrichPoliciesWithOrderCounts(policies) {
  if (!policies || !policies.length || !isSupabaseAdminConfigured()) {
    return (policies || []).map((p) => ({ ...p, order_count: null }));
  }
  const sb = getSupabaseAdmin();
  const out = await Promise.all(
    policies.map(async (p) => {
      const { count, error } = await sb
        .schema('gc_commerce')
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('shipping_policy_version_id', p.id);
      return {
        ...p,
        order_count: error ? null : count || 0,
      };
    })
  );
  return out;
}

module.exports = {
  getActivePolicyVersionAt,
  resolveShippingConfigForCheckout,
  listPolicyVersions,
  createPolicyVersion,
  activatePolicyVersion,
  enrichPoliciesWithOrderCounts,
};
