/** Append-only procurement event types — Phase 2B taxonomy (extend with governance review). */
export const PROCUREMENT_EVENT_SCHEMA_VERSION = 1 as const;

export const ProcurementEventType = {
  opportunity_created: "opportunity_created",
  opportunity_resumed: "opportunity_resumed",
  intake_request_pricing: "intake_request_pricing",
  intake_quote_cart: "intake_quote_cart",
  ai_advisory_glove_finder: "ai_advisory_glove_finder",
  line_items_attached: "line_items_attached",
  /** Internal channel attempt (e.g. SMTP to operators/sales inbox) — not “customer received quote”. */
  notification_sent: "notification_sent",
  /** Delivery/logging failure on internal notification channel — surface for sales_follow_up / operator retry. */
  notification_failed: "notification_failed",
  stage_transition: "stage_transition",
  /** Invoice intake (Phase 1 procurement memory) — append-only timeline */
  invoice_uploaded: "invoice_uploaded",
  invoice_extraction_started: "invoice_extraction_started",
  invoice_extraction_completed: "invoice_extraction_completed",
  review_required: "review_required",
  assessment_pending: "assessment_pending",
  /** Phase 2 — structured line + supplier + CatalogOS matcher lifecycle */
  invoice_lines_persisted: "invoice_lines_persisted",
  supplier_match_completed: "supplier_match_completed",
  product_match_completed: "product_match_completed",
  line_review_required: "line_review_required",
  no_match_detected: "no_match_detected",
  /** @deprecated Prefer Phase 3 governance events; retained for historical append-only rows */
  canonical_match_approved: "canonical_match_approved",
  /** Phase 3 — operator governance (distinct semantics; do not overload) */
  canonical_match_reviewed: "canonical_match_reviewed",
  canonical_match_rejected: "canonical_match_rejected",
  canonical_match_manually_assigned: "canonical_match_manually_assigned",
  supplier_match_reviewed: "supplier_match_reviewed",
  supplier_match_rejected: "supplier_match_rejected",
  no_match_confirmed: "no_match_confirmed",
  matching_rerun_requested: "matching_rerun_requested",
  matching_rerun_completed: "matching_rerun_completed",
  /** Phase 4 — trusted spend memory (observations only from governed truth) */
  price_observation_created: "price_observation_created",
  price_observation_rejected: "price_observation_rejected",
  spend_memory_updated: "spend_memory_updated",
  trusted_spend_promoted: "trusted_spend_promoted",
  /** Phase 5 — governed savings opportunities (no AI / no fuzzy substitutes) */
  savings_opportunity_drafted: "savings_opportunity_drafted",
  savings_opportunity_blocked: "savings_opportunity_blocked",
  savings_opportunity_rules_passed: "savings_opportunity_rules_passed",
  savings_opportunity_reviewed: "savings_opportunity_reviewed",
  spec_group_member_approved: "spec_group_member_approved",
  substitution_candidate_approved: "substitution_candidate_approved",
  /** Phase 6 — internal recommendation lifecycle (no customer UI) */
  recommendation_reviewed: "recommendation_reviewed",
  recommendation_approved: "recommendation_approved",
  recommendation_rejected: "recommendation_rejected",
  recommendation_archived: "recommendation_archived",
  reorder_product_promoted: "reorder_product_promoted",
  reorder_product_retired: "reorder_product_retired",
  /** Phase 7 — customer workspace (human-in-the-loop; debounce/dedupe at write site) */
  customer_viewed_recommendation: "customer_viewed_recommendation",
  customer_acknowledged_recommendation: "customer_acknowledged_recommendation",
  customer_requested_reorder: "customer_requested_reorder",
  customer_requested_quote: "customer_requested_quote",
  customer_asked_about_alternate: "customer_asked_about_alternate",
  customer_viewed_procurement_history: "customer_viewed_procurement_history",
  customer_contacted_procurement_advisor: "customer_contacted_procurement_advisor",
} as const;

export type ProcurementEventTypeId = (typeof ProcurementEventType)[keyof typeof ProcurementEventType];
