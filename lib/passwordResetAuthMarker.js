'use strict';

/**
 * Auth app_metadata key for durable password-reset completion.
 * Never store raw tokens. Customers must not write this key.
 */
const PASSWORD_RESET_APP_METADATA_KEY = 'gc_password_reset';

/**
 * Merge a reset-completion marker into existing app_metadata without dropping keys.
 * @param {Record<string, unknown>|null|undefined} existing
 * @param {{ tokenHash: string, claimId: string, completedAt: string }} marker
 */
function mergePasswordResetAppMetadata(existing, marker) {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...existing }
      : {};
  base[PASSWORD_RESET_APP_METADATA_KEY] = {
    th: String(marker.tokenHash),
    cid: String(marker.claimId),
    at: String(marker.completedAt),
  };
  return base;
}

/**
 * True when Auth app_metadata shows this token hash already completed a reset.
 * @param {Record<string, unknown>|null|undefined} appMetadata
 * @param {string} tokenHash
 */
function isPasswordResetAlreadyCompleted(appMetadata, tokenHash) {
  if (!tokenHash || !appMetadata || typeof appMetadata !== 'object') return false;
  const block = appMetadata[PASSWORD_RESET_APP_METADATA_KEY];
  if (!block || typeof block !== 'object') return false;
  return String(block.th || '') === String(tokenHash);
}

module.exports = {
  PASSWORD_RESET_APP_METADATA_KEY,
  mergePasswordResetAppMetadata,
  isPasswordResetAlreadyCompleted,
};
