'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  hashPasswordResetToken,
  generatePasswordResetToken,
  generateClaimId,
  isResetTokenClaimable,
  DEFAULT_CLAIM_TTL_MS,
} = require('../lib/passwordResetToken');
const {
  mergePasswordResetAppMetadata,
  isPasswordResetAlreadyCompleted,
  PASSWORD_RESET_APP_METADATA_KEY,
} = require('../lib/passwordResetAuthMarker');

describe('passwordResetToken helpers', () => {
  it('hashes deterministically and never equals the raw token', () => {
    const raw = generatePasswordResetToken();
    const h1 = hashPasswordResetToken(raw);
    assert.equal(h1, hashPasswordResetToken(raw));
    assert.notEqual(h1, raw);
    assert.match(h1, /^[a-f0-9]{64}$/);
  });

  it('rejects empty tokens', () => {
    assert.throws(() => hashPasswordResetToken(''), /password_reset_token_required/);
  });

  it('isResetTokenClaimable rejects consumed / expired / active claim', () => {
    const now = Date.parse('2026-07-27T12:00:00.000Z');
    const base = {
      expires_at: '2026-07-27T13:00:00.000Z',
      consumed_at: null,
      claim_expires_at: null,
    };
    assert.equal(isResetTokenClaimable(base, now), true);
    assert.equal(isResetTokenClaimable({ ...base, consumed_at: '2026-07-27T11:00:00.000Z' }, now), false);
    assert.equal(isResetTokenClaimable({ ...base, expires_at: '2026-07-27T11:00:00.000Z' }, now), false);
    assert.equal(
      isResetTokenClaimable({ ...base, claim_expires_at: '2026-07-27T12:01:00.000Z' }, now),
      false
    );
  });
});

describe('passwordResetAuthMarker', () => {
  it('merges without dropping existing app_metadata keys', () => {
    const merged = mergePasswordResetAppMetadata(
      { role: 'buyer', nested: { a: 1 } },
      { tokenHash: 'abc', claimId: 'c1', completedAt: '2026-07-27T12:00:00.000Z' }
    );
    assert.equal(merged.role, 'buyer');
    assert.deepEqual(merged.nested, { a: 1 });
    assert.equal(merged[PASSWORD_RESET_APP_METADATA_KEY].th, 'abc');
    assert.equal(merged[PASSWORD_RESET_APP_METADATA_KEY].cid, 'c1');
  });

  it('detects completed reset for matching token hash only', () => {
    const meta = mergePasswordResetAppMetadata(
      {},
      { tokenHash: 'hash-a', claimId: 'c', completedAt: 't' }
    );
    assert.equal(isPasswordResetAlreadyCompleted(meta, 'hash-a'), true);
    assert.equal(isPasswordResetAlreadyCompleted(meta, 'hash-b'), false);
    assert.equal(isPasswordResetAlreadyCompleted({}, 'hash-a'), false);
  });

  it('does not use user_metadata key names', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../lib/passwordResetAuthMarker.js'),
      'utf8'
    );
    assert.doesNotMatch(src, /user_metadata/);
    assert.match(src, /app_metadata|PASSWORD_RESET_APP_METADATA_KEY/);
  });
});

/**
 * In-memory machine: claim → consume (retire) → password → marker → finalize
 * On password failure before marker: resurrect.
 */
