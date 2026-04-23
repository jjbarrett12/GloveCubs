#!/usr/bin/env node
/**
 * Staging smoke helper: DB reconciliation (Supabase) + optional API checks.
 * V2 catalog truth is catalogos.products (UUID); no live_product_id / public.products / canonical_products gates.
 *
 * Usage:
 *   node scripts/smoke-staging.mjs --reconcile-only
 *   node scripts/smoke-staging.mjs --api
 *   node scripts/smoke-staging.mjs --all
 *
 * Env (.env in repo root):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   API_BASE (default http://127.0.0.1:3004)
 *   SMOKE_USER_EMAIL, SMOKE_USER_PASSWORD  — buyer (for --api)
 *   SMOKE_ADMIN_JWT — optional; if unset, tries same login token for admin endpoints
 *
 * Exit code: 0 if no critical reconciliation failures; 1 otherwise.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:3004').replace(/\/$/, '');
const args = process.argv.slice(2);
const reconcileOnly = args.includes('--reconcile-only');
const apiMode = args.includes('--api');
const allMode = args.includes('--all');

if (!reconcileOnly && !apiMode && !allMode) {
  console.error('Usage: node scripts/smoke-staging.mjs --reconcile-only | --api | --all');
  process.exit(2);
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

let critical = 0;
let warnings = 0;

function failCritical(msg, count) {
  console.log(`[BLOCKER] ${msg}: ${count}`);
  if (count > 0) critical += 1;
}

function warn(msg, count) {
  console.log(`[WARN] ${msg}: ${count}`);
  if (count > 0) warnings += 1;
}

async function reconcile() {
  section('Supabase reconciliation');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { count: holdCount, error: e1 } = await supabase
    .schema('gc_commerce')
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('payment_integrity_hold', true);
  if (e1) console.error('hold query:', e1.message);
  else failCritical('orders with payment_integrity_hold', holdCount ?? 0);

  const { count: shipNoDeduct, error: e2 } = await supabase
    .schema('gc_commerce')
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'shipped')
    .is('inventory_deducted_at', null);
  if (e2) console.error('shipped/deduct query:', e2.message);
  else failCritical('shipped orders without inventory_deducted_at', shipNoDeduct ?? 0);

  const { count: cancReserved, error: e3 } = await supabase
    .schema('gc_commerce')
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'cancelled')
    .not('inventory_reserved_at', 'is', null)
    .is('inventory_released_at', null)
    .is('inventory_deducted_at', null);
  if (e3) console.error('cancelled/reserved query:', e3.message);
  else failCritical('cancelled orders still holding reservation', cancReserved ?? 0);

  // V2: public.inventory is keyed by canonical_product_id (UUID); product_id was dropped (structural_final_cleanup).
  // Columns for reserve/release/deduct: quantity_on_hand, quantity_reserved (see lib/inventory.js).
  const INVENTORY_RESERVED_MIGRATION =
    'supabase/migrations/20260330000005_inventory_stock_reserved_history.sql';
  const { data: invRows, error: e4 } = await supabase
    .from('inventory')
    .select('canonical_product_id, quantity_on_hand, quantity_reserved');
  if (e4) {
    const em = String(e4.message || '');
    const el = em.toLowerCase();
    const missingReserved =
      el.includes('quantity_reserved') &&
      (el.includes('does not exist') || el.includes('column') || el.includes('schema cache'));
    const missingCanon =
      el.includes('canonical_product_id') &&
      (el.includes('does not exist') || el.includes('column') || el.includes('schema cache'));
    if (missingReserved) {
      console.error('[SCHEMA BLOCKER] public.inventory is missing column quantity_reserved.');
      console.error('  Runtime code (lib/inventory.js, server.js admin routes, reserve RPCs) requires it.');
      console.error(`  DB drift: apply migration file ${INVENTORY_RESERVED_MIGRATION}`);
      console.error('  SQL check: select column_name from information_schema.columns');
      console.error("    where table_schema = 'public' and table_name = 'inventory' and column_name = 'quantity_reserved';");
      failCritical('inventory verification blocked (schema drift: no quantity_reserved)', 1);
    } else if (missingCanon) {
      console.error('[SCHEMA BLOCKER] public.inventory is missing canonical_product_id (V2 catalog UUID key).');
      console.error('  Expected after: supabase/migrations/20260730100000_structural_final_cleanup.sql');
      failCritical('inventory verification blocked (schema drift: no canonical_product_id)', 1);
    } else {
      console.error('[BLOCKER] inventory read failed (cannot verify reserved vs on_hand):', em);
      failCritical('inventory read error', 1);
    }
  } else {
    let bad = 0;
    for (const r of invRows || []) {
      const on = Number(r.quantity_on_hand ?? 0);
      const res = Number(r.quantity_reserved ?? 0);
      if (res > on || on < 0 || res < 0) bad++;
    }
    failCritical('inventory rows with invalid reserved/on_hand', bad);
  }

  const { count: nullCanonItems, error: e5 } = await supabase
    .from('order_items')
    .select('*', { count: 'exact', head: true })
    .is('canonical_product_id', null);
  if (e5) console.error('order_items null canonical:', e5.message);
  else warn('order_items rows with NULL canonical_product_id (historical rows OK)', nullCanonItems ?? 0);

  section('catalogos.products (V2 single-brain catalog)');
  try {
    const cos = () => supabase.schema('catalogos');

    const { count: pubInactive, error: ePub } = await cos()
      .from('products')
      .select('*', { count: 'exact', head: true })
      .not('published_at', 'is', null)
      .eq('is_active', false);
    if (ePub) {
      console.log('[SKIP] catalogos.products published/inactive query:', ePub.message);
    } else {
      failCritical(
        'published catalogos.products rows that are inactive (should not publish a dead row)',
        pubInactive ?? 0
      );
    }

    const { count: activeNullSkuOrName, error: eNullId } = await cos()
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .or('sku.is.null,name.is.null');
    const { count: activeEmptySku, error: eEmptySku } = await cos()
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('sku', '');
    const { count: activeEmptyName, error: eEmptyName } = await cos()
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('name', '');
    if (eNullId || eEmptySku || eEmptyName) {
      console.log('[SKIP] catalogos.products identity query:', eNullId?.message || eEmptySku?.message || eEmptyName?.message);
    } else {
      const badIdentity =
        (activeNullSkuOrName ?? 0) + (activeEmptySku ?? 0) + (activeEmptyName ?? 0);
      failCritical(
        'active catalogos.products rows with missing sku or name (null or empty string)',
        badIdentity
      );
    }

    const { count: activeNoCategory, error: eCat } = await cos()
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .is('category_id', null);
    if (eCat) {
      console.log('[SKIP] catalogos.products category query:', eCat.message);
    } else {
      warn(
        'active catalogos.products rows with NULL category_id (browse/search may be degraded)',
        activeNoCategory ?? 0
      );
    }

    const { count: activeCatalog, error: eAct } = await cos()
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);
    if (eAct) {
      console.log('[SKIP] catalogos.products active count:', eAct.message);
    } else if ((activeCatalog ?? 0) === 0) {
      warn('catalogos has zero active products (empty sellable catalog)', 1);
    }
  } catch (err) {
    console.log('[SKIP] catalogos schema not available via client:', err.message);
  }

  try {
    const { count: syncFailed, error: se } = await supabase
      .schema('catalogos')
      .from('supplier_products_normalized')
      .select('*', { count: 'exact', head: true })
      .eq('search_publish_status', 'sync_failed');
    if (se) {
      console.log('[SKIP] search_publish_status query:', se.message);
    } else {
      warn(
        'supplier_products_normalized rows with search_publish_status=sync_failed (ingest/publish pipeline; not a canonical_products check)',
        syncFailed ?? 0
      );
    }
  } catch (err) {
    console.log('[SKIP] catalogos normalized query:', err.message);
  }

  console.log(`\nSummary: critical_checks_failed=${critical}, warn_fields=${warnings}`);
  return critical === 0;
}

async function apiSmoke() {
  section('API smoke');
  const health = await fetch(`${API_BASE}/api/config`);
  console.log(`GET /api/config → ${health.status}`);
  if (!health.ok) {
    console.error('API not reachable at', API_BASE);
    return false;
  }

  const email = process.env.SMOKE_USER_EMAIL;
  const password = process.env.SMOKE_USER_PASSWORD;
  let token = process.env.SMOKE_ADMIN_JWT || null;

  if (!token && email && password) {
    const login = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginJson = await login.json().catch(() => ({}));
    if (login.ok && loginJson.token) {
      token = loginJson.token;
      console.log('Login OK (SMOKE_USER_EMAIL)');
    } else {
      console.log('Login skipped/failed:', login.status, loginJson.error || '');
    }
  }

  if (!token) {
    console.log('No JWT; skipping authenticated API checks (set SMOKE_USER_* or SMOKE_ADMIN_JWT)');
    return true;
  }

  const alerts = await fetch(`${API_BASE}/api/admin/orders/operational-alerts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`GET /api/admin/orders/operational-alerts → ${alerts.status}`);
  if (alerts.ok) {
    const j = await alerts.json();
    const h = (j.payment_integrity_holds || []).length;
    const s = (j.shipped_without_inventory_deduct || []).length;
    const c = (j.cancelled_still_reserved || []).length;
    console.log(`  payment_integrity_holds: ${h}, shipped_no_deduct: ${s}, cancelled_still_reserved: ${c}`);
    if (h + s + c > 0) {
      console.log('[BLOCKER] operational-alerts lists non-empty');
      critical += 1;
    }
  } else if (alerts.status === 403) {
    console.log('  (403 — token is not admin; set SMOKE_ADMIN_JWT for ops alerts)');
  }

  const verify = await fetch(`${API_BASE}/api/admin/inventory/verify`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`GET /api/admin/inventory/verify → ${verify.status}`);
  if (verify.ok) {
    const invJson = await verify.json();
    const n = Number(invJson.issue_count ?? (Array.isArray(invJson.issues) ? invJson.issues.length : 0));
    console.log(`  inventory issue_count: ${n}`);
    if (!invJson.ok && n > 0) {
      console.log('[BLOCKER] inventory verify reported issues');
      critical += 1;
    }
  } else if (verify.status === 403) {
    console.log('  (403 — need admin JWT for inventory verify)');
  }

  const products = await fetch(`${API_BASE}/api/products?limit=5`);
  console.log(`GET /api/products?limit=5 → ${products.status}`);

  return true;
}

async function main() {
  console.log('GloveCubs smoke-staging');
  console.log('API_BASE:', API_BASE);

  let ok = true;
  if (reconcileOnly || allMode) {
    ok = (await reconcile()) && ok;
  }
  if (apiMode || allMode) {
    ok = (await apiSmoke()) && ok;
  }

  if (!ok || critical > 0) {
    console.log('\nExit 1 — fix blockers before launch.');
    process.exit(1);
  }
  console.log('\nExit 0');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
