'use strict';
/** One-off helper to refresh scripts/express-route-freeze-baseline.json — run from repo root. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const text = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const re = /app\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g;
const routes = new Set();
let m;
while ((m = re.exec(text)) !== null) {
  routes.add(`${m[1].toUpperCase()} ${m[2]}`);
}
const sorted = [...routes].sort();
const out = path.join(__dirname, 'express-route-freeze-baseline.json');
fs.writeFileSync(out, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
console.log(`Wrote ${sorted.length} routes to ${path.relative(ROOT, out)}`);
