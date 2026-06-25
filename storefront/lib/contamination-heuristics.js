'use strict';

/**
 * Canonical fake/smoke/demo contamination heuristics (read-only classification).
 * Shared by scripts/contamination-report.mjs, tests, and admin KPI exclusion (future).
 *
 * Does NOT mutate data. Does NOT auto-tag rows in production.
 */

/** @typedef {'definite'|'high'|'medium'|'low'} ContaminationConfidence */
/** @typedef {'critical'|'high'|'medium'|'low'} ContaminationSeverity */
/** @typedef {'quarantine_review'|'exclude_from_kpi'|'archive_candidate'|'manual_review'|'none'} ContaminationAction */

/** @typedef {Object} ContaminationMatch
 * @property {boolean} flagged
 * @property {ContaminationConfidence} confidence
 * @property {ContaminationSeverity} severity
 * @property {ContaminationAction} recommendedAction
 * @property {string} entityType
 * @property {string[]} reasons
 */

const CONFIDENCE_RANK = { definite: 4, high: 3, medium: 2, low: 1 };
const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

const DEMO_EMAIL_EXACT = 'demo@company.com';

const TEST_EMAIL_DOMAINS = ['glovecubs-test.com', 'example.com', 'test.local'];

const TEST_EMAIL_PREFIXES = ['loadtest', 'loadtest+', 'test-', 'test-e2e-'];

const MATRIX_EMAIL_LOCAL_PREFIX = 'matrix';

const PLACEHOLDER_IMAGE_HOSTS = ['via.placeholder.com', 'placehold.co', 'placeholder.com'];

const KNOWN_DEMO_COMPANY_NAMES = [
  'demo company inc',
  'loadtest company',
  'test company llc',
  'glovecubs admin test',
  'legacy orders (no company)',
];

const KNOWN_DEMO_COMPANY_SLUGS = ['legacy-no-company-backfill'];

const KNOWN_TEST_PRODUCT_SLUGS = ['test-product'];

const SMOKE_ORDER_NUMBER_PREFIXES = ['LEGACY-MATRIX', 'MATRIX-', 'LEGACY-', 'CONC-', 'INV-', 'REL-', 'R6ADD-', 'LEG-'];

const KNOWN_SMOKE_TEXT_MARKERS = [
  'commerce truth smoke',
  'load test quote submission',
  'load test',
  'e2e test',
  'rec-duplicate-test-',
];

const KNOWN_DEMO_PRODUCT_TYPE_CODE = 'gc_demo_gloves';
const KNOWN_DEMO_SUPPLIER_SLUG = 'sample-supplier';
const DEMO_PRODUCT_SLUG_PREFIX = 'demo-product-';

const SMOKE_SESSION_PREFIX = 'smoke-';

const SEED_SKU_PREFIXES = ['GLV-GL-', 'GLV-705', 'GLV-805', 'GLV-500', 'GLV-SAF-', 'GLV-AMS-', 'GLV-PIP-', 'GLV-MCR-', 'GLV-ANS-', 'GLV-SHW-', 'GLV-WSL-', 'GLV-CR509'];

function normStr(v) {
  if (v == null) return '';
  return String(v).trim();
}

function normLower(v) {
  return normStr(v).toLowerCase();
}

function emailLocalPart(email) {
  const e = normLower(email);
  const at = e.indexOf('@');
  return at === -1 ? e : e.slice(0, at);
}

function emailDomain(email) {
  const e = normLower(email);
  const at = e.indexOf('@');
  return at === -1 ? '' : e.slice(at + 1);
}

/** @returns {ContaminationMatch} */
function emptyMatch(entityType) {
  return {
    flagged: false,
    confidence: 'low',
    severity: 'low',
    recommendedAction: 'none',
    entityType,
    reasons: [],
  };
}

