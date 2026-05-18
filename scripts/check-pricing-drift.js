'use strict';

/**
 * Phase 0D: fail CI when new pricing drift enters runtime trees.
 * See lib/commerce-truth-warnings.js for migration targets (Pricing Authority V2).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCAN_ROOTS = [
  path.join(ROOT, 'lib'),
  path.join(ROOT, 'services'),
  path.join(ROOT, 'storefront', 'src'),
  path.join(ROOT, 'public', 'js'),
  path.join(ROOT, 'server.js'),
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'coverage']);

function normRel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function normAbs(file) {
  return path.resolve(file).replace(/\\/g, '/').toLowerCase();
}

/** Files allowed to require lib/commerce-pricing (compatibility layer until 0A/0E). */
const COMMERCE_PRICING_IMPORT_ALLOW = new Set(
  [
    'lib/commerce-pricing.js',
    'lib/pricing-authority-v2.js',
    'lib/pricing-authority-checkout.js',
    'lib/checkout-compute.js',
    'lib/order-reorder.js',
    'server.js',
    'tests/commerce-pricing.test.js',
    'tests/commerce-money-parity.test.js',
    'tests/pricing-authority-v2.test.js',
    'tests/pricing-authority-checkout.test.js',
  ].map((r) => normAbs(path.join(ROOT, r))),
);

/** lib/pricing.js computeSellPrice — catalog margin overlay (deprecated; 0A). */
const COMPUTE_SELL_PRICE_ALLOW = new Set(
  [
    'lib/pricing.js',
    'lib/commerce-pricing.js',
    'lib/supplierCostPricing.js',
    'server.js',
    'tests/commerce-pricing.test.js',
    'tests/commerce-money-parity.test.js',
    'tests/commerce-pricing-metadata-guard.test.js',
  ].map((r) => normAbs(path.join(ROOT, r))),
);

const RE_COMMERCE_PRICING_REQUIRE =
  /require\s*\(\s*['"][^'"]*commerce-pricing['"]\s*\)|from\s+['"][^'"]*commerce-pricing['"]/;

const RE_LIB_PRICING_REQUIRE = /require\s*\(\s*['"][^'"]*\/pricing['"]\s*\)|require\s*\(\s*['"]\.\/pricing['"]\s*\)/;

const RE_COMPUTE_SELL_PRICE = /\bcomputeSellPrice\s*\(/;

/** Client-side tier % applied to money (not label-only metadata). */
const RE_CLIENT_TIER_PRICE_MATH =
  /(?:unitPrice|unit_price|checkout_unit_price|subtotal|price)\s*[^;\n]{0,80}\*\s*\(\s*1\s*-\s*(?:tier|discount)/i;

const RE_DUPLICATE_CHECKOUT_RESOLVER =
  /function\s+resolveLineUnitPriceForCheckout\s*\(|resolveLineUnitPriceForCheckout\s*=\s*\(/;

function* walkFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const stat = fs.statSync(dir);
  if (stat.isFile()) {
    if (/\.(js|cjs|mjs|ts|tsx)$/.test(dir)) yield dir;
    return;
  }
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walkFiles(full);
    } else if (/\.(js|cjs|mjs|ts|tsx)$/.test(e.name)) {
      yield full;
    }
  }
}

function violationsForFile(file, text) {
  const rel = normRel(file);
  const abs = normAbs(file);
  const out = [];

  if (RE_COMMERCE_PRICING_REQUIRE.test(text) && !COMMERCE_PRICING_IMPORT_ALLOW.has(abs)) {
    out.push('forbidden require/import of commerce-pricing (use Pricing Authority V2 wrapper when added)');
  }

  if (RE_COMPUTE_SELL_PRICE.test(text) && !COMPUTE_SELL_PRICE_ALLOW.has(abs)) {
    if (!rel.startsWith('catalogos/')) {
      out.push('computeSellPrice outside approved compatibility files');
    }
  }

  if (rel.startsWith('storefront/src/') && RE_LIB_PRICING_REQUIRE.test(text)) {
    out.push('storefront must not require lib/pricing — use server pricing authority RPC only');
  }

  if (RE_CLIENT_TIER_PRICE_MATH.test(text)) {
    if (rel.startsWith('storefront/src/')) {
      out.push('client-side tier/discount price math in storefront');
    } else if (rel.startsWith('public/js/') && rel !== 'public/js/app.js') {
      out.push('client-side tier/discount price math in public/js (legacy app.js grandfathered until Phase 6)');
    }
  }

  if (RE_DUPLICATE_CHECKOUT_RESOLVER.test(text) && !COMMERCE_PRICING_IMPORT_ALLOW.has(abs)) {
    out.push('duplicate resolveLineUnitPriceForCheckout implementation');
  }

  return out;
}

let failed = false;
for (const root of SCAN_ROOTS) {
  for (const file of walkFiles(root)) {
    const text = fs.readFileSync(file, 'utf8');
    const v = violationsForFile(file, text);
    if (v.length) {
      failed = true;
      console.error(`PRICING DRIFT (${v.join(' | ')}) in ${normRel(file)}`);
    }
  }
}

if (failed) process.exit(1);
console.log('check-pricing-drift: OK');
