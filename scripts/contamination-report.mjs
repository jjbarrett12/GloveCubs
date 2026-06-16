'use strict';

/**
 * Read-only contamination report — NO writes, NO deletes, NO updates.
 *
 * Usage:
 *   node scripts/contamination-report.mjs
 *   node scripts/contamination-report.mjs --json --out=contamination-report.json
 *   node scripts/contamination-report.mjs --csv --out=contamination-flagged.csv
 *   GC_CONTAMINATION_REPORT_STRICT=1 node scripts/contamination-report.mjs
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
const { classifyRecord, DEMO_EMAIL_EXACT } = require('../lib/contamination-heuristics');

const MAX_SCAN_ROWS = Math.min(
  5000,
  Math.max(100, parseInt(process.env.GC_CONTAMINATION_MAX_ROWS || '2000', 10) || 2000),
);
const SAMPLE_ROWS = Math.min(20, Math.max(3, parseInt(process.env.GC_CONTAMINATION_SAMPLE || '8', 10) || 8));

const args = process.argv.slice(2);
const wantJson = args.includes('--json');
const wantCsv = args.includes('--csv');
const outArg = args.find((a) => a.startsWith('--out='));
const outPath = outArg ? outArg.slice('--out='.length).trim() : null;

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function scanTable(supabase, def) {
  const { entityType, label, fetchRows, rowId } = def;
  const result = {
    key: def.key,
    label,
    entityType,
    scanned: 0,
    flagged: 0,
    error: null,
    severity: { critical: 0, high: 0, medium: 0, low: 0 },
    samples: [],
    skipped: false,
    skipReason: null,
  };

  let rows;
  try {
    rows = await fetchRows(supabase);
  } catch (err) {
    result.error = err.message || String(err);
    result.skipped = true;
    return result;
  }

  if (rows && rows.skipReason) {
    result.skipped = true;
    result.skipReason = rows.skipReason;
    return result;
  }

  if (rows && rows.rows && Array.isArray(rows.rows)) {
    if (rows.schemaNote) result.schemaNote = rows.schemaNote;
    rows = rows.rows;
  }

  const list = Array.isArray(rows) ? rows : [];
  result.scanned = list.length;

  const flagged = [];
  for (const row of list) {
    const classification = classifyRecord(entityType, row);
    if (!classification.flagged) continue;
    flagged.push({ id: rowId ? rowId(row) : row.id, row, classification });
    result.severity[classification.severity] = (result.severity[classification.severity] || 0) + 1;
  }

  result.flagged = flagged.length;
  result.samples = flagged.slice(0, SAMPLE_ROWS).map(({ id, row, classification }) => ({
    id,
    reasons: classification.reasons,
    confidence: classification.confidence,
    severity: classification.severity,
    recommendedAction: classification.recommendedAction,
    preview: def.preview ? def.preview(row) : undefined,
  }));

  return result;
}

async function fetchAll(supabase, buildQuery, max = MAX_SCAN_ROWS) {
  const { data, error } = await buildQuery(supabase).limit(max);
  if (error) throw new Error(error.message);
  return data || [];
}

/** Try select variants until one succeeds (schema drift resilience). */
async function fetchAllResilient(supabase, builders, max = MAX_SCAN_ROWS) {
  let lastError = null;
  for (const build of builders) {
    const { data, error } = await build(supabase).limit(max);
    if (!error) return { data: data || [], schemaNote: null };
    lastError = error;
    if (!/column|schema cache|does not exist/i.test(error.message || '')) break;
  }
  throw new Error(lastError?.message || 'fetch failed');
}

async function enrichOrdersWithCompanies(supabase, orders) {
  const companyIds = [...new Set(orders.map((o) => o.company_id).filter(Boolean))];
  let companyById = {};
  if (companyIds.length) {
    const { data: companies } = await supabase
      .schema('gc_commerce')
      .from('companies')
      .select('id, trade_name, legal_name, slug')
      .in('id', companyIds.slice(0, 500));
    companyById = Object.fromEntries((companies || []).map((c) => [c.id, c]));
  }
  return orders.map((o) => {
    const co = companyById[o.company_id];
    return {
      ...o,
      company_name: co?.trade_name || co?.legal_name || null,
      trade_name: co?.trade_name || null,
      legal_name: co?.legal_name || null,
      company_slug: co?.slug || null,
    };
  });
}

