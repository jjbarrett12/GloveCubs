'use strict';

/**
 * Guard: leftover triggers on catalogos.products_deleted_do_not_use must be
 * cleared additively before 20260924120000 pre-DROP checks (blank history).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const migDir = path.join(__dirname, '..', 'supabase', 'migrations');
const preFile = '20260924115900_drop_products_deleted_leftover_triggers.sql';
const dropFile = '20260924120000_drop_products_deleted_v2_complete.sql';
const schemaFile = '20260311000001_catalogos_schema_full.sql';

describe('drop products_deleted_do_not_use trigger cleanup', () => {
  it('schema creates tr_products_updated_at on catalogos.products', () => {
    const sql = fs.readFileSync(path.join(migDir, schemaFile), 'utf8');
    assert.match(sql, /tr_%I_updated_at/);
    assert.match(sql, /'products'/);
  });

  it('additive pre-drop migration sorts immediately before historical drop', () => {
    const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
    assert.ok(files.includes(preFile));
    assert.ok(files.includes(dropFile));
    assert.ok(preFile < dropFile);
    const between = files.filter((f) => f > preFile && f < dropFile);
    assert.deepEqual(between, []);
  });

  it('additive sweep is constrained to dead relation OID only', () => {
    const sql = fs.readFileSync(path.join(migDir, preFile), 'utf8');
    assert.match(sql, /to_regclass\(\s*'catalogos\.products_deleted_do_not_use'\s*\)/);
    assert.match(sql, /t\.tgrelid\s*=\s*dead::oid/);
    assert.match(sql, /NOT t\.tgisinternal/);
    assert.match(
      sql,
      /DROP TRIGGER IF EXISTS %I ON catalogos\.products_deleted_do_not_use/
    );
    assert.match(
      sql,
      /DROP TRIGGER IF EXISTS tr_products_updated_at ON catalogos\.products_deleted_do_not_use/i
    );
    assert.doesNotMatch(sql, /tgrelid\s*=\s*.*catalogos\.products[^_]/);
    assert.doesNotMatch(sql, /ON\s+catalog_v2\./i);
    assert.doesNotMatch(sql, /ON\s+public\./i);
  });

  it('historical drop migration remains unmodified trigger-named baseline', () => {
    const sql = fs.readFileSync(path.join(migDir, dropFile), 'utf8');
    assert.match(
      sql,
      /DROP TRIGGER IF EXISTS trg_catalogos_products_search_tsv ON catalogos\.products_deleted_do_not_use/i
    );
    assert.doesNotMatch(
      sql,
      /DROP TRIGGER IF EXISTS tr_products_updated_at ON catalogos\.products_deleted_do_not_use/i
    );
  });
});
