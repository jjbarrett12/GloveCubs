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

module.exports = {
  hashPasswordResetToken,
  generatePasswordResetToken,
};
