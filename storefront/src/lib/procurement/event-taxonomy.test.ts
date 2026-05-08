import { describe, expect, it } from "vitest";
import { ProcurementEventType, PROCUREMENT_EVENT_SCHEMA_VERSION } from "@/lib/procurement/event-taxonomy";

describe("procurement event taxonomy", () => {
  it("pins schema version for append-only spine", () => {
    expect(PROCUREMENT_EVENT_SCHEMA_VERSION).toBe(1);
  });

  it("includes Phase 2B intake and advisory events", () => {
    expect(ProcurementEventType.opportunity_created).toBe("opportunity_created");
    expect(ProcurementEventType.intake_quote_cart).toBe("intake_quote_cart");
    expect(ProcurementEventType.intake_request_pricing).toBe("intake_request_pricing");
    expect(ProcurementEventType.ai_advisory_glove_finder).toBe("ai_advisory_glove_finder");
  });

  it("includes Phase 1 invoice procurement-memory events", () => {
    expect(ProcurementEventType.invoice_uploaded).toBe("invoice_uploaded");
    expect(ProcurementEventType.invoice_extraction_started).toBe("invoice_extraction_started");
    expect(ProcurementEventType.invoice_extraction_completed).toBe("invoice_extraction_completed");
    expect(ProcurementEventType.review_required).toBe("review_required");
    expect(ProcurementEventType.assessment_pending).toBe("assessment_pending");
  });

  it("includes Phase 2 line + supplier + matcher lifecycle events", () => {
    expect(ProcurementEventType.invoice_lines_persisted).toBe("invoice_lines_persisted");
    expect(ProcurementEventType.supplier_match_completed).toBe("supplier_match_completed");
    expect(ProcurementEventType.product_match_completed).toBe("product_match_completed");
    expect(ProcurementEventType.line_review_required).toBe("line_review_required");
    expect(ProcurementEventType.no_match_detected).toBe("no_match_detected");
    expect(ProcurementEventType.canonical_match_approved).toBe("canonical_match_approved");
  });

  it("includes Phase 3 governance + rerun events", () => {
    expect(ProcurementEventType.canonical_match_reviewed).toBe("canonical_match_reviewed");
    expect(ProcurementEventType.canonical_match_rejected).toBe("canonical_match_rejected");
    expect(ProcurementEventType.canonical_match_manually_assigned).toBe("canonical_match_manually_assigned");
    expect(ProcurementEventType.supplier_match_reviewed).toBe("supplier_match_reviewed");
    expect(ProcurementEventType.supplier_match_rejected).toBe("supplier_match_rejected");
    expect(ProcurementEventType.no_match_confirmed).toBe("no_match_confirmed");
    expect(ProcurementEventType.matching_rerun_requested).toBe("matching_rerun_requested");
    expect(ProcurementEventType.matching_rerun_completed).toBe("matching_rerun_completed");
  });

  it("includes Phase 4 spend memory events", () => {
    expect(ProcurementEventType.price_observation_created).toBe("price_observation_created");
    expect(ProcurementEventType.price_observation_rejected).toBe("price_observation_rejected");
    expect(ProcurementEventType.spend_memory_updated).toBe("spend_memory_updated");
    expect(ProcurementEventType.trusted_spend_promoted).toBe("trusted_spend_promoted");
  });

  it("includes Phase 5 savings governance events", () => {
    expect(ProcurementEventType.savings_opportunity_drafted).toBe("savings_opportunity_drafted");
    expect(ProcurementEventType.savings_opportunity_blocked).toBe("savings_opportunity_blocked");
    expect(ProcurementEventType.savings_opportunity_rules_passed).toBe("savings_opportunity_rules_passed");
    expect(ProcurementEventType.savings_opportunity_reviewed).toBe("savings_opportunity_reviewed");
    expect(ProcurementEventType.spec_group_member_approved).toBe("spec_group_member_approved");
    expect(ProcurementEventType.substitution_candidate_approved).toBe("substitution_candidate_approved");
  });

  it("includes Phase 6 recommendation lifecycle events", () => {
    expect(ProcurementEventType.recommendation_reviewed).toBe("recommendation_reviewed");
    expect(ProcurementEventType.recommendation_approved).toBe("recommendation_approved");
    expect(ProcurementEventType.recommendation_rejected).toBe("recommendation_rejected");
    expect(ProcurementEventType.recommendation_archived).toBe("recommendation_archived");
    expect(ProcurementEventType.reorder_product_promoted).toBe("reorder_product_promoted");
    expect(ProcurementEventType.reorder_product_retired).toBe("reorder_product_retired");
  });

  it("includes Phase 7 customer workspace events", () => {
    expect(ProcurementEventType.customer_viewed_recommendation).toBe("customer_viewed_recommendation");
    expect(ProcurementEventType.customer_acknowledged_recommendation).toBe("customer_acknowledged_recommendation");
    expect(ProcurementEventType.customer_requested_reorder).toBe("customer_requested_reorder");
    expect(ProcurementEventType.customer_requested_quote).toBe("customer_requested_quote");
    expect(ProcurementEventType.customer_asked_about_alternate).toBe("customer_asked_about_alternate");
    expect(ProcurementEventType.customer_viewed_procurement_history).toBe("customer_viewed_procurement_history");
    expect(ProcurementEventType.customer_contacted_procurement_advisor).toBe("customer_contacted_procurement_advisor");
  });
});
