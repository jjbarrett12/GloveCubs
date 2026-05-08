import { describe, expect, it } from "vitest";
import { fetchRecommendationReviewQueueEnriched } from "@/lib/procurement/procurement-workspace-read-models";

describe("fetchRecommendationReviewQueueEnriched", () => {
  it("attaches procurement_opportunity_id from invoice → uploaded invoice chain", async () => {
    const supabase = {
      schema: () => ({
        from: (table: string) => {
          if (table === "savings_opportunities") {
            return {
              select: () => ({
                eq: () => ({
                  in: () => ({
                    order: () => ({
                      limit: () =>
                        Promise.resolve({
                          data: [
                            {
                              id: "so-1",
                              company_id: "co-1",
                              source_invoice_line_id: "line-1",
                              source_catalog_product_id: "p-src",
                              candidate_catalog_product_id: "p-cand",
                              trust_status: "draft",
                              block_reason: null,
                              reviewed_at: null,
                              reviewed_by: null,
                              created_at: "2026-01-01T00:00:00Z",
                              spec_group_id: "g1",
                              substitution_candidate_id: "s1",
                              basis_uom: "per_100_gloves",
                              source_unit_price_normalized: 1,
                              candidate_unit_price_normalized: 2,
                              estimated_delta_per_basis: -1,
                            },
                          ],
                          error: null,
                        }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "invoice_lines") {
            return {
              select: () => ({
                in: () =>
                  Promise.resolve({
                    data: [{ id: "line-1", uploaded_invoice_id: "up-1" }],
                    error: null,
                  }),
              }),
            };
          }
          if (table === "uploaded_invoices") {
            return {
              select: () => ({
                in: () =>
                  Promise.resolve({
                    data: [{ id: "up-1", procurement_opportunity_id: "opp-1" }],
                    error: null,
                  }),
              }),
            };
          }
          throw new Error(table);
        },
      }),
    };
    const rows = await fetchRecommendationReviewQueueEnriched(supabase as any, "co-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.procurement_opportunity_id).toBe("opp-1");
  });
});
