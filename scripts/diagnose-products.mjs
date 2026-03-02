#!/usr/bin/env node
/**
 * Diagnostic script: product and brand counts for CSV import verification.
 * Run from repo root: node scripts/diagnose-products.mjs [path-to-database.json]
 * Default path: ./database.json
 */

import fs from 'fs';
import path from 'path';

const defaultPath = path.join(process.cwd(), 'database.json');
const dbPath = process.argv[2] || defaultPath;

if (!fs.existsSync(dbPath)) {
  console.error('Database not found:', dbPath);
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const products = Array.isArray(db.products) ? db.products : [];

console.log('=== GloveCubs product diagnostic ===\n');
console.log('DB path:', dbPath);
console.log('Total products:', products.length);

// Brand containing hospeco (case-insensitive)
const hospecoLike = products.filter(
  (p) => (p.brand || '').toLowerCase().includes('hospeco')
);
console.log(
  "Products where brand contains 'hospeco' (case-insensitive):",
  hospecoLike.length
);

// Exact "Hospeco" (trimmed) - what admin filter "Hospeco" shows
const exactHospeco = products.filter(
  (p) => (p.brand || '').trim() === 'Hospeco'
);
console.log(
  "Products where brand (trimmed) === 'Hospeco' (admin filter):",
  exactHospeco.length
);

// Distinct brand values that contain hospeco
const distinctBrandsHospeco = [
  ...new Set(
    hospecoLike
      .map((p) => (p.brand || '').trim())
      .filter(Boolean)
  ),
].sort();
console.log(
  '\nDistinct brand values containing "hospeco":',
  distinctBrandsHospeco
);

// Count by each such brand
const byBrand = {};
hospecoLike.forEach((p) => {
  const b = (p.brand || '').trim();
  byBrand[b] = (byBrand[b] || 0) + 1;
});
console.log('\nCount by brand (hospeco-like):');
Object.entries(byBrand)
  .sort((a, b) => b[1] - a[1])
  .forEach(([brand, count]) => console.log(`  "${brand}": ${count}`));

// All distinct brands in DB (sample for context)
const allBrands = [...new Set(products.map((p) => (p.brand || '').trim()).filter(Boolean))].sort();
console.log('\nAll distinct brands in DB (count):', allBrands.length);
console.log('Sample:', allBrands.slice(0, 20).join(', '));

// Assertion: ILIKE count should match admin when filter is "Hospeco" after fix
console.log('\n--- Verification ---');
console.log(
  'After fix: Admin filter "Hospeco" should show',
  hospecoLike.length,
  'product(s) (case-insensitive).'
);
if (exactHospeco.length !== hospecoLike.length) {
  console.log(
    'MISMATCH: Exact "Hospeco" =',
    exactHospeco.length,
    '; case-insensitive =',
    hospecoLike.length,
    '→ fix admin filter to use case-insensitive match.'
  );
} else {
  console.log('OK: All hospeco-like products use exact brand "Hospeco".');
}
