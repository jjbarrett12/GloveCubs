/**
 * Phase A redirect smoke (optional live).
 *
 * Prereqs: Express on EXPRESS_URL (default http://127.0.0.1:3004) with STOREFRONT_PUBLIC_ORIGIN=NEXT_URL;
 * Next storefront on NEXT_URL (default http://127.0.0.1:3005).
 *
 *   RUN_PHASE_A_LIVE=1 node scripts/verify-phase-a-redirects.cjs
 *
 * Without RUN_PHASE_A_LIVE=1, prints the matrix and exits 0.
 */

const { spawnSync } = require('child_process');

const EXPRESS = (process.env.EXPRESS_URL || 'http://127.0.0.1:3004').replace(/\/$/, '');
const NEXT = (process.env.NEXT_URL || 'http://127.0.0.1:3005').replace(/\/$/, '');
const LIVE = process.env.RUN_PHASE_A_LIVE === '1';

function curlI(url) {
  const r = spawnSync('curl', ['-sI', '-m', '3', url], { encoding: 'utf8', maxBuffer: 512 * 1024 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

function firstStatus(headers) {
  const m = headers.match(/^HTTP\/[^\s]+\s+(\d+)/m);
  return m ? Number(m[1], 10) : 0;
}

function headerValue(headers, name) {
  const re = new RegExp(`^${name}:\\s*(.+)\\s*$`, 'im');
  const m = headers.match(re);
  return m ? m[1].trim() : '';
}

const matrix = `
Phase A — local redirect matrix (copy-paste when servers are up)

Express (${EXPRESS}) with STOREFRONT_PUBLIC_ORIGIN=${NEXT}:
  curl -sI "${EXPRESS}/" | findstr /i "HTTP Location"
  curl -sI "${EXPRESS}/workspace" | findstr /i "HTTP Location"
  curl -sI "${EXPRESS}/invoice-savings" | findstr /i "HTTP Location"
  curl -sI "${EXPRESS}/api/config" | findstr /i "HTTP Location"

Next (${NEXT}):
  curl -sI "${NEXT}/workspace" | findstr /i "HTTP Location"
  curl -sI "${NEXT}/workspace/" | findstr /i "HTTP Location"

Expect: Express HTML paths → 308 Location on ${NEXT} (same path+query).
        Express /api/config → 200 (no redirect to storefront).
        Next /workspace and /workspace/ → 308 to .../workspace/procurement
`;

function assertLive(name, url, wantStatus, locationNeedle) {
  const { status, out } = curlI(url);
  if (status !== 0) {
    console.error(`[${name}] curl failed (status ${status}). Is the server up?\n${url}`);
    process.exit(1);
  }
  const code = firstStatus(out);
  if (code !== wantStatus) {
    console.error(`[${name}] want HTTP ${wantStatus}, got ${code}\n${out.slice(0, 800)}`);
    process.exit(1);
  }
  if (locationNeedle) {
    const loc = headerValue(out, 'Location');
    if (!loc.includes(locationNeedle)) {
      console.error(`[${name}] Location missing "${locationNeedle}": ${loc}`);
      process.exit(1);
    }
  }
}

if (!LIVE) {
  console.log(matrix.trim());
  console.log('\nRun live checks: RUN_PHASE_A_LIVE=1 node scripts/verify-phase-a-redirects.cjs');
  process.exit(0);
}

const nextHost = new URL(NEXT).host;
assertLive('express-root', `${EXPRESS}/`, 308, nextHost);
assertLive('express-workspace', `${EXPRESS}/workspace`, 308, nextHost);
assertLive('express-invoice-savings', `${EXPRESS}/invoice-savings`, 308, nextHost);
assertLive('express-api-config', `${EXPRESS}/api/config`, 200, null);

assertLive('next-workspace', `${NEXT}/workspace`, 308, '/workspace/procurement');
assertLive('next-workspace-slash', `${NEXT}/workspace/`, 308, '/workspace/procurement');

console.log('Phase A live redirect checks: OK');
