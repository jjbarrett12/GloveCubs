'use strict';

/**
 * Non-destructive GloveCubs staging environment safety guard.
 * Call before migrations, fixtures, Auth password tests, or RLS mutation tests.
 * Never prints secrets.
 */

const crypto = require('crypto');

/** Known production / unverified project refs — never treat as staging. */
const DENYLIST_PROJECT_REFS = Object.freeze([
  'mnmagwsenzvetwngaszv', // GloveCubs V2 (production / unverified for security staging)
  'kfrizyygvcjbomxdrdal', // GLOVECUBS (legacy cloud project — not security staging)
]);

const DENYLIST_HOSTS = Object.freeze([
  'www.glovecubs.com',
  'glovecubs.com',
  'api.glovecubs.com',
]);

const PRODUCTION_VERCEL_PROJECT_IDS = Object.freeze([
  'prj_N0EIAYhHKwyORCuPBgh1Yibq9ID0', // linked storefront/root glovecubs production
]);

function fingerprint(value) {
  if (value == null || String(value).length === 0) return null;
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function parseSupabaseProjectRef(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  const m = raw.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i);
  return m ? m[1].toLowerCase() : null;
}

function normalizeHost(hostOrUrl) {
  const s = String(hostOrUrl || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
  return s || null;
}

function isLocalHost(host) {
  const h = normalizeHost(host);
  if (!h) return false;
  return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost');
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ allowLocal?: boolean }} [options]
 * @returns {{ ok: boolean, code?: string, errors: string[], warnings: string[], report: object }}
 */
