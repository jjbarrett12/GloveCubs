import { describe, expect, it } from "vitest";
import { governInvoiceLinePatchSchema, notesOnlyInvoiceLinePatchSchema } from "@/lib/admin/invoice-line-patch-contract";

describe("invoice-line-patch-contract", () => {
  it("notes-only schema rejects extra keys (cannot smuggle decision)", () => {
    const r = notesOnlyInvoiceLinePatchSchema.safeParse({
      review_notes: "Called buyer",
      decision: "approve",
    });
    expect(r.success).toBe(false);
  });

  it("notes-only schema accepts review_notes only", () => {
    const r = notesOnlyInvoiceLinePatchSchema.safeParse({ review_notes: "ok" });
    expect(r.success).toBe(true);
  });

  it("governance schema still requires decision", () => {
    expect(governInvoiceLinePatchSchema.safeParse({ review_notes: "x" }).success).toBe(false);
    expect(
      governInvoiceLinePatchSchema.safeParse({
        decision: "no_match",
        review_notes: null,
      }).success
    ).toBe(true);
  });
});
