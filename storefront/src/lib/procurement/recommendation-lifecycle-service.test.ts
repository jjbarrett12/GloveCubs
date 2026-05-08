import { describe, expect, it, vi, beforeEach } from "vitest";
import { appendProcurementEvent } from "@/lib/procurement/opportunity-service";
import { ProcurementEventType } from "@/lib/procurement/event-taxonomy";
import {
  approveRecommendationForCustomer,
  archiveRecommendation,
  markRecommendationReviewed,
  promoteReorderProduct,
  revalidateSavingsOpportunityForApproval,
  rejectRecommendation,
} from "@/lib/procurement/recommendation-lifecycle-service";

vi.mock("@/lib/procurement/opportunity-service", () => ({
  appendProcurementEvent: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@/lib/procurement/price-observation-queries", () => ({
  fetchLatestTrustedPriceObservation: vi.fn(),
}));

import { fetchLatestTrustedPriceObservation } from "@/lib/procurement/price-observation-queries";

const LINE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SRC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CAND = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const GRP = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SUB = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const CO = "99999999-9999-4999-8999-999999999999";

function baseSavingsRow(overrides: Record<string, unknown> = {}) {
  return {
    trust_status: "operator_reviewed",
    company_id: CO,
    source_invoice_line_id: LINE,
    source_catalog_product_id: SRC,
    candidate_catalog_product_id: CAND,
    spec_group_id: GRP,
    substitution_candidate_id: SUB,
    basis_uom: "per_100_gloves",
    source_unit_price_normalized: 10,
    candidate_unit_price_normalized: 6,
    estimated_delta_per_basis: 4,
    ...overrides,
  };
}

describe("revalidateSavingsOpportunityForApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchLatestTrustedPriceObservation).mockReset();
  });

  it("fails for blocked rows", async () => {
    const r = await revalidateSavingsOpportunityForApproval({} as any, baseSavingsRow({ trust_status: "blocked" }));
    expect(r).toEqual({ ok: false, reason: "blocked_not_approvable" });
  });

  it("fails when recomputed economics diverge from stored snapshot", async () => {
    vi.mocked(fetchLatestTrustedPriceObservation).mockImplementation(async (_s, _c, cat) => {
      if (cat === SRC) {
        return { unit_price: 10, quantity: 1, observed_at: "2026-01-01T00:00:00Z", catalogos_supplier_id: "x" };
      }
      if (cat === CAND) {
        return { unit_price: 6, quantity: 1, observed_at: "2026-01-01T00:00:00Z", catalogos_supplier_id: "x" };
      }
      return null;
    });
    const supabase = {
      schema: () => ({
        from: (t: string) => {
          if (t === "invoice_lines") {
            return {
              select: () => ({
                eq: () => ({
                  single: () =>
                    Promise.resolve({
                      data: {
                        id: LINE,
                        uploaded_invoice_id: UP,
                        review_status: "approved",
                        decision_source: "operator",
                        human_decided_at: "2026-01-01T00:00:00Z",
                        human_decided_by: "u1",
                        catalog_product_id: SRC,
                        quantity: 1,
                        unit_price: 10,
                      },
                      error: null,
                    }),
                }),
              }),
            };
          }
          if (t === "invoice_supplier_matches") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: {
                        review_status: "approved",
                        decision_source: "operator",
                        reviewed_at: "2026-01-01T00:00:00Z",
                        reviewed_by: "u1",
                        catalogos_supplier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                      },
                      error: null,
                    }),
                }),
              }),
            };
          }
          if (t === "substitution_candidates") {
            return {
              select: () => ({
                eq: () => ({
                  single: () =>
                    Promise.resolve({
                      data: {
                        id: SUB,
                        status: "approved",
                        approved_at: "2026-01-01T00:00:00Z",
                        from_catalog_product_id: SRC,
                        to_catalog_product_id: CAND,
                        spec_group_id: GRP,
                      },
                      error: null,
                    }),
                }),
              }),
            };
          }
          if (t === "glove_spec_groups") {
            return {
              select: () => ({
                eq: () => ({
                  single: () => Promise.resolve({ data: { id: GRP, status: "active" }, error: null }),
                }),
              }),
            };
          }
          if (t === "glove_spec_group_members") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () =>
                      Promise.resolve({
                        data: {
                          units_per_line_uom: 100,
                          approved_at: "2026-01-01T00:00:00Z",
                          decision_source: "operator",
                          valid_to: null,
                        },
                        error: null,
                      }),
                  }),
                }),
              }),
            };
          }
          throw new Error(t);
        },
      }),
    };
    const r = await revalidateSavingsOpportunityForApproval(supabase as any, {
      ...baseSavingsRow(),
      source_unit_price_normalized: 99,
    } as Record<string, unknown>);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("economic_snapshot_stale");
  });

  it("passes when governance and economics match stored row", async () => {
    vi.mocked(fetchLatestTrustedPriceObservation).mockImplementation(async (_s, _c, cat) => {
      if (cat === SRC) {
        return { unit_price: 10, quantity: 1, observed_at: "2026-01-01T00:00:00Z", catalogos_supplier_id: "x" };
      }
      if (cat === CAND) {
        return { unit_price: 6, quantity: 1, observed_at: "2026-01-01T00:00:00Z", catalogos_supplier_id: "x" };
      }
      return null;
    });
    const supabase = {
      schema: () => ({
        from: (t: string) => {
          if (t === "invoice_lines") {
            return {
              select: () => ({
                eq: () => ({
                  single: () =>
                    Promise.resolve({
                      data: {
                        id: LINE,
                        uploaded_invoice_id: UP,
                        review_status: "approved",
                        decision_source: "operator",
                        human_decided_at: "2026-01-01T00:00:00Z",
                        human_decided_by: "u1",
                        catalog_product_id: SRC,
                        quantity: 1,
                        unit_price: 10,
                      },
                      error: null,
                    }),
                }),
              }),
            };
          }
          if (t === "invoice_supplier_matches") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: {
                        review_status: "approved",
                        decision_source: "operator",
                        reviewed_at: "2026-01-01T00:00:00Z",
                        reviewed_by: "u1",
                        catalogos_supplier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                      },
                      error: null,
                    }),
                }),
              }),
            };
          }
          if (t === "substitution_candidates") {
            return {
              select: () => ({
                eq: () => ({
                  single: () =>
                    Promise.resolve({
                      data: {
                        id: SUB,
                        status: "approved",
                        approved_at: "2026-01-01T00:00:00Z",
                        from_catalog_product_id: SRC,
                        to_catalog_product_id: CAND,
                        spec_group_id: GRP,
                      },
                      error: null,
                    }),
                }),
              }),
            };
          }
          if (t === "glove_spec_groups") {
            return {
              select: () => ({
                eq: () => ({
                  single: () => Promise.resolve({ data: { id: GRP, status: "active" }, error: null }),
                }),
              }),
            };
          }
          if (t === "glove_spec_group_members") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () =>
                      Promise.resolve({
                        data: {
                          units_per_line_uom: 100,
                          approved_at: "2026-01-01T00:00:00Z",
                          decision_source: "operator",
                          valid_to: null,
                        },
                        error: null,
                      }),
                  }),
                }),
              }),
            };
          }
          throw new Error(t);
        },
      }),
    };
    const r = await revalidateSavingsOpportunityForApproval(supabase as any, baseSavingsRow() as Record<string, unknown>);
    expect(r.ok).toBe(true);
  });
});

