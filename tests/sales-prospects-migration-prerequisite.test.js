'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const migDir = path.join(__dirname, '..', 'supabase', 'migrations');
const read = (name) => fs.readFileSync(path.join(migDir, name), 'utf8');
const list = () => fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();

describe('sales_prospects blank-project prerequisite', () => {
  const createFile = '20260506110000_create_sales_prospects.sql';
  const consumer = '20260506120000_procurement_opportunities_spine.sql';
  const deferred = '20260704120000_growth_pipeline_prospects.sql';

  it('create sorts before procurement FK to sales_prospects', () => {
    const files = list();
    assert.ok(files.includes(createFile));
    assert.ok(files.includes(consumer));
    assert.ok(createFile < consumer);
    assert.match(read(createFile), /create\s+table\s+if\s+not\s+exists\s+public\.sales_prospects/i);
    assert.match(read(consumer), /references\s+public\.sales_prospects/i);
  });

  it('canonical columns match deferred growth migration', () => {
    const sql = read(createFile);
    for (const col of [
      'company_name',
      'contact_name',
      'email',
      'phone',
      'source',
      'status',
      'notes',
      'converted_company_id',
      'created_by_admin_user_id',
      'last_contacted_at',
    ]) {
      assert.match(sql, new RegExp(`\\b${col}\\b`));
    }
    assert.match(sql, /sales_prospects_status_check/);
  });

  it('enables RLS without authenticated USING \\(true\\)', () => {
    const sql = read(createFile);
    assert.match(sql, /enable\s+row\s+level\s+security/i);
    assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i);
  });

  it('deferred create remains IF NOT EXISTS', () => {
    assert.match(read(deferred), /create\s+table\s+if\s+not\s+exists\s+public\.sales_prospects/i);
  });

  it('favorites and pg_trgm prerequisites remain ordered', () => {
    const files = list();
    assert.ok(files.includes('20260422102000_enable_pg_trgm.sql'));
    assert.ok(files.includes('20260422115000_create_product_favorites.sql'));
    assert.ok('20260422102000_enable_pg_trgm.sql' < '20260422103000_storefront_search_catalogos_products.sql');
    assert.ok('20260422115000_create_product_favorites.sql' < '20260422120000_product_favorites_catalog_uuid.sql');
  });
});
