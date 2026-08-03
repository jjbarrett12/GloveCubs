'use strict';

/**
 * Guard: product_favorites must be created before 20260422120000 alters it.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const migDir = path.join(__dirname, '..', 'supabase', 'migrations');
const read = (name) => fs.readFileSync(path.join(migDir, name), 'utf8');
const list = () => fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();

describe('product_favorites blank-project prerequisite', () => {
  const createFile = '20260422115000_create_product_favorites.sql';
  const alterFile = '20260422120000_product_favorites_catalog_uuid.sql';
  const deferredCreate = '20260630150100_product_favorites_after_users.sql';

  it('create migration sorts before first truncate/alter of product_favorites', () => {
    const files = list();
    assert.ok(files.includes(createFile));
    assert.ok(files.includes(alterFile));
    assert.ok(createFile < alterFile);
    const createSql = read(createFile);
    assert.match(createSql, /create\s+table\s+if\s+not\s+exists\s+public\.product_favorites/i);
    const alterSql = read(alterFile);
    assert.match(alterSql, /truncate\s+table\s+public\.product_favorites/i);
    assert.match(alterSql, /references\s+catalogos\.products/i);
  });

  it('canonical columns required by alter migration exist in create shape', () => {
    const sql = read(createFile);
    assert.match(sql, /\buser_id\b/);
    assert.match(sql, /\bproduct_id\b/);
    assert.match(sql, /\bcreated_at\b/);
    assert.match(sql, /unique\s*\(\s*user_id\s*,\s*product_id\s*\)/i);
  });

  it('enables RLS without authenticated USING \(true\)', () => {
    const sql = read(createFile);
    assert.match(sql, /enable\s+row\s+level\s+security/i);
    assert.match(sql, /product_favorites_select_own/);
    assert.match(sql, /product_favorites_insert_own/);
    assert.match(sql, /product_favorites_delete_own/);
    assert.doesNotMatch(sql, /for\s+all[\s\S]*using\s*\(\s*true\s*\)/i);
    assert.doesNotMatch(sql, /to\s+authenticated[\s\S]{0,80}using\s*\(\s*true\s*\)/i);
    assert.match(sql, /auth\.uid\s*\(/);
  });

  it('deferred create remains compatible IF NOT EXISTS', () => {
    const deferred = read(deferredCreate);
    assert.match(deferred, /create\s+table\s+if\s+not\s+exists\s+public\.product_favorites/i);
  });

  it('pg_trgm prerequisite remains before trigram indexes', () => {
    const files = list();
    assert.ok(files.includes('20260422102000_enable_pg_trgm.sql'));
    assert.ok(files.includes('20260422103000_storefront_search_catalogos_products.sql'));
    assert.ok('20260422102000_enable_pg_trgm.sql' < '20260422103000_storefront_search_catalogos_products.sql');
  });

  it('drops own-user policies before UUID user_id conversion and restores after', () => {
    const dropFile = '20260707115000_drop_product_favorites_rls_for_user_uuid.sql';
    const uuidFile = '20260707120000_public_users_uuid_identity.sql';
    const restoreFile = '20260707121000_restore_product_favorites_rls.sql';
    const files = list();
    assert.ok(files.includes(dropFile));
    assert.ok(files.includes(restoreFile));
    assert.ok(dropFile < uuidFile);
    assert.ok(uuidFile < restoreFile);
    assert.match(read(dropFile), /DROP POLICY IF EXISTS product_favorites_select_own/i);
    assert.match(read(restoreFile), /CREATE POLICY product_favorites_select_own/i);
    assert.match(read(restoreFile), /user_id\s*=\s*\(\s*SELECT auth\.uid\(\)\s*\)/i);
    assert.doesNotMatch(read(restoreFile), /using\s*\(\s*true\s*\)/i);
  });
});
