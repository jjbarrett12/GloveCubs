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
    assert.equal(
      isResetTokenClaimable({ ...base, claim_expires_at: '2026-07-27T11:59:00.000Z' }, now),
      true
    );
  });
});

/**
 * In-memory claim/consume/release machine mirroring dataService semantics.
 */
function createInMemoryResetStore() {
  /** @type {Map<string, object>} */
  const byHash = new Map();
  return {
    insert(rawToken, expiresAt) {
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
        user_id: 'u1',
      });
      return token_hash;
    },
    claim(rawToken, nowMs = Date.now(), ttlMs = DEFAULT_CLAIM_TTL_MS) {
      const token_hash = hashPasswordResetToken(rawToken);
      const row = byHash.get(token_hash);
      if (!isResetTokenClaimable(row, nowMs)) return null;
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
      row.claim_id = null;
      row.claimed_at = null;
      row.claim_expires_at = null;
      row.token = '';
      return { id: 'ok' };
    },
    release(rawToken, claimId) {
      const token_hash = hashPasswordResetToken(rawToken);
      const row = byHash.get(token_hash);
      if (!row || row.consumed_at || row.claim_id !== claimId) return null;
      row.claim_id = null;
      row.claimed_at = null;
      row.claim_expires_at = null;
      row.token = '';
      return { id: 'ok' };
    },
    get(rawToken) {
      return byHash.get(hashPasswordResetToken(rawToken));
    },
  };
}

describe('password reset claim state machine', () => {
  it('success path consumes after update simulation', () => {
    const store = createInMemoryResetStore();
    const raw = generatePasswordResetToken();
    store.insert(raw, new Date(Date.now() + 3600000).toISOString());
    const claimed = store.claim(raw);
    assert.ok(claimed?.claim_id);
    // simulate password update ok
    const consumed = store.consume(raw, claimed.claim_id);
    assert.ok(consumed);
    assert.ok(store.get(raw).consumed_at);
    assert.equal(store.claim(raw), null);
  });

  it('password-update failure releases claim for retry', () => {
    const store = createInMemoryResetStore();
    const raw = generatePasswordResetToken();
    store.insert(raw, new Date(Date.now() + 3600000).toISOString());
    const claimed = store.claim(raw);
    assert.ok(claimed);
    // simulate update failure → release
    assert.ok(store.release(raw, claimed.claim_id));
    const retry = store.claim(raw);
    assert.ok(retry?.claim_id);
    assert.notEqual(retry.claim_id, claimed.claim_id);
  });

  it('concurrent claims: only one succeeds while claim live', () => {
    const store = createInMemoryResetStore();
    const raw = generatePasswordResetToken();
    const now = Date.now();
    store.insert(raw, new Date(now + 3600000).toISOString());
    const a = store.claim(raw, now);
    const b = store.claim(raw, now);
    assert.ok(a);
    assert.equal(b, null);
    assert.ok(store.consume(raw, a.claim_id));
    assert.equal(store.claim(raw, now + 1000), null);
  });

  it('never persists plaintext token in store rows', () => {
    const store = createInMemoryResetStore();
    const raw = generatePasswordResetToken();
    store.insert(raw, new Date(Date.now() + 3600000).toISOString());
    const claimed = store.claim(raw);
    store.consume(raw, claimed.claim_id);
    assert.equal(store.get(raw).token, '');
    assert.notEqual(store.get(raw).token_hash, raw);
  });

  it('expired and invalid tokens fail', () => {
    const store = createInMemoryResetStore();
    const raw = generatePasswordResetToken();
    const now = Date.now();
    store.insert(raw, new Date(now - 1000).toISOString());
    assert.equal(store.claim(raw, now), null);
    assert.equal(store.claim('not-a-real-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', now), null);
  });
});
