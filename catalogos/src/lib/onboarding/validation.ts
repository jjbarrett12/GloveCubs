/**
 * Onboarding request validation: missing requirements for review/approval.
 */

import type { SupplierOnboardingRequestRow } from "./types";

export interface OnboardingValidation {
  valid: boolean;
  missing: string[];
}

/**
 * Check if request has minimum data to mark ready_for_review.
 */
export function validateReadyForReview(request: SupplierOnboardingRequestRow): OnboardingValidation {
  const missing: string[] = [];
  if (!request.company_name?.trim()) missing.push("company_name");
  const configUrl = (request.feed_config as Record<string, unknown>)?.url;
  const feedUrl =
    request.feed_url?.trim() || (typeof configUrl === "string" ? String(configUrl).trim() : "");
  if (!feedUrl) missing.push("feed_url or feed config");
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Check if request can proceed to create supplier (after approved).
 */
export function validateCanCreateSupplier(request: SupplierOnboardingRequestRow): OnboardingValidation {
  if (request.status !== "approved" && request.status !== "created_supplier") {
    return { valid: false, missing: ["status must be approved"] };
  }
  if (request.created_supplier_id) {
    return { valid: true, missing: [] };
  }
  if (!request.company_name?.trim()) {
    return { valid: false, missing: ["company_name"] };
  }
  return { valid: true, missing: [] };
}
