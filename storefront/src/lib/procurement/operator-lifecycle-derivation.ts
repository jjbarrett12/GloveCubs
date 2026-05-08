/**
 * Pure helpers for operator priority / queue semantics (no DB).
 * Used to rank concurrent signals on an invoice or opportunity without implying CRM automation.
 */

export type InvoiceOperatorSignal =
  | "notification_failed"
  | "substitution_review"
  | "aggregate_no_match"
  | "line_or_supplier_review"
  | "cleared_open_opportunity"
  | "sourcing_ready";

/** Lower number = higher operator attention (first wins in tie-break). */
export const INVOICE_OPERATOR_SIGNAL_PRIORITY: Record<InvoiceOperatorSignal, number> = {
  notification_failed: 10,
  substitution_review: 20,
  aggregate_no_match: 30,
  line_or_supplier_review: 40,
  sourcing_ready: 50,
  cleared_open_opportunity: 60,
};

export function compareInvoiceOperatorSignals(a: InvoiceOperatorSignal, b: InvoiceOperatorSignal): number {
  return INVOICE_OPERATOR_SIGNAL_PRIORITY[a] - INVOICE_OPERATOR_SIGNAL_PRIORITY[b];
}

export function highestPriorityInvoiceSignal(signals: InvoiceOperatorSignal[]): InvoiceOperatorSignal | null {
  if (signals.length === 0) return null;
  return signals.slice().sort(compareInvoiceOperatorSignals)[0]!;
}

export type OpportunityLifecycleRankInput = "quote_linked" | "sourcing_ready" | string;

/**
 * When both procurement linkage and sourcing readiness appear in UX, prefer sourcing queue work over pure linkage display.
 * Does not encode sales outcome.
 */
export function compareOpportunityLifecycleForOperatorDisplay(
  a: OpportunityLifecycleRankInput,
  b: OpportunityLifecycleRankInput
): number {
  const rank = (s: string) => {
    if (s === "sourcing_ready") return 0;
    if (s === "quote_linked") return 1;
    return 2;
  };
  return rank(a) - rank(b);
}
