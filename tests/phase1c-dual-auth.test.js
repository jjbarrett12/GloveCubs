'use strict';

/**
 * Phase 1C dual-auth elimination tests (behavioral + source guards).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  PASSWORD_HASH_DEPRECATED_SENTINEL,
  isDeprecatedPasswordHashSentinel,
  authenticateCustomerPassword,
} = require('../lib/supabasePasswordAuth');
const {
  mergePasswordResetAppMetadata,
  isPasswordResetAlreadyCompleted,
} = require('../lib/passwordResetAuthMarker');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function mockAuthClient({ userId = null, email = null, error = null } = {}) {
  return {
    auth: {
      async signInWithPassword() {
        if (error || !userId) return { data: { user: null }, error: error || { message: 'invalid' } };
        return { data: { user: { id: userId, email: email || 'buyer@example.com' } }, error: null };
      },
      async signOut() {
        return { error: null };
      },
    },
  };
}

describe('supabasePasswordAuth helpers', () => {
  it('exposes a non-authenticating sentinel', () => {
    assert.ok(PASSWORD_HASH_DEPRECATED_SENTINEL.startsWith('!'));
    assert.equal(isDeprecatedPasswordHashSentinel(PASSWORD_HASH_DEPRECATED_SENTINEL), true);
    assert.equal(isDeprecatedPasswordHashSentinel('$2a$10$abcdefghijk'), false);
  });

  it('authenticateCustomerPassword rejects empty credentials without calling network', async () => {
    const r = await authenticateCustomerPassword('', '');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'missing_credentials');
  });

  it('correct Auth password returns Auth UUID (mock)', async () => {
    const r = await authenticateCustomerPassword('Buyer@Example.com', 'new-pass', {
      client: mockAuthClient({ userId: '11111111-1111-4111-8111-111111111111', email: 'buyer@example.com' }),
    });
    assert.equal(r.ok, true);
    assert.equal(r.userId, '11111111-1111-4111-8111-111111111111');
    assert.equal(r.email, 'buyer@example.com');
  });

  it('incorrect Auth password fails even if a stale bcrypt hash would match (mock)', async () => {
    const r = await authenticateCustomerPassword('buyer@example.com', 'stale-bcrypt-password', {
      client: mockAuthClient({ error: { message: 'Invalid login credentials' } }),
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'invalid_credentials');
  });
});

describe('phase1c Express login (source)', () => {
  it('uses Supabase password auth and never bcrypt.compare on login', () => {
    const server = read('server.js');
    const loginIdx = server.indexOf("app.post('/api/auth/login'");
    const nextRoute = server.indexOf("app.get('/api/auth/me'");
    assert.ok(loginIdx > 0 && nextRoute > loginIdx);
    const loginBlock = server.slice(loginIdx, nextRoute);
    assert.match(loginBlock, /authenticateCustomerPassword/);
    assert.doesNotMatch(loginBlock, /bcrypt\.compare/);
    assert.doesNotMatch(loginBlock, /from\(['"]users['"]\).*password/);
    assert.match(loginBlock, /authResult\.userId/);
    assert.match(loginBlock, /jwt\.sign/);
    assert.match(loginBlock, /id:\s*authSubject/);
  });

  it('does not fall back to custom-hash validation after Auth rejection', () => {
    const login = read('lib/supabasePasswordAuth.js');
    assert.doesNotMatch(login, /require\(['"]bcrypt/);
    assert.doesNotMatch(login, /bcrypt\./);
    assert.doesNotMatch(login, /compare\(/);
    assert.match(login, /signInWithPassword/);
  });

  it('login route does not log password or access token fields', () => {
    const server = read('server.js');
    const loginBlock = server.slice(
      server.indexOf("app.post('/api/auth/login'"),
      server.indexOf("app.get('/api/auth/me'")
    );
    assert.doesNotMatch(loginBlock, /console\.(log|error|info|warn)\([^)]*\bpassword\b\s*[,)]/);
    assert.doesNotMatch(loginBlock, /console\.(log|error|info|warn)\([^)]*req\.body/);
    assert.doesNotMatch(loginBlock, /access_token/);
    assert.doesNotMatch(loginBlock, /refresh_token/);
  });
});

describe('phase1c password reset (source)', () => {
  it('applyPasswordReset updates Auth only — no public.users credential write', () => {
    const users = read('services/usersService.js');
    const start = users.indexOf('async function applyPasswordReset');
    const end = users.indexOf('async function hasCompletedPasswordResetForToken');
    assert.ok(start > 0 && end > start);
    const fn = users.slice(start, end);
    assert.match(fn, /auth\.admin\.updateUserById/);
    assert.doesNotMatch(fn, /from\('users'\)\.update/);
    assert.doesNotMatch(fn, /password_hash/);
    assert.match(fn, /mergePasswordResetAppMetadata/);
  });

  it('Auth failure path sets passwordUpdated false (resurrectable)', () => {
    const users = read('services/usersService.js');
    assert.match(users, /passwordUpdated = false/);
  });

  it('reset route returns success only when Auth path succeeds or Auth already updated', () => {
    const server = read('server.js');
    const block = server.slice(
      server.indexOf("app.post('/api/auth/reset-password'"),
      server.indexOf('// ============ PRODUCT ROUTES')
    );
    assert.match(block, /applyErr\.passwordUpdated/);
    assert.match(block, /resurrectPasswordResetClaim/);
    assert.doesNotMatch(block, /bcrypt/);
  });
});

describe('phase1c user creation (source)', () => {
  it('writes sentinel credential column and Auth password from plain_password', () => {
    const users = read('services/usersService.js');
    const start = users.indexOf('async function createUser');
    const end = users.indexOf('async function updateUser');
    const fn = users.slice(start, end);
    assert.match(fn, /PASSWORD_HASH_DEPRECATED_SENTINEL/);
    assert.match(fn, /auth\.admin\.createUser/);
    assert.doesNotMatch(fn, /bcrypt/);
  });

  it('register and admin create pass plain_password without bcrypt.hash', () => {
    const server = read('server.js');
    assert.match(server, /plain_password: password/);
    const reg = server.slice(
      server.indexOf("app.post('/api/auth/register'"),
      server.indexOf("app.post('/api/auth/login'")
    );
    assert.doesNotMatch(reg, /bcrypt\.hash/);
  });

  it('bootstrap-admin does not create a usable bcrypt parallel credential', () => {
    const boot = read('scripts/bootstrap-admin.js');
    assert.doesNotMatch(boot, /bcrypt/);
    assert.match(boot, /PASSWORD_HASH_DEPRECATED_SENTINEL/);
    assert.match(boot, /plain_password/);
  });
});

describe('phase1c storefront recovery (source)', () => {
  it('native recovery updates Auth password only', () => {
    const reset = read('storefront/src/app/login/reset/ResetPasswordClient.tsx');
    assert.match(reset, /updateUser\(\{\s*password/);
    assert.doesNotMatch(reset, /password_hash/);
    assert.doesNotMatch(reset, /glovecubs.*reset-password|\/api\/auth\/reset-password/);
  });
});

describe('phase1c marker still blocks replay', () => {
  it('latest marker invalidates matching token hash only and preserves other metadata', () => {
    const meta = mergePasswordResetAppMetadata({ keep: 1, role: 'x' }, {
      tokenHash: 'hash-new',
      claimId: 'c',
      completedAt: 't',
    });
    assert.equal(meta.keep, 1);
    assert.equal(meta.role, 'x');
    assert.equal(isPasswordResetAlreadyCompleted(meta, 'hash-new'), true);
    assert.equal(isPasswordResetAlreadyCompleted(meta, 'hash-old'), false);
  });
});

describe('phase1c docs and audit artifacts', () => {
  it('ships canonical authority doc and identity audit SQL', () => {
    assert.ok(fs.existsSync(path.join(root, 'docs/security/CANONICAL_PASSWORD_AUTHORITY.md')));
    assert.ok(fs.existsSync(path.join(root, 'scripts/sql/auth-identity-dual-password-audit.sql')));
    const doc = read('docs/security/CANONICAL_PASSWORD_AUTHORITY.md');
    assert.match(doc, /Supabase Auth/);
    assert.match(doc, /no bcrypt fallback/i);
  });
});
