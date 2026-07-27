'use strict';

/**
 * Phase 1 source guards: migrations and password-reset code must encode
 * tenant helpers, supplier-cost revocation, and hashed tokens.
 * Live RLS proof requires scripts/sql/tenant-isolation-policy-tests.sql
 * against a migrated database (see docs/security/SECURITY_VALIDATION_RUNBOOK.md).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('phase1 tenant security migrations (source)', () => {
  it('defines canonical membership helpers using auth.uid()', () => {
    const sql = read('supabase/migrations/20261227120000_gc_commerce_tenant_access_helpers.sql');
    assert.match(sql, /gc_commerce\.is_company_member/);
    assert.match(sql, /gc_commerce\.has_company_role/);
    assert.match(sql, /public\.is_active_admin/);
    assert.match(sql, /auth\.uid\(\)/);
    assert.match(sql, /SET search_path/);
    assert.doesNotMatch(sql, /p_user_id/);
  });

  it('enables RLS and deny-by-default company policies', () => {
    const sql = read('supabase/migrations/20261227120100_gc_commerce_rls_tenant_isolation.sql');
    for (const t of [
      'gc_commerce.companies',
      'gc_commerce.company_members',
      'gc_commerce.ship_to_addresses',
      'gc_commerce.uploaded_invoices',
      'gc_commerce.rfqs',
      'gc_commerce.orders',
      'gc_commerce.order_lines',
      'gc_commerce.saved_lists',
    ]) {
      assert.match(sql, new RegExp(`ALTER TABLE ${t.replace('.', '\\.')} ENABLE ROW LEVEL SECURITY`));
    }
    assert.match(sql, /role <> 'owner'/);
    assert.match(sql, /gc_commerce\.is_company_member/);
  });

  it('revokes public supplier-cost SELECT policies', () => {
    const sql = read('supabase/migrations/20261227120200_revoke_public_supplier_cost_access.sql');
    assert.match(sql, /DROP POLICY IF EXISTS "public read supplier_offers"/);
    assert.match(sql, /DROP POLICY IF EXISTS "public read offer_trust_scores"/);
    assert.match(sql, /REVOKE ALL ON TABLE catalogos\.supplier_offers FROM anon/);
    assert.match(sql, /public\.is_active_admin\(\)/);
  });

  it('adds password reset token_hash and revokes client grants', () => {
    const sql = read('supabase/migrations/20261227120300_password_reset_token_hash_rls.sql');
    assert.match(sql, /token_hash/);
    assert.match(sql, /consumed_at/);
    assert.match(sql, /SET token = ''/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.password_reset_tokens FROM anon/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.password_reset_tokens FROM authenticated/);
  });

  it('hardens import jobs and unit_cost_minor grants', () => {
    const sql = read('supabase/migrations/20261227120400_phase1_grant_and_cost_hardening.sql');
    assert.match(sql, /reject_company_id_change/);
    assert.match(sql, /REVOKE SELECT \(unit_cost_minor\)/);
    assert.match(sql, /supplier_import_jobs_admin_all/);
    assert.match(sql, /REVOKE ALL ON FUNCTION catalogos\.supplier_raw_rows_missing_normalized/);
  });
});

describe('phase1 password reset application code (source)', () => {
  it('stores token_hash and never persists raw token', () => {
    const ds = read('services/dataService.js');
    assert.match(ds, /token_hash/);
    assert.match(ds, /hashPasswordResetToken/);
    assert.match(ds, /consumed_at/);
    assert.match(ds, /token: ''/);
  });

  it('consumes tokens before password update', () => {
    const server = read('server.js');
    const idxConsume = server.indexOf('consumePasswordResetToken');
    const idxUpdate = server.indexOf('updateUser(user.id, { password_hash }');
    assert.ok(idxConsume > 0 && idxUpdate > idxConsume);
    assert.match(server, /generatePasswordResetToken/);
  });
});
