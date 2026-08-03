'use strict';

/**
 * Guard: PO full-receive migrations stay CLI-safe and canonicalize to
 * admin_receive_purchase_order_full_atomic with a thin _full wrapper.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const migDir = path.join(__dirname, '..', 'supabase', 'migrations');
const createFile = '20261218120300_admin_po_receive_hardening.sql';
const grantsFile = '20261218120400_admin_po_receive_rpc_grants.sql';
const applyFile = '20261218120401_admin_po_receive_rpc_grants_apply.sql';
const canonFile = '20261218120402_admin_po_receive_canonicalize_full_atomic.sql';

const read = (name) => fs.readFileSync(path.join(migDir, name), 'utf8');

describe('admin_po_receive CLI atomic splitter + canonicalize', () => {
  it('historical create still defines _full_atomic', () => {
    assert.match(
      read(createFile),
      /CREATE OR REPLACE FUNCTION public\.admin_receive_purchase_order_full_atomic\s*\(/i
    );
  });

  it('historical grants file still targets _full_atomic', () => {
    assert.match(
      read(grantsFile),
      /GRANT EXECUTE ON FUNCTION public\.admin_receive_purchase_order_full_atomic\b/i
    );
    assert.doesNotMatch(read(grantsFile), /RENAME TO/i);
  });

  it('20401 is a single DO block (no static multi-stmt atomic GRANT list)', () => {
    const sql = read(applyFile)
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
    assert.match(sql, /^DO\s+\$body\$/i);
    assert.match(sql, /\$body\$\s*;\s*$/);
    assert.equal((sql.match(/\bDO\b/gi) || []).length, 1);
  });

  it('20402 canonicalizes to _full_atomic and wraps _full', () => {
    const sql = read(canonFile);
    assert.match(sql, /RENAME TO admin_receive_purchase_order_full_atomic/i);
    assert.match(
      sql,
      /CREATE OR REPLACE FUNCTION public\.admin_receive_purchase_order_full\s*\(/i
    );
    assert.match(
      sql,
      /SELECT public\.admin_receive_purchase_order_full_atomic\s*\(/i
    );
    assert.match(sql, /SET search_path\s*=\s*public/i);
    assert.match(sql, /GRANT EXECUTE[\s\S]*TO service_role/i);
    assert.match(sql, /REVOKE ALL[\s\S]*FROM anon,\s*authenticated/i);
  });

  it('corrective migrations sort after 20400 and before Phase 1', () => {
    assert.ok(applyFile > grantsFile);
    assert.ok(canonFile > applyFile);
    assert.ok(canonFile < '20261227120000_gc_commerce_tenant_access_helpers.sql');
  });
});
