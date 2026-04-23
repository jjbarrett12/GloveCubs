/**
 * Preflight for bulk “approve all auto-ready”: skip rows that would fail publish prep or are inconsistent.
 */

import type { StagingRow } from "./data";

export interface AutoApproveBlockResult {
  blocked: boolean;
  /** Short code for logs / UI */
  reason?: "no_master" | "not_pending" | "not_auto_candidate" | "missing_title" | "validation_errors";
  detail?: string;
}

/** Minimal row shape for server-side bulk checks (subset of DB row). */
export type AutoApproveRowInput = Pick<StagingRow, "id" | "status" | "master_product_id" | "normalized_data">;

export function evaluateAutoApproveEligibility(row: AutoApproveRowInput): AutoApproveBlockResult {
  if (row.status !== "pending") {
    return { blocked: true, reason: "not_pending", detail: `status=${row.status}` };
  }
  if (!row.master_product_id) {
    return { blocked: true, reason: "no_master" };
  }
  const nd = row.normalized_data ?? {};
  const disp = nd.ingestion_disposition;
  if (disp !== "auto_candidate") {
    return { blocked: true, reason: "not_auto_candidate", detail: String(disp ?? "unset") };
  }
  const title = String(nd.name ?? nd.canonical_title ?? "").trim();
  if (!title) {
    return { blocked: true, reason: "missing_title" };
  }
  const validationErrors = nd.validation_errors as unknown[] | undefined;
  if (Array.isArray(validationErrors) && validationErrors.length > 0) {
    return { blocked: true, reason: "validation_errors" };
  }
  return { blocked: false };
}
