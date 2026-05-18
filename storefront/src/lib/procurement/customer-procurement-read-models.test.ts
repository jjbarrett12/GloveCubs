import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  assertCustomerApprovedOpportunityDtoShape,
  CUSTOMER_PROCUREMENT_TIMELINE_EVENT_TYPES,
  fetchCustomerApprovedOpportunities,
  fetchCustomerProcurementTimeline,
  mapRawProcurementEventToCustomerTimelineRow,
} from "@/lib/procurement/customer-procurement-read-models";
import { ProcurementEventType } from "@/lib/procurement/event-taxonomy";
import * as Lifecycle from "@/lib/procurement/recommendation-lifecycle-service";
import * as StoreProducts from "@/lib/catalog/store-products";

describe("customer procurement read models", () => {
  it("assertCustomerApprovedOpportunityDtoShape rejects extra top-level keys", () => {
    const bad = {
      id: "x",
      basis_uom: "per_100_gloves",
      approved_for_customer_at: null,
      procurement_opportunity_id: null,
      source_product: { catalog_product_id: "a", label: "A", slug: null },
      candidate_product: { catalog_product_id: "b", label: "B", slug: null },
      economics: {
        source_unit_price_normalized: 1,
        candidate_unit_price_normalized: 2,
        estimated_delta_per_basis: -1,
        observed_at_source: "2026-01-01",
        observed_at_candidate: "2026-01-02",
      },
      trust_status: "leak",
    } as unknown as Parameters<typeof assertCustomerApprovedOpportunityDtoShape>[0];
    expect(() => assertCustomerApprovedOpportunityDtoShape(bad)).toThrow(/customer_opportunity_dto_leak/);
  });

  it("approved opportunity DTO JSON has no governance or internal savings fields", () => {
    const dto = {
      id: "so-1",
      basis_uom: "per_100_gloves",
      approved_for_customer_at: "2026-01-01T00:00:00Z",
      procurement_opportunity_id: "opp-1",
      source_product: { catalog_product_id: "a", label: "A", slug: "a" },
      candidate_product: { catalog_product_id: "b", label: "B", slug: "b" },
      economics: {
        source_unit_price_normalized: 1,
        candidate_unit_price_normalized: 0.9,
        estimated_delta_per_basis: 0.1,
        observed_at_source: "2026-01-01T00:00:00Z",
        observed_at_candidate: "2026-01-02T00:00:00Z",
      },
    };
    assertCustomerApprovedOpportunityDtoShape(dto);
    const s = JSON.stringify(dto);
    expect(s).not.toMatch(/block_reason|reviewed_by|trust_status|confidence|draft|operator_reviewed/);
  });

  it("mapRawProcurementEventToCustomerTimelineRow returns null for non-customer-safe types", () => {
    const row = mapRawProcurementEventToCustomerTimelineRow({
      id: "1",
      event_type: ProcurementEventType.invoice_extraction_started,
      payload: {},
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(row).toBeNull();
  });

  it("timeline allowlist excludes AI and intake noise", () => {
    expect(CUSTOMER_PROCUREMENT_TIMELINE_EVENT_TYPES).not.toContain(ProcurementEventType.ai_advisory_glove_finder);
    expect(CUSTOMER_PROCUREMENT_TIMELINE_EVENT_TYPES).not.toContain(ProcurementEventType.invoice_extraction_started);
    expect(CUSTOMER_PROCUREMENT_TIMELINE_EVENT_TYPES).not.toContain(ProcurementEventType.recommendation_rejected);
  });

  it("mapRawProcurementEventToCustomerTimelineRow sorts-stable fields for recommendation_approved", () => {
    const row = mapRawProcurementEventToCustomerTimelineRow({
      id: "e1",
      event_type: ProcurementEventType.recommendation_approved,
      payload: {
        basis_uom: "per_100_gloves",
        source_unit_price_normalized: 10,
        candidate_unit_price_normalized: 9,
        estimated_delta_per_basis: 1,
      },
      created_at: "2026-03-01T12:00:00Z",
    });
    expect(row?.headline).toBe("Approved alternate recorded");
    expect(row?.detail).toContain("SourceIt reviewed");
    expect(row?.detail).toContain("governed observations");
    expect(row?.detail).not.toMatch(/AI|smart|benchmark|operator|internal review queue/i);
  });
});

describe("fetchCustomerApprovedOpportunities stale exclusion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("omits approved rows that fail economic revalidation", async () => {
    vi.spyOn(Lifecycle, "revalidateSavingsOpportunityForApproval").mockResolvedValue({
      ok: false,
      reason: "economic_snapshot_stale",
    });
    vi.spyOn(StoreProducts, "fetchStoreProductRowsByIds").mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Src",
        slug: "src",
        brandName: null,
        brandId: null,
        imageUrl: null,
        internalSku: null,
        catalogVariantId: null,
        variantSku: null,
        sizeCode: null,
        materialHint: null,
        badges: [],
        bestPrice: null,
        commercialUseSummary: null,
        certificationHints: [],
        protectionHint: null,
        activeVariantCount: 1,
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        name: "Cand",
        slug: "cand",
        brandName: null,
        brandId: null,
        imageUrl: null,
        internalSku: null,
        catalogVariantId: null,
        variantSku: null,
        sizeCode: null,
        materialHint: null,
        badges: [],
        bestPrice: null,
        commercialUseSummary: null,
        certificationHints: [],
        protectionHint: null,
        activeVariantCount: 1,
      },
    ]);

    const supabase = {
      schema: () => ({
        from: (table: string) => {
          if (table === "savings_opportunities") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    order: () => ({
                      limit: () =>
                        Promise.resolve({
                          data: [
                            {
                              id: "so-1",
                              company_id: "co-1",
                              source_invoice_line_id: "line-1",
                              source_catalog_product_id: "00000000-0000-4000-8000-000000000001",
                              candidate_catalog_product_id: "00000000-0000-4000-8000-000000000002",
                              basis_uom: "per_100_gloves",
                              source_unit_price_normalized: 1,
                              candidate_unit_price_normalized: 2,
                              estimated_delta_per_basis: -1,
                              trust_status: "approved_for_customer",
                              approved_for_customer_at: "2026-01-01T00:00:00Z",
                              created_at: "2026-01-01T00:00:00Z",
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
                    data: [{ id: "up-1", procurement_opportunity_id: "00000000-0000-4000-8000-000000000099" }],
                    error: null,
                  }),
              }),
            };
          }
          throw new Error(`unexpected table ${table}`);
        },
      }),
    };

    const rows = await fetchCustomerApprovedOpportunities(supabase as any, "co-1");
    expect(rows).toHaveLength(0);
  });
});

