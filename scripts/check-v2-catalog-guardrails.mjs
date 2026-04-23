#!/usr/bin/env node
/**
 * CI guard: catalog product reads/writes must stay on catalogos + CatalogService.
 * Fails if legacy dual-catalog schema names or unscoped product table queries appear in vetted roots.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const EXCLUDE_DIR_NAMES = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.claude']);

/** @param {string} dir */
function walkJs(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (EXCLUDE_DIR_NAMES.has(ent.name)) continue;
      walkJs(full, acc);
    } else if (/\.(js|cjs|mjs|ts|tsx)$/.test(ent.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const roots = [
  path.join(ROOT, 'services'),
  path.join(ROOT, 'lib'),
  path.join(ROOT, 'server.js'),
  path.join(ROOT, 'seed.js'),
  path.join(ROOT, 'restore-images.js'),
];

const LEGACY_DUAL_SCHEMA = ['catalog', '_v', '2'].join('');

const files = [];
for (const r of roots) {
  if (r.endsWith('.js')) {
    if (fs.existsSync(r)) files.push(r);
  } else {
    walkJs(r, files);
  }
}

const allowUnscopedProducts = (rel) =>
  rel === path.join('services', 'catalogosProductService.js') || rel === path.join('services', 'catalogService.js');

const fromProductsRe = /\.from\(\s*['"]products['"]\s*\)/g;
const publicProductsRe = /\.schema\(\s*['"]public['"]\s*\)[\s\S]{0,200}\.from\(\s*['"]products['"]|from\(\s*['"]products['"][\s\S]{0,80}\)\s*\.schema\(\s*['"]public['"]/g;

const violations = [];

for (const abs of files) {
  const rel = path.relative(ROOT, abs).split(path.sep).join(path.sep);
  const text = fs.readFileSync(abs, 'utf8');

  if (text.includes(LEGACY_DUAL_SCHEMA)) {
    violations.push({ rel, kind: 'legacy dual-catalog schema reference' });
  }
  publicProductsRe.lastIndex = 0;
  if (publicProductsRe.test(text)) {
    violations.push({ rel, kind: 'public.products Supabase client usage' });
  }

  if (allowUnscopedProducts(rel)) continue;

  let m;
  const re = new RegExp(fromProductsRe.source, 'g');
  while ((m = re.exec(text)) !== null) {
    const start = Math.max(0, m.index - 200);
    const window = text.slice(start, m.index);
    const ok =
      /schema\s*\(\s*['"]catalogos['"]\s*\)/.test(window) ||
      /\.schema\s*\(\s*COS\s*\)/.test(window) ||
      /Accept-Profile['"]\s*:\s*['"]catalogos['"]/.test(window) ||
      /Content-Profile['"]\s*:\s*['"]catalogos['"]/.test(window);
    if (!ok) {
      violations.push({ rel, kind: `products table query without catalogos schema (char ${m.index})` });
      break;
    }
  }
}

if (violations.length > 0) {
  console.error('V2 catalog guardrail failures:\n');
  for (const v of violations) {
    console.error(`  [${v.kind}] ${v.rel}`);
  }
  process.exit(1);
}

console.log('V2 catalog guardrails: OK (%d files checked)', files.length);
