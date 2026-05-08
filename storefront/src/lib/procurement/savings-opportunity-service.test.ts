import { describe, expect, it, vi, beforeEach } from "vitest";
import { appendProcurementEvent } from "@/lib/procurement/opportunity-service";
import { ProcurementEventType } from "@/lib/procurement/event-taxonomy";
import { runSavingsOpportunityBuildAfterTrustedObservation } from "@/lib/procurement/savings-opportunity-service";

vi.mock("@/lib/procurement/opportunity-service", () => ({
  appendProcurementEvent: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@/lib/procurement/price-observation-queries", () => ({
  fetchLatestTrustedPriceObservation: vi.fn(),
}));

import { fetchLatestTrustedPriceObservation } from "@/lib/procurement/price-observation-queries";

const P_SRC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P_CAND = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const G1 = "11111111-1111-4111-8111-111111111111";
const SUB1 = "22222222-2222-4222-8222-222222222222";

function trustedLine(overrides: Record<string, unknown> = {}) {
  return {
    uploaded_invoice_id: "u1",
    review_status: "approved",
    decision_source: "operator",
    human_decided_at: "2026-01-01T00:00:00Z",
    human_decided_by: "admin",
    catalog_product_id: P_SRC,
    quantity: 1,
    unit_price: 10,
    ...overrides,
  };
}

function trustedSupplier(overrides: Record<string, unknown> = {}) {
  return {
    review_status: "approved",
    decision_source: "operator",
    reviewed_at: "2026-01-01T00:00:00Z",
    reviewed_by: "admin",
    catalogos_supplier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ...overrides,
  };
}

function approvedMember(units: number) {
  return {
    units_per_line_uom: units,
    approved_at: "2026-01-02T00:00:00Z",
    decision_source: "operator",
    valid_to: null,
  };
}

type MockCtx = {
  groupStatus?: string;
  srcMember?: Record<string, unknown> | null;
  candMember?: Record<string, unknown> | null;
  subs?: unknown[];
  existActive?: { id: string } | null;
  savingsInsertResult?: { data: { id: string }; error: null } | { data: null; error: { code: string; message: string } };
  savingsInsertSpy?: (row: Record<string, unknown>) => void;
};