/** @param {Partial<ContaminationMatch>} patch @returns {ContaminationMatch} */
function mergeMatches(base, patch) {
  const reasons = [...new Set([...(base.reasons || []), ...(patch.reasons || [])])];
  const confidence =
    CONFIDENCE_RANK[patch.confidence] >= CONFIDENCE_RANK[base.confidence]
      ? patch.confidence
      : base.confidence;
  const severity =
    SEVERITY_RANK[patch.severity] >= SEVERITY_RANK[base.severity] ? patch.severity : base.severity;
  const recommendedAction =
    patch.recommendedAction && patch.recommendedAction !== 'none'
      ? patch.recommendedAction
      : base.recommendedAction;
  return {
    flagged: Boolean(base.flagged || patch.flagged),
    confidence,
    severity,
    recommendedAction,
    entityType: patch.entityType || base.entityType,
    reasons,
  };
}

/**
 * @param {string|null|undefined} email
 * @param {string} entityType
 * @returns {ContaminationMatch}
 */
function classifyEmail(email, entityType = 'email') {
  const out = emptyMatch(entityType);
  const raw = normStr(email);
  if (!raw) return out;

  const lower = raw.toLowerCase();
  const local = emailLocalPart(raw);
  const domain = emailDomain(raw);

  if (lower === DEMO_EMAIL_EXACT) {
    return mergeMatches(out, {
      flagged: true,
      confidence: 'definite',
      severity: 'critical',
      recommendedAction: 'quarantine_review',
      reasons: ['email:demo@company.com (known migration/seed demo account)'],
    });
  }

  if (TEST_EMAIL_DOMAINS.includes(domain)) {
    const isDefinite = domain === 'glovecubs-test.com';
    return mergeMatches(out, {
      flagged: true,
      confidence: isDefinite ? 'definite' : 'high',
      severity: isDefinite ? 'critical' : 'high',
      recommendedAction: 'exclude_from_kpi',
      reasons: [`email:domain @${domain}`],
    });
  }

  if (local.startsWith('loadtest') || local.startsWith('loadtest+')) {
    return mergeMatches(out, {
      flagged: true,
      confidence: 'definite',
      severity: 'high',
      recommendedAction: 'exclude_from_kpi',
      reasons: ['email:loadtest prefix'],
    });
  }

  if (local.startsWith('test-e2e-')) {
    return mergeMatches(out, {
      flagged: true,
      confidence: 'definite',
      severity: 'high',
      recommendedAction: 'quarantine_review',
      reasons: ['email:test-e2e- prefix (e2e script)'],
    });
  }

  if (local.startsWith('test-')) {
    return mergeMatches(out, {
      flagged: true,
      confidence: 'high',
      severity: 'medium',
      recommendedAction: 'manual_review',
      reasons: ['email:test- prefix'],
    });
  }

  if (local.startsWith(MATRIX_EMAIL_LOCAL_PREFIX) && (domain === 'test.local' || domain === 'example.com')) {
    return mergeMatches(out, {
      flagged: true,
      confidence: 'definite',
      severity: 'high',
      recommendedAction: 'exclude_from_kpi',
      reasons: [`email:matrix*@${domain} (matrix test fixture)`],
    });
  }

  return out;
}

/**
 * @param {string|null|undefined} text
 * @param {string} fieldLabel
 * @param {string} entityType
 * @returns {ContaminationMatch}
 */
