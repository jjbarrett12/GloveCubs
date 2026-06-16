'use strict';

/**
 * Phase 1C-auth — operator identity audit (app_admins vs admin_users).
 *
 * Run: node scripts/audit-admin-identity.js
 * Strict (exit 1 on blocking findings): GC_ADMIN_IDENTITY_AUDIT_STRICT=1 node scripts/audit-admin-identity.js
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { getSupabaseAdmin, isSupabaseAdminConfigured } = require('../lib/supabaseAdmin');
const { runAdminIdentityAudit, AUDIT_QUERIES } = require('../lib/admin-identity');

async function main() {
    if (!isSupabaseAdminConfigured()) {
        console.error('audit-admin-identity: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
        process.exit(2);
    }

    const supabase = getSupabaseAdmin();
    const { findings, hasBlockingIssues } = await runAdminIdentityAudit(supabase);

    console.log('=== Admin identity audit (Phase 1C-auth) ===\n');

    const sections = [
        ['appAdminsMissingActiveAdminUsers', 'app_admins without active admin_users (BLOCKING)'],
        ['inactiveAdminUsersWithAppAdmins', 'inactive admin_users still in app_admins (BLOCKING)'],
        ['activeAdminUsersMissingAppAdminsCompat', 'active admin_users missing app_admins compat (WARN)'],
    ];

    for (const [key, label] of sections) {
        const rows = findings[key] || [];
        console.log(`${label}: ${rows.length}`);
        for (const row of rows.slice(0, 20)) {
            console.log(' ', JSON.stringify(row));
        }
        if (rows.length > 20) console.log(`  … and ${rows.length - 20} more`);
        console.log('');
    }

    console.log('Reference SQL (run in Supabase SQL editor if needed):');
    for (const [name, sql] of Object.entries(AUDIT_QUERIES)) {
        console.log(`-- ${name}`);
        console.log(sql.trim());
        console.log('');
    }

    const strict = ['1', 'true', 'yes'].includes(
        String(process.env.GC_ADMIN_IDENTITY_AUDIT_STRICT || '').trim().toLowerCase()
    );

    if (hasBlockingIssues) {
        console.error('audit-admin-identity: blocking identity drift detected');
        if (strict) process.exit(1);
        process.exit(0);
    }

    console.log('audit-admin-identity: OK (no blocking drift)');
}

main().catch((err) => {
    console.error('audit-admin-identity:', err.message || err);
    process.exit(1);
});