describe("fetchCustomerProcurementTimeline ordering", () => {
  it("orders newest first with stable tie-break on id", async () => {
    const supabase = {
      schema: (schemaName: string) => {
        if (schemaName !== "gc_commerce") throw new Error(schemaName);
        return {
          from: (table: string) => {
            if (table === "uploaded_invoices") {
              return {
                select: () => ({
                  eq: () => ({
                    not: () => ({
                      limit: () =>
                        Promise.resolve({
                          data: [{ procurement_opportunity_id: "opp-1" }],
                          error: null,
                        }),
                    }),
                  }),
                }),
              };
            }
            throw new Error(table);
          },
        };
      },
      from: (table: string) => {
        if (table !== "procurement_events") throw new Error(table);
        return {
          select: () => ({
            in: () => ({
              in: () => ({
                order: () => ({
                  limit: () =>
                    Promise.resolve({
                      data: [
                        {
                          id: "b",
                          event_type: ProcurementEventType.reorder_product_promoted,
                          payload: { occurred_at: "2026-01-02T00:00:00Z" },
                          created_at: "2026-01-02T00:00:00Z",
                        },
                        {
                          id: "a",
                          event_type: ProcurementEventType.recommendation_approved,
                          payload: { occurred_at: "2026-01-03T00:00:00Z", basis_uom: "per_100_gloves" },
                          created_at: "2026-01-03T00:00:00Z",
                        },
                      ],
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        };
      },
    };

    const rows = await fetchCustomerProcurementTimeline(supabase as any, "co-1", 50);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
});
