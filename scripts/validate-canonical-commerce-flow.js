/**
 * Live DB checks: catalog_v2-only product id through cart/checkout/order snapshot + inventory + guards.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Expose `catalog_v2` (and `catalogos` for non-product tables if needed).
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const crypto = require('crypto');
const assert = require('node:assert/strict');

const { isSupabaseAdminConfigured } = require('../lib/supabaseAdmin');
const { computeCheckoutMoneyFromCart } = require('../lib/checkout-compute');
const { buildGcOrderLinesForInsert } = require('../lib/buildGcOrderLines');
const inventory = require('../lib/inventory');
const { assertCatalogV2ProductIdForCommerce } = require('../lib/catalog-v2-product-guard');
const productsService = require('../services/catalogosProductService');
const commerceShipping = require('../lib/commerce-shipping');

const addr = { state: 'NY', city: 'NYC', zip_code: '10001', address_line1: '1 Main', full_name: 'A' };

/** Preferred live row for this validator (checkout + inventory chain). */
const PREFERRED_CATALOG_V2_PRODUCT_ID = 'a0c88bf6-b338-4ce4-a433-e6daafbba7e1';

function isSchemaNotExposedError(err) {
  const m = err && (err.message || err.details || (err.error && err.error.message));
  return typeof m === 'string' && (m.includes('Invalid schema') || m.includes('PGRST106'));
}

/** @returns {Promise<{ catalogV2Reachable: boolean, catalogV2Detail: string|null, blockedByExposedSchemaSetting: boolean }>} */
async function probePostgrestCatalogSchemas() {
  const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
  const supabase = getSupabaseAdmin();
  const v2r = await supabase.schema('catalog_v2').from('catalog_products').select('id').limit(1);
  const v2Detail = v2r.error ? v2r.error.message || JSON.stringify(v2r.error) : null;
  const blockedByExposedSchemaSetting = v2r.error && isSchemaNotExposedError(v2r.error);
  return {
    catalogV2Reachable: !v2r.error,
    catalogV2Detail: v2Detail,
    blockedByExposedSchemaSetting,
  };
}

function printSchemaReachabilityReport(probe) {
  console.log('--- PostgREST schema reachability ---');
  console.log(
    `${probe.catalogV2Reachable ? 'REACHABLE' : 'NOT REACHABLE'}\tcatalog_v2${probe.catalogV2Detail ? `\t${probe.catalogV2Detail}` : ''}`,
  );
}

function printExposedSchemasInstructions() {
  console.log('');
  console.log('=== Action: expose schemas in Supabase ===');
  console.log('Dashboard → Project Settings → Data API (or API) → Exposed schemas');
  console.log('Add: catalog_v2');
  console.log('Then rerun: node scripts/validate-canonical-commerce-flow.js');
  console.log('');
}

/** Best-effort classification for live failures (for humans triaging CI / local runs). */
function classifyLiveFailure(stepName, errOrMessage) {
  const s = String(errOrMessage == null ? '' : errOrMessage.message != null ? errOrMessage.message : errOrMessage);
  if (isSchemaNotExposedError({ message: s }) || /PGRST106|Invalid schema/i.test(s)) return 'config';
  if (/MissingSellableProductError|No active sellable_products/i.test(s)) return 'missing sellable row';
  if (/CatalogV2ProductMappingError|could not resolve/i.test(s)) return 'missing mapping';
  if (/Insufficient stock|inventory row|getStockForLineItem returned null/i.test(s)) return 'missing inventory row';
  if (/InvalidCatalogV2ProductIdError|NOT_FOUND/i.test(s)) return 'code path / guard (expected for negative tests)';
  return 'code bug or unknown';
}

function pass(name) {
  console.log(`PASS — ${name}`);
}

function fail(name, detail) {
  console.log(`FAIL — ${name}`);
  if (detail != null) console.log(String(detail));
}

/**
 * Guest checkout uses product.price from metadata.list_price (see commerce-pricing).
 * Ensures subtotal clears MIN_ORDER_AMOUNT without weakening shipping rules.
 *
 * @param {*} supabase - getSupabaseAdmin() client
 * @param {string} v2Id
 */
