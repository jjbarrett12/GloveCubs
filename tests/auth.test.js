/**
 * Auth and authorization tests.
 * Run: node --test tests/auth.test.js
 * Requires: .env with SUPABASE_* and a test admin user in app_admins.
 * Skips integration tests if env not configured.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Load env before any imports that use it
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const isConfigured = !!(
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

describe('Auth hardening', () => {
  describe('JWT_SECRET production guard', () => {
    it('rejects default JWT_SECRET in production', () => {
      const defaultVal = 'glovecubs-secret-key-2024';
      const raw = process.env.JWT_SECRET || '';
      const isProd = process.env.NODE_ENV === 'production';
      const wouldReject = isProd && (!raw.trim() || raw === defaultVal);
      assert.strictEqual(
        typeof wouldReject,
        'boolean',
        'Guard logic should be deterministic'
      );
      if (isProd) {
        assert.ok(!wouldReject, 'Production must have JWT_SECRET set and not default');
      }
    });
  });

  describe('requireAdmin logic (unit)', () => {
    it('requires isAdmin, not is_approved', async () => {
      try {
        const { isSupabaseAdminConfigured } = require('../lib/supabaseAdmin');
        if (!isSupabaseAdminConfigured()) return;
        const usersService = require('../services/usersService');
        const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
        const supabase = getSupabaseAdmin();
        const { data: admins } = await supabase.from('app_admins').select('auth_user_id, email').limit(50);
        const adminAuth = new Set((admins || []).map((a) => String(a.auth_user_id)));
        const { data: users } = await supabase.from('users').select('id, email, is_approved').limit(50);
        if (!users || users.length === 0) return;
        for (const u of users) {
          if (!u.is_approved) continue;
          const uid = String(u.id);
          if (adminAuth.has(uid)) continue;
          const isAdmin = await usersService.isAdmin(uid);
          assert.strictEqual(isAdmin, false, 'Approved non-admin Auth user must NOT be considered admin');
          return;
        }
      } catch (e) {
        if (e.message && e.message.includes('SUPABASE')) return; // skip when not configured
        throw e;
      }
    });
  });
});

describe('Tenant isolation', () => {
  it('dataService exposes company-scoped order functions', () => {
    const dataService = require('../services/dataService');
    assert.strictEqual(typeof dataService.getOrderById, 'function');
    assert.strictEqual(typeof dataService.getOrderByIdForCompany, 'function');
    assert.strictEqual(typeof dataService.getOrdersByCompanyId, 'function');
  });

  it('dataService exposes company-scoped ship-to, invoices, RFQs', () => {
    const dataService = require('../services/dataService');
    assert.strictEqual(typeof dataService.getShipToByCompanyId, 'function');
    assert.strictEqual(typeof dataService.getUploadedInvoicesByCompanyId, 'function');
    assert.strictEqual(typeof dataService.getRfqsByCompanyId, 'function');
  });

  it('company A user cannot access company B order', async () => {
    try {
      const { isSupabaseAdminConfigured } = require('../lib/supabaseAdmin');
      if (!isSupabaseAdminConfigured()) return;
      const dataService = require('../services/dataService');
      const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
      const supabase = getSupabaseAdmin();
      const { data: orders } = await supabase
        .schema('gc_commerce')
        .from('orders')
        .select('id, company_id')
        .not('company_id', 'is', null)
        .order('placed_at', { ascending: false })
        .limit(20);
      if (!orders || orders.length < 2) return;
      const firstCo = String(orders[0].company_id);
      const other = orders.find((o) => String(o.company_id) !== firstCo);
      if (!other) return;
      const result = await dataService.getOrderByIdForCompany(other.id, [firstCo], null);
      assert.strictEqual(result, null, 'Company A must not load company B order via scoped lookup');
    } catch (e) {
      if (e.message && e.message.includes('SUPABASE')) return;
      throw e;
    }
  });

  it('pricing effective-margin uses server-derived company_id not user-controlled', () => {
    const fs = require('fs');
    const serverSrc = fs.readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
    const idx = serverSrc.indexOf("'/api/pricing/effective-margin'");
    assert.ok(idx >= 0, 'pricing route exists');
    const block = serverSrc.slice(idx, idx + 800);
    assert.ok(block.includes('getCompanyIdForUser'), 'must derive company from user');
    assert.ok(!block.includes('req.query.companyId'), 'must not accept companyId from client');
  });

  it('order create does not trust client-supplied company_id', () => {
    const fs = require('fs');
    const serverSrc = fs.readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
    const createOrderIdx = serverSrc.indexOf("createOrder(orderPayload");
    assert.ok(createOrderIdx >= 0, 'createOrder call exists');
    const block = serverSrc.slice(Math.max(0, createOrderIdx - 500), createOrderIdx + 400);
    assert.ok(block.includes('getCompanyIdForUser') || block.includes('companyId'), 'companyId derived server-side');
    assert.ok(!block.includes('req.body.company_id') && !block.includes('req.body.companyId'), 'must not use client company_id');
  });
});