async function fetchOrdersForReport(supabase) {
  const selectVariants = [
    'id, order_number, company_id, metadata, stripe_payment_intent_id, payment_confirmed_at, payment_method, invoice_status, invoice_amount_paid, total_minor, created_at',
    'id, order_number, company_id, metadata, created_at',
  ];
  const { data, schemaNote } = await fetchAllResilient(
    supabase,
    selectVariants.map(
      (cols) => (sb) =>
        sb.schema('gc_commerce').from('orders').select(cols).order('created_at', { ascending: false }),
    ),
  );
  const enriched = await enrichOrdersWithCompanies(supabase, data);
  return schemaNote ? { rows: enriched, schemaNote } : enriched;
}

async function fetchAdminUsersForReport(supabase) {
  try {
    const rows = await fetchAllResilient(supabase, [
      (sb) => sb.from('admin_users').select('id, email, is_active, created_at').order('created_at', { ascending: false }),
      (sb) => sb.from('admin_users').select('id, is_active, created_at').order('created_at', { ascending: false }),
    ]);
    const list = rows.data || rows;
    if (!list.length) return list;
    const needsEmail = list.some((r) => r.email == null);
    if (!needsEmail) return list;
    const ids = list.map((r) => r.id).filter(Boolean);
    const { data: users } = await supabase.from('users').select('id, email').in('id', ids);
    const emailById = Object.fromEntries((users || []).map((u) => [u.id, u.email]));
    return list.map((r) => ({ ...r, email: r.email ?? emailById[r.id] ?? null }));
  } catch (e) {
    if (/admin_users|schema cache/i.test(e.message || '')) return { skipReason: `admin_users: ${e.message}` };
    throw e;
  }
}

