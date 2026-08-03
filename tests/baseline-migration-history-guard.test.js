'use strict';

/**
 * Guard: shipped baseline migrations must keep committed bytes; Phase 1 must
 * remain under supabase/migrations (not a hold directory); corrective PO/trigger
 * migrations must sort before Phase 1.
 *
 * Update procedure: after an intentional history rewrite is approved, refresh
 * PROTECTED_BLOBS by running:
 *   git rev-parse HEAD:supabase/migrations/<file>
 * and updating the expected hash in this file in the same commit.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const migDir = path.join(root, 'supabase', 'migrations');
const holdDir = path.join(root, 'supabase', 'migrations_phase1_hold');

/** @type {Record<string, string>} filename → git blob id at protective pin */
const PROTECTED_BLOBS = {
  '20260422115000_create_product_favorites.sql':
    '75dc38e4ebcb764aaa30edf3788f1c0ad17f4287',
  '20260924120000_drop_products_deleted_v2_complete.sql':
    'b6f1035e42ef12246d84d3a2ec0d7f19d2dfe9bc',
  '20261218120300_admin_po_receive_hardening.sql':
    '462e49118b6ff2f3f9fb32bb927c0eda7c8fe9dd',
  '20261218120400_admin_po_receive_rpc_grants.sql':
    '8f2793cf85e0d5af028d546722b47b00ca0cf480',
};

const PHASE1_FILES = [
  '20261227120000_gc_commerce_tenant_access_helpers.sql',
  '20261227120100_gc_commerce_rls_tenant_isolation.sql',
  '20261227120200_revoke_public_supplier_cost_access.sql',
  '20261227120300_password_reset_token_hash_rls.sql',
  '20261227120400_phase1_grant_and_cost_hardening.sql',
  '20261227120500_phase1a_security_blockers.sql',
];

function gitHashObject(filePath) {
  return execFileSync('git', ['hash-object', filePath], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

describe('baseline migration history integrity', () => {
  it('protected historical migrations match pinned blob hashes', () => {
    for (const [name, expected] of Object.entries(PROTECTED_BLOBS)) {
      const full = path.join(migDir, name);
      assert.ok(fs.existsSync(full), `missing ${name}`);
      const actual = gitHashObject(full);
      assert.equal(
        actual,
        expected,
        `${name} drifted (update PROTECTED_BLOBS only with intentional history rewrite)`
      );
    }
  });

  it('Phase 1 migrations exist under supabase/migrations', () => {
    for (const name of PHASE1_FILES) {
      assert.ok(
        fs.existsSync(path.join(migDir, name)),
        `Phase 1 missing from migrations/: ${name}`
      );
    }
  });

  it('migrations_phase1_hold is not present', () => {
    assert.equal(
      fs.existsSync(holdDir),
      false,
      'migrations_phase1_hold must not exist in the final tree'
    );
  });

  it('no duplicate migration version prefixes', () => {
    const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql'));
    const versions = files.map((f) => f.slice(0, 14));
    const seen = new Map();
    for (const v of versions) {
      seen.set(v, (seen.get(v) || 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1);
    assert.deepEqual(dupes, [], `duplicate versions: ${JSON.stringify(dupes)}`);
  });

  it('pre-Phase1 corrective migrations sort before Phase 1', () => {
    const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
    const phase1First = '20261227120000_gc_commerce_tenant_access_helpers.sql';
    for (const name of [
      '20260924115900_drop_products_deleted_leftover_triggers.sql',
      '20261218120401_admin_po_receive_rpc_grants_apply.sql',
      '20261218120402_admin_po_receive_canonicalize_full_atomic.sql',
      '20260506110000_create_sales_prospects.sql',
      '20260707115000_drop_product_favorites_rls_for_user_uuid.sql',
      '20260707121000_restore_product_favorites_rls.sql',
    ]) {
      assert.ok(files.includes(name), `missing ${name}`);
      assert.ok(name < phase1First, `${name} must sort before Phase 1`);
    }
  });
});
