#!/usr/bin/env node
/**
 * Optional: set companies with severely overdue open AR to net_terms_status on_hold.
 *
 * Requires: AR_AUTO_ON_HOLD_DAYS_PAST_DUE (integer, days past due on any open invoice).
 * Set AR_AUTO_ON_HOLD_DRY_RUN=1 to log only.
 *
 * Usage: node scripts/ar-aging-auto-hold.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { getSupabaseAdmin, isSupabaseAdminConfigured } = require('../lib/supabaseAdmin');
const { aggregateCompanyArAging } = require('../lib/arAging');
const { fetchAllOpenArOrderRows } = require('../services/arAgingService');
const netTermsService = require('../services/netTermsService');

function getThresholdDays() {
  const raw = process.env.AR_AUTO_ON_HOLD_DAYS_PAST_DUE;
  if (raw == null || String(raw).trim() === '') return null;
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

async function main() {
  if (!isSupabaseAdminConfigured()) {
    console.error('[ar-aging-auto-hold] Supabase admin not configured.');
    process.exit(1);
  }
  const threshold = getThresholdDays();
  if (threshold == null) {
    console.log('[ar-aging-auto-hold] Skip: set AR_AUTO_ON_HOLD_DAYS_PAST_DUE (e.g. 60) to enable.');
    process.exit(0);
  }

  const dryRun =
    process.env.AR_AUTO_ON_HOLD_DRY_RUN === '1' ||
    String(process.env.AR_AUTO_ON_HOLD_DRY_RUN || '').toLowerCase() === 'true';

  const rows = await fetchAllOpenArOrderRows();
  const byCompany = new Map();
  for (const r of rows) {
    const cid = r.company_id;
    if (cid == null) continue;
    if (!byCompany.has(cid)) byCompany.set(cid, []);
    byCompany.get(cid).push(r);
  }

  const asOf = new Date();
  const candidates = [];
  for (const [companyId, list] of byCompany) {
    const aging = aggregateCompanyArAging(list, asOf);
    if (aging.open_invoice_count === 0) continue;
    if (aging.max_days_past_due >= threshold) {
      candidates.push({ companyId, max_days_past_due: aging.max_days_past_due, aging });
    }
  }

  if (candidates.length === 0) {
    console.log('[ar-aging-auto-hold] No companies over threshold', threshold, 'days past due.');
    process.exit(0);
  }

  const sb = getSupabaseAdmin();
  const { data: companies, error: coErr } = await sb
    .from('companies')
    .select('id, name, net_terms_status')
    .in(
      'id',
      candidates.map((c) => c.companyId)
    );
  if (coErr) throw coErr;
  const coMap = new Map((companies || []).map((c) => [c.id, c]));

  let updated = 0;
  for (const { companyId, max_days_past_due } of candidates) {
    const co = coMap.get(companyId);
    const st = co ? String(co.net_terms_status || '').toLowerCase() : '';
    if (st !== 'approved') continue;

    const label = co ? `${co.name} (#${companyId})` : `#${companyId}`;
    if (dryRun) {
      console.log('[dry-run] would on_hold:', label, 'max_days_past_due=', max_days_past_due);
      continue;
    }
    await netTermsService.updateCompanyCommercial(companyId, { net_terms_status: 'on_hold' });
    console.log('[ar-aging-auto-hold] set on_hold:', label, 'max_days_past_due=', max_days_past_due);
    updated += 1;
  }

  console.log('[ar-aging-auto-hold] done. updated=', updated, 'dry_run=', dryRun);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
