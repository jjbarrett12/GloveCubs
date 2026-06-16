import {
  buyerLifecycleStageLabel,
  buyerQuoteStatusLabel,
} from "@/lib/procurement/buyer-lifecycle-copy";
import type { ProcurementOpportunityLifecycleStage } from "@/lib/procurement/procurement-lifecycle-stages";

/** Operator workflow domain — separates sourcing, quote review, buyer follow-up, and fulfillment. */
export type OperatorWorkflowDomain =
  | "setup"
  | "sourcing"
  | "quote_review"
  | "buyer_follow_up"
  | "fulfillment"
  | "closed";

export type OperatorLifecycleStageCopy = {
  label: string;
  nextHint: string;
  buyerSees: string;
  domain: OperatorWorkflowDomain;
};

/**
 * Operator-facing sourcing-thread copy. Includes buyer mirror label for continuity.
 * Procurement state only — no implied customer delivery, PO receipt, or sales close.
 */
export function describeLifecycleStageForOperator(stage: string): OperatorLifecycleStageCopy {
  const s = stage as ProcurementOpportunityLifecycleStage | string;
  const buyerSees = buyerLifecycleStageLabel(stage);
  switch (s) {
    case "quote_linked":
      return {
        label: "Quote request linked",
        buyerSees,
        domain: "quote_review",
        nextHint: "Catalog quote request is linked — confirm pricing before buyer-facing communication.",
      };
    case "sales_follow_up":
      return {
        label: "Buyer follow-up",
        buyerSees,
        domain: "buyer_follow_up",
        nextHint: "Commercial or procurement follow-up needed — buyer may still see pricing in progress.",
      };
    case "sourcing_ready":
      return {
        label: "Ready for sourcing",
        buyerSees,
        domain: "sourcing",
        nextHint: "Ready for catalog/sourcing work — does not mean formal pricing was shared with the buyer.",
      };
    case "scoped":
      return {
        label: "Procurement review",
        buyerSees,
        domain: "sourcing",
        nextHint: "Identity captured on thread — continue qualification separately from invoice matching.",
      };
    case "evidencing":
      return {
        label: "Evidence gathering",
        buyerSees,
        domain: "sourcing",
        nextHint: "Gathering proof on the sourcing thread — not a buyer delivery milestone.",
      };
    case "closed":
      return {
        label: "Closed thread",
        buyerSees,
        domain: "closed",
        nextHint: "Thread marked closed — verify in CRM if revenue impact matters.",
      };
    case "stale":
      return {
        label: "Paused thread",
        buyerSees,
        domain: "sourcing",
        nextHint: "Paused or superseded — confirm before buyer-facing action.",
      };
    case "draft":
      return {
        label: "Thread setup",
        buyerSees,
        domain: "setup",
        nextHint: "Incomplete sourcing thread — not buyer-ready.",
      };
    case "open":
      return {
        label: "Intake",
        buyerSees,
        domain: "sourcing",
        nextHint: "Active sourcing thread — triage procurement review vs buyer follow-up explicitly.",
      };
    default:
      return {
        label: String(s),
        buyerSees,
        domain: "sourcing",
        nextHint: "Active opportunity — triage procurement vs buyer follow-up explicitly.",
      };
  }
}

export type OperatorQuoteStatusCopy = {
  internalLabel: string;
  buyerSees: string;
  actionHint: string;
  domain: OperatorWorkflowDomain;
};

/** Operator quote-request review copy with buyer mirror for admin queues. */
export function describeQuoteStatusForOperator(status: string): OperatorQuoteStatusCopy {
  const buyerSees = buyerQuoteStatusLabel(status);
  switch (status) {
    case "new":
      return {
        internalLabel: "Intake queue",
        buyerSees,
        domain: "quote_review",
        actionHint: "Review quote request lines and company linkage.",
      };
    case "reviewing":
      return {
        internalLabel: "Quote review",
        buyerSees,
        domain: "quote_review",
        actionHint: "Confirm pricing and availability before buyer communication.",
      };
    case "contacted":
      return {
        internalLabel: "Buyer follow-up",
        buyerSees,
        domain: "buyer_follow_up",
        actionHint: "Respond to buyer question or clarification.",
      };
    case "quoted":
      return {
        internalLabel: "Pricing shared",
        buyerSees,
        domain: "quote_review",
        actionHint: "Await buyer decision — do not treat as fulfilled order.",
      };
    case "won":
      return {
        internalLabel: "Closed — accepted",
        buyerSees,
        domain: "closed",
        actionHint: "Quote accepted — hand off to fulfillment workflow if applicable.",
      };
    case "lost":
      return {
        internalLabel: "Closed — not proceeding",
        buyerSees,
        domain: "closed",
        actionHint: "Quote closed without proceeding.",
      };
    case "expired":
      return {
        internalLabel: "Closed — expired",
        buyerSees,
        domain: "closed",
        actionHint: "Quote expired — reopen only with buyer confirmation.",
      };
    case "closed":
      return {
        internalLabel: "Closed",
        buyerSees,
        domain: "closed",
        actionHint: "No further quote action expected.",
      };
    default:
      return {
        internalLabel: "In progress",
        buyerSees,
        domain: "quote_review",
        actionHint: "Review quote request state before buyer communication.",
      };
  }
}

export type OperatorOrderStatusCopy = {
  label: string;
  domain: OperatorWorkflowDomain;
  hint: string;
};

/** Fulfillment-oriented order record labels for operator order queues. */
export function describeOrderStatusForOperator(status: string): OperatorOrderStatusCopy {
  switch (status) {
    case "draft":
      return { label: "Draft record", domain: "setup", hint: "Incomplete order record — not fulfillment-ready." };
    case "pending":
    case "pending_payment":
      return {
        label: status === "pending_payment" ? "Payment pending" : "Pending review",
        domain: "fulfillment",
        hint: "Await payment or operator review before fulfillment.",
      };
    case "payment_failed":
      return { label: "Payment failed", domain: "fulfillment", hint: "Resolve payment before fulfillment." };
    case "processing":
    case "confirmed":
    case "paid":
      return {
        label: status === "paid" ? "Paid — fulfillment review" : "Fulfillment review",
        domain: "fulfillment",
        hint: "Confirm fulfillment steps — record totals are not finance-approved.",
      };
    case "fulfilled":
    case "shipped":
      return {
        label: status === "shipped" ? "Shipped" : "Fulfilled",
        domain: "fulfillment",
        hint: "Fulfillment recorded — verify against carrier/PO if needed.",
      };
    case "cancelled":
    case "refunded":
    case "expired":
    case "abandoned":
      return {
        label: status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " "),
        domain: "closed",
        hint: "Terminal order state — no active fulfillment expected.",
      };
    default:
      return { label: status || "Unknown", domain: "fulfillment", hint: "Review order record before fulfillment action." };
  }
}