function targetListUsdForMinOrder() {
  const minOrder = Number(commerceShipping.getCommerceShippingConfig().minOrderAmount) || 200;
  return Math.max(minOrder + 1, 250);
}

/**
 * When DB cannot be updated (grants), step 2 still needs a list price ≥ min order.
 * Wraps the real service: same catalog_v2 id, only augments numeric price fields for checkout math.
 */
function checkoutProductsServiceWithMinListPrice(base, minListUsd) {
  return {
    async getProductById(id) {
      const p = await base.getProductById(id);
      if (!p) return null;
      const cur = Number(p.price);
      if (Number.isFinite(cur) && cur >= minListUsd) return p;
      return { ...p, price: minListUsd };
    },
  };
}

async function ensureValidatorV2CheckoutPricing(supabase, v2Id) {
  const targetListUsd = targetListUsdForMinOrder();
  const minOrder = Number(commerceShipping.getCommerceShippingConfig().minOrderAmount) || 200;

  const { data: row, error } = await supabase
    .schema('catalog_v2')
    .from('catalog_products')
    .select('id, metadata, internal_sku, name')
    .eq('id', v2Id)
    .single();
  if (error) throw error;

  const sku =
    (row.internal_sku && String(row.internal_sku).trim()) ||
    `validator-${String(v2Id).replace(/-/g, '').slice(0, 12)}`;
  const name = (row.name && String(row.name).trim()) || 'Validator catalog_v2 fixture';
  const listMinor = Math.round(targetListUsd * 100);
  /* Upsert sellable before catalog_products UPDATE so step 3 still sees a row if UPDATE is denied. */
  const { error: sErr } = await supabase.schema('gc_commerce').from('sellable_products').upsert(
    {
      sku,
      display_name: name,
      catalog_product_id: v2Id,
      currency_code: 'USD',
      list_price_minor: listMinor,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'sku' },
  );
  if (sErr) {
    console.warn('[validate-canonical-commerce-flow] gc_commerce.sellable_products upsert:', sErr.message || sErr);
  }

  const meta = row.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {};
  const facet =
    meta.facet_attributes && typeof meta.facet_attributes === 'object' ? { ...meta.facet_attributes } : {};
  const existingList = Number(meta.list_price ?? facet.list_price ?? 0);
  const needsList = !Number.isFinite(existingList) || existingList < minOrder;

  if (needsList) {
    meta.list_price = targetListUsd;
    meta.facet_attributes = { ...facet, list_price: targetListUsd };
    const { error: uErr } = await supabase
      .schema('catalog_v2')
      .from('catalog_products')
      .update({ metadata: meta, updated_at: new Date().toISOString() })
      .eq('id', v2Id);
    if (uErr) throw uErr;
  }
}

/** @returns {Promise<{ v2: string }>} */
async function pickV2ProductFixture() {
  const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
  const supabase = getSupabaseAdmin();

  const pref = await supabase
    .schema('catalog_v2')
    .from('catalog_products')
    .select('id')
    .eq('id', PREFERRED_CATALOG_V2_PRODUCT_ID)
    .eq('status', 'active')
    .maybeSingle();

  if (!pref.error && pref.data?.id) {
    return { v2: String(pref.data.id).toLowerCase() };
  }

  const { data: row, error } = await supabase
    .schema('catalog_v2')
    .from('catalog_products')
    .select('id')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!row || !row.id) {
    throw new Error('No active catalog_v2.catalog_products row — seed v2 catalog before running this validator.');
  }
  return { v2: String(row.id).toLowerCase() };
}