function classifyFreeText(text, fieldLabel, entityType) {
  const out = emptyMatch(entityType);
  const lower = normLower(text);
  if (!lower) return out;

  for (const name of KNOWN_DEMO_COMPANY_NAMES) {
    if (lower === name || lower.startsWith(`${name} `)) {
      return mergeMatches(out, {
        flagged: true,
        confidence: name.includes('loadtest') ? 'definite' : 'high',
        severity: 'high',
        recommendedAction: 'exclude_from_kpi',
        reasons: [`${fieldLabel}:known demo company name "${name}"`],
      });
    }
  }

  if (/^loadtest company\b/i.test(lower) || /^loadtest mixed\b/i.test(lower)) {
    return mergeMatches(out, {
      flagged: true,
      confidence: 'definite',
      severity: 'high',
      recommendedAction: 'exclude_from_kpi',
      reasons: [`${fieldLabel}:LoadTest company pattern`],
    });
  }

  for (const marker of KNOWN_SMOKE_TEXT_MARKERS) {
    if (lower.includes(marker)) {
      return mergeMatches(out, {
        flagged: true,
        confidence: marker.includes('commerce truth') ? 'definite' : 'high',
        severity: marker.includes('commerce truth') ? 'high' : 'medium',
        recommendedAction: 'exclude_from_kpi',
        reasons: [`${fieldLabel}:smoke marker "${marker}"`],
      });
    }
  }

  if (/\bvu\d+\b/i.test(lower) && lower.includes('load test')) {
    return mergeMatches(out, {
      flagged: true,
      confidence: 'high',
      severity: 'medium',
      recommendedAction: 'exclude_from_kpi',
      reasons: [`${fieldLabel}:k6 load-test note pattern`],
    });
  }

  if (/^matrix test$/i.test(lower) || /^matrix\s*test\s*\d*$/i.test(lower)) {
    return mergeMatches(out, {
      flagged: true,
      confidence: 'high',
      severity: 'medium',
      recommendedAction: 'exclude_from_kpi',
      reasons: [`${fieldLabel}:matrix test contact pattern`],
    });
  }

  return out;
}

/**
 * @param {string|null|undefined} url
 * @returns {ContaminationMatch}
 */
function classifyImageUrl(url) {
  const out = emptyMatch('product');
  const lower = normLower(url);
  if (!lower) return out;

  for (const host of PLACEHOLDER_IMAGE_HOSTS) {
    if (lower.includes(host)) {
      return mergeMatches(out, {
        flagged: true,
        confidence: 'medium',
        severity: 'medium',
        recommendedAction: 'manual_review',
        reasons: [`image:placeholder host ${host} (often seed.js legacy product)`],
      });
    }
  }
  return out;
}

/**
 * @param {string|null|undefined} slug
 * @returns {ContaminationMatch}
 */
function classifyProductSlug(slug) {
  const out = emptyMatch('product');
  const s = normLower(slug);
  if (!s) return out;

  if (s.startsWith(DEMO_PRODUCT_SLUG_PREFIX)) {
    return mergeMatches(out, {
      flagged: true,
      confidence: 'definite',
      severity: 'high',
      recommendedAction: 'archive_candidate',
      reasons: [`slug:${DEMO_PRODUCT_SLUG_PREFIX}* (seed-sample-catalog-products.sql)`],
    });
  }

  if (KNOWN_TEST_PRODUCT_SLUGS.includes(s) || s === 'test-product' || s.startsWith('test-product-')) {
    return mergeMatches(out, {
      flagged: true,
      confidence: 'definite',
      severity: 'high',
      recommendedAction: 'exclude_from_kpi',
      reasons: ['slug:test-product* (dev/test catalog fixture)'],
    });
  }

  return out;
}

/**
 * @param {string|null|undefined} typeCode
 * @returns {ContaminationMatch}
 */
function classifyProductTypeCode(typeCode) {
  const out = emptyMatch('product');
  if (normLower(typeCode) === KNOWN_DEMO_PRODUCT_TYPE_CODE) {
    return mergeMatches(out, {
      flagged: true,
      confidence: 'definite',
      severity: 'high',
      recommendedAction: 'archive_candidate',
      reasons: [`product_type:${KNOWN_DEMO_PRODUCT_TYPE_CODE}`],
    });
  }
  return out;
}

/**
 * @param {string|null|undefined} slug
 * @param {string|null|undefined} name
 * @returns {ContaminationMatch}
 */
