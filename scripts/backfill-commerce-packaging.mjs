#!/usr/bin/env node
'use strict';

/**
 * Safe backfill: metadata.commerce_packaging from legacy product metadata.
 *
 * Usage:
 *   npx tsx scripts/backfill-commerce-packaging.mjs              # dry-run (default)
 *   npx tsx scripts/backfill-commerce-packaging.mjs --apply
 *   npx tsx scripts/backfill-commerce-packaging.mjs --apply --limit 10
 *   npx tsx scripts/backfill-commerce-packaging.mjs --product-id UUID
 *   npx tsx scripts/backfill-commerce-packaging.mjs --apply --force --product-id UUID
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { getSupabaseAdmin, isSupabaseAdminConfigured } = require('../lib/supabaseAdmin');

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const force = argv.includes('--force');
  let limit = null;
  let productId = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--limit=')) {
      limit = parseInt(a.split('=')[1], 10);
    } else if (a === '--limit' && argv[i + 1]) {
      limit = parseInt(argv[++i], 10);
    } else if (a.startsWith('--product-id=')) {
      productId = a.split('=')[1].trim();
    } else if (a === '--product-id' && argv[i + 1]) {
      productId = argv[++i].trim();
    }
  }
  return { apply, force, limit: Number.isFinite(limit) && limit > 0 ? limit : null, productId };
}

async function loadBackfill() {
  return import('../lib/commerce-packaging/product-backfill.ts');
}

async function main() {
  const { apply, force, limit, productId } = parseArgs(process.argv.slice(2));

  let backfill;
  try {
    backfill = await loadBackfill();
  } catch (e) {
    console.error('Run with: npx tsx scripts/backfill-commerce-packaging.mjs');
    console.error(e?.message ?? e);
    process.exit(1);
  }

  if (!isSupabaseAdminConfigured()) {
    console.error('Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .schema('catalog_v2')
    .from('catalog_products')
    .select('id, internal_sku, name, metadata')
    .order('updated_at', { ascending: false });

  if (productId) {
    query = query.eq('id', productId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  let candidates = (data ?? []).map((row) => ({
    row,
    plan: backfill.inferProductBackfillPlan(
      {
        id: row.id,
        internal_sku: row.internal_sku,
        name: row.name,
        metadata: row.metadata,
      },
      { force }
    ),
  }));

  candidates = candidates.filter((c) => c.plan.recommendedAction === 'safe_backfill' && c.plan.commercePackaging);

  if (limit != null) {
    candidates = candidates.slice(0, limit);
  }

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}${force ? ' (force)' : ''}`);
  console.log(`Candidates: ${candidates.length}`);

  let wouldWrite = 0;
  let skipped = 0;
  let errors = 0;

  for (const { row, plan } of candidates) {
    if (plan.recommendedAction === 'skip_has_commerce' && !force) {
      console.log(`SKIP has commerce ${row.id}`);
      skipped++;
      continue;
    }

    if (plan.recommendedAction !== 'safe_backfill' || !plan.commercePackaging) {
      console.log(`SKIP ${plan.recommendedAction} ${row.id} ${row.internal_sku ?? ''} — ${plan.reason}`);
      skipped++;
      continue;
    }

    const meta = (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata))
      ? { ...row.metadata }
      : {};
    const nextMeta = backfill.mergeMetadataForBackfill(meta, plan.commercePackaging);

    console.log(
      `${apply ? 'WRITE' : 'DRY-RUN'} ${row.id} ${row.internal_sku ?? ''} — ${plan.reason} → units_per_case=${plan.inferredUnitsPerCase}`
    );

    if (!apply) {
      wouldWrite++;
      continue;
    }

    const { error: updErr } = await supabase
      .schema('catalog_v2')
      .from('catalog_products')
      .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
      .eq('id', row.id);

    if (updErr) {
      console.error(`  ERROR ${row.id}: ${updErr.message}`);
      errors++;
    } else {
      wouldWrite++;
    }
  }

  console.log(`\nSummary: ${wouldWrite} ${apply ? 'written' : 'would write'}, ${skipped} skipped, ${errors} errors`);
  if (!apply) {
    console.log('No changes written (dry-run). Pass --apply to persist.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