function createInMemoryResetStore() {
  /** @type {Map<string, object>} */
  const byHash = new Map();
  /** @type {Map<string, object>} auth markers by userId */
  const authMarkers = new Map();
  return {
    authMarkers,
    insert(rawToken, expiresAt, userId = 'u1') {
      const token_hash = hashPasswordResetToken(rawToken);
      byHash.set(token_hash, {
        token_hash,
        token: '',
        expires_at: expiresAt,
        consumed_at: null,
        claim_id: null,
        claimed_at: null,
        claim_expires_at: null,
        email: 'a@example.com',
        user_id: userId,
      });
      return token_hash;
    },
    claim(rawToken, nowMs = Date.now(), ttlMs = DEFAULT_CLAIM_TTL_MS) {
      const token_hash = hashPasswordResetToken(rawToken);
      const row = byHash.get(token_hash);
      if (!isResetTokenClaimable(row, nowMs)) return null;
      if (isPasswordResetAlreadyCompleted(authMarkers.get(row.user_id), token_hash)) return null;
      const claim_id = generateClaimId();
      Object.assign(row, {
        claim_id,
        claimed_at: new Date(nowMs).toISOString(),
        claim_expires_at: new Date(nowMs + ttlMs).toISOString(),
        token: '',
      });
      return { ...row };
    },
    consume(rawToken, claimId) {
      const token_hash = hashPasswordResetToken(rawToken);
      const row = byHash.get(token_hash);
      if (!row || row.consumed_at || row.claim_id !== claimId) return null;
      row.consumed_at = new Date().toISOString();
      row.token = '';
      return { id: 'ok', claim_id: claimId, token_hash };
    },
    resurrect(rawToken, claimId) {
      const token_hash = hashPasswordResetToken(rawToken);
      const row = byHash.get(token_hash);
      if (!row || !row.consumed_at || row.claim_id !== claimId) return null;
      row.consumed_at = null;
      row.claim_id = null;
      row.claimed_at = null;
      row.claim_expires_at = null;
      row.token = '';
      return { id: 'ok' };
    },
    finalize(rawToken, claimId) {
      const token_hash = hashPasswordResetToken(rawToken);
      const row = byHash.get(token_hash);
      if (!row || !row.consumed_at || row.claim_id !== claimId) return null;
      row.claim_id = null;
      row.claimed_at = null;
      row.claim_expires_at = null;
      return { id: 'ok' };
    },
    writeAuthMarker(userId, tokenHash, claimId) {
      authMarkers.set(
        userId,
        mergePasswordResetAppMetadata(authMarkers.get(userId) || { keep: true }, {
          tokenHash,
          claimId,
          completedAt: new Date().toISOString(),
        })
      );
    },
    get(rawToken) {
      return byHash.get(hashPasswordResetToken(rawToken));
    },
  };
}

describe('password reset claim/consume/resurrect state machine', () => {
  it('success: consume before password; marker blocks replay after claim expiry', () => {
    const store = createInMemoryResetStore();
    const raw = generatePasswordResetToken();
    const now = Date.now();
    const th = store.insert(raw, new Date(now + 3600000).toISOString());
    const claimed = store.claim(raw, now);
    assert.ok(claimed);
    assert.ok(store.consume(raw, claimed.claim_id));
    // password ok
    store.writeAuthMarker(claimed.user_id, th, claimed.claim_id);
    store.finalize(raw, claimed.claim_id);
    // claim expired window
    const later = now + DEFAULT_CLAIM_TTL_MS + 10_000;
    assert.equal(store.claim(raw, later), null);
    assert.ok(store.get(raw).consumed_at);
  });

  it('password-update failure resurrects and allows retry', () => {
    const store = createInMemoryResetStore();
    const raw = generatePasswordResetToken();
    const now = Date.now();
    store.insert(raw, new Date(now + 3600000).toISOString());
    const claimed = store.claim(raw, now);
    assert.ok(store.consume(raw, claimed.claim_id));
    // password fails → resurrect
    assert.ok(store.resurrect(raw, claimed.claim_id));
    assert.equal(store.get(raw).consumed_at, null);
    const retry = store.claim(raw, now + 1000);
    assert.ok(retry);
    assert.ok(store.consume(raw, retry.claim_id));
    store.writeAuthMarker(retry.user_id, hashPasswordResetToken(raw), retry.claim_id);
    assert.equal(store.claim(raw, now + 2000), null);
  });

  it('consume failure after password+marker still blocks replay (crash-equivalent)', () => {
    const store = createInMemoryResetStore();
    const raw = generatePasswordResetToken();
    const now = Date.now();
    const th = store.insert(raw, new Date(now + 3600000).toISOString());
    // Simulate legacy/partial: password+marker written, row left unconsumed, claim expired
    store.writeAuthMarker('u1', th, 'old-claim');
    const row = store.get(raw);
    row.claim_id = null;
    row.claim_expires_at = null;
    row.consumed_at = null;
    assert.equal(store.claim(raw, now + 60_000), null);
  });

  it('concurrent claims: only one succeeds', () => {
    const store = createInMemoryResetStore();
    const raw = generatePasswordResetToken();
    const now = Date.now();
    store.insert(raw, new Date(now + 3600000).toISOString());
    const a = store.claim(raw, now);
    const b = store.claim(raw, now);
    assert.ok(a);
    assert.equal(b, null);
  });

  it('never persists plaintext token', () => {
    const store = createInMemoryResetStore();
    const raw = generatePasswordResetToken();
    store.insert(raw, new Date(Date.now() + 3600000).toISOString());
    const c = store.claim(raw);
    store.consume(raw, c.claim_id);
    assert.equal(store.get(raw).token, '');
  });
});
