import { describe, expect, it, vi, beforeEach } from "vitest";
import { runInvoiceMatchingRerun } from "@/lib/invoice/invoice-matching-rerun";

vi.mock("@/lib/procurement/opportunity-service", () => ({
  appendProcurementEvent: vi.fn(() => Promise.resolve(true)),
}));

const resolveInvoiceLinesViaCatalogos = vi.fn();

vi.mock("@/lib/invoice/catalogos-resolve-client", () => ({
  resolveInvoiceLinesViaCatalogos: (...a: unknown[]) => resolveInvoiceLinesViaCatalogos(...a),
}));

describe("runInvoiceMatchingRerun", () => {
  beforeEach(() => {
    resolveInvoiceLinesViaCatalogos.mockReset();
  });

  it("returns concurrent error when lock row is missing", async () => {
    const supabase = {
      schema: () => ({
        from: () => ({
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    };
    const r = await runInvoiceMatchingRerun({ supabase: supabase as any, uploadedInvoiceId: "inv-1", adminUserId: "admin-1" });
    expect(r).toEqual({ ok: false, error: "matching_rerun_in_progress_or_not_found" });
  });

  it("skips trusted lines in CatalogOS payload and clears lock in finally", async () => {
    const trustedId = "11111111-1111-4111-8111-111111111111";
    const openId = "22222222-2222-4222-8222-222222222222";
    let lockCleared = false;
    let invoiceLinesSelectCalls = 0;

    resolveInvoiceLinesViaCatalogos.mockResolvedValue({
      ok: true,
      results: [
        {
          line_id: openId,
          matched: true,
          catalog_product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          match_confidence: 0.9,
          match_reason: "upc_exact",
          category_slug: "disposable_gloves",
          normalized_snapshot: {},
        },
      ],
    });

    const supabase = {
      schema: () => ({
        from: (table: string) => {
          if (table === "uploaded_invoices") {
            return {
              update: (patch: Record<string, unknown>) => {
                if (patch.matching_rerun_in_progress === false) {
                  lockCleared = true;
                  return { eq: () => Promise.resolve({ error: null }) };
                }
                if (patch.matching_rerun_in_progress === true) {
                  return {
                    eq: () => ({
                      eq: () => ({
                        select: () => ({
                          maybeSingle: () =>
                            Promise.resolve({
                              data: {
                                id: "inv-1",
                                matching_attempt: 0,
                                procurement_opportunity_id: "opp-1",
                              },
                              error: null,
                            }),
                        }),
                      }),
                    }),
                  };
                }
                return { eq: () => Promise.resolve({ error: null }) };
              },
            };
          }
          if (table === "invoice_lines") {
            return {
              select: () => ({
                eq: () => {
                  invoiceLinesSelectCalls += 1;
                  if (invoiceLinesSelectCalls === 1) {
                    return {
                      order: () =>
                        Promise.resolve({
                          data: [
                            {
                              id: trustedId,
                              line_index: 0,
                              raw_description: "A",
                              supplier_sku: "S1",
                              quantity: 1,
                              unit_price: 1,
                              review_status: "approved",
                              decision_source: "operator",
                              human_decided_at: "2026-01-01T00:00:00Z",
                              human_decided_by: "u1",
                              catalog_product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                            },
                            {
                              id: openId,
                              line_index: 1,
                              raw_description: "B",
                              supplier_sku: "S2",
                              quantity: 2,
                              unit_price: 2,
                              review_status: "review_required",
                              decision_source: "system",
                              human_decided_at: null,
                              human_decided_by: null,
                              catalog_product_id: null,
                            },
                          ],
                          error: null,
                        }),
                    };
                  }
                  return Promise.resolve({
                    data: [{ review_status: "review_required" }, { review_status: "approved" }],
                    error: null,
                  });
                },
              }),
              update: () => ({
                eq: () => Promise.resolve({ error: null }),
              }),
            };
          }
          if (table === "invoice_supplier_matches") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: { review_status: "pending_review" }, error: null }),
                }),
              }),
            };
          }
          throw new Error(`unexpected table ${table}`);
        },
      }),
    };

    const r = await runInvoiceMatchingRerun({ supabase: supabase as any, uploadedInvoiceId: "inv-1", adminUserId: "admin-1" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.skipped_trusted_line_ids).toEqual([trustedId]);
      expect(r.rematched_line_ids).toEqual([openId]);
    }
    expect(resolveInvoiceLinesViaCatalogos).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: expect.arrayContaining([expect.objectContaining({ line_id: openId })]),
      }),
      expect.objectContaining({ opportunityId: "opp-1", uploadedInvoiceId: "inv-1" })
    );
    expect(resolveInvoiceLinesViaCatalogos.mock.calls[0]![0].lines).toHaveLength(1);
    expect(lockCleared).toBe(true);
  });
});