function createSavingsSupabase(ctx: MockCtx) {
  const subs = ctx.subs ?? [
    {
      id: SUB1,
      from_catalog_product_id: P_SRC,
      to_catalog_product_id: P_CAND,
      spec_group_id: G1,
      status: "approved",
      approved_at: "2026-01-03T00:00:00Z",
    },
  ];
  const groupStatus = ctx.groupStatus ?? "active";
  const srcMember = ctx.srcMember ?? approvedMember(100);
  const candMember = ctx.candMember ?? approvedMember(100);
  const existActive = ctx.existActive ?? null;
  const defaultInsert = { data: { id: "so-new-1" }, error: null as null };
  const savingsInsertResult = ctx.savingsInsertResult ?? defaultInsert;

  return {
    schema: () => ({
      from: (table: string) => {
        if (table === "invoice_lines") {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: trustedLine(), error: null }),
              }),
            }),
          };
        }
        if (table === "invoice_supplier_matches") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: trustedSupplier(), error: null }),
              }),
            }),
          };
        }
        if (table === "substitution_candidates") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  not: () => Promise.resolve({ data: subs, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "savings_opportunities") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  in: () => ({
                    maybeSingle: () => Promise.resolve({ data: existActive, error: null }),
                  }),
                }),
              }),
            }),
            insert: (row: Record<string, unknown>) => {
              ctx.savingsInsertSpy?.(row);
              const insErr = savingsInsertResult.error;
              if (insErr) {
                return {
                  select: () => ({
                    single: () => Promise.resolve({ data: null, error: insErr }),
                  }),
                };
              }
              return {
                select: () => ({
                  single: () => Promise.resolve(savingsInsertResult as { data: { id: string }; error: null }),
                }),
              };
            },
          };
        }
        if (table === "glove_spec_groups") {
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: G1, status: groupStatus },
                    error: null,
                  }),
              }),
            }),
          };
        }
        if (table === "glove_spec_group_members") {
          return {
            select: () => ({
              eq: () => ({
                eq: (col: string, val: unknown) => {
                  const pick = col === "catalog_product_id" && val === P_SRC ? srcMember : candMember;
                  return {
                    maybeSingle: () => Promise.resolve({ data: pick, error: null }),
                  };
                },
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    }),
  };
}

describe("runSavingsOpportunityBuildAfterTrustedObservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchLatestTrustedPriceObservation).mockReset();
  });

  it("emits blocked when line is not trusted (no savings row)", async () => {
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
                        ...trustedLine(),
                        review_status: "review_required",
                        decision_source: "system",
                        human_decided_at: null,
                        human_decided_by: null,
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
    const r = await runSavingsOpportunityBuildAfterTrustedObservation(supabase as any, {
      invoiceLineId: "line-1",
      companyId: "co-1",
      catalogProductId: P_SRC,
      procurementOpportunityId: "opp-1",
    });
    expect(r.ok).toBe(true);
    expect(appendProcurementEvent).toHaveBeenCalledWith(
      expect.anything(),
      "opp-1",
      ProcurementEventType.savings_opportunity_blocked,
      expect.objectContaining({ block_reason: "line_not_trusted" })
    );
  });

  it("emits blocked when supplier is not trusted", async () => {
    const supabase = {
      schema: () => ({
        from: (table: string) => {
          if (table === "invoice_lines") {
            return {
              select: () => ({
                eq: () => ({
                  single: () => Promise.resolve({ data: trustedLine(), error: null }),
                }),
              }),
            };
          }
          if (table === "invoice_supplier_matches") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: trustedSupplier({ review_status: "review_required", decision_source: "system" }),
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
    const r = await runSavingsOpportunityBuildAfterTrustedObservation(supabase as any, {
      invoiceLineId: "line-1",
      companyId: "co-1",
      catalogProductId: P_SRC,
      procurementOpportunityId: "opp-1",
    });
    expect(r.ok).toBe(true);
    expect(appendProcurementEvent).toHaveBeenCalledWith(
      expect.anything(),
      "opp-1",
      ProcurementEventType.savings_opportunity_blocked,
      expect.objectContaining({ block_reason: "supplier_not_trusted" })
    );
    expect(vi.mocked(fetchLatestTrustedPriceObservation)).not.toHaveBeenCalled();
  });

  it("emits blocked when trusted but missing source observation", async () => {
    vi.mocked(fetchLatestTrustedPriceObservation).mockResolvedValue(null);
    const supabase = {
      schema: () => ({
        from: (table: string) => {
          if (table === "invoice_lines") {
            return {
              select: () => ({
                eq: () => ({
                  single: () => Promise.resolve({ data: trustedLine(), error: null }),
                }),
              }),
            };
          }
          if (table === "invoice_supplier_matches") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: trustedSupplier(), error: null }),
                }),
              }),
            };
          }
          throw new Error(table);
        },
      }),
    };
    const r = await runSavingsOpportunityBuildAfterTrustedObservation(supabase as any, {
      invoiceLineId: "line-1",
      companyId: "co-1",
      catalogProductId: P_SRC,
      procurementOpportunityId: "opp-1",
    });
    expect(r.ok).toBe(true);
    expect(appendProcurementEvent).toHaveBeenCalledWith(
      expect.anything(),
      "opp-1",
      ProcurementEventType.savings_opportunity_blocked,
      expect.objectContaining({ block_reason: "missing_trusted_source_observation" })
    );
  });

  it("happy path: one draft row, deterministic normalized delta, drafted then rules_passed", async () => {
    vi.mocked(fetchLatestTrustedPriceObservation).mockImplementation(async (_s, _co, catalogProductId) => {
      if (catalogProductId === P_SRC) {
        return {
          unit_price: 10,
          quantity: 1,
          observed_at: "2026-01-01T00:00:00Z",
          catalogos_supplier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        };
      }
      if (catalogProductId === P_CAND) {
        return {
          unit_price: 6,
          quantity: 1,
          observed_at: "2026-01-01T00:00:00Z",
          catalogos_supplier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        };
      }
      return null;
    });
    const inserted: Record<string, unknown>[] = [];
    const supabase = createSavingsSupabase({
      savingsInsertSpy: (row) => inserted.push(row),
    });
    const r = await runSavingsOpportunityBuildAfterTrustedObservation(supabase as any, {
      invoiceLineId: "line-1",
      companyId: "co-1",
      catalogProductId: P_SRC,
      procurementOpportunityId: "opp-1",
    });
    expect(r.ok).toBe(true);
    expect(inserted).toHaveLength(1);
    const row = inserted[0]!;
    expect(row.trust_status).toBe("draft");
    expect(row.block_reason).toBeNull();
    expect(row.source_unit_price_normalized).toBe(10);
    expect(row.candidate_unit_price_normalized).toBe(6);
    expect(row.estimated_delta_per_basis).toBe(4);
    const draftedIdx = vi.mocked(appendProcurementEvent).mock.calls.findIndex(
      (c) => c[2] === ProcurementEventType.savings_opportunity_drafted
    );
    const rulesIdx = vi.mocked(appendProcurementEvent).mock.calls.findIndex(
      (c) => c[2] === ProcurementEventType.savings_opportunity_rules_passed
    );
    expect(draftedIdx).toBeGreaterThanOrEqual(0);
    expect(rulesIdx).toBeGreaterThan(draftedIdx);
    expect(vi.mocked(appendProcurementEvent).mock.calls[rulesIdx]?.[3]).toMatchObject({
      savings_opportunity_id: "so-new-1",
      estimated_delta_per_basis: 4,
    });
  });

  it("idempotency: existing active opportunity skips insert and skips draft events", async () => {
    vi.mocked(fetchLatestTrustedPriceObservation).mockImplementation(async (_s, _co, catalogProductId) => {
      if (catalogProductId === P_SRC || catalogProductId === P_CAND) {
        return {
          unit_price: 10,
          quantity: 1,
          observed_at: "2026-01-01T00:00:00Z",
          catalogos_supplier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        };
      }
      return null;
    });
    const inserted: Record<string, unknown>[] = [];
    const supabase = createSavingsSupabase({
      existActive: { id: "existing-so" },
      savingsInsertSpy: (row) => inserted.push(row),
    });
    const r = await runSavingsOpportunityBuildAfterTrustedObservation(supabase as any, {
      invoiceLineId: "line-1",
      companyId: "co-1",
      catalogProductId: P_SRC,
      procurementOpportunityId: "opp-1",
    });
    expect(r.ok).toBe(true);
    expect(inserted).toHaveLength(0);
    expect(vi.mocked(appendProcurementEvent).mock.calls.some((c) => c[2] === ProcurementEventType.savings_opportunity_drafted)).toBe(
      false
    );
  });

  it("treats duplicate insert (23505) as safe retry — no thrown error, no rules_passed", async () => {
    vi.mocked(fetchLatestTrustedPriceObservation).mockImplementation(async (_s, _co, catalogProductId) => {
      if (catalogProductId === P_SRC || catalogProductId === P_CAND) {
        return {
          unit_price: 10,
          quantity: 1,
          observed_at: "2026-01-01T00:00:00Z",
          catalogos_supplier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        };
      }
      return null;
    });
    const supabase = createSavingsSupabase({
      savingsInsertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
    });
    const r = await runSavingsOpportunityBuildAfterTrustedObservation(supabase as any, {
      invoiceLineId: "line-1",
      companyId: "co-1",
      catalogProductId: P_SRC,
      procurementOpportunityId: "opp-1",
    });
    expect(r.ok).toBe(true);
    expect(vi.mocked(appendProcurementEvent).mock.calls.some((c) => c[2] === ProcurementEventType.savings_opportunity_rules_passed)).toBe(
      false
    );
  });

  it("inactive spec group: emits blocked, no draft insert", async () => {
    vi.mocked(fetchLatestTrustedPriceObservation).mockResolvedValue({
      unit_price: 10,
      quantity: 1,
      observed_at: "2026-01-01T00:00:00Z",
      catalogos_supplier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    const inserted: Record<string, unknown>[] = [];
    const supabase = createSavingsSupabase({
      groupStatus: "retired",
      savingsInsertSpy: (row) => inserted.push(row),
    });
    const r = await runSavingsOpportunityBuildAfterTrustedObservation(supabase as any, {
      invoiceLineId: "line-1",
      companyId: "co-1",
      catalogProductId: P_SRC,
      procurementOpportunityId: "opp-1",
    });
    expect(r.ok).toBe(true);
    expect(inserted).toHaveLength(0);
    expect(appendProcurementEvent).toHaveBeenCalledWith(
      expect.anything(),
      "opp-1",
      ProcurementEventType.savings_opportunity_blocked,
      expect.objectContaining({ block_reason: "spec_group_not_active" })
    );
  });

  it("pending group membership: emits source_not_approved_group_member", async () => {
    vi.mocked(fetchLatestTrustedPriceObservation).mockResolvedValue({
      unit_price: 10,
      quantity: 1,
      observed_at: "2026-01-01T00:00:00Z",
      catalogos_supplier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    const supabase = createSavingsSupabase({
      srcMember: { ...approvedMember(100), approved_at: null, decision_source: "system" },
    });
    const r = await runSavingsOpportunityBuildAfterTrustedObservation(supabase as any, {
      invoiceLineId: "line-1",
      companyId: "co-1",
      catalogProductId: P_SRC,
      procurementOpportunityId: "opp-1",
    });
    expect(r.ok).toBe(true);
    expect(appendProcurementEvent).toHaveBeenCalledWith(
      expect.anything(),
      "opp-1",
      ProcurementEventType.savings_opportunity_blocked,
      expect.objectContaining({ block_reason: "source_not_approved_group_member" })
    );
  });

  it("missing pack UOM on member: inserts blocked row + blocked event", async () => {
    vi.mocked(fetchLatestTrustedPriceObservation).mockImplementation(async (_s, _co, catalogProductId) => {
      if (catalogProductId === P_SRC || catalogProductId === P_CAND) {
        return {
          unit_price: 10,
          quantity: 1,
          observed_at: "2026-01-01T00:00:00Z",
          catalogos_supplier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        };
      }
      return null;
    });
    const inserted: Record<string, unknown>[] = [];
    const supabase = createSavingsSupabase({
      srcMember: { ...approvedMember(100), units_per_line_uom: 0 },
      savingsInsertSpy: (row) => inserted.push(row),
    });
    const r = await runSavingsOpportunityBuildAfterTrustedObservation(supabase as any, {
      invoiceLineId: "line-1",
      companyId: "co-1",
      catalogProductId: P_SRC,
      procurementOpportunityId: "opp-1",
    });
    expect(r.ok).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ trust_status: "blocked", block_reason: "missing_units_per_line_uom" });
    expect(appendProcurementEvent).toHaveBeenCalledWith(
      expect.anything(),
      "opp-1",
      ProcurementEventType.savings_opportunity_blocked,
      expect.objectContaining({ block_reason: "missing_units_per_line_uom" })
    );
  });

  it("missing candidate observation: blocked row + event (replay can duplicate blocked rows — current behavior)", async () => {
    vi.mocked(fetchLatestTrustedPriceObservation).mockImplementation(async (_s, _co, catalogProductId) => {
      if (catalogProductId === P_SRC) {
        return {
          unit_price: 10,
          quantity: 1,
          observed_at: "2026-01-01T00:00:00Z",
          catalogos_supplier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        };
      }
      return null;
    });
    const inserted: Record<string, unknown>[] = [];
    const supabase = createSavingsSupabase({ savingsInsertSpy: (row) => inserted.push(row) });
    const r = await runSavingsOpportunityBuildAfterTrustedObservation(supabase as any, {
      invoiceLineId: "line-1",
      companyId: "co-1",
      catalogProductId: P_SRC,
      procurementOpportunityId: "opp-1",
    });
    expect(r.ok).toBe(true);
    expect(inserted[0]).toMatchObject({
      trust_status: "blocked",
      block_reason: "missing_trusted_candidate_observation",
    });
    vi.clearAllMocks();
    const inserted2: Record<string, unknown>[] = [];
    const supabase2 = createSavingsSupabase({ savingsInsertSpy: (row) => inserted2.push(row) });
    const r2 = await runSavingsOpportunityBuildAfterTrustedObservation(supabase2 as any, {
      invoiceLineId: "line-1",
      companyId: "co-1",
      catalogProductId: P_SRC,
      procurementOpportunityId: "opp-1",
    });
    expect(r2.ok).toBe(true);
    expect(inserted2).toHaveLength(1);
  });

  it("rejected substitution edges never appear (empty approved query)", async () => {
    vi.mocked(fetchLatestTrustedPriceObservation).mockResolvedValue({
      unit_price: 10,
      quantity: 1,
      observed_at: "2026-01-01T00:00:00Z",
      catalogos_supplier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    const supabase = createSavingsSupabase({ subs: [] });
    const r = await runSavingsOpportunityBuildAfterTrustedObservation(supabase as any, {
      invoiceLineId: "line-1",
      companyId: "co-1",
      catalogProductId: P_SRC,
      procurementOpportunityId: "opp-1",
    });
    expect(r.ok).toBe(true);
    expect(appendProcurementEvent).not.toHaveBeenCalled();
  });

  it("normalization failure: inserts blocked row with detailed block_reason on row", async () => {
    vi.mocked(fetchLatestTrustedPriceObservation).mockImplementation(async (_s, _co, catalogProductId) => {
      if (catalogProductId === P_SRC) {
        return {
          unit_price: -5,
          quantity: 1,
          observed_at: "2026-01-01T00:00:00Z",
          catalogos_supplier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        };
      }
      if (catalogProductId === P_CAND) {
        return {
          unit_price: 6,
          quantity: 1,
          observed_at: "2026-01-01T00:00:00Z",
          catalogos_supplier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        };
      }
      return null;
    });
    const inserted: Record<string, unknown>[] = [];
    const supabase = createSavingsSupabase({ savingsInsertSpy: (row) => inserted.push(row) });
    const r = await runSavingsOpportunityBuildAfterTrustedObservation(supabase as any, {
      invoiceLineId: "line-1",
      companyId: "co-1",
      catalogProductId: P_SRC,
      procurementOpportunityId: "opp-1",
    });
    expect(r.ok).toBe(true);
    expect(inserted[0]?.trust_status).toBe("blocked");
    expect(String(inserted[0]?.block_reason)).toContain("normalization_failed");
  });

  it("economic integrity: uses absolute per-basis delta, not percentage", async () => {
    vi.mocked(fetchLatestTrustedPriceObservation).mockImplementation(async (_s, _co, catalogProductId) => {
      if (catalogProductId === P_SRC) {
        return { unit_price: 20, quantity: 1, observed_at: "2026-01-01T00:00:00Z", catalogos_supplier_id: "b" };
      }
      if (catalogProductId === P_CAND) {
        return { unit_price: 15, quantity: 1, observed_at: "2026-01-01T00:00:00Z", catalogos_supplier_id: "b" };
      }
      return null;
    });
    const inserted: Record<string, unknown>[] = [];
    const supabase = createSavingsSupabase({ savingsInsertSpy: (row) => inserted.push(row) });
    await runSavingsOpportunityBuildAfterTrustedObservation(supabase as any, {
      invoiceLineId: "line-1",
      companyId: "co-1",
      catalogProductId: P_SRC,
      procurementOpportunityId: "opp-1",
    });
    expect(inserted[0]?.estimated_delta_per_basis).toBe(5);
    const payloads = vi.mocked(appendProcurementEvent).mock.calls.map((c) => JSON.stringify(c[3]));
    expect(payloads.some((p) => p.includes("%") || p.includes("percent"))).toBe(false);
  });
});
