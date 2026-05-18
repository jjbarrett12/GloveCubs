'use strict';

/**
 * Phase 0D: structured deprecation warnings for commerce truth consolidation.
 * Deduped by tag+path+reason to avoid log spam. Server-side only — never send to clients.
 */

const seen = new Map();
const MAX_KEYS = 500;

function pruneSeen() {
  if (seen.size <= MAX_KEYS) return;
  const first = seen.keys().next().value;
  seen.delete(first);
}

/**
 * @param {string} tag
 * @param {Record<string, unknown>} payload
 */
function warnOnce(tag, payload) {
  const pathKey = payload.path != null ? String(payload.path) : '';
  const reasonKey = payload.reason != null ? String(payload.reason) : '';
  const moduleKey = payload.module != null ? String(payload.module) : '';
  const key = `${tag}|${moduleKey}|${pathKey}|${reasonKey}`;
  if (seen.has(key)) return;
  seen.set(key, Date.now());
  pruneSeen();
  const body = { ...payload, ts: new Date().toISOString() };
  try {
    console.warn(tag, JSON.stringify(body));
  } catch (_) {
    console.warn(tag, body);
  }
}

/** @param {Record<string, unknown>} payload */
function warnPricingDeprecated(payload) {
  warnOnce('[GC_PRICING_DEPRECATED]', {
    migration: 'Pricing Authority V2 (resolve_pricing_authority_v2)',
    retire_phase: '0A/0E',
    ...payload,
  });
}

/** @param {Record<string, unknown>} payload */
function warnVariantInference(payload) {
  warnOnce('[GC_VARIANT_INFERENCE]', {
    migration: 'Variant Mandatory Enforcement — explicit catalog_variant_id + variant_sku',
    retire_phase: '0B',
    ...payload,
  });
}

/** @param {Record<string, unknown>} payload */
function warnParentInventory(payload) {
  warnOnce('[GC_PARENT_INVENTORY]', {
    migration: 'Variant Inventory Authority (catalog_v2.variant_inventory)',
    retire_phase: '0C',
    ...payload,
  });
}

/** @param {Record<string, unknown>} payload */
function warnLegacyCommercePath(payload) {
  warnOnce('[GC_LEGACY_COMMERCE_PATH]', {
    migration: 'Next storefront /store or Express routes with variant identity',
    retire_phase: '0D/0F',
    ...payload,
  });
}

/** Test-only reset */
function _resetForTests() {
  seen.clear();
}

module.exports = {
  warnPricingDeprecated,
  warnVariantInference,
  warnParentInventory,
  warnLegacyCommercePath,
  _resetForTests,
};
