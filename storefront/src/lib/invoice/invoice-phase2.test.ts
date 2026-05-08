import { describe, expect, it, vi, beforeEach } from "vitest";
import { processInvoicePhase2, INVOICE_MATCHING_VERSION, computeAggregateReview } from "@/lib/invoice/invoice-phase2";
import { ProcurementEventType } from "@/lib/procurement/event-taxonomy";
import { resolveInvoiceLinesViaCatalogos } from "@/lib/invoice/catalogos-resolve-client";

const eventLog: string[] = [];

vi.mock("@/lib/procurement/opportunity-service", () => ({
  appendProcurementEvent: vi.fn(async (_s: unknown, _oid: string, type: string) => {
    eventLog.push(type);
    return true;
  }),
}));

vi.mock("@/lib/invoice/supplier-resolve", () => ({
  resolveInvoiceVendor: vi.fn(async () => ({
    catalogos_supplier_id: "sup-1",
    confidence: 0.98,
    method: "exact_ilike",
    review_status: "pending_review",
    normalized_vendor_key: "acme",
  })),
}));

const { mockRandomUUID, resetMockRandomUUID } = vi.hoisted(() => {
  let i = 0;
  return {
    mockRandomUUID: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++i).padStart(12, "0")}`,
    resetMockRandomUUID: () => {
      i = 0;
    },
  };
});

vi.mock("crypto", () => ({
  randomUUID: () => mockRandomUUID(),
}));

vi.mock("@/lib/invoice/catalogos-resolve-client", () => ({
  resolveInvoiceLinesViaCatalogos: vi.fn(),
}));

function createSupabaseMock(opts: { existingLineCount?: number; insertError?: string | null }) {
  const existingLineCount = opts.existingLineCount ?? 0;
  const invoiceLineUpdates: unknown[] = [];
  let insertLinesPayload: unknown[] | null = null;

  const supabase: any = {
    schema: (schema: string) => {
      if (schema !== "gc_commerce") throw new Error(`unexpected schema ${schema}`);
      return {
        from: (table: string) => {
          if (table === "invoice_lines") {
            return {
              select: (_sel: string, q?: { count?: string; head?: boolean }) => ({
                eq: () => {
                  if (q?.count === "exact" && q?.head) {
                    return Promise.resolve({ count: existingLineCount, error: null });
                  }
                  return Promise.resolve({ data: null, error: null });
                },
              }),
              insert: (rows: unknown[]) => {
                insertLinesPayload = rows;
                if (opts.insertError) {
                  return Promise.resolve({ error: { message: opts.insertError } });
                }
                return Promise.resolve({ error: null });
              },
              delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
              update: (patch: unknown) => ({
                eq: (_col: string, id: string) => {
                  invoiceLineUpdates.push({ patch, id });
                  return Promise.resolve({ error: null });
                },
              }),
            };
          }
          if (table === "uploaded_invoices") {
            return {
              select: (cols: string) => ({
                eq: () => ({
                  single: () => {
                    if (cols.includes("matching_attempt")) {
                      return Promise.resolve({ data: { matching_attempt: 0 }, error: null });
                    }
                    if (cols.includes("payload")) {
                      return Promise.resolve({ data: { payload: { last_extract: { x: 1 } } }, error: null });
                    }
                    return Promise.resolve({ data: {}, error: null });
                  },
                }),
              }),
              update: () => ({ eq: () => Promise.resolve({ error: null }) }),
            };
          }
          if (table === "invoice_supplier_matches") {
            return {
              delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
              insert: () => Promise.resolve({ error: null }),
            };
          }
          throw new Error(`unexpected table ${table}`);
        },
      };
    },
  };

  return {
    supabase,
    /** Do not destructure — must read after `processInvoicePhase2` for live value. */
    getInsertLinesPayload: () => insertLinesPayload,
    getInvoiceLineUpdates: () => invoiceLineUpdates,
  };
}

describe("processInvoicePhase2", () => {
  beforeEach(() => {
    eventLog.length = 0;
    resetMockRandomUUID();
    vi.mocked(resolveInvoiceLinesViaCatalogos).mockReset();
  });

  it("is a no-op replay when invoice_lines already exist (no duplicate events)", async () => {
    const { supabase } = createSupabaseMock({ existingLineCount: 3 });
    const r = await processInvoicePhase2({
      supabase,
      opportunityId: "opp-1",
      uploadedInvoiceId: "inv-1",
      extractOk: true,
      extract: { lines: [{ description: "A", quantity: 1, unit_price: 1, total: 1, sku_or_code: "x" }] } as any,
    });
    expect(r).toEqual({ ok: true });
    expect(eventLog).toEqual([]);
    expect(resolveInvoiceLinesViaCatalogos).not.toHaveBeenCalled();
  });

  it("persists lines, calls CatalogOS, updates rows, and emits events in deterministic order", async () => {
    const ctx = createSupabaseMock({});
    const { supabase } = ctx;
    const lineId = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
    vi.mocked(resolveInvoiceLinesViaCatalogos).mockResolvedValue({
      ok: true,
      results: [
        {
          line_id: lineId,
          matched: true,
          catalog_product_id: "prod-1",
          match_confidence: 0.9,
          match_reason: "upc_exact",
          category_slug: "disposable_gloves",
          normalized_snapshot: { a: 1 },
        },
      ],
    });

    const r = await processInvoicePhase2({
      supabase,
      opportunityId: "opp-1",
      uploadedInvoiceId: "inv-1",
      extractOk: true,
      extract: {
        vendor_name: "Acme",
        lines: [{ description: "Nitrile gloves", quantity: 2, unit_price: 3, total: 6, sku_or_code: "SKU1" }],
      } as any,
    });

    expect(r).toEqual({ ok: true });
    const insertLinesPayload = ctx.getInsertLinesPayload();
    expect(insertLinesPayload).toHaveLength(1);
    expect((insertLinesPayload![0] as any).raw_description).toBe("Nitrile gloves");
    expect(resolveInvoiceLinesViaCatalogos).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({
            line_id: lineId,
            row: expect.objectContaining({ description: "Nitrile gloves", sku: "SKU1" }),
          }),
        ]),
      }),
      expect.objectContaining({ opportunityId: "opp-1", uploadedInvoiceId: "inv-1" })
    );
    expect(ctx.getInvoiceLineUpdates().length).toBeGreaterThanOrEqual(1);

    expect(eventLog).toEqual([
      ProcurementEventType.invoice_lines_persisted,
      ProcurementEventType.supplier_match_completed,
      ProcurementEventType.product_match_completed,
    ]);
  });

  it("routes CatalogOS failure to review_required and still completes product_match event", async () => {
    const { supabase } = createSupabaseMock({});
    vi.mocked(resolveInvoiceLinesViaCatalogos).mockResolvedValue({ ok: false, error: "500 boom", status: 500 });

    const r = await processInvoicePhase2({
      supabase,
      opportunityId: "opp-1",
      uploadedInvoiceId: "inv-1",
      extractOk: true,
      extract: { lines: [{ description: "X", quantity: 1, unit_price: 1, total: 1 }] } as any,
    });
    expect(r).toEqual({ ok: true });
    expect(eventLog).toEqual([
      ProcurementEventType.invoice_lines_persisted,
      ProcurementEventType.supplier_match_completed,
      ProcurementEventType.product_match_completed,
      ProcurementEventType.line_review_required,
    ]);
  });

  it("returns error when line insert fails (e.g. duplicate key)", async () => {
    const { supabase } = createSupabaseMock({ insertError: "duplicate key value" });
    const r = await processInvoicePhase2({
      supabase,
      opportunityId: "opp-1",
      uploadedInvoiceId: "inv-1",
      extractOk: true,
      extract: { lines: [{ description: "A", quantity: 1 }] } as any,
    });
    expect(r).toEqual({ ok: false, error: "invoice_lines_insert:duplicate key value" });
    expect(eventLog).toEqual([]);
  });

  it("includes matching_version on invoice_lines_persisted payload", async () => {
    const { supabase } = createSupabaseMock({});
    const lineId = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
    vi.mocked(resolveInvoiceLinesViaCatalogos).mockResolvedValue({
      ok: true,
      results: [
        {
          line_id: lineId,
          matched: true,
          catalog_product_id: "prod-1",
          match_confidence: 0.9,
          match_reason: "upc_exact",
          category_slug: "disposable_gloves",
          normalized_snapshot: {},
        },
      ],
    });

    await processInvoicePhase2({
      supabase,
      opportunityId: "opp-1",
      uploadedInvoiceId: "inv-1",
      extractOk: true,
      extract: { lines: [{ description: "Only", quantity: 1 }] } as any,
    });

    const { appendProcurementEvent } = await import("@/lib/procurement/opportunity-service");
    const firstCall = vi.mocked(appendProcurementEvent).mock.calls.find(
      (c) => c[2] === ProcurementEventType.invoice_lines_persisted
    );
    expect(firstCall?.[3]).toMatchObject({ matching_version: INVOICE_MATCHING_VERSION });
  });

  it("emits no_match_detected before line_review_required when both apply", async () => {
    const { supabase } = createSupabaseMock({});
    const idNoMatch = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
    const idReview = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
    vi.mocked(resolveInvoiceLinesViaCatalogos).mockResolvedValue({
      ok: true,
      results: [
        {
          line_id: idNoMatch,
          matched: false,
          catalog_product_id: null,
          match_confidence: 0,
          match_reason: "no_match",
          category_slug: "disposable_gloves",
          normalized_snapshot: {},
        },
        {
          line_id: idReview,
          matched: true,
          catalog_product_id: "p2",
          match_confidence: 0.5,
          match_reason: "fuzzy_title",
          category_slug: "disposable_gloves",
          normalized_snapshot: {},
        },
      ],
    });

    await processInvoicePhase2({
      supabase,
      opportunityId: "opp-1",
      uploadedInvoiceId: "inv-1",
      extractOk: true,
      extract: {
        lines: [
          { description: "A", quantity: 1 },
          { description: "B", quantity: 1 },
        ],
      } as any,
    });

    const nmIdx = eventLog.indexOf(ProcurementEventType.no_match_detected);
    const lrIdx = eventLog.indexOf(ProcurementEventType.line_review_required);
    expect(nmIdx).toBeGreaterThan(-1);
    expect(lrIdx).toBeGreaterThan(-1);
    expect(nmIdx).toBeLessThan(lrIdx);
  });
});

describe("computeAggregateReview", () => {
  it("returns no_match when every line is no_match (unanimous)", () => {
    expect(computeAggregateReview(["no_match", "no_match"], "pending_review")).toBe("no_match");
  });

  it("returns review_required when no_match is mixed with other line states", () => {
    expect(computeAggregateReview(["no_match", "review_required"], "pending_review")).toBe("review_required");
    expect(computeAggregateReview(["no_match", "pending_review"], "pending_review")).toBe("review_required");
  });

  it("returns cleared when there are no lines and supplier is calm", () => {
    expect(computeAggregateReview([], "pending_review")).toBe("cleared");
  });

  it("supplier review_required still wins over unanimous no_match lines", () => {
    expect(computeAggregateReview(["no_match"], "review_required")).toBe("review_required");
  });
});
