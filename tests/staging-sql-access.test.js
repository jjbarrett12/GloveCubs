'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveStagingDatabaseUrl,
  resolveAndPrecheckStagingDb,
  projectRefFromDbUrl,
  APPROVED_DB_URL_KEYS,
  EXPECTED_STAGING_REF,
} = require('../lib/stagingSqlAccess');

function baseEnv(overrides = {}) {
  return {
    GC_ENVIRONMENT: 'staging',
    GC_ALLOW_DESTRUCTIVE_TESTS: '1',
    GC_EXPECTED_SUPABASE_PROJECT_REF: EXPECTED_STAGING_REF,
    GC_EXPECTED_DEPLOYMENT_HOST: 'localhost',
    GC_EMERGENCY_DISABLE_CATALOG_SUPABASE: '1',
    GC_EMAIL_SANDBOX: '1',
    SUPABASE_URL: `https://${EXPECTED_STAGING_REF}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${EXPECTED_STAGING_REF}.supabase.co`,
    SUPABASE_ANON_KEY: 'anon-test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-test',
    DOMAIN: 'http://localhost:3005',
    API_BASE: 'http://localhost:3004',
    ...overrides,
  };
}

describe('stagingSqlAccess resolution', () => {
  it('lists approved keys with STAGING_DATABASE_URL first', () => {
    assert.equal(APPROVED_DB_URL_KEYS[0], 'STAGING_DATABASE_URL');
  });

  it('prefers STAGING_DATABASE_URL over DATABASE_URL', () => {
    const r = resolveStagingDatabaseUrl({
      STAGING_DATABASE_URL: 'postgresql://u:p@h/db',
      DATABASE_URL: 'postgresql://other/db',
    });
    assert.equal(r.key, 'STAGING_DATABASE_URL');
  });

  it('returns BLOCKED_ON_OPERATOR_SECRET when no DB URL', () => {
    const r = resolveAndPrecheckStagingDb(baseEnv());
    assert.equal(r.ok, false);
    assert.equal(r.code, 'BLOCKED_ON_OPERATOR_SECRET');
  });

  it('rejects denylisted project ref embedded in pooler username', () => {
    const r = resolveAndPrecheckStagingDb(
      baseEnv({
        STAGING_DATABASE_URL:
          'postgresql://postgres.mnmagwsenzvetwngaszv:x@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
      })
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 'STAGING_DB_REJECTED');
  });

  it('parses pooler username project ref', () => {
    assert.equal(
      projectRefFromDbUrl(
        `postgresql://postgres.${EXPECTED_STAGING_REF}:x@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
      ),
      EXPECTED_STAGING_REF
    );
  });

  it('precheck ok when URL matches expected staging ref', () => {
    const r = resolveAndPrecheckStagingDb(
      baseEnv({
        STAGING_DATABASE_URL: `postgresql://postgres.${EXPECTED_STAGING_REF}:x@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      })
    );
    assert.equal(r.ok, true);
    assert.equal(r.code, 'STAGING_DB_PRECHECK_OK');
    assert.equal(r.resolved.key, 'STAGING_DATABASE_URL');
  });
});