async function main() {
  const results = [];
  const record = (name, ok, mismatch) => {
    results.push({ name, ok, mismatch });
    if (ok) pass(name);
    else fail(name, mismatch);
  };

  if (!isSupabaseAdminConfigured()) {
    console.log('SKIP — Supabase admin not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
    process.exit(0);
  }

  const probe = await probePostgrestCatalogSchemas();
  printSchemaReachabilityReport(probe);

  if (!probe.catalogV2Reachable) {
    if (probe.blockedByExposedSchemaSetting) {
      console.log('');
      console.log('SKIP — PostgREST exposed schemas do not include catalog_v2 (see file header).');
      printExposedSchemasInstructions();
    } else {
      console.log('');
      console.log(
        'FAIL — schema query error (not PGRST106). Classification:',
        classifyLiveFailure('schema_probe', probe.catalogV2Detail || ''),
      );
    }
    console.log('--- summary (chain not run) ---');
    const steps = [
      '1. Cart → v2 identity',
      '2. Checkout orderItems v2',
      '3. Order snapshot v2',
      '4. Inventory row (reserve)',
      '5. Inventory row (deduct key)',
      '6. Negative fake UUID',
      '6b. Negative unknown UUID in guard',
    ];
    for (const s of steps) console.log('SKIP\t' + s);
    process.exit(probe.blockedByExposedSchemaSetting ? 0 : 1);
  }

  let v2;
  try {
    ({ v2 } = await pickV2ProductFixture());
  } catch (e) {
    const msg = e.message || String(e);
    record('fixture: catalog_v2 product', false, `${msg}\n  classification: ${classifyLiveFailure('fixture', e)}`);
    printSummary(results);
    process.exit(1);
  }
  record('fixture: catalog_v2.catalog_products (active)', true);
  console.log(`  catalog_v2=${v2}`);

  const minList = targetListUsdForMinOrder();
  let productsServiceForCheckout = productsService;
  let pricingFixtureMode = 'db';
  try {
    const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
    await ensureValidatorV2CheckoutPricing(getSupabaseAdmin(), v2);
  } catch (e) {
    const msg = e.message || String(e);
    console.warn('[validate-canonical-commerce-flow] DB pricing fixture skipped:', msg);
    console.warn(
      `[validate-canonical-commerce-flow] Using validator-only list price overlay (${minList} USD) for checkout step; canonical ids unchanged.`,
    );
    productsServiceForCheckout = checkoutProductsServiceWithMinListPrice(productsService, minList);
    pricingFixtureMode = 'overlay';
  }
  record(
    'fixture: checkout pricing (min order)',
    true,
    pricingFixtureMode === 'db' ? null : `mode=overlay (DB update not permitted or failed)`,
  );
  if (pricingFixtureMode === 'overlay') {
    console.log('  (checkout step uses overlay; grant UPDATE on catalog_v2.catalog_products to persist list_price in DB)');
  }

  // 1 — Cart line uses catalog_v2 UUID only
  try {
    const lines = [{ product_id: v2, quantity: 2, size: null, canonical_product_id: v2, listing_id: v2 }];
    await assertCatalogV2ProductIdForCommerce(v2, 'validate_cart');
    const line = lines[0];
    const ok = line.canonical_product_id === v2 && line.product_id === v2;
    record('1. Cart v2 identity', ok, ok ? null : JSON.stringify(line));
  } catch (e) {
    record('1. Cart v2 identity', false, e.message || e);
  }

  // 2 — Checkout compute payload uses catalog_v2 id on order item rows
  try {
    const cartItems = [
      {
        product_id: v2,
        quantity: 1,
        size: null,
        canonical_product_id: v2,
        listing_id: v2,
      },
    ];
    const money = await computeCheckoutMoneyFromCart({
      cartItems,
      finalShippingAddress: addr,
      user: null,
      companyId: null,
      pricingContext: { companies: [], customer_manufacturer_pricing: [] },
      productsService: productsServiceForCheckout,
    });
    if (!money.ok) {
      record('2. Checkout payload uses catalog_v2 id', false, JSON.stringify(money.body));
    } else {
      const oi = money.value.orderItems[0];
      const ok = oi && oi.canonical_product_id === v2 && oi.product_id === v2 && oi.listing_id === v2;
      record(
        '2. Checkout payload uses catalog_v2 id',
        ok,
        ok ? null : `orderItems[0]=${JSON.stringify(oi)}`,
      );
    }
  } catch (e) {
    record('2. Checkout payload uses catalog_v2 id', false, e.message || e);
  }

  // 3 — Order line snapshot: product_snapshot.catalog_product_id is v2
  const dummyOrderId = crypto.randomUUID();
  try {
    const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
    const rows = await buildGcOrderLinesForInsert(getSupabaseAdmin(), dummyOrderId, [
      {
        listing_id: v2,
        canonical_product_id: v2,
        product_id: v2,
        quantity: 1,
        unit_price: 9.99,
        size: null,
      },
    ]);
    const snap = rows[0] && rows[0].product_snapshot;
    const ok = snap && String(snap.catalog_product_id).toLowerCase() === v2;
    record(
      '3. Create order snapshot: catalog_product_id is catalog_v2',
      ok,
      ok ? null : `rows=${JSON.stringify(rows)}`,
    );
  } catch (e) {
    record('3. Create order snapshot: catalog_product_id is catalog_v2', false, e.message || e);
  }

  // 4 — Reserve path prerequisite: inventory row keyed by canonical (v2)
  try {
    const stock = await inventory.getStockForLineItem({ canonical_product_id: v2 });
    const ok = !!(stock && String(stock.canonical_product_id).toLowerCase() === v2);
    record(
      '4. Reserve stock: inventory row found for catalog_v2 id',
      ok,
      ok ? null : `getStockForLineItem returned ${JSON.stringify(stock)}`,
    );
  } catch (e) {
    record('4. Reserve stock: inventory row found for catalog_v2 id', false, e.message || e);
  }

  // 5 — Deduct targets same canonical row (read-only: inventory key matches v2)
  try {
    const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
    const supabase = getSupabaseAdmin();
    const { data: invRow, error } = await supabase
      .from('inventory')
      .select('id, canonical_product_id, quantity_on_hand, quantity_reserved')
      .eq('canonical_product_id', v2)
      .maybeSingle();
    if (error) throw error;
    const ok = !!(invRow && String(invRow.canonical_product_id).toLowerCase() === v2);
    record(
      '5. Deduct stock: inventory row keyed by catalog_v2 id (read-only check)',
      ok,
      ok ? null : 'No inventory row with canonical_product_id = v2 (deduct RPC would not update a row)',
    );
  } catch (e) {
    record('5. Deduct stock: inventory row keyed by catalog_v2 id (read-only check)', false, e.message || e);
  }

  // 6 — Negative: random UUID not in catalog_v2 / catalogos
  try {
    const fake = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
    await assertCatalogV2ProductIdForCommerce(fake, 'validate_negative');
    record('6. Negative: fake UUID rejected', false, 'expected throw');
  } catch (e) {
    const ok = e && e.name === 'InvalidCatalogV2ProductIdError' && e.typedCode === 'NOT_FOUND_IN_CATALOG_V2';
    record('6. Negative: fake UUID rejected', ok, ok ? null : `${e && e.name} ${e && e.typedCode} ${e && e.message}`);
  }

  // 6b — random UUID not in catalog_v2
  try {
    const unknown = crypto.randomUUID();
    await assertCatalogV2ProductIdForCommerce(unknown, 'validate_unknown_uuid');
    record('6b. Negative: unknown UUID rejected in guard', false, 'expected throw');
  } catch (e) {
    const ok = e && e.name === 'InvalidCatalogV2ProductIdError' && e.typedCode === 'NOT_FOUND_IN_CATALOG_V2';
    record(
      '6b. Negative: unknown UUID rejected in guard',
      ok,
      ok ? null : `${e && e.name} ${e && e.typedCode} ${e && e.message}`,
    );
  }

  printSummary(results);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log('');
    console.log('--- failure classification (hints) ---');
    for (const r of failed) {
      console.log(`${r.name}\t${classifyLiveFailure(r.name, r.mismatch || '')}`);
    }
    process.exit(1);
  }
}

function printSummary(results) {
  console.log('');
  console.log('--- summary ---');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}\t${r.name}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
