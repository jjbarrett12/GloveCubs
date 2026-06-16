#!/usr/bin/env node
'use strict';

/**
 * Verify commerce packaging filter migration file exists and is non-destructive.
 * Does not connect to the database.
 *
 * Usage: node scripts/verify-commerce-packaging-migration.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260609120000_commerce_packaging_v2_filters.sql'
);

const DESTRUCTIVE = /\b(DROP|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE\s+.+\s+DROP)\b/i;

function main() {
  if (!fs.existsSync(migrationPath)) {
    console.error('MISSING migration:', migrationPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');
  const checks = [
    { label: 'units_per_case seed', ok: /units_per_case/.test(sql) },
    { label: 'cases_per_pallet seed', ok: /cases_per_pallet/.test(sql) },
    { label: 'pallet_pricing_available seed', ok: /pallet_pricing_available/.test(sql) },
    { label: 'box_quantity filter disabled', ok: /box_quantity/.test(sql) && /is_filterable\s*=\s*false/i.test(sql) },
    { label: 'pack_quantity filter disabled', ok: /pack_quantity/.test(sql) },
    { label: 'no destructive DDL', ok: !DESTRUCTIVE.test(sql) },
  ];

  console.log('=== Commerce packaging migration verification ===');
  console.log('File:', migrationPath);
  let failed = false;
  for (const c of checks) {
    console.log(`${c.ok ? 'OK' : 'FAIL'} — ${c.label}`);
    if (!c.ok) failed = true;
  }

  console.log('\nApply when ready:');
  console.log('  supabase db push --include-all --yes');
  console.log('\nMigration is idempotent (ON CONFLICT DO UPDATE); no data deletion.');

  if (failed) process.exit(1);
}

main();
