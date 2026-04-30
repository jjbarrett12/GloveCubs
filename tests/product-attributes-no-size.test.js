/**
 * Invariant: catalogos.product_attributes must not store attribute_key = size
 * (size_code on catalog_variants is the only SoT).
 */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const MIGRATION_GLOB = '20261028110000_delete_product_attributes_size_rows.sql';

test('migration deletes all product_attributes rows for attribute_key size', () => {
  const migPath = path.join(__dirname, '..', 'supabase', 'migrations', MIGRATION_GLOB);
  const sql = fs.readFileSync(migPath, 'utf8');
  assert.match(sql, /DELETE FROM\s+catalogos\.product_attributes/i);
  assert.match(sql, /attribute_key\s*=\s*'size'/i);
});

test('catalogosProductService does not sync size into product_attributes', () => {
  const svcPath = path.join(__dirname, '..', 'services', 'catalogosProductService.js');
  const src = fs.readFileSync(svcPath, 'utf8');
  const fnStart = src.indexOf('async function syncProductAttributes');
  assert.ok(fnStart >= 0, 'syncProductAttributes not found');
  const fnEnd = src.indexOf('\nasync function ', fnStart + 1);
  const fnBody = fnEnd > fnStart ? src.slice(fnStart, fnEnd) : src.slice(fnStart, fnStart + 2000);
  assert.ok(!/\['size',\s*payload/.test(fnBody), 'must not upsert size in syncProductAttributes pairs');
  assert.match(fnBody, /deleteProductAttributeSizeRows/);
});

test('catalogosProductService setAttributes skips size key', () => {
  const svcPath = path.join(__dirname, '..', 'services', 'catalogosProductService.js');
  const src = fs.readFileSync(svcPath, 'utf8');
  const fnStart = src.indexOf('async function setAttributes');
  assert.ok(fnStart >= 0, 'setAttributes not found');
  const fnBody = src.slice(fnStart, fnStart + 600);
  assert.match(fnBody, /if \(key === 'size'\) continue/);
});
