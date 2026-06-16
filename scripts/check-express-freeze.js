'use strict';

/**
 * Phase 1A — Express route freeze: fail CI when server.js gains HTTP routes without
 * updating scripts/express-route-freeze-baseline.json.
 *
 * Run: node scripts/check-express-freeze.js
 * Refresh baseline (intentional only): node scripts/gen-express-route-baseline.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'server.js');
const BASELINE = path.join(__dirname, 'express-route-freeze-baseline.json');

const ROUTE_RE = /app\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g;

function extractRoutes(text) {
  const routes = new Set();
  let m;
  ROUTE_RE.lastIndex = 0;
  while ((m = ROUTE_RE.exec(text)) !== null) {
    routes.add(`${m[1].toUpperCase()} ${m[2]}`);
  }
  return [...routes].sort();
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE)) {
    console.error(`Missing baseline: ${path.relative(ROOT, BASELINE)}`);
    console.error('Run: node scripts/gen-express-route-baseline.js');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  if (!Array.isArray(raw)) {
    console.error('Baseline must be a JSON array of "METHOD /path" strings.');
    process.exit(1);
  }
  return raw.map(String).sort();
}

const current = extractRoutes(fs.readFileSync(SERVER, 'utf8'));
const baseline = loadBaseline();

const added = current.filter((r) => !baseline.includes(r));
const removed = baseline.filter((r) => !current.includes(r));

if (added.length || removed.length) {
  console.error('Express route freeze: server.js HTTP routes changed without baseline update.');
  if (added.length) {
    console.error('\nAdded routes (forbidden without explicit baseline refresh):');
    for (const r of added) console.error(`  + ${r}`);
  }
  if (removed.length) {
    console.error('\nRemoved routes (update baseline after intentional drain):');
    for (const r of removed) console.error(`  - ${r}`);
  }
  console.error('\nTo refresh intentionally: node scripts/gen-express-route-baseline.js');
  process.exit(1);
}

console.log(`check-express-freeze: OK (${current.length} routes frozen)`);
