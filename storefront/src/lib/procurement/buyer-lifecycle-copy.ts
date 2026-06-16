/**
 * Buyer-safe procurement lifecycle labels only.
 * Do not import operator-lifecycle-copy here — operator hints must not leak to customers.
 *
 * Canonical stages: PROCUREMENT_OPPORTUNITY_LIFECYCLE_STAGES
 */

import type { ProcurementOpportunityLifecycleStage } from "@/lib/procurement/procurement-lifecycle-stages";

/** Left-to-right sort for pipeline distribution chips (not a completion bar). */
export const BUYER_LIFECYCLE_STAGE_ORDER: readonly ProcurementOpportunityLifecycleStage[] = [
  "draft",
  "open",
  "scoped",
  "evidencing",
  "sourcing_ready",
  "quote_linked",
  "sales_follow_up",
  "stale",
  "closed",
] as const;

export function buyerLifecycleStageLabel(stage: string): string {
  const s = stage as ProcurementOpportunityLifecycleStage;
  switch (s) {
    case "draft":
      return "Setting up";
    case "open":
      return "Received";
    case "scoped":
      return "Identified";
    case "evidencing":
      return "Gathering details";
    case "sourcing_ready":
      return "Sourcing";
    case "quote_linked":
      return "Pricing in progress";
    case "sales_follow_up":
      return "Follow-up needed";
    case "closed":
      return "Closed";
    case "stale":
      return "Paused";
    default:
      return stage;
  }
}

/** Stages shown in the operational pipeline summary (excludes terminal closed). */
export function isBuyerPipelineDistributionStage(stage: string): boolean {
  return stage !== "closed";
}

export function buyerPipelineStageSortIndex(stage: string): number {
  const idx = BUYER_LIFECYCLE_STAGE_ORDER.indexOf(stage as ProcurementOpportunityLifecycleStage);
  if (idx >= 0) return idx;
  return BUYER_LIFECYCLE_STAGE_ORDER.length + 1;
}

/** Buyer-safe labels for catalogos.quote_requests.status — never expose raw operator queue names in UI. */
export function buyerQuoteStatusLabel(status: string): string {
  switch (status) {
    case "new":
      return "Received";
    case "reviewing":
      return "Under review";
    case "contacted":
      return "Follow-up in progress";
    case "quoted":
      return "Formal pricing shared";
    case "won":
      return "Closed — accepted";
    case "lost":
      return "Closed — not proceeding";
    case "expired":
      return "Closed — expired";
    case "closed":
      return "Closed";
    default:
      return "In progress";
  }
}