function verifyStagingEnvironment(env, options = {}) {
  const allowLocal = options.allowLocal !== false;
  const errors = [];
  const warnings = [];

  const gcEnv = String(env.GC_ENVIRONMENT || '').trim().toLowerCase();
  const allowDestructive = String(env.GC_ALLOW_DESTRUCTIVE_TESTS || '').trim() === '1';
  const expectedRef = String(env.GC_EXPECTED_SUPABASE_PROJECT_REF || '')
    .trim()
    .toLowerCase();
  const expectedHost = normalizeHost(env.GC_EXPECTED_DEPLOYMENT_HOST);

  const expressUrl = env.SUPABASE_URL || '';
  const storefrontUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '';
  const expressRef = parseSupabaseProjectRef(expressUrl);
  const storefrontRef = parseSupabaseProjectRef(storefrontUrl);

  const anon = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const service = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const killSwitch = String(env.GC_EMERGENCY_DISABLE_CATALOG_SUPABASE || '').trim() === '1';
  const emailSandbox =
    String(env.GC_EMAIL_SANDBOX || '').trim() === '1' ||
    !String(env.SMTP_HOST || '').trim() ||
    String(env.SMTP_HOST || '')
      .toLowerCase()
      .includes('mailtrap') ||
    String(env.SMTP_HOST || '')
      .toLowerCase()
      .includes('ethereal');

  const domainHost = normalizeHost(env.DOMAIN || env.STOREFRONT_PUBLIC_ORIGIN || '');
  const apiHost = normalizeHost(env.API_BASE || env.NEXT_PUBLIC_GLOVECUBS_API || '');
  const vercelProjectId = String(env.VERCEL_PROJECT_ID || '').trim();

  if (gcEnv !== 'staging' && gcEnv !== 'test') {
    errors.push('GC_ENVIRONMENT must be "staging" or "test"');
  }
  if (!allowDestructive) {
    errors.push('GC_ALLOW_DESTRUCTIVE_TESTS must be "1" for isolated security tests');
  }
  if (!expectedRef) {
    errors.push('GC_EXPECTED_SUPABASE_PROJECT_REF is required');
  }
  if (expectedRef && DENYLIST_PROJECT_REFS.includes(expectedRef)) {
    errors.push('GC_EXPECTED_SUPABASE_PROJECT_REF is on the production/unverified denylist');
  }
  if (!expressRef) {
    errors.push('SUPABASE_URL missing or not a valid *.supabase.co project URL');
  }
  if (!storefrontRef) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL missing or invalid');
  }
  if (expressRef && storefrontRef && expressRef !== storefrontRef) {
    errors.push('Storefront and Express Supabase project refs do not match');
  }
  if (expressRef && expectedRef && expressRef !== expectedRef) {
    errors.push('SUPABASE_URL project ref does not match GC_EXPECTED_SUPABASE_PROJECT_REF');
  }
  if (expressRef && DENYLIST_PROJECT_REFS.includes(expressRef)) {
    errors.push('Supabase project ref is denylisted (production/unverified)');
  }
  if (!anon) {
    errors.push('SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
  }
  if (!service) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY is required');
  }
  if (!killSwitch) {
    errors.push('GC_EMERGENCY_DISABLE_CATALOG_SUPABASE must be "1" for staging security tests');
  }
  if (!emailSandbox) {
    errors.push('Email is not sandboxed: set GC_EMAIL_SANDBOX=1 or clear/sandbox SMTP_HOST');
  }

  for (const h of [domainHost, apiHost, expectedHost]) {
    if (!h) continue;
    if (DENYLIST_HOSTS.includes(h)) {
      errors.push(`Host "${h}" is a known production hostname`);
    }
  }

  if (vercelProjectId && PRODUCTION_VERCEL_PROJECT_IDS.includes(vercelProjectId)) {
    errors.push('VERCEL_PROJECT_ID matches the production GloveCubs Vercel project');
  }

  const localOk =
    allowLocal &&
    (!expectedHost || isLocalHost(expectedHost)) &&
    (!domainHost || isLocalHost(domainHost)) &&
    (!apiHost || isLocalHost(apiHost));

  if (expectedHost && !isLocalHost(expectedHost) && DENYLIST_HOSTS.includes(expectedHost)) {
    errors.push('GC_EXPECTED_DEPLOYMENT_HOST is production');
  }

  if (!localOk && expectedHost && !isLocalHost(expectedHost)) {
    // Cloud staging host is allowed when not denylisted; warn if marker missing pattern
    if (!/staging|preview|localhost|127\.0\.0\.1/i.test(expectedHost)) {
      warnings.push(
        'GC_EXPECTED_DEPLOYMENT_HOST does not look like staging/preview/local — confirm isolation',
      );
    }
  }

  const report = {
    gc_environment: gcEnv || null,
    allow_destructive_tests: allowDestructive,
    expected_ref: expectedRef || null,
    express_ref: expressRef,
    storefront_ref: storefrontRef,
    refs_match: !!(expressRef && storefrontRef && expressRef === storefrontRef),
    anon_fingerprint: fingerprint(anon),
    service_role_fingerprint: fingerprint(service),
    catalog_kill_switch: killSwitch,
    email_sandboxed: emailSandbox,
    domain_host: domainHost,
    api_host: apiHost,
    expected_host: expectedHost,
    local_stack: localOk,
    denylist_hit: !!(
      (expressRef && DENYLIST_PROJECT_REFS.includes(expressRef)) ||
      (expectedRef && DENYLIST_PROJECT_REFS.includes(expectedRef))
    ),
  };

  const ok = errors.length === 0;
  return {
    ok,
    code: ok ? 'STAGING_OK' : 'STAGING_UNSAFE',
    errors,
    warnings,
    report,
  };
}

/**
 * Throws if environment is not proven isolated staging.
 * Safe to call before opening a DB connection for destructive tests.
 */
function assertStagingEnvironment(env = process.env, options) {
  const result = verifyStagingEnvironment(env, options);
  if (!result.ok) {
    const err = new Error(
      `Staging environment guard failed: ${result.errors.join('; ')}`,
    );
    err.code = result.code;
    err.errors = result.errors;
    err.report = result.report;
    throw err;
  }
  return result;
}

module.exports = {
  DENYLIST_PROJECT_REFS,
  DENYLIST_HOSTS,
  PRODUCTION_VERCEL_PROJECT_IDS,
  fingerprint,
  parseSupabaseProjectRef,
  normalizeHost,
  isLocalHost,
  verifyStagingEnvironment,
  assertStagingEnvironment,
};
