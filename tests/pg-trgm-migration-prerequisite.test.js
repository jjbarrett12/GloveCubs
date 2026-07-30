'use strict';

/**
 * Guard: pg_trgm must be enabled before first gin_trgm_ops / similarity() use.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const migDir = path.join(__dirname, '..', 'supabase', 'migrations');

function listMigrations() {
  return fs
    .readdirSync(migDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function read(name) {
  return fs.readFileSync(path.join(migDir, name), 'utf8');
}

describe('pg_trgm blank-project prerequisite', () => {
  it('enables pg_trgm before first gin_trgm_ops usage', () => {
    const files = listMigrations();
    const enableIdx = files.findIndex((f) => /pg_trgm/i.test(read(f)) && /create\s+extension/i.test(read(f)));
    assert.ok(enableIdx >= 0, 'expected a CREATE EXTENSION pg_trgm migration');
    const firstUseIdx = files.findIndex((f) => {
      const sql = read(f);
      if (/create\s+extension\s+if\s+not\s+exists\s+pg_trgm/i.test(sql)) return false;
      return /gin_trgm_ops|gist_trgm_ops/.test(sql) || /\bsimilarity\s*\(/.test(sql);
    });
    assert.ok(firstUseIdx >= 0, 'expected a gin_trgm_ops or similarity() consumer');
    assert.ok(
      enableIdx < firstUseIdx,
      `pg_trgm enable (${files[enableIdx]}) must sort before first use (${files[firstUseIdx]})`,
    );
  });

  it('prerequisite sorts immediately before storefront trigram migration', () => {
    const files = listMigrations();
    const enable = '20260422102000_enable_pg_trgm.sql';
    const consumer = '20260422103000_storefront_search_catalogos_products.sql';
    assert.ok(files.includes(enable));
    assert.ok(files.includes(consumer));
    assert.ok(enable < consumer);
    const between = files.filter((f) => f > enable && f < consumer);
    assert.deepEqual(between, []);
  });

  it('enable migration is idempotent (IF NOT EXISTS)', () => {
    const sql = read('20260422102000_enable_pg_trgm.sql');
    assert.match(sql, /create\s+extension\s+if\s+not\s+exists\s+pg_trgm/i);
  });
});
