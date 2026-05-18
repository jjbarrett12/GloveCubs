'use strict';

/**
 * Phase 0D: fail CI when new parent-grain inventory logic enters checkout/commerce paths.
 * Existing parent inventory in lib/inventory.js + server.js is allowlisted until Phase 0C.
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

const RESERVE_RPC_ALLOW = new Set([normAbs(path.join(ROOT, 'lib', 'inventory.js'))]);

const VARIANT_RESERVE_RPC_ALLOW = new Set([normAbs(path.join(ROOT, 'lib', 'inventory.js'))]);

const CHECK_AVAILABILITY_ALLOW = new Set(
  [
    'server.js',
    'lib/inventory.js',
    'scripts/launch-readiness-audit.js',
    'tests/inventory.test.js',
    'tests/inventory-mutations.test.js',
  ].map((r) => normAbs(path.join(ROOT, r))),
);

const APPLY_INVENTORY_OVERLAY_ALLOW = new Set([normAbs(path.join(ROOT, 'server.js'))]);

const RE_RESERVE_RPC = /(?:\.rpc\s*\(\s*['"]gc_reserve_stock_for_order_atomic['"]|gc_reserve_stock_for_order_atomic\s*\()/;

const RE_VARIANT_RESERVE_RPC =
  /(?:\.rpc\s*\(\s*['"]gc_reserve_variant_stock_for_order_atomic['"]|gc_reserve_variant_stock_for_order_atomic\s*\()/;

const RE_CHECK_AVAILABILITY = /\binventory\.checkAvailability\s*\(/;

const RE_APPLY_INVENTORY = /\bapplyInventoryToProducts\s*\(/;

const RE_PUBLIC_INVENTORY_FROM = /\.from\s*\(\s*['"]inventory['"]\s*\)/;

const RE_VARIANT_INVENTORY_WRITE =
  /\.schema\s*\(\s*['"]catalog_v2['"]\s*\)[\s\S]{0,200}\.from\s*\(\s*['"]variant_inventory['"]\s*\)[\s\S]{0,200}\.(?:insert|update|upsert)\s*\(/;

const VARIANT_INVENTORY_MODULE_ALLOW = new Set(
  [
    'lib/variant-inventory-authority.js',
    'lib/inventory.js',
    'tests/variant-inventory-authority.test.js',
  ].map((r) => normAbs(path.join(ROOT, r))),
);

const RE_VARIANT_INVENTORY_AUTHORITY = /\bvariant-inventory-authority\b/;

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

  if (RE_RESERVE_RPC.test(text) && !RESERVE_RPC_ALLOW.has(abs)) {
    if (!rel.startsWith('supabase/migrations/') && !rel.startsWith('tests/')) {
      out.push('gc_reserve_stock_for_order_atomic only allowed in lib/inventory.js');
    }
  }

  if (RE_VARIANT_RESERVE_RPC.test(text) && !VARIANT_RESERVE_RPC_ALLOW.has(abs)) {
    if (!rel.startsWith('supabase/migrations/') && !rel.startsWith('tests/')) {
      out.push('gc_reserve_variant_stock_for_order_atomic only allowed in lib/inventory.js');
    }
  }

  if (RE_CHECK_AVAILABILITY.test(text) && !CHECK_AVAILABILITY_ALLOW.has(abs)) {
    out.push('inventory.checkAvailability outside approved checkout paths');
  }

  if (RE_APPLY_INVENTORY.test(text) && !APPLY_INVENTORY_OVERLAY_ALLOW.has(abs)) {
    out.push('applyInventoryToProducts (parent in_stock overlay) only allowed in server.js');
  }

  if (rel.startsWith('storefront/src/') && RE_PUBLIC_INVENTORY_FROM.test(text)) {
    out.push('storefront must not read public.inventory directly — use variant availability API (0C)');
  }

  if (RE_VARIANT_INVENTORY_WRITE.test(text) && abs !== normAbs(path.join(ROOT, 'lib', 'inventory.js'))) {
    if (!rel.startsWith('supabase/migrations/') && !rel.startsWith('scripts/')) {
      out.push('variant_inventory writes only allowed in lib/inventory.js (Phase 0C)');
    }
  }

  if (RE_VARIANT_INVENTORY_AUTHORITY.test(text) && !VARIANT_INVENTORY_MODULE_ALLOW.has(abs)) {
    out.push('variant-inventory-authority only allowed in lib/inventory.js and tests');
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
      console.error(`INVENTORY DRIFT (${v.join(' | ')}) in ${normRel(file)}`);
    }
  }
}

if (failed) process.exit(1);
console.log('check-parent-inventory-usage: OK');
