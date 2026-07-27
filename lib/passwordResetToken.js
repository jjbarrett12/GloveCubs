'use strict';

const crypto = require('crypto');

/** SHA-256 hex digest of a password-reset token. Never store the raw token. */
function hashPasswordResetToken(rawToken) {
  const token = String(rawToken || '');
  if (!token) {
    throw new Error('password_reset_token_required');
  }
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function generatePasswordResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateClaimId() {
  return crypto.randomUUID();
}

/** Default claim window for an in-flight password update (ms). */
const DEFAULT_CLAIM_TTL_MS = 2 * 60 * 1000;

/**
 * Pure eligibility check for claiming a reset row (unit-testable).
 * @param {object} row
 * @param {number} nowMs
 */
function isResetTokenClaimable(row, nowMs = Date.now()) {
  if (!row) return false;
  if (row.consumed_at) return false;
  if (!row.expires_at || Date.parse(row.expires_at) <= nowMs) return false;
  if (row.claim_expires_at && Date.parse(row.claim_expires_at) > nowMs) return false;
  return true;
}

module.exports = {
  hashPasswordResetToken,
  generatePasswordResetToken,
  generateClaimId,
  DEFAULT_CLAIM_TTL_MS,
  isResetTokenClaimable,
};
