/**
 * Rollout flags for unified ingestion (Phase 1A).
 * UNIFIED_STAGING_WRITE=1 enables writer paths; default off for safe rollout.
 */

export function isUnifiedStagingWriteEnabled(): boolean {
  const v = process.env.UNIFIED_STAGING_WRITE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Mirror new Quick rows to admin_url_clipboard_staging during transition. */
export function isLegacyClipboardMirrorEnabled(): boolean {
  const v = process.env.UNIFIED_LEGACY_CLIPBOARD_MIRROR?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Admin review queue reads catalog_staging_* instead of clipboard table. */
export function isUnifiedReviewQueueEnabled(): boolean {
  const v = process.env.UNIFIED_REVIEW_QUEUE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
