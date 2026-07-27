'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  hashPasswordResetToken,
  generatePasswordResetToken,
} = require('../lib/passwordResetToken');

describe('passwordResetToken', () => {
  it('hashes deterministically and never equals the raw token', () => {
    const raw = 'a'.repeat(64);
    const h1 = hashPasswordResetToken(raw);
    const h2 = hashPasswordResetToken(raw);
    assert.equal(h1, h2);
    assert.notEqual(h1, raw);
    assert.match(h1, /^[a-f0-9]{64}$/);
  });

  it('rejects empty tokens', () => {
    assert.throws(() => hashPasswordResetToken(''), /password_reset_token_required/);
    assert.throws(() => hashPasswordResetToken(null), /password_reset_token_required/);
  });

  it('generates high-entropy hex tokens', () => {
    const a = generatePasswordResetToken();
    const b = generatePasswordResetToken();
    assert.match(a, /^[a-f0-9]{64}$/);
    assert.notEqual(a, b);
    assert.notEqual(hashPasswordResetToken(a), a);
  });

  it('different inputs produce different digests', () => {
    assert.notEqual(hashPasswordResetToken('token-a'), hashPasswordResetToken('token-b'));
  });
});
