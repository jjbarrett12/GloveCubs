#!/usr/bin/env node
/**
 * Diagnostic script: product and brand counts from Supabase.
 * Run from repo root: node scripts/diagnose-products.mjs
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (or environment).
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function diagnose() {
  const { data: products, error } = await supabase.from('products').select('id, sku, name, brand, category, slug, image_url');
  if (error) {
    console.error('Failed to fetch products:', error.message);
    process.exit(1);
  }

  const list = Array.isArray(products) ? products : [];

  console.log('=== GloveCubs product diagnostic (Supabase) ===\n');
  console.log('Total products:', list.length);

  // Brand containing hospeco (case-insensitive)
  const hospecoLike = list.filter(
    (p) => (p.brand || '').toLowerCase().includes('hospeco')
  );
  console.log(
    "Products where brand contains 'hospeco' (case-insensitive):",
    hospecoLike.length
  );

  // Exact "Hospeco" (trimmed) - what admin filter "Hospeco" shows
  const exactHospeco = list.filter(
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
  const allBrands = [...new Set(list.map((p) => (p.brand || '').trim()).filter(Boolean))].sort();
  console.log('\nAll distinct brands in DB (count):', allBrands.length);
  console.log('Sample:', allBrands.slice(0, 20).join(', '));

  // Categories
  const categories = [...new Set(list.map((p) => (p.category || '').trim()).filter(Boolean))].sort();
  console.log('\nCategories:', categories.length);
  console.log('Sample:', categories.slice(0, 15).join(', '));

  // Missing slugs or image_url
  const missingSlug = list.filter((p) => !(p.slug || '').trim());
  const missingImage = list.filter((p) => !(p.image_url || '').trim());
  console.log('\n--- Storefront-critical fields ---');
  console.log('Products missing slug:', missingSlug.length);
  console.log('Products missing image_url:', missingImage.length);
  if (missingSlug.length > 0 && missingSlug.length <= 5) {
    console.log('  Missing slug:', missingSlug.map((p) => p.sku).join(', '));
  }

  // Verification
  console.log('\n--- Verification ---');
  console.log(
    'Admin filter "Hospeco" should show',
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
}

diagnose().catch((err) => {
  console.error('Diagnostic error:', err.message);
  process.exit(1);
});