describe("markRecommendationReviewed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when procurement opportunity id missing", async () => {
    const r = await markRecommendationReviewed({} as any, {
      savingsOpportunityId: "x",
      procurementOpportunityId: "",
      actorId: "a",
    });
    expect(r).toEqual({ ok: false, error: "procurement_opportunity_id_required" });
  });

  it("updates draft row and emits recommendation_reviewed", async () => {
    const savingsApi = {
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: { id: "so1", trust_status: "draft", company_id: CO },
              error: null,
            }),
        }),
      }),
      update: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      }),
    };
    const supabase = {
      schema: () => ({
        from: (t: string) => {
          if (t === "savings_opportunities") return savingsApi;
          throw new Error(t);
        },
      }),
    };
    const r = await markRecommendationReviewed(supabase as any, {
      savingsOpportunityId: "so1",
      procurementOpportunityId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor",
    });
    expect(r.ok).toBe(true);
    expect(appendProcurementEvent).toHaveBeenCalledWith(
      expect.anything(),
      "11111111-1111-4111-8111-111111111111",
      ProcurementEventType.recommendation_reviewed,
      expect.objectContaining({ to_status: "operator_reviewed" })
    );
  });
});

describe("approveRecommendationForCustomer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchLatestTrustedPriceObservation).mockReset();
  });

  it("fails when row is draft (must be operator_reviewed)", async () => {
    const supabase = {
      schema: () => ({
        from: (t: string) => {
          if (t !== "savings_opportunities") throw new Error(t);
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: baseSavingsRow({ trust_status: "draft" }),
                    error: null,
                  }),
              }),
            }),
          };
        },
      }),
    };
    const r = await approveRecommendationForCustomer(supabase as any, {
      savingsOpportunityId: "so1",
      procurementOpportunityId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor",
    });
    expect(r).toEqual({ ok: false, error: "must_be_operator_reviewed" });
  });
});

describe("rejectRecommendation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fails when reason empty", async () => {
    const supabase = {
      schema: () => ({
        from: (t: string) => {
          if (t !== "savings_opportunities") throw new Error(t);
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: baseSavingsRow({ trust_status: "draft" }),
                    error: null,
                  }),
              }),
            }),
          };
        },
      }),
    };
    const r = await rejectRecommendation(supabase as any, {
      savingsOpportunityId: "so1",
      procurementOpportunityId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor",
      reason: "   ",
    });
    expect(r).toEqual({ ok: false, error: "reason_required" });
  });
});

describe("promoteReorderProduct", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fails when savings not approved_for_customer", async () => {
    const supabase = {
      schema: () => ({
        from: (t: string) => {
          if (t !== "savings_opportunities") throw new Error(t);
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: baseSavingsRow({ trust_status: "operator_reviewed" }),
                    error: null,
                  }),
              }),
            }),
          };
        },
      }),
    };
    const r = await promoteReorderProduct(supabase as any, {
      companyId: CO,
      savingsOpportunityId: "so1",
      procurementOpportunityId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor",
    });
    expect(r).toEqual({ ok: false, error: "savings_not_approved_for_customer" });
  });
});

describe("archiveRecommendation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fails when already archived", async () => {
    const supabase = {
      schema: () => ({
        from: (t: string) => {
          if (t !== "savings_opportunities") throw new Error(t);
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: baseSavingsRow({ trust_status: "archived" }),
                    error: null,
                  }),
              }),
            }),
          };
        },
      }),
    };
    const r = await archiveRecommendation(supabase as any, {
      savingsOpportunityId: "so1",
      procurementOpportunityId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor",
      reason: "stale",
    });
    expect(r).toEqual({ ok: false, error: "already_terminal" });
  });
});
