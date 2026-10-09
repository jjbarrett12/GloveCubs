import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { recordInvoiceIntakeSpine } from "@/lib/procurement/spine-writes";
import { ProcurementEventType } from "@/lib/procurement/event-taxonomy";
import { runInvoiceIntake } from "@/lib/invoice/run-intake";
import { minimalPdfBuffer } from "@/lib/invoice/file-validate";
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
      idempotency_scope: "company:co-1",
      payload: {
        last_extract: {
          vendor_name: "V",
          invoice_number: "1",
          total_amount: 10,
          lines: [{ description: "x", quantity: 1, unit_price: 10, total: 10, sku_or_code: null }],
        },
      },
    };

    const chainEq = () => {
      const api: any = {
        eq: () => api,
        maybeSingle: async () => ({
          data: {
            id: "opp-1",
            idempotency_key: "idem-x",
            idempotency_scope: "company:co-1",
            metadata: {},
          },
          error: null,
        }),
      };
      return api;
    };

    const intakeEq = () => {
      const api: any = {
        eq: () => api,
        maybeSingle: async () => ({ data: intakeRow, error: null }),
      };
      return api;
    };

    const supabase = {
      from: (table: string) => {
        if (table === "procurement_opportunities") {
          return {
            select: () => chainEq(),
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
                select: () => intakeEq(),
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
      file: { buffer: minimalPdfBuffer(1), filename: "f.pdf", mimeType: "application/pdf" },
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
    const oppEq = () => {
      const api: any = {
        eq: () => api,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return api;
    };
    const shaEq = () => {
      const api: any = {
        eq: () => api,
        maybeSingle: async () => ({
          data: {
            id: "existing",
            idempotency_key: "old-key",
            idempotency_scope: "company:co-1",
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
      };
      return api;
    };

    const supabase = {
      from: (table: string) => {
        if (table === "procurement_opportunities") {
          return {
            select: () => oppEq(),
          };
        }
        throw new Error(`unexpected public table ${table}`);
      },
      schema: () => ({
        from: (table: string) => {
          if (table !== "uploaded_invoices") throw new Error(table);
          return {
            select: () => shaEq(),
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
      file: { buffer: minimalPdfBuffer(1), filename: "a.pdf", mimeType: "application/pdf" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.body.error).toBe("duplicate_invoice_bytes");
    }
  });

  it("does not replay another tenant's intake for the same idempotency key", async () => {
    const extractSpy = vi.spyOn(aiProvider, "aiExtractInvoice").mockRejectedValue(new Error("stop"));

    // Opportunity lookup is scoped — other tenant's row is invisible (null).
    const oppEq = () => {
      const api: any = {
        eq: () => api,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return api;
    };

    const supabase = {
      from: (table: string) => {
        if (table === "procurement_opportunities") {
          return {
            select: () => oppEq(),
            insert: () => ({
              select: () => ({
                single: async () => ({ data: null, error: { message: "stop create" } }),
              }),
            }),
          };
        }
        throw new Error(`unexpected public table ${table}`);
      },
      schema: () => ({
        from: () => ({
          select: () => {
            const api: any = {
              eq: () => api,
              maybeSingle: async () => ({ data: null, error: null }),
            };
            return api;
          },
        }),
      }),
    };

    const result = await runInvoiceIntake({
      supabase,
      identityOverride: {
        authenticated: true,
        company_id: "tenant-b",
        user_id: "user-b",
        anonymous_session_id: null,
      },
      idempotencyKeyHeader: "shared-client-key",
      anonymousSessionId: null,
      file: { buffer: minimalPdfBuffer(1), filename: "f.pdf", mimeType: "application/pdf" },
    });

    // Must not succeed as a cross-tenant replay; create path fails closed without leaking.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.body.error).not.toBe("incomplete_intake");
    }
    expect(extractSpy).not.toHaveBeenCalled();
  });

  it("rejects disguised files before calling AI", async () => {
    const extractSpy = vi.spyOn(aiProvider, "aiExtractInvoice").mockRejectedValue(new Error("AI must not run"));
    const result = await runInvoiceIntake({
      supabase: {},
      identityOverride: {
        authenticated: true,
        company_id: "co-1",
        user_id: "user-1",
        anonymous_session_id: null,
      },
      idempotencyKeyHeader: "k",
      anonymousSessionId: null,
      file: { buffer: Buffer.from("MZ not a pdf"), filename: "f.pdf", mimeType: "application/pdf" },
    });
    expect(extractSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(415);
      expect(result.body.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    }
  });

  it("never writes today's date as a stand-in invoice_date", () => {
    const src = readFileSync(path.join(__dirname, "run-intake.ts"), "utf8");
    expect(src).not.toMatch(/const invoiceDate = new Date\(/);
    expect(src).not.toMatch(/invoice_date:\s*invoiceDate/);
    expect(src).toMatch(/parseInvoiceDate/);
  });
});
