#!/usr/bin/env node
'use strict';

/**
 * Read-only audit: catalog_v2.catalog_products commerce_packaging coverage.
 *
 * Usage:
 *   npx tsx scripts/audit-commerce-packaging-coverage.mjs
 *   npx tsx scripts/audit-commerce-packaging-coverage.mjs --csv
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { getSupabaseAdmin, isSupabaseAdminConfigured } = require('../lib/supabaseAdmin');

async function loadBackfill() {
  return import('../lib/commerce-packaging/product-backfill.ts');
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  let backfill;
  try {
    backfill = await loadBackfill();
  } catch (e) {
    console.error('Run with: npx tsx scripts/audit-commerce-packaging-coverage.mjs');
    console.error(e?.message ?? e);
    process.exit(1);
  }

  if (!isSupabaseAdminConfigured()) {
    console.error('Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const wantCsv = process.argv.includes('--csv');
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .schema('catalog_v2')
    .from('catalog_products')
    .select('id, internal_sku, name, status, metadata')
    .order('name');

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  const rows = data ?? [];
  const plans = rows.map((row) =>
    backfill.inferProductBackfillPlan({
      id: row.id,
      internal_sku: row.internal_sku,
      name: row.name,
      metadata: row.metadata,
    })
  );

  const summary = backfill.summarizeBackfillPlans(plans);

  console.log('\n=== Commerce packaging coverage (read-only) ===');
  console.log(`Total catalog products scanned: ${summary.total}`);
  console.log(`With metadata.commerce_packaging: ${summary.withCommercePackaging}`);
  console.log(`Missing metadata.commerce_packaging: ${summary.missingCommercePackaging}`);
  console.log(`With legacy metadata.units_per_case: ${summary.withLegacyUnitsPerCase}`);
  console.log(`With legacy metadata.case_pack: ${summary.withLegacyCasePack}`);
  console.log(`With metadata.packaging_summary: ${summary.withPackagingSummary}`);
  console.log(`Safe to backfill: ${summary.safeBackfill}`);
  console.log(`Manual review needed: ${summary.manualReview}`);
  console.log(`Skipped (already has commerce_packaging): ${summary.skipHasCommerce}`);

  if (wantCsv) {
    const outDir = path.join(__dirname, '..', 'tmp');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'commerce-packaging-coverage.csv');
    const header = [
      'product_id',
      'internal_sku',
      'name',
      'category_slug',
      'has_commerce_packaging',
      'legacy_units_per_case',
      'legacy_case_pack',
      'inferred_units_per_case',
      'inferred_inner_unit_type',
      'inferred_units_per_inner',
      'inferred_inners_per_case',
      'recommended_action',
      'reason',
    ].join(',');
    const lines = plans.map((p) =>
      [
        p.productId,
        p.internalSku,
        p.name,
        p.categorySlug,
        p.hasCommercePackaging,
        p.legacyUnitsPerCase,
        p.legacyCasePack,
        p.inferredUnitsPerCase,
        p.inferredInnerUnitType,
        p.inferredUnitsPerInner,
        p.inferredInnersPerCase,
        p.recommendedAction,
        p.reason,
      ]
        .map(csvEscape)
        .join(',')
    );
    fs.writeFileSync(outFile, [header, ...lines].join('\n'), 'utf8');
    console.log(`\nWrote ${outFile}`);
  }

  console.log('\nDone (no writes).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