function buildTableDefs() {
  return [
    {
      key: 'public_users',
      label: 'public.users',
      entityType: 'user',
      rowId: (r) => r.id,
      preview: (r) => ({ email: r.email, company_name: r.company_name }),
      fetchRows: (sb) =>
        fetchAll(sb, (s) => s.from('users').select('id, email, company_name, contact_name, created_at').order('created_at', { ascending: false })),
    },
    {
      key: 'admin_users',
      label: 'public.admin_users',
      entityType: 'admin_user',
      rowId: (r) => r.id,
      preview: (r) => ({ email: r.email, is_active: r.is_active }),
      fetchRows: (sb) => fetchAdminUsersForReport(sb),
    },
    {
      key: 'app_admins',
      label: 'public.app_admins',
      entityType: 'admin_user',
      rowId: (r) => r.auth_user_id || r.id,
      preview: (r) => ({ email: r.email }),
      fetchRows: async (sb) => {
        try {
          const { data } = await fetchAllResilient(sb, [
            (s) => s.from('app_admins').select('auth_user_id, email, created_at').order('created_at', { ascending: false }),
            (s) => s.from('app_admins').select('auth_user_id, created_at').order('created_at', { ascending: false }),
          ]);
          return data;
        } catch (e) {
          if (/app_admins|schema cache|column/i.test(e.message || '')) return { skipReason: `app_admins: ${e.message}` };
          throw e;
        }
      },
    },
    {
      key: 'gc_companies',
      label: 'gc_commerce.companies',
      entityType: 'company',
      rowId: (r) => r.id,
      preview: (r) => ({ trade_name: r.trade_name, slug: r.slug }),
      fetchRows: (sb) =>
        fetchAll(sb, (s) =>
          s.schema('gc_commerce').from('companies').select('id, trade_name, legal_name, slug, created_at').order('created_at', { ascending: false }),
        ),
    },
    {
      key: 'public_products',
      label: 'public.products (legacy)',
      entityType: 'product',
      rowId: (r) => r.id,
      preview: (r) => ({ sku: r.sku, slug: r.slug, image_url: r.image_url }),
      fetchRows: async (sb) => {
        try {
          return await fetchAll(sb, (s) =>
            s.from('products').select('id, sku, slug, name, image_url, created_at').order('created_at', { ascending: false }),
          );
        } catch (e) {
          if (/products|schema cache/i.test(e.message || '')) return { skipReason: 'table unavailable' };
          throw e;
        }
      },
    },
    {
      key: 'catalog_v2_products',
      label: 'catalog_v2.catalog_products',
      entityType: 'catalog_product',
      rowId: (r) => r.id,
      preview: (r) => ({ slug: r.slug, name: r.name, product_type_code: r.product_type_code }),
      fetchRows: async (sb) => {
        try {
          const products = await fetchAll(sb, (s) =>
            s
              .schema('catalog_v2')
              .from('catalog_products')
              .select('id, slug, name, status, product_type_id, created_at')
              .order('created_at', { ascending: false }),
          );
          const typeIds = [...new Set(products.map((p) => p.product_type_id).filter(Boolean))];
          let typeById = {};
          if (typeIds.length) {
            const { data: types } = await sb.schema('catalog_v2').from('catalog_product_types').select('id, code').in('id', typeIds);
            typeById = Object.fromEntries((types || []).map((t) => [t.id, t.code]));
          }
          return products.map((p) => ({ ...p, product_type_code: typeById[p.product_type_id] || null }));
        } catch (e) {
          if (/catalog_v2|schema cache/i.test(e.message || '')) return { skipReason: 'schema unavailable' };
          throw e;
        }
      },
    },
    {
      key: 'quote_requests',
      label: 'catalogos.quote_requests',
      entityType: 'quote_request',
      rowId: (r) => r.id,
      preview: (r) => ({ email: r.email, company_name: r.company_name }),
      fetchRows: (sb) =>
        fetchAll(sb, (s) =>
          s.schema('catalogos').from('quote_requests').select('id, email, company_name, contact_name, notes, created_at').order('created_at', { ascending: false }),
        ),
    },
    {
      key: 'rfqs',
      label: 'gc_commerce.rfqs',
      entityType: 'rfq',
      rowId: (r) => r.id,
      preview: (r) => {
        const p = r.payload && typeof r.payload === 'object' ? r.payload : {};
        return { email: p.email, company_name: p.company_name };
      },
      fetchRows: (sb) =>
        fetchAll(sb, (s) => s.schema('gc_commerce').from('rfqs').select('id, payload, created_at').order('created_at', { ascending: false })),
    },
    {
      key: 'orders',
      label: 'gc_commerce.orders',
      entityType: 'order',
      rowId: (r) => r.id,
      preview: (r) => ({ order_number: r.order_number, company_id: r.company_id }),
      fetchRows: (sb) => fetchOrdersForReport(sb),
    },
    {
      key: 'stock_history',
      label: 'public.stock_history',
      entityType: 'inventory_adjustment',
      rowId: (r) => r.id,
      preview: (r) => ({ notes: r.notes, delta: r.delta, type: r.type }),
      fetchRows: async (sb) => {
        try {
          return await fetchAll(sb, (s) => s.from('stock_history').select('id, notes, delta, type, created_at').order('created_at', { ascending: false }));
        } catch (e) {
          if (/stock_history|schema cache/i.test(e.message || '')) return { skipReason: 'table unavailable' };
          throw e;
        }
      },
    },
    {
      key: 'purchase_orders',
      label: 'public.purchase_orders',
      entityType: 'purchase_order',
      rowId: (r) => r.id,
      preview: (r) => ({ po_number: r.po_number, notes: r.notes }),
      fetchRows: async (sb) => {
        try {
          return await fetchAll(sb, (s) => s.from('purchase_orders').select('id, po_number, notes, created_at').order('created_at', { ascending: false }));
        } catch (e) {
          if (/purchase_orders|schema cache/i.test(e.message || '')) return { skipReason: 'table unavailable' };
          throw e;
        }
      },
    },
    {
      key: 'suppliers',
      label: 'catalogos.suppliers',
      entityType: 'supplier',
      rowId: (r) => r.id,
      preview: (r) => ({ slug: r.slug, name: r.name }),
      fetchRows: async (sb) => {
        try {
          return await fetchAll(sb, (s) =>
            s.schema('catalogos').from('suppliers').select('id, slug, name, is_active, created_at').order('created_at', { ascending: false }),
          );
        } catch (e) {
          if (/suppliers|schema cache/i.test(e.message || '')) return { skipReason: 'table unavailable' };
          throw e;
        }
      },
    },
    {
      key: 'contact_messages',
      label: 'public.contact_messages',
      entityType: 'contact_message',
      rowId: (r) => r.id,
      preview: (r) => {
        const p = r.payload && typeof r.payload === 'object' ? r.payload : {};
        return { email: p.email, company: p.company, name: p.name };
      },
      fetchRows: (sb) =>
        fetchAll(sb, (s) => s.from('contact_messages').select('id, payload, created_at').order('created_at', { ascending: false })),
    },
    {
      key: 'recommendation_outcomes',
      label: 'catalogos.recommendation_outcomes',
      entityType: 'recommendation_outcome',
      rowId: (r) => r.id,
      preview: (r) => ({ recommendation_id: r.recommendation_id, outcome: r.outcome }),
      fetchRows: async (sb) => {
        try {
          return await fetchAll(sb, (s) =>
            s
              .schema('catalogos')
              .from('recommendation_outcomes')
              .select('id, recommendation_id, outcome, created_at')
              .order('created_at', { ascending: false }),
          );
        } catch (e) {
          if (/recommendation_outcomes|schema cache/i.test(e.message || '')) return { skipReason: 'table unavailable' };
          throw e;
        }
      },
    },
  ];
}

