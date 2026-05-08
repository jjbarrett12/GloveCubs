import { describe, expect, it, vi, beforeEach } from "vitest";
import { recordInvoiceIntakeSpine } from "@/lib/procurement/spine-writes";
import { ProcurementEventType } from "@/lib/procurement/event-taxonomy";
import { runInvoiceIntake } from "@/lib/invoice/run-intake";
import * as aiProvider from "@/lib/ai/provider";

describe("recordInvoiceIntakeSpine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits pre events in order (uploaded then extraction_started)", async () => {
    const inserted: { event_type: string; payload: Record<string, unknown> }[] = [];
    const supabase = {
      from: (table: string) => {
        if (table !== "procurement_events") throw new Error(`unexpected table ${table}`);
        return {
          insert: (row: { event_type: string; payload: Record<string, unknown> }) => {
            inserted.push({ event_type: row.event_type, payload: row.payload });
            return { error: null };
          },
        };
      },
    };

    const ok = await recordInvoiceIntakeSpine(supabase as any, {
      phase: "pre",
      opportunityId: "opp-1",
      uploadedInvoiceId: "inv-1",
      idempotencyKey: "idem-a",
      companyId: "co-1",
      document: {
        filename: "a.pdf",
        mime_type: "application/pdf",
        byte_size: 12,
        content_sha256: "abc",
      },
      extractionVersion: "invoice-intake-v1",
      extractionModel: "gpt-4o-mini",
    });
    expect(ok).toBe(true);
    expect(inserted.map((r) => r.event_type)).toEqual([
      ProcurementEventType.invoice_uploaded,
      ProcurementEventType.invoice_extraction_started,
    ]);
    expect(inserted[0].payload.uploaded_invoice_id).toBe("inv-1");
    expect(inserted[1].payload.extraction_version).toBe("invoice-intake-v1");
  });

  it("emits post events in order (completed, review_required, assessment_pending)", async () => {
    const inserted: string[] = [];
    const supabase = {
      from: (table: string) => {
        if (table !== "procurement_events") throw new Error(`unexpected table ${table}`);
        return {
          insert: (row: { event_type: string }) => {
            inserted.push(row.event_type);
            return { error: null };
          },
        };
      },
    };

    const ok = await recordInvoiceIntakeSpine(supabase as any, {
      phase: "post",
      opportunityId: "opp-1",
      uploadedInvoiceId: "inv-1",
      extraction: {
        ok: false,
        lineCount: 0,
        vendorName: null,
        invoiceNumber: null,
        totalAmount: null,
        error: "simulated extract failure",
      },
    });
    expect(ok).toBe(true);
    expect(inserted).toEqual([
      ProcurementEventType.invoice_extraction_completed,
      ProcurementEventType.review_required,
      ProcurementEventType.assessment_pending,
    ]);
  });
});

describe("runInvoiceIntake", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns idempotent replay without calling AI when opportunity + intake already exist", async () => {
    const extractSpy = vi.spyOn(aiProvider, "aiExtractInvoice").mockRejectedValue(new Error("AI must not run"));

    const intakeRow = {
      id: "intake-1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      intake_status: "extracted_ok",
      extraction_model: "gpt-4o-mini",
      extracted_at: "2026-01-01T00:01:00Z",
      extraction_error: null,
      payload: {
        last_extract: {
          vendor_name: "V",
          invoice_number: "1",
          total_amount: 10,
          lines: [{ description: "x", quantity: 1, unit_price: 10, total: 10, sku_or_code: null }],
        },
      },
    };

    const supabase = {
      from: (table: string) => {
        if (table === "procurement_opportunities") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "opp-1",
                    idempotency_key: "idem-x",
                    metadata: {},
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected public table ${table}`);
      },
      schema: (schema: string) => {
        expect(schema).toBe("gc_commerce");
        return {
          from: (table: string) => {
            if (table === "uploaded_invoices") {
              return {
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: intakeRow, error: null }),
                  }),
                }),
              };
            }
            throw new Error(`unexpected gc table ${table}`);
          },
        };
      },
    };

    const result = await runInvoiceIntake({
      supabase,
      identityOverride: {
        authenticated: true,
        company_id: "co-1",
        user_id: "user-1",
        anonymous_session_id: null,
      },
      idempotencyKeyHeader: "idem-x",
      anonymousSessionId: null,
      file: { buffer: Buffer.from("x"), filename: "f.pdf", mimeType: "application/pdf" },
    });

    expect(extractSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contract.idempotent_replay).toBe(true);
      expect(result.contract.intake_id).toBe("intake-1");
      expect(result.contract.vendor_name).toBe("V");
    }
  });

  it("returns 409 when same company re-uploads same bytes with a different idempotency key", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "procurement_opportunities") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        throw new Error(`unexpected public table ${table}`);
      },
      schema: () => ({
        from: (table: string) => {
          if (table !== "uploaded_invoices") throw new Error(table);
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "existing",
                      idempotency_key: "old-key",
                      intake_status: "extracted_ok",
                      created_at: "2026-01-01T00:00:00Z",
                      updated_at: "2026-01-01T00:00:00Z",
                      extraction_model: null,
                      extracted_at: null,
                      extraction_error: null,
                      payload: {},
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
      }),
    };

    const result = await runInvoiceIntake({
      supabase,
      identityOverride: {
        authenticated: true,
        company_id: "co-1",
        user_id: "user-1",
        anonymous_session_id: null,
      },
      idempotencyKeyHeader: "new-key",
      anonymousSessionId: null,
      file: { buffer: Buffer.from("same-bytes"), filename: "a.pdf", mimeType: "application/pdf" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.body.error).toBe("duplicate_invoice_bytes");
    }
  });
});
