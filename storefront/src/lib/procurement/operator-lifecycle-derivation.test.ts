import { describe, expect, it } from "vitest";
import {
  compareInvoiceOperatorSignals,
  compareOpportunityLifecycleForOperatorDisplay,
  highestPriorityInvoiceSignal,
  type InvoiceOperatorSignal,
} from "@/lib/procurement/operator-lifecycle-derivation";

describe("operator-lifecycle-derivation", () => {
  it("ranks notification_failed above substitution and aggregate no_match", () => {
    expect(compareInvoiceOperatorSignals("notification_failed", "aggregate_no_match")).toBeLessThan(0);
    expect(compareInvoiceOperatorSignals("substitution_review", "aggregate_no_match")).toBeLessThan(0);
    expect(compareInvoiceOperatorSignals("aggregate_no_match", "line_or_supplier_review")).toBeLessThan(0);
  });

  it("highestPriorityInvoiceSignal picks the strongest concurrent signal", () => {
    const batch: InvoiceOperatorSignal[] = [
      "cleared_open_opportunity",
      "aggregate_no_match",
      "notification_failed",
      "line_or_supplier_review",
    ];
    expect(highestPriorityInvoiceSignal(batch)).toBe("notification_failed");
  });

  it("prefers sourcing_ready display rank over quote_linked when both appear", () => {
    expect(compareOpportunityLifecycleForOperatorDisplay("sourcing_ready", "quote_linked")).toBeLessThan(0);
    expect(compareOpportunityLifecycleForOperatorDisplay("quote_linked", "sourcing_ready")).toBeGreaterThan(0);
  });
});
