/**
 * Determines if a staged row is blocked from publish (e.g. missing required attributes, no match).
 * Surfaces blocking validation earlier so operators see "Blocked" in the UI and bulk publish skips them.
 */

import type { StagingRow } from "./data";

/** Required normalized_data fields for publish (runPublish / buildPublishInputFromStaged expect these). */
const REQUIRED_NORMALIZED = ["name"] as const;

export function isPublishBlocked(row: StagingRow): boolean {
  if (!row.master_product_id) return true;
  const nd = row.normalized_data ?? {};
  for (const key of REQUIRED_NORMALIZED) {
    const v = nd[key];
    if (v == null || (typeof v === "string" && !v.trim())) return true;
  }
  const validationErrors = (nd as { validation_errors?: unknown[] }).validation_errors;
  if (Array.isArray(validationErrors) && validationErrors.length > 0) return true;
  return false;
}
