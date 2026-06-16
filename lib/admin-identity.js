'use strict';

/**
 * Phase 1C-auth — canonical operator allowlist (public.admin_users).
 * Express isAdmin and Next /admin both converge on admin_users; app_admins is transitional.
 */

/**
 * Pure allowlist decision (unit-testable).
 *
 * @param {{ adminUser?: { is_active?: boolean } | null, appAdmin?: object | null }} input
 * @returns {{ allowed: boolean, source: 'admin_users' | 'admin_users_inactive' | 'app_admins_compat' | null }}
 */
function resolveAdminAllowlistDecision({ adminUser, appAdmin }) {
    if (adminUser) {
        if (adminUser.is_active) {
            return { allowed: true, source: 'admin_users' };
        }
        return { allowed: false, source: 'admin_users_inactive' };
    }
    if (appAdmin) {
        return { allowed: true, source: 'app_admins_compat' };
    }
    return { allowed: false, source: null };
}

/** SQL audit fragments — run via scripts/audit-admin-identity.js */
const AUDIT_QUERIES = {
    appAdminsMissingActiveAdminUsers: `
        SELECT a.auth_user_id, a.email AS app_admins_email
        FROM public.app_admins a
        LEFT JOIN public.admin_users u ON u.id = a.auth_user_id AND u.is_active = true
        WHERE a.auth_user_id IS NOT NULL AND u.id IS NULL
        ORDER BY a.created_at NULLS LAST
    `,
    inactiveAdminUsersWithAppAdmins: `
        SELECT u.id, u.email, u.is_active
        FROM public.admin_users u
        INNER JOIN public.app_admins a ON a.auth_user_id = u.id
        WHERE u.is_active IS NOT TRUE
        ORDER BY u.created_at NULLS LAST
    `,
    activeAdminUsersMissingAuthUser: `
        SELECT u.id, u.email
        FROM public.admin_users u
        LEFT JOIN auth.users au ON au.id = u.id
        WHERE u.is_active = true AND au.id IS NULL
        ORDER BY u.created_at NULLS LAST
    `,
    activeAdminUsersMissingAppAdminsCompat: `
        SELECT u.id, u.email
        FROM public.admin_users u
        LEFT JOIN public.app_admins a ON a.auth_user_id = u.id
        WHERE u.is_active = true AND a.auth_user_id IS NULL
        ORDER BY u.created_at NULLS LAST
    `,
};

/**
 * Grant canonical operator access: admin_users first, then app_admins compat mirror.
 * One-direction sync — avoids drift from granting app_admins alone.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase service role
 * @param {{ id: string, email?: string | null }} operator auth.users.id
 */
async function grantCanonicalAdminOperator(supabase, operator) {
    const id = String(operator.id || '').trim();
    if (!id) throw new Error('grantCanonicalAdminOperator: id required');

    const email = operator.email != null ? String(operator.email).trim() || null : null;

    let { error: adminErr } = await supabase
        .from('admin_users')
        .upsert(email ? { id, is_active: true, email } : { id, is_active: true }, { onConflict: 'id' });
    if (adminErr && email && /email/i.test(adminErr.message || '')) {
        ({ error: adminErr } = await supabase
            .from('admin_users')
            .upsert({ id, is_active: true }, { onConflict: 'id' }));
    }
    if (adminErr) throw new Error(`admin_users upsert: ${adminErr.message}`);

    const compatRow = { auth_user_id: id };
    if (email) compatRow.email = email;

    const { error: compatErr } = await supabase.from('app_admins').upsert(compatRow, { onConflict: 'auth_user_id' });
    if (compatErr) throw new Error(`app_admins compat upsert: ${compatErr.message}`);

    return { id, email };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{ findings: Record<string, unknown[]>, hasBlockingIssues: boolean }>}
 */
async function runAdminIdentityAudit(supabase) {
    const { data: appAdmins, error: e1 } = await supabase
        .from('app_admins')
        .select('auth_user_id, email, created_at');
    if (e1) throw new Error(`audit app_admins: ${e1.message}`);

    const { data: adminUsers, error: e2 } = await supabase
        .from('admin_users')
        .select('id, is_active, created_at');
    if (e2) throw new Error(`audit admin_users: ${e2.message}`);

    const appAdminIds = new Set((appAdmins || []).map((a) => String(a.auth_user_id)).filter(Boolean));
    const activeAdminIds = new Set(
        (adminUsers || []).filter((u) => u.is_active).map((u) => String(u.id))
    );

    const findings = {
        appAdminsMissingActiveAdminUsers: (appAdmins || []).filter(
            (a) => a.auth_user_id && !activeAdminIds.has(String(a.auth_user_id))
        ),
        inactiveAdminUsersWithAppAdmins: (adminUsers || []).filter(
            (u) => !u.is_active && appAdminIds.has(String(u.id))
        ),
        activeAdminUsersMissingAppAdminsCompat: (adminUsers || []).filter(
            (u) => u.is_active && !appAdminIds.has(String(u.id))
        ),
    };

    const hasBlockingIssues =
        findings.appAdminsMissingActiveAdminUsers.length > 0 ||
        findings.inactiveAdminUsersWithAppAdmins.length > 0;

    return { findings, hasBlockingIssues };
}

module.exports = {
    resolveAdminAllowlistDecision,
    grantCanonicalAdminOperator,
    runAdminIdentityAudit,
    AUDIT_QUERIES,
};
