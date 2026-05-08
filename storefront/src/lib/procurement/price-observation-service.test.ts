import { describe, expect, it, vi, beforeEach } from "vitest";
import { appendProcurementEvent } from "@/lib/procurement/opportunity-service";
import {
  runPriceObservationAfterLineGovernance,
  supersedeTrustedObservationForLine,
  runTrustedPriceObservationRepairForLine,
} from "@/lib/procurement/price-observation-service";

vi.mock("@/lib/procurement/opportunity-service", () => ({
  appendProcurementEvent: vi.fn(() => Promise.resolve(true)),
}));

describe("price-observation-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("supersedes trusted observation by line and emits rejection then spend_memory_updated", async () => {
    const supabase = {
      schema: () => ({
        from: (table: string) => {
          if (table === "price_observations") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () =>
                      Promise.resolve({
                        data: {
                          id: "obs-1",
                          invoice_line_id: "line-1",
                          uploaded_invoice_id: "inv-1",
                          company_id: "co-1",
                          catalog_product_id: "prod-1",
                        },
                        error: null,
                      }),
                  }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  eq: () => Promise.resolve({ error: null }),
                }),
              }),
            };
          }
          throw new Error(table);
        },
      }),
    };

    const r = await supersedeTrustedObservationForLine(supabase as any, {
      lineId: "line-1",
      exclusionReason: "line_rejected",
      opportunityId: "opp-1",
    });
    expect(r).toEqual({ ok: true });
    expect(appendProcurementEvent).toHaveBeenNthCalledWith(1, expect.anything(), "opp-1", "price_observation_rejected", expect.any(Object));
    expect(appendProcurementEvent).toHaveBeenNthCalledWith(2, expect.anything(), "opp-1", "spend_memory_updated", expect.any(Object));
  });

  it("does not insert when line is not trusted", async () => {
    const supabase = {
      schema: () => ({
        from: (table: string) => {
          if (table === "invoice_lines") {
            return {
              select: () => ({
                eq: () => ({
                  single: () =>
                    Promise.resolve({
                      data: {
                        review_status: "review_required",
                        decision_source: "system",
                        human_decided_at: null,
                        human_decided_by: null,
                        catalog_product_id: "p1",
                      },
                      error: null,
                    }),
                }),
              }),
            };
          }
          throw new Error(table);
        },
      }),
    };
    const r = await runPriceObservationAfterLineGovernance(supabase as any, { lineId: "line-1", opportunityId: "opp-1" });
    expect(r).toEqual({ ok: true });
    expect(appendProcurementEvent).not.toHaveBeenCalled();
  });

  it("on trusted line + supplier inserts once and idempotent second call skips insert", async () => {
    const trustedLine = {
      id: "line-1",
      uploaded_invoice_id: "up-1",
      review_status: "approved",
      decision_source: "operator",
      human_decided_at: "2026-01-01T00:00:00Z",
      human_decided_by: "u1",
      catalog_product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      quantity: 10,
      unit_price: 2.5,
      line_total: 25,
      updated_at: "2026-01-01T00:00:00Z",
    };
    const trustedSupplier = {
      review_status: "approved",
      decision_source: "operator",
      reviewed_at: "2026-01-01T00:00:00Z",
      reviewed_by: "u1",
      catalogos_supplier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    };
    const invoice = {
      id: "up-1",
      company_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      procurement_opportunity_id: "opp-1",
    };

    let existingTrusted = false;
    let insertCalls = 0;

    const supabase = {
      schema: () => ({
        from: (table: string) => {
          if (table === "invoice_lines") {
            return {
              select: () => ({
                eq: () => ({
                  single: () => Promise.resolve({ data: trustedLine, error: null }),
                }),
              }),
            };
          }
          if (table === "uploaded_invoices") {
            return {
              select: () => ({
                eq: () => ({
                  single: () => Promise.resolve({ data: invoice, error: null }),
                }),
              }),
            };
          }
          if (table === "invoice_supplier_matches") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: trustedSupplier, error: null }),
                }),
              }),
            };
          }
          if (table === "price_observations") {
            return {
              select: (fields?: string) => {
                const f = String(fields ?? "");
                if (f.includes("unit_price")) {
                  return {
                    eq: () => ({
                      eq: () => ({
                        eq: () => ({
                          order: () => ({
                            limit: () => ({
                              maybeSingle: () =>
                                Promise.resolve({
                                  data: {
                                    unit_price: trustedLine.unit_price,
                                    quantity: trustedLine.quantity,
                                    observed_at: "2026-01-01T00:00:00Z",
                                    catalogos_supplier_id: trustedSupplier.catalogos_supplier_id,
                                  },
                                  error: null,
                                }),
                            }),
                          }),
                        }),
                      }),
                    }),
                  };
                }
                return {
                  eq: () => ({
                    eq: () => ({
                      maybeSingle: () =>
                        Promise.resolve({
                          data: existingTrusted ? { id: "obs-existing" } : null,
                          error: null,
                        }),
                    }),
                  }),
                };
              },
              insert: (_row: unknown) => ({
                select: () => ({
                  single: () => {
                    insertCalls += 1;
                    existingTrusted = true;
                    return Promise.resolve({ data: { id: "obs-new" }, error: null });
                  },
                }),
              }),
            };
          }
          if (table === "substitution_candidates") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    not: () => Promise.resolve({ data: [], error: null }),
                  }),
                }),
              }),
            };
          }
          throw new Error(table);
        },
      }),
    };

    const r1 = await runTrustedPriceObservationRepairForLine(supabase as any, "line-1", "opp-1");
    expect(r1.ok).toBe(true);
    expect(insertCalls).toBe(1);
    expect(appendProcurementEvent).toHaveBeenCalled();

    vi.clearAllMocks();
    const r2 = await runTrustedPriceObservationRepairForLine(supabase as any, "line-1", "opp-1");
    expect(r2.ok).toBe(true);
    expect(insertCalls).toBe(1);
    expect(appendProcurementEvent).not.toHaveBeenCalled();
  });
});