function classifySupplier(slug, name) {
  let out = emptyMatch('supplier');
  if (normLower(slug) === KNOWN_DEMO_SUPPLIER_SLUG) {
    out = mergeMatches(out, {
      flagged: true,
      confidence: 'definite',
      severity: 'medium',
      recommendedAction: 'archive_candidate',
      reasons: [`supplier:slug ${KNOWN_DEMO_SUPPLIER_SLUG} (migration seed)`],
    });
  }
  if (normLower(name) === 'sample supplier') {
    out = mergeMatches(out, {
      flagged: true,
      confidence: 'high',
      severity: 'medium',
      recommendedAction: 'manual_review',
      reasons: ['supplier:name Sample Supplier'],
    });
  }
  return out;
}

/**
 * @param {string|null|undefined} sku
 * @param {string|null|undefined} imageUrl
 * @returns {ContaminationMatch}
 */
function classifyLegacyProductSku(sku, imageUrl) {
  let out = emptyMatch('product');
  const s = normStr(sku).toUpperCase();
  if (s) {
    const seedHit = SEED_SKU_PREFIXES.some((p) => s.startsWith(p.toUpperCase()));
    if (seedHit) {
      out = mergeMatches(out, {
        flagged: true,
        confidence: 'medium',
        severity: 'medium',
        recommendedAction: 'manual_review',
        reasons: [`sku:matches seed.js GLV-* family (${s}) — verify not real catalog before cleanup`],
      });
    }
  }
  out = mergeMatches(out, classifyImageUrl(imageUrl));
  return out;
}

/**
 * @param {string|null|undefined} slug
 * @returns {ContaminationMatch}
 */
function classifyCompanySlug(slug) {
  const out = emptyMatch('company');
  const s = normLower(slug);
  if (!s) return out;

  if (KNOWN_DEMO_COMPANY_SLUGS.includes(s)) {
    return mergeMatches(out, {
      flagged: true,
      confidence: 'definite',
      severity: 'high',
      recommendedAction: 'exclude_from_kpi',
      reasons: [`company:slug ${s} (migration backfill bucket)`],
    });
  }
  return out;
}

/**
 * True when order has payment/financial signals — never auto-delete-safe.
 * @param {Record<string, unknown>} row
 */
function orderHasFinancialSignals(row) {
  const r = row || {};
  if (normStr(r.stripe_payment_intent_id)) return true;
  if (r.payment_confirmed_at != null && normStr(r.payment_confirmed_at)) return true;
  const inv = normLower(r.invoice_status);
  if (inv && inv !== 'none' && inv !== 'draft') return true;
  if (typeof r.invoice_amount_paid === 'number' && r.invoice_amount_paid > 0) return true;
  if (typeof r.total_minor === 'number' && r.total_minor > 0 && r.payment_method != null) return true;
  return false;
}

/**
 * @param {string|null|undefined} orderNumber
 * @param {Record<string, unknown>} row
 * @returns {ContaminationMatch}
 */
function classifyOrderNumber(orderNumber, row) {
  let out = emptyMatch('order');
  const num = normStr(orderNumber).toUpperCase();
  if (!num) return out;

  const financial = orderHasFinancialSignals(row);
  const financialNote = financial ? ' — has payment/invoice signals; manual review only' : '';

  for (const prefix of SMOKE_ORDER_NUMBER_PREFIXES) {
    if (num.startsWith(prefix.toUpperCase())) {
      out = mergeMatches(out, {
        flagged: true,
        confidence: 'definite',
        severity: financial ? 'high' : 'medium',
        recommendedAction: financial ? 'manual_review' : 'exclude_from_kpi',
        reasons: [`order_number:${prefix}* smoke/matrix fixture${financialNote}`],
      });
      break;
    }
  }

  return out;
}

/**
 * @param {Record<string, unknown>} row
 * @returns {ContaminationMatch}
 */
