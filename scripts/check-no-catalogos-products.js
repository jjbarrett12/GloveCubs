'use strict';

/**
 * Fails if runtime trees reference the legacy catalogos listing products table
 * (schema(catalogos).from('products'), COS/CATALOGOS_SCHEMA chains, raw catalogos.products, or forbidden .from('products') in allowlisted files).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCAN_ROOTS = [
  path.join(ROOT, 'storefront', 'src'),
  path.join(ROOT, 'lib'),
  path.join(ROOT, 'services'),
  path.join(ROOT, 'catalogos', 'src'),
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'coverage']);

/** Absolute paths normalized for comparison (POSIX slashes, lowercased). */
function normAbsPath(absPath) {
  return path.resolve(absPath).replace(/\\/g, '/').toLowerCase();
}

const KNOWN_FROM_PRODUCTS_FILES = new Set([
  normAbsPath(path.join(ROOT, 'services', 'catalogosProductService.js')),
]);

const SCHEMA_PRODUCT_CHAIN_RULES = [
  { name: 'schema("catalogos"|\'catalogos\').from("products")', re: /\.schema\s*\(\s*['"]catalogos['"]\s*\)[\s\S]{0,1200}\.from\s*\(\s*['"]products['"]\s*\)/ },
  { name: 'schema(`catalogos`).from("products")', re: /\.schema\s*\(\s*`catalogos`\s*\)[\s\S]{0,1200}\.from\s*\(\s*['"]products['"]\s*\)/ },
  { name: 'schema(COS).from("products")', re: /\.schema\s*\(\s*COS\s*\)[\s\S]{0,1200}\.from\s*\(\s*['"]products['"]\s*\)/ },
  { name: 'schema(CATALOGOS_SCHEMA).from("products")', re: /\.schema\s*\(\s*CATALOGOS_SCHEMA\s*\)[\s\S]{0,1200}\.from\s*\(\s*['"]products['"]\s*\)/ },
  {
    name: 'supabase.schema(<catalogos alias>).from("products")',
    re: /\.schema\s*\(\s*(?:COS|CATALOGOS_SCHEMA|['"]catalogos['"]|`catalogos`)\s*\)[\s\S]{0,1200}\.from\s*\(\s*['"]products['"]\s*\)/,
  },
];

/** SQL / DDL style references only (avoids docstrings that mention the legacy table name). */
const RAW_SQL_CATALOGOS_PRODUCTS = /\b(from|join|into|update|truncate)\s+catalogos\.products\b/i;

const FROM_PRODUCTS = /\.from\s*\(\s*['"]products['"]\s*\)/;

/** Ingestion / supplier portal / match handlers must not read legacy catalogos.products. */
const FORBIDDEN_FROM_PRODUCTS_REL = (rel) => {
  const r = rel.replace(/\\/g, '/');
  if (r.startsWith('storefront/src/lib/supplier-portal/')) return true;
  if (r === 'storefront/src/lib/jobs/handlers/productMatch.ts') return true;
  if (r === 'storefront/src/lib/jobs/handlers/competitorPriceCheck.ts') return true;
  return false;
};

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(full);
    } else if (/\.(js|cjs|mjs|ts|tsx)$/.test(e.name)) {
      yield full;
    }
  }
}

function violationsForFile(file, text) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const out = [];
  const isUnderMigrations = rel.startsWith('supabase/migrations/');

  for (const { name, re } of SCHEMA_PRODUCT_CHAIN_RULES) {
    re.lastIndex = 0;
    if (re.test(text)) out.push(name);
  }

  if (!isUnderMigrations && RAW_SQL_CATALOGOS_PRODUCTS.test(text)) {
    out.push('SQL/DML reference to catalogos.products table');
  }

  const n = normAbsPath(file);
  if (KNOWN_FROM_PRODUCTS_FILES.has(n)) {
    FROM_PRODUCTS.lastIndex = 0;
    if (FROM_PRODUCTS.test(text)) {
      out.push('services/catalogosProductService.js must use catalog_v2.catalog_products only (no .from(products))');
    }
  }

  if (rel.startsWith('catalogos/src/')) {
    FROM_PRODUCTS.lastIndex = 0;
    if (FROM_PRODUCTS.test(text)) {
      out.push('catalogos/src runtime .from(products) — use schema("catalog_v2").from("catalog_products")');
    }
  }

  if (FORBIDDEN_FROM_PRODUCTS_REL(rel)) {
    FROM_PRODUCTS.lastIndex = 0;
    if (FROM_PRODUCTS.test(text)) {
      out.push('forbidden .from(products) in supplier portal / productMatch / competitorPriceCheck (use catalog_v2)');
    }
  }

  return out;
}

let failed = false;
for (const root of SCAN_ROOTS) {
  for (const file of walk(root)) {
    const text = fs.readFileSync(file, 'utf8');
    const v = violationsForFile(file, text);
    if (v.length) {
      failed = true;
      console.error(`FORBIDDEN (${v.join(' | ')}) in ${path.relative(ROOT, file)}`);
    }
  }
}

if (failed) process.exit(1);
console.log('check-no-catalogos-products: OK (storefront/src, lib, services, catalogos/src)');
