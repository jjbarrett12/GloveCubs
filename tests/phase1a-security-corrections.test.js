'use strict';

/**
 * Phase 1A source guards for review-blocker corrections.
 * Supplemental only — not live JWT/RLS proof.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('phase1a corrective migration (source)', () => {
  const sql = () => read('supabase/migrations/20261227120500_phase1a_security_blockers.sql');

  it('revokes authenticated order INSERT and drops insert policy', () => {
    const s = sql();
    assert.match(s, /DROP POLICY IF EXISTS gc_orders_insert/);
    assert.match(s, /REVOKE INSERT, UPDATE, DELETE ON TABLE gc_commerce\.orders FROM authenticated/);
    assert.match(s, /REVOKE INSERT, UPDATE, DELETE ON TABLE gc_commerce\.order_lines FROM authenticated/);
    assert.doesNotMatch(s, /CREATE POLICY gc_orders_insert/);
  });

  it('revokes authenticated membership writes', () => {
    const s = sql();
    assert.match(s, /DROP POLICY IF EXISTS gc_company_members_insert_owner_admin/);
    assert.match(s, /DROP POLICY IF EXISTS gc_company_members_update_owner_admin/);
    assert.match(s, /DROP POLICY IF EXISTS gc_company_members_delete_owner_admin/);
    assert.match(s, /REVOKE INSERT, UPDATE, DELETE ON TABLE gc_commerce\.company_members FROM authenticated/);
  });

  it('replaces quote_status_history USING \(true\) with admin policy', () => {
    const s = sql();
    assert.match(s, /DROP POLICY IF EXISTS admin_all_quote_status_history/);
    assert.match(s, /catalogos_quote_status_history_admin_all/);
    assert.match(s, /public\.is_active_admin\(\)/);
    assert.doesNotMatch(s, /USING \(true\)/);
  });

  it('nulls cost on legacy product views and isolates internal cost view', () => {
    const s = sql();
    assert.match(s, /NULL::numeric AS cost/);
    assert.match(s, /v_products_legacy_shape_internal/);
    assert.match(s, /REVOKE ALL ON TABLE catalog_v2\.v_products_legacy_shape_internal FROM authenticated/);
    assert.match(s, /REVOKE ALL ON TABLE catalog_v2\.v_products_legacy_shape FROM anon/);
  });

  it('adds reset claim columns', () => {
    const s = sql();
    assert.match(s, /claim_id/);
    assert.match(s, /claim_expires_at/);
  });

  it('tightens ship-to delete and invoice hard-delete', () => {
    const s = sql();
    assert.match(s, /DROP POLICY IF EXISTS gc_ship_to_delete/);
    assert.match(s, /REVOKE DELETE ON TABLE gc_commerce\.ship_to_addresses FROM authenticated/);
    assert.match(s, /DROP POLICY IF EXISTS gc_uploaded_invoices_delete/);
  });
});

describe('phase1a password reset app flow (source)', () => {
  it('claims, consumes before applyPasswordReset; resurrects only on pre-success failure', () => {
    const server = read('server.js');
    assert.match(server, /claimPasswordResetToken/);
    assert.match(server, /consumePasswordResetClaim/);
    assert.match(server, /applyPasswordReset/);
    assert.match(server, /resurrectPasswordResetClaim/);
    assert.match(server, /hasCompletedPasswordResetForToken/);
    assert.match(server, /forceInvalidatePasswordResetToken/);
    const idxConsume = server.indexOf('consumePasswordResetClaim');
    const idxApply = server.indexOf('applyPasswordReset');
    assert.ok(idxConsume > 0 && idxApply > idxConsume);
  });

  it('does not restore consume-after-update-only without marker', () => {
    const server = read('server.js');
    assert.doesNotMatch(server, /updateUser\(user\.id, \{ password_hash \}/);
    assert.match(server, /app_metadata|applyPasswordReset/);
  });
});

describe('phase1b durable replay guards (source)', () => {
  it('uses Auth app_metadata marker helpers, not user_metadata', () => {
    const marker = read('lib/passwordResetAuthMarker.js');
    const users = read('services/usersService.js');
    assert.match(marker, /PASSWORD_RESET_APP_METADATA_KEY/);
    assert.doesNotMatch(marker, /user_metadata/);
    assert.match(users, /auth\.admin\.updateUserById/);
    assert.match(users, /mergePasswordResetAppMetadata/);
    assert.match(users, /app_metadata/);
    assert.doesNotMatch(users, /user_metadata.*gc_password_reset|gc_password_reset.*user_metadata/);
  });
});

describe('phase1a onboarding signing auth (source)', () => {
  it('requires admin or scoped token before signing', () => {
    const src = read('catalogos/src/app/actions/onboarding.ts');
    assert.match(src, /assertCatalogosAdminAction/);
    assert.match(src, /ONBOARDING_SIGNED_URL_TTL_SEC/);
    assert.match(src, /getOnboardingRequestByAccessToken/);
  });
});

describe('phase1 sensitive USING(true) residual scan (source of Phase1A+Phase1 migrations)', () => {
  it('phase1a migration body has no USING (true)', () => {
    const s = read('supabase/migrations/20261227120500_phase1a_security_blockers.sql');
    assert.doesNotMatch(s, /USING\s*\(\s*true\s*\)/i);
    assert.doesNotMatch(s, /WITH CHECK\s*\(\s*true\s*\)/i);
  });
});