function classifyOrder(row) {
  let out = emptyMatch('order');
  const r = row || {};

  if (r.slug != null) out = mergeMatches(out, classifyCompanySlug(r.slug));
  if (r.company_slug != null) out = mergeMatches(out, classifyCompanySlug(r.company_slug));

  if (r.order_number != null) out = mergeMatches(out, classifyOrderNumber(r.order_number, r));

  if (orderHasFinancialSignals(r) && out.flagged) {
    out = mergeMatches(out, {
      recommendedAction: 'manual_review',
      reasons: ['order:financial signals present — never auto-delete-safe'],
    });
  }

  return out;
}

/**
 * @param {string|null|undefined} sessionOrRefId
 * @returns {ContaminationMatch}
 */
function classifySmokeSessionId(sessionOrRefId) {
  const out = emptyMatch('session');
  const s = normLower(sessionOrRefId);
  if (s.startsWith(SMOKE_SESSION_PREFIX)) {
    return mergeMatches(out, {
      flagged: true,
      confidence: 'high',
      severity: 'low',
      recommendedAction: 'exclude_from_kpi',
      reasons: [`session:${SMOKE_SESSION_PREFIX}* (commerce-truth smoke)`],
    });
  }
  return out;
}

/**
 * @param {string|null|undefined} recommendationId
 * @returns {ContaminationMatch}
 */
function classifyRecommendationId(recommendationId) {
  const out = emptyMatch('recommendation_outcome');
  const s = normLower(recommendationId);
  if (s.startsWith('rec-duplicate-test-')) {
    return mergeMatches(out, {
      flagged: true,
      confidence: 'definite',
      severity: 'medium',
      recommendedAction: 'archive_candidate',
      reasons: ['recommendation_id:rec-duplicate-test-* (load-test outcome-write)'],
    });
  }
  return out;
}

/**
 * Classify a row by entity type. Does not fetch related rows — pass denormalized fields when available.
 *
 * @param {string} entityType
 * @param {Record<string, unknown>} row
 * @returns {ContaminationMatch}
 */
function classifyRecord(entityType, row) {
  const r = row || {};
  let out = emptyMatch(entityType);

  const emailFields = ['email', 'contact_email', 'rep_email', 'admin_email'];
  for (const f of emailFields) {
    if (r[f] != null) out = mergeMatches(out, classifyEmail(r[f], entityType));
  }

  const textFields = [
    ['company_name', 'company_name'],
    ['trade_name', 'trade_name'],
    ['legal_name', 'legal_name'],
    ['contact_name', 'contact_name'],
    ['name', 'name'],
    ['notes', 'notes'],
    ['message', 'message'],
    ['reason', 'reason'],
  ];
  for (const [key, label] of textFields) {
    if (r[key] != null) out = mergeMatches(out, classifyFreeText(r[key], label, entityType));
  }

  if (entityType === 'product' || entityType === 'catalog_product') {
    if (r.slug != null) out = mergeMatches(out, classifyProductSlug(r.slug));
    if (r.product_type_code != null) out = mergeMatches(out, classifyProductTypeCode(r.product_type_code));
    if (r.type_code != null) out = mergeMatches(out, classifyProductTypeCode(r.type_code));
  }

  if (entityType === 'supplier') {
    out = mergeMatches(out, classifySupplier(r.slug, r.name));
  }

  if (entityType === 'company') {
    if (r.slug != null) out = mergeMatches(out, classifyCompanySlug(r.slug));
  }

  if (entityType === 'order') {
    out = mergeMatches(out, classifyOrder(r));
  }

  if (r.sku != null || r.image_url != null) {
    out = mergeMatches(out, classifyLegacyProductSku(r.sku, r.image_url));
  }

  if (r.recommendation_id != null) {
    out = mergeMatches(out, classifyRecommendationId(r.recommendation_id));
  }

  if (r.session_id != null) out = mergeMatches(out, classifySmokeSessionId(r.session_id));

  if (r.payload && typeof r.payload === 'object') {
    const p = /** @type {Record<string, unknown>} */ (r.payload);
    out = mergeMatches(out, classifyRecord(entityType, p));
  }

  if (r.metadata && typeof r.metadata === 'object') {
    const m = /** @type {Record<string, unknown>} */ (r.metadata);
    out = mergeMatches(out, classifyRecord(entityType, m));
  }

  out.entityType = entityType;
  return out;
}

