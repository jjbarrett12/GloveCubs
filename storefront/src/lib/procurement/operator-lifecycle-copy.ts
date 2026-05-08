import type { ProcurementOpportunityLifecycleStage } from "@/lib/procurement/procurement-lifecycle-stages";

/**
 * Operator-facing copy: procurement state only — no implied customer delivery, PO receipt, or sales close.
 */
export function describeLifecycleStageForOperator(stage: string): { label: string; nextHint: string } {
  const s = stage as ProcurementOpportunityLifecycleStage | string;
  switch (s) {
    case "quote_linked":
      return {
        label: "Quote linked",
        nextHint: "Spine linked to catalog quote request — follow up commercially as needed (linkage ≠ outbound delivery).",
      };
    case "sales_follow_up":
      return {
        label: "Sales follow-up",
        nextHint: "Commercial thread needs human follow-up (e.g. intake email did not send); procurement may still be in progress.",
      };
    case "sourcing_ready":
      return {
        label: "Sourcing ready",
        nextHint: "Ready for sourcing / catalog work — does not mean pricing was sent to the customer.",
      };
    case "scoped":
      return {
        label: "Scoped",
        nextHint: "Identity captured on spine — continue commercial qualification separately from invoice matching.",
      };
    case "evidencing":
      return {
        label: "Evidencing",
        nextHint: "Gathering proof / context on the opportunity — not a customer delivery milestone.",
      };
    case "closed":
      return { label: "Closed", nextHint: "Thread marked closed on spine — verify in CRM if revenue impact matters." };
    case "stale":
      return { label: "Stale", nextHint: "Stale / superseded spine state — confirm before customer-facing action." };
    case "draft":
      return { label: "Draft", nextHint: "Incomplete spine row — not customer-ready." };
    case "open":
    default:
      return {
        label: s === "open" ? "Open" : String(s),
        nextHint: "Active opportunity — triage procurement vs sales tasks explicitly.",
      };
  }
}
