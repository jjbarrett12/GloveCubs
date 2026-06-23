/**
 * Verify legacy Express warehouse mutation routes return 410 Gone.
 * Usage: node scripts/verify-legacy-warehouse-410.mjs [API_BASE]
 * Env: SMOKE_ADMIN_JWT or SMOKE_USER_EMAIL + SMOKE_USER_PASSWORD
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API_BASE = (process.argv[2] || process.env.API_BASE || 'http://127.0.0.1:3004').replace(/\/$/, '');
const EXPECTED = 'This warehouse action has moved to the native admin workflow.';

async function loginToken() {
  if (process.env.SMOKE_ADMIN_JWT) return process.env.SMOKE_ADMIN_JWT;
  const email = process.env.SMOKE_USER_EMAIL;
  const password = process.env.SMOKE_USER_PASSWORD;
  if (!email || !password) return null;
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => ({}));
  return res.ok && json.token ? json.token : null;
}

async function check(name, init) {
  const res = await fetch(`${API_BASE}${init.path}`, {
    method: init.method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${init.token}`,
    },
    body: init.body != null ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  const pass =
    res.status === 410 &&
    json.error === EXPECTED &&
    json.code === 'WAREHOUSE_NATIVE_MIGRATION';
  return { name, pass, status: res.status, code: json.code, error: json.error };
}

const token = await loginToken();
if (!token) {
  console.error(JSON.stringify({ ok: false, error: 'No admin JWT (set SMOKE_ADMIN_JWT or SMOKE_USER_*)' }));
  process.exit(2);
}

const checks = await Promise.all([
  check('PUT /api/admin/inventory/:id', {
    method: 'PUT',
    path: '/api/admin/inventory/00000000-0000-4000-8000-000000000001',
    token,
    body: { quantity_on_hand: 1 },
  }),
  check('POST /api/admin/inventory/adjust', {
    method: 'POST',
    path: '/api/admin/inventory/adjust',
    token,
    body: { product_id: '00000000-0000-4000-8000-000000000001', delta: 1 },
  }),
  check('POST /api/admin/inventory/cycle', {
    method: 'POST',
    path: '/api/admin/inventory/cycle',
    token,
    body: { counts: [] },
  }),
  check('POST /api/admin/purchase-orders/:id/receive', {
    method: 'POST',
    path: '/api/admin/purchase-orders/1/receive',
    token,
    body: { lines: [{ catalog_variant_id: '00000000-0000-4000-8000-000000000010', quantity_received: 1 }] },
  }),
  check('POST /api/fishbowl/sync-inventory', {
    method: 'POST',
    path: '/api/fishbowl/sync-inventory',
    token,
    body: {},
  }),
]);

const ok = checks.every((c) => c.pass);
console.log(JSON.stringify({ ok, api: API_BASE, checks }, null, 2));
process.exit(ok ? 0 : 1);
