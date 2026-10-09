'use strict';

/**
 * Guard: Phase 1 RLS migration 20100 may only target tables that still exist
 * after the UUID identity cutover. gc_commerce.user_profiles was dropped in
 * 20260707120000 and must not be referenced unconditionally.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const migDir = path.join(root, 'supabase', 'migrations');
const rlsFile = '20261227120100_gc_commerce_rls_tenant_isolation.sql';
const dropFile = '20260707120000_public_users_uuid_identity.sql';
const helpersFile = '20261227120000_gc_commerce_tenant_access_helpers.sql';
const phase1Last = '20261227120500_phase1a_security_blockers.sql';

const REQUIRED = [
  {
    table: 'gc_commerce.companies',
    createHint: /CREATE TABLE\s+gc_commerce\.companies\b/i,
  },
  {
    table: 'gc_commerce.company_members',
    createHint: /CREATE TABLE\s+gc_commerce\.company_members\b/i,
  },
  {
    table: 'gc_commerce.ship_to_addresses',
    createHint: /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+gc_commerce\.ship_to_addresses\b/i,
  },
  {
    table: 'gc_commerce.uploaded_invoices',
    createHint: /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+gc_commerce\.uploaded_invoices\b/i,
  },
  {
    table: 'gc_commerce.rfqs',
    createHint: /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+gc_commerce\.rfqs\b/i,
  },
  {
    table: 'gc_commerce.orders',
    createHint: /CREATE TABLE\s+gc_commerce\.orders\b/i,
  },
  {
    table: 'gc_commerce.order_lines',
    createHint: /CREATE TABLE\s+gc_commerce\.order_lines\b/i,
  },
  {
    table: 'gc_commerce.saved_lists',
    createHint: /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+gc_commerce\.saved_lists\b/i,
  },
  {
    table: 'gc_commerce.company_quicklist_items',
    createHint: /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+gc_commerce\.company_quicklist_items\b/i,
  },
  {
    table: 'gc_commerce.customer_manufacturer_pricing',
    createHint: /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+gc_commerce\.customer_manufacturer_pricing\b/i,
  },
  {
    table: 'gc_commerce.net_terms_applications',
    createHint: /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+gc_commerce\.net_terms_applications\b/i,
  },
  {
    table: 'gc_commerce.sellable_products',
    createHint: /CREATE TABLE\s+gc_commerce\.sellable_products\b/i,
  },
  {
    table: 'catalogos.quote_requests',
    createHint: /CREATE TABLE\s+catalogos\.quote_requests\b/i,
  },
  {
    table: 'catalogos.quote_line_items',
    createHint: /CREATE TABLE\s+catalogos\.quote_line_items\b/i,
  },
];

function listMigrations() {
  return fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
}

function read(name) {
  return fs.readFileSync(path.join(migDir, name), 'utf8');
}

describe('phase1 20100 table dependency guard', () => {
  it('Phase 1 ordering remains helpers → rls → … → 1A', () => {
    const files = listMigrations();
    assert.ok(files.includes(helpersFile));
    assert.ok(files.includes(rlsFile));
    assert.ok(files.includes(phase1Last));
    assert.ok(helpersFile < rlsFile);
    assert.ok(rlsFile < '20261227120200_revoke_public_supplier_cost_access.sql');
    assert.ok(dropFile < rlsFile);
  });

  it('every required 20100 table has a baseline CREATE before Phase 1', () => {
    const files = listMigrations().filter((f) => f < rlsFile);
    for (const { table, createHint } of REQUIRED) {
      const found = files.some((f) => createHint.test(read(f)));
      assert.ok(found, `missing CREATE for ${table} before ${rlsFile}`);
    }
  });

  it('user_profiles is dropped before Phase 1 and not targeted unconditionally', () => {
    assert.match(read(dropFile), /DROP TABLE IF EXISTS gc_commerce\.user_profiles/i);
    const sql = read(rlsFile);
    assert.doesNotMatch(sql, /ALTER TABLE gc_commerce\.user_profiles\b/i);
    assert.doesNotMatch(sql, /ON gc_commerce\.user_profiles\b/i);
    assert.doesNotMatch(sql, /GRANT .+ ON TABLE gc_commerce\.user_profiles\b/i);
  });

  it('optional carts remain existence-guarded', () => {
    const sql = read(rlsFile);
    assert.match(sql, /to_regclass\(\s*'gc_commerce\.carts'\s*\)/i);
  });
});
