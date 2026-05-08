/**
 * Durable `procurement_opportunities.lifecycle_stage` values (public schema CHECK).
 * Operator UI should describe stages plainly — procurement progress does not imply sales closed or customer receipt.
 *
 * @see supabase/migrations/20260508180000_procurement_lifecycle_operator_semantics.sql
 */
export const PROCUREMENT_OPPORTUNITY_LIFECYCLE_STAGES = [
  "draft",
  "open",
  "scoped",
  "evidencing",
  "sourcing_ready",
  "quote_linked",
  "sales_follow_up",
  "closed",
  "stale",
] as const;

export type ProcurementOpportunityLifecycleStage = (typeof PROCUREMENT_OPPORTUNITY_LIFECYCLE_STAGES)[number];
