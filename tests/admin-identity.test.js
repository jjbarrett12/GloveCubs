/**
 * Phase 1C-auth — admin allowlist convergence (unit + optional integration).
 * Run: node --test tests/admin-identity.test.js
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
    resolveAdminAllowlistDecision,
    AUDIT_QUERIES,
} = require('../lib/admin-identity');

describe('resolveAdminAllowlistDecision', () => {
    it('allows active admin_users', () => {
        const r = resolveAdminAllowlistDecision({
            adminUser: { is_active: true },
            appAdmin: null,
        });
        assert.equal(r.allowed, true);
        assert.equal(r.source, 'admin_users');
    });

    it('rejects inactive admin_users even when app_admins exists', () => {
        const r = resolveAdminAllowlistDecision({
            adminUser: { is_active: false },
            appAdmin: { auth_user_id: 'x' },
        });
        assert.equal(r.allowed, false);
        assert.equal(r.source, 'admin_users_inactive');
    });

    it('allows app_admins compat when admin_users row is absent', () => {
        const r = resolveAdminAllowlistDecision({
            adminUser: null,
            appAdmin: { auth_user_id: 'x' },
        });
        assert.equal(r.allowed, true);
        assert.equal(r.source, 'app_admins_compat');
    });

    it('rejects when neither table matches', () => {
        const r = resolveAdminAllowlistDecision({
            adminUser: null,
            appAdmin: null,
        });
        assert.equal(r.allowed, false);
        assert.equal(r.source, null);
    });
});

describe('AUDIT_QUERIES', () => {
    it('defines expected audit SQL fragments', () => {
        assert.ok(AUDIT_QUERIES.appAdminsMissingActiveAdminUsers.includes('app_admins'));
        assert.ok(AUDIT_QUERIES.appAdminsMissingActiveAdminUsers.includes('admin_users'));
        assert.ok(AUDIT_QUERIES.inactiveAdminUsersWithAppAdmins.includes('is_active'));
    });
});

describe('audit-admin-identity script', () => {
    it('loads without throwing when Supabase is unset (exit 2)', () => {
        const script = path.join(__dirname, '..', 'scripts', 'audit-admin-identity.js');
        try {
            execFileSync(process.execPath, [script], {
                cwd: path.join(__dirname, '..'),
                env: { ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            assert.fail('expected exit 2');
        } catch (e) {
            assert.equal(e.status, 2);
        }
    });
});

describe('usersService.isAdmin (integration, optional)', () => {
    it('uses admin_users when configured', async () => {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;

        const usersService = require('../services/usersService');
        const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
        const supabase = getSupabaseAdmin();

        const { data: activeAdmin } = await supabase
            .from('admin_users')
            .select('id')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

        if (activeAdmin?.id) {
            const ok = await usersService.isAdmin(String(activeAdmin.id));
            assert.equal(ok, true);
            return;
        }

        const { data: compatOnly } = await supabase.from('app_admins').select('auth_user_id').limit(1).maybeSingle();
        if (compatOnly?.auth_user_id) {
            const ok = await usersService.isAdmin(String(compatOnly.auth_user_id));
            assert.equal(ok, true);
        }
    });

    it('rejects random uuid not in allowlist', async () => {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
        const usersService = require('../services/usersService');
        const ok = await usersService.isAdmin('00000000-0000-4000-8000-000000000099');
        assert.equal(ok, false);
    });
});
