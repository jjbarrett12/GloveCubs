#!/usr/bin/env node
/**
 * CLI preflight: PO mapping health summary (for CI / release checklist).
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and applied migration po_mapping_health_report.
 *
 * Usage: node scripts/check-po-mapping-health.js
 * Exit 1 if any issues found (override: PO_MAPPING_HEALTH_ALLOW_ISSUES=1).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { runPoMappingHealthReport } = require('../lib/poMappingHealth');

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[check-po-mapping-health] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }
  const limit = parseInt(process.env.PO_MAPPING_HEALTH_LIMIT || '50000', 10);
  const report = await runPoMappingHealthReport({ limit, summary: true });
  console.log(JSON.stringify(report, null, 2));
  const n = report.issue_row_count || 0;
  if (n > 0 && process.env.PO_MAPPING_HEALTH_ALLOW_ISSUES !== '1') {
    console.error(`[check-po-mapping-health] FAILED: ${n} issue row(s), ${report.distinct_variant_count || 0} variant(s) affected.`);
    process.exit(1);
  }
  console.error('[check-po-mapping-health] OK (no issues in scan).');
}

main().catch((e) => {
  console.error('[check-po-mapping-health]', e.message || e);
  process.exit(2);
});