function assertReadOnlyScript() {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const lines = src.split('\n').filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
  const body = lines.join('\n');
  const forbidden = [/\.insert\s*\(/, /\.update\s*\(/, /\.delete\s*\(/, /\.upsert\s*\(/, /\bTRUNCATE\b/i, /\bDELETE FROM\b/i];
  for (const re of forbidden) {
    if (re.test(body)) {
      throw new Error(`contamination-report.mjs failed read-only self-check: matched ${re}`);
    }
  }
}

function toCsv(report) {
  const lines = ['table,entity_type,row_id,confidence,severity,recommended_action,reasons,preview_json'];
  for (const t of report.tables) {
    for (const s of t.samples) {
      const reasons = (s.reasons || []).join(' | ').replace(/"/g, '""');
      const preview = JSON.stringify(s.preview || {}).replace(/"/g, '""');
      lines.push(
        `"${t.label}","${t.entityType}","${s.id ?? ''}","${s.confidence}","${s.severity}","${s.recommendedAction}","${reasons}","${preview}"`,
      );
    }
  }
  return lines.join('\n');
}

async function main() {
  assertReadOnlyScript();

  if (!isSupabaseAdminConfigured()) {
    console.error('contamination-report: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(2);
  }

  const supabase = getSupabaseAdmin();
  const startedAt = new Date().toISOString();
  const tables = [];
  let totalFlagged = 0;
  let totalScanned = 0;

  section('GloveCubs contamination report (read-only)');
  console.log(`Started: ${startedAt}`);
  console.log(`Max rows scanned per table: ${MAX_SCAN_ROWS}`);
  console.log(`Known demo email (always flag): ${DEMO_EMAIL_EXACT}`);

  for (const def of buildTableDefs()) {
    const r = await scanTable(supabase, def);
    tables.push(r);
    if (!r.skipped && !r.error) {
      totalScanned += r.scanned;
      totalFlagged += r.flagged;
    }
  }

  section('Summary by table');
  let skippedCount = 0;
  for (const t of tables) {
    if (t.skipped) {
      skippedCount += 1;
      console.log(`[SKIP] ${t.label}: ${t.skipReason || t.error || 'skipped'}`);
      continue;
    }
    if (t.error) {
      console.log(`[ERROR] ${t.label}: ${t.error}`);
      continue;
    }
    const sev = t.severity;
    const schemaNote = t.schemaNote ? ` (schema: ${t.schemaNote})` : '';
    console.log(
      `${t.label}: flagged ${t.flagged} / scanned ${t.scanned} (critical:${sev.critical || 0} high:${sev.high || 0} medium:${sev.medium || 0} low:${sev.low || 0})${schemaNote}`,
    );
    for (const s of t.samples) {
      console.log(`  • id=${s.id} [${s.confidence}/${s.severity}] ${s.reasons.join('; ')}`);
    }
    if (t.flagged > t.samples.length) {
      console.log(`  … and ${t.flagged - t.samples.length} more flagged row(s) not shown`);
    }
  }

  section('Totals');
  console.log(`Tables scanned: ${tables.filter((t) => !t.skipped && !t.error).length}`);
  console.log(`Tables skipped: ${skippedCount}`);
  console.log(`Rows scanned: ${totalScanned}`);
  console.log(`Rows flagged (heuristic): ${totalFlagged}`);
  if (skippedCount > 0) {
    console.log('\nWARNING: skipped sections may hide contamination — resolve schema gaps before cleanup.');
  }
  console.log('\nThis report does NOT modify data. Review samples before any cleanup.');

  const report = {
    meta: {
      readOnly: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      maxScanRows: MAX_SCAN_ROWS,
      sampleRows: SAMPLE_ROWS,
      tablesSkipped: skippedCount,
    },
    totals: { tables: tables.length, scanned: totalScanned, flagged: totalFlagged },
    tables,
  };

  if (wantJson) {
    const json = JSON.stringify(report, null, 2);
    if (outPath) fs.writeFileSync(outPath, json, 'utf8');
    else console.log('\n' + json);
  }

  if (wantCsv) {
    const csv = toCsv(report);
    if (outPath) fs.writeFileSync(outPath, csv, 'utf8');
    else console.log('\n' + csv);
  }

  const strict = ['1', 'true', 'yes'].includes(String(process.env.GC_CONTAMINATION_REPORT_STRICT || '').trim().toLowerCase());
  if (strict && totalFlagged > 0) {
    console.error('\ncontamination-report: strict mode — flagged rows present');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('contamination-report:', err.message || err);
  process.exit(1);
});