/** True when row should be excluded from admin KPI aggregates (future use). */
function isLikelyTestData(row, entityType) {
  return classifyRecord(entityType, row).flagged;
}

/** @returns {string|null} */
function getContaminationExclusionReason(row, entityType) {
  const c = classifyRecord(entityType, row);
  if (!c.flagged) return null;
  return c.reasons.join('; ');
}

function shouldExcludeFromAdminKpi(row, entityType) {
  const c = classifyRecord(entityType, row);
  if (!c.flagged) return false;
  if (entityType === 'order' && orderHasFinancialSignals(row)) return false;
  if (c.recommendedAction === 'manual_review' && c.confidence !== 'definite' && c.confidence !== 'high') {
    return false;
  }
  return c.recommendedAction === 'exclude_from_kpi' || c.confidence === 'definite' || c.confidence === 'high';
}

/** Count definite/high flagged rows for admin visibility banner (includes non-KPI domains). */
function countFlaggedForAdminVisibility(rows, entityType) {
  const list = rows || [];
  return list.filter((row) => {
    const c = classifyRecord(entityType, row);
    return c.flagged && (c.confidence === 'definite' || c.confidence === 'high');
  }).length;
}

/**
 * Client-side filter helper for admin lists (future KPI suppression).
 * @template T
 * @param {T[]} rows
 * @param {string} entityType
 * @returns {T[]}
 */
function filterLikelyTestRows(rows, entityType) {
  return (rows || []).filter((row) => !shouldExcludeFromAdminKpi(row, entityType));
}

/**
 * Count rows excluding likely test data (future dashboard use).
 * @param {unknown[]} rows
 * @param {string} entityType
 */
function countExcludingLikelyTest(rows, entityType) {
  const list = rows || [];
  const excluded = list.filter((row) => shouldExcludeFromAdminKpi(row, entityType)).length;
  return { total: list.length, excluded, included: list.length - excluded };
}

/** PostgREST ilike patterns for report pre-filter (read-only queries). */
const SQL_EMAIL_LIKE_FRAGMENTS = [
  `%@glovecubs-test.com`,
  `%@example.com`,
  `%@test.local`,
  `demo@company.com`,
  `loadtest%`,
  `test-e2e-%`,
  `test-%`,
  `matrix%@test.local`,
];

module.exports = {
  DEMO_EMAIL_EXACT,
  TEST_EMAIL_DOMAINS,
  TEST_EMAIL_PREFIXES,
  PLACEHOLDER_IMAGE_HOSTS,
  KNOWN_DEMO_COMPANY_NAMES,
  KNOWN_DEMO_COMPANY_SLUGS,
  KNOWN_TEST_PRODUCT_SLUGS,
  KNOWN_SMOKE_TEXT_MARKERS,
  KNOWN_DEMO_PRODUCT_TYPE_CODE,
  KNOWN_DEMO_SUPPLIER_SLUG,
  DEMO_PRODUCT_SLUG_PREFIX,
  SMOKE_SESSION_PREFIX,
  SMOKE_ORDER_NUMBER_PREFIXES,
  SEED_SKU_PREFIXES,
  SQL_EMAIL_LIKE_FRAGMENTS,
  classifyEmail,
  classifyFreeText,
  classifyImageUrl,
  classifyProductSlug,
  classifyProductTypeCode,
  classifySupplier,
  classifyCompanySlug,
  classifyOrder,
  classifyOrderNumber,
  orderHasFinancialSignals,
  classifyLegacyProductSku,
  classifySmokeSessionId,
  classifyRecommendationId,
  classifyRecord,
  mergeMatches,
  isLikelyTestData,
  getContaminationExclusionReason,
  shouldExcludeFromAdminKpi,
  countFlaggedForAdminVisibility,
  filterLikelyTestRows,
  countExcludingLikelyTest,
};
