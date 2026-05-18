'use strict';

/**
 * Phase 0D: fail CI when new variant-identity drift enters runtime trees.
 * Inference gated by VARIANT_MANDATORY_ENFORCE in lib/resolve-cart-catalog-variant.js.
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

const VARIANT_RESOLVER_IMPORT_ALLOW = new Set(
  [
    'lib/resolve-cart-catalog-variant.js',
    'server.js',
    'lib/order-reorder.js',
    'scripts/validate-canonical-commerce-flow.js',
    'tests/commerce-variant-paths.test.js',
  ].map((r) => normAbs(path.join(ROOT, r))),
);

const COMMERCIAL_IDENTITY_IMPORT_ALLOW = new Set(
  [
    'lib/commercial-line-identity.js',
    'server.js',
    'lib/checkout-compute.js',
    'lib/order-reorder.js',
    'tests/commercial-line-identity.test.js',
  ].map((r) => normAbs(path.join(ROOT, r))),
);

const RE_ASSERT_COMMERCIAL = /\bassertCommercialLineIdentity\b/;

const ENSURE_CART_VARIANTS_ALLOW = new Set([normAbs(path.join(ROOT, 'server.js'))]);

const RE_VARIANT_RESOLVER =
  /require\s*\(\s*['"][^'"]*resolve-cart-catalog-variant['"]\s*\)|resolveCatalogVariantForCommerceLine/;

const RE_ENSURE_CART_VARIANTS = /\bensureCartLinesHaveResolvedVariants\s*\(/;

const QUOTE_REQUEST_ROUTE = path.join(ROOT, 'storefront', 'src', 'app', 'api', 'quote-request', 'route.ts');
const QUOTE_TYPES = path.join(ROOT, 'storefront', 'src', 'lib', 'quote-cart', 'types.ts');

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

  if (
    RE_VARIANT_RESOLVER.test(text) &&
    !VARIANT_RESOLVER_IMPORT_ALLOW.has(abs) &&
    rel !== 'lib/commerce-truth-warnings.js'
  ) {
    out.push('resolveCatalogVariantForCommerceLine used outside approved paths');
  }

  if (RE_ENSURE_CART_VARIANTS.test(text) && !ENSURE_CART_VARIANTS_ALLOW.has(abs)) {
    out.push('ensureCartLinesHaveResolvedVariants only allowed in server.js until Phase 0B');
  }

  if (RE_ASSERT_COMMERCIAL.test(text) && !COMMERCIAL_IDENTITY_IMPORT_ALLOW.has(abs)) {
    out.push('assertCommercialLineIdentity used outside approved paths');
  }

  return out;
}

function checkQuoteContracts() {
  const out = [];
  if (!fs.existsSync(QUOTE_REQUEST_ROUTE)) {
    out.push('missing quote-request route (expected catalog_variant_id in schema)');
    return out;
  }
  const routeSrc = fs.readFileSync(QUOTE_REQUEST_ROUTE, 'utf8');
  if (!/catalog_variant_id/.test(routeSrc)) {
    out.push('quote-request route must keep catalog_variant_id field');
  }
  if (!/variant_sku/.test(routeSrc)) {
    out.push('quote-request route must keep variant_sku field');
  }
  if (!/isVariantMandatoryEnforceEnabled/.test(routeSrc)) {
    out.push('quote-request route must gate variant fields with VARIANT_MANDATORY_ENFORCE');
  }
  if (fs.existsSync(QUOTE_TYPES)) {
    const typesSrc = fs.readFileSync(QUOTE_TYPES, 'utf8');
    if (!/catalog_variant_id/.test(typesSrc)) {
      out.push('quote-cart types must keep catalog_variant_id');
    }
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
      console.error(`VARIANT DRIFT (${v.join(' | ')}) in ${normRel(file)}`);
    }
  }
}

for (const msg of checkQuoteContracts()) {
  failed = true;
  console.error(`VARIANT DRIFT (${msg})`);
}

if (failed) process.exit(1);
console.log('check-variant-mandatory: OK');
