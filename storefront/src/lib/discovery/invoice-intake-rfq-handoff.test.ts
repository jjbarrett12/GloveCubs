import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  INVOICE_INTAKE_RFQ_STORAGE_KEY,
  buildInvoiceIntakeRfqPrefillNotes,
  consumeInvoiceIntakeRfqHandoffIfEligible,
  persistInvoiceIntakeRfqHandoff,
} from "@/lib/discovery/invoice-intake-rfq-handoff";
import { buildRequestPricingHref } from "@/lib/discovery/request-pricing-url";

describe("invoice-intake-rfq-handoff", () => {
  let mem: Record<string, string>;
  const g = globalThis as typeof globalThis & { sessionStorage?: Storage };

  beforeEach(() => {
    mem = {};
    g.sessionStorage = {
      getItem: (k: string) => (k in mem ? mem[k] : null),
      setItem: (k: string, v: string) => {
        mem[k] = v;
      },
      removeItem: (k: string) => {
        delete mem[k];
      },
      key: () => null,
      clear: () => {
        mem = {};
      },
      length: 0,
    } as Storage;
  });

  afterEach(() => {
    Reflect.deleteProperty(g, "sessionStorage");
  });

  const samplePayload = {
    intake_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    procurement_opportunity_id: "11111111-2222-3333-4444-555555555555",
    vendor_name: "Acme Supply",
    invoice_number: "INV-9001",
    extracted_line_count: 7,
    persisted_line_count: 7,
    upload_filename: "invoice.pdf",
  };

  it("buildInvoiceIntakeRfqPrefillNotes includes safe operational fields when ctx present", () => {
    const notes = buildInvoiceIntakeRfqPrefillNotes({
      clientTrace: samplePayload.intake_id,
      opportunityId: samplePayload.procurement_opportunity_id,
      ctx: samplePayload,
    });
    expect(notes).toContain("quote based on your current invoice");
    expect(notes).toContain(samplePayload.intake_id);
    expect(notes).toContain(samplePayload.procurement_opportunity_id);
    expect(notes).toContain("invoice.pdf");
    expect(notes).toContain("Acme Supply");
    expect(notes).toContain("INV-9001");
    expect(notes).toContain("Extracted line items (this response): 7");
    expect(notes).toContain("Lines saved for review: 7");
    expect(notes).not.toMatch(/gpt|claude|confidence|savings ?%/i);
  });

  it("buildInvoiceIntakeRfqPrefillNotes uses URL-only fallback when ctx is null but ids present", () => {
    const notes = buildInvoiceIntakeRfqPrefillNotes({
      clientTrace: samplePayload.intake_id,
      opportunityId: samplePayload.procurement_opportunity_id,
      ctx: null,
    });
    expect(notes).toContain("not carried in this browser tab");
    expect(notes).toContain(samplePayload.intake_id);
  });

  it("consumeInvoiceIntakeRfqHandoffIfEligible returns payload and clears storage when ids match", () => {
    persistInvoiceIntakeRfqHandoff(samplePayload);
    expect(mem[INVOICE_INTAKE_RFQ_STORAGE_KEY]).toBeDefined();

    const got = consumeInvoiceIntakeRfqHandoffIfEligible(
      samplePayload.intake_id,
      samplePayload.procurement_opportunity_id
    );
    expect(got).toEqual(samplePayload);
    expect(mem[INVOICE_INTAKE_RFQ_STORAGE_KEY]).toBeUndefined();
  });

  it("consumeInvoiceIntakeRfqHandoffIfEligible rejects stale session when intake id mismatches", () => {
    persistInvoiceIntakeRfqHandoff(samplePayload);
    const got = consumeInvoiceIntakeRfqHandoffIfEligible(
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
      samplePayload.procurement_opportunity_id
    );
    expect(got).toBeNull();
    expect(mem[INVOICE_INTAKE_RFQ_STORAGE_KEY]).toBeUndefined();
  });

  it("buildRequestPricingHref keeps invoice correlation keys only (no vendor in URL)", () => {
    const href = buildRequestPricingHref({
      procurement_opportunity_id: samplePayload.procurement_opportunity_id,
      client_trace: samplePayload.intake_id,
      source: "invoice_intake",
    });
    const u = new URL(href, "https://example.com");
    expect(u.searchParams.get("procurement_opportunity_id")).toBe(samplePayload.procurement_opportunity_id);
    expect(u.searchParams.get("client_trace")).toBe(samplePayload.intake_id);
    expect(u.searchParams.get("source")).toBe("invoice_intake");
    expect(u.searchParams.has("vendor_name")).toBe(false);
    expect(u.searchParams.has("product")).toBe(false);
  });
});
