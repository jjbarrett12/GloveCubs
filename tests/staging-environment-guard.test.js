'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  verifyStagingEnvironment,
  parseSupabaseProjectRef,
  DENYLIST_PROJECT_REFS,
} = require('../lib/stagingEnvironmentGuard');

const STAGING_REF = 'fmrupehxifzkpfphiyvm';

function baseEnv(overrides = {}) {
  return {
    GC_ENVIRONMENT: 'staging',
    GC_ALLOW_DESTRUCTIVE_TESTS: '1',
    GC_EXPECTED_SUPABASE_PROJECT_REF: STAGING_REF,
    GC_EXPECTED_DEPLOYMENT_HOST: 'localhost',
    GC_EMERGENCY_DISABLE_CATALOG_SUPABASE: '1',
    GC_EMAIL_SANDBOX: '1',
    SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
    SUPABASE_ANON_KEY: 'test-anon-key-value',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-value',
    DOMAIN: 'http://localhost:3005',
    API_BASE: 'http://localhost:3004',
    SMTP_HOST: '',
    ...overrides,
  };
}

describe('stagingEnvironmentGuard', () => {
  it('parses supabase project refs', () => {
    assert.equal(
      parseSupabaseProjectRef(`https://${STAGING_REF}.supabase.co`),
      STAGING_REF,
    );
    assert.equal(parseSupabaseProjectRef('https://evil.example.com'), null);
  });

  it('accepts valid staging configuration', () => {
    const r = verifyStagingEnvironment(baseEnv());
    assert.equal(r.ok, true);
    assert.equal(r.code, 'STAGING_OK');
    assert.equal(r.report.express_ref, STAGING_REF);
    assert.equal(r.report.refs_match, true);
  });

  it('rejects missing GC_ENVIRONMENT marker', () => {
    const r = verifyStagingEnvironment(baseEnv({ GC_ENVIRONMENT: '' }));
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /GC_ENVIRONMENT/.test(e)));
  });

  it('rejects production hostname', () => {
    const r = verifyStagingEnvironment(
      baseEnv({
        DOMAIN: 'https://www.glovecubs.com',
        GC_EXPECTED_DEPLOYMENT_HOST: 'www.glovecubs.com',
      }),
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /production hostname/i.test(e)));
  });

  it('rejects denylisted / unverified production project ref', () => {
    const bad = DENYLIST_PROJECT_REFS[0];
    const r = verifyStagingEnvironment(
      baseEnv({
        GC_EXPECTED_SUPABASE_PROJECT_REF: bad,
        SUPABASE_URL: `https://${bad}.supabase.co`,
        NEXT_PUBLIC_SUPABASE_URL: `https://${bad}.supabase.co`,
      }),
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /denylist/i.test(e)));
  });

  it('rejects storefront/Express project ref mismatch', () => {
    const r = verifyStagingEnvironment(
      baseEnv({
        NEXT_PUBLIC_SUPABASE_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
      }),
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /do not match/i.test(e)));
  });

  it('rejects missing anon key', () => {
    const r = verifyStagingEnvironment(
      baseEnv({
        SUPABASE_ANON_KEY: '',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      }),
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /ANON_KEY/i.test(e)));
  });

  it('rejects missing service-role key', () => {
    const r = verifyStagingEnvironment(baseEnv({ SUPABASE_SERVICE_ROLE_KEY: '' }));
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /SERVICE_ROLE/i.test(e)));
  });

  it('rejects when email is not sandboxed', () => {
    const r = verifyStagingEnvironment(
      baseEnv({
        GC_EMAIL_SANDBOX: '0',
        SMTP_HOST: 'smtp.gmail.com',
      }),
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /Email is not sandboxed/i.test(e)));
  });

  it('rejects when catalog kill switch is disabled', () => {
    const r = verifyStagingEnvironment(
      baseEnv({ GC_EMERGENCY_DISABLE_CATALOG_SUPABASE: '0' }),
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /GC_EMERGENCY_DISABLE_CATALOG_SUPABASE/i.test(e)));
  });

  it('allows explicit local isolated stack hosts', () => {
    const r = verifyStagingEnvironment(
      baseEnv({
        GC_ENVIRONMENT: 'test',
        GC_EXPECTED_DEPLOYMENT_HOST: '127.0.0.1',
        DOMAIN: 'http://127.0.0.1:3005',
        API_BASE: 'http://127.0.0.1:3004',
      }),
    );
    assert.equal(r.ok, true);
    assert.equal(r.report.local_stack, true);
  });
});
