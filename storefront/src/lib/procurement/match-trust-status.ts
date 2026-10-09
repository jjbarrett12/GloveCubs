/**
 * Categorical match trust. Avoid fake decimal confidence for savings decisions.
 */

export const MATCH_TRUST_STATUSES = [
  "unidentified",
  "candidate_match",
  "spec_review_required",
  "uom_review_required",
  "price_review_required",
  "incompatible",
  "insufficient_data",
  "verified",
  "high_confidence",
  "savings_ready",
] as const;

export type MatchTrustStatus = (typeof MATCH_TRUST_STATUSES)[number];

export const EQUIVALENCY_STATUSES = ["candidate", "needs_review", "approved", "rejected"] as const;
export type EquivalencyStatus = (typeof EQUIVALENCY_STATUSES)[number];
