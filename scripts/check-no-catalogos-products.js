'use strict';

/**
 * Fails if selected runtime trees reference catalogos listing table.
 * catalogos/ app package is scanned separately in CI when that package is migrated.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCAN_ROOTS = [
  path.join(ROOT, 'storefront', 'src'),
  path.join(ROOT, 'lib'),
  path.join(ROOT, 'services'),
];

const FORBIDDEN = /\.schema\s*\(\s*['"]catalogos['"]\s*\)[\s\S]{0,400}\.from\s*\(\s*['"]products['"]\s*\)/;

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'coverage']);

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

let failed = false;
for (const root of SCAN_ROOTS) {
  for (const file of walk(root)) {
    const text = fs.readFileSync(file, 'utf8');
    FORBIDDEN.lastIndex = 0;
    if (FORBIDDEN.test(text)) {
      console.error(`FORBIDDEN catalogos.products chain in ${path.relative(ROOT, file)}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('check-no-catalogos-products: OK (storefront/src, lib, services)');
