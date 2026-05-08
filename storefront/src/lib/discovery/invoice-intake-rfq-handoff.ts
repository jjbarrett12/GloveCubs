/**
 * Carries invoice → /request-pricing operational context without putting vendor/PII in URLs.
 * Consumed once when query params match the stored intake + opportunity (same-tab handoff).
 */

export const INVOICE_INTAKE_RFQ_STORAGE_KEY = "gc_invoice_intake_rfq_context_v1" as const;

export type InvoiceIntakeRfqHandoffPayload = {
  intake_id: string;
  procurement_opportunity_id: string;
  vendor_name: string | null;
  invoice_number: string | null;
  extracted_line_count: number;
  persisted_line_count: number | null;
  upload_filename: string | null;
};

function getSessionStorage(): Storage | null {
  try {
    const s = (globalThis as unknown as { sessionStorage?: Storage }).sessionStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

export function persistInvoiceIntakeRfqHandoff(payload: InvoiceIntakeRfqHandoffPayload): void {
  const s = getSessionStorage();
  if (!s) return;
  try {
    s.setItem(INVOICE_INTAKE_RFQ_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Returns handoff payload if session data matches URL correlation; clears storage either way when malformed or mismatched.
 */
export function consumeInvoiceIntakeRfqHandoffIfEligible(
  intakeId: string,
  opportunityId: string
): InvoiceIntakeRfqHandoffPayload | null {
  const s = getSessionStorage();
  if (!s) return null;
  let raw: string | null = null;
  try {
    raw = s.getItem(INVOICE_INTAKE_RFQ_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const iid = typeof parsed.intake_id === "string" ? parsed.intake_id : null;
    const oid = typeof parsed.procurement_opportunity_id === "string" ? parsed.procurement_opportunity_id : null;
    if (!iid || !oid || iid !== intakeId || oid !== opportunityId) {
      s.removeItem(INVOICE_INTAKE_RFQ_STORAGE_KEY);
      return null;
    }

    const extractedRaw = parsed.extracted_line_count;
    const extracted =
      typeof extractedRaw === "number" && Number.isFinite(extractedRaw)
        ? Math.max(0, Math.floor(extractedRaw))
        : 0;

    let persisted: number | null = null;
    if (parsed.persisted_line_count != null) {
      const p = parsed.persisted_line_count;
      if (typeof p === "number" && Number.isFinite(p)) persisted = Math.max(0, Math.floor(p));
    }

    const out: InvoiceIntakeRfqHandoffPayload = {
      intake_id: iid,
      procurement_opportunity_id: oid,
      vendor_name: typeof parsed.vendor_name === "string" ? parsed.vendor_name : null,
      invoice_number: typeof parsed.invoice_number === "string" ? parsed.invoice_number : null,
      upload_filename: typeof parsed.upload_filename === "string" ? parsed.upload_filename : null,
      extracted_line_count: extracted,
      persisted_line_count: persisted,
    };

    s.removeItem(INVOICE_INTAKE_RFQ_STORAGE_KEY);
    return out;
  } catch {
    try {
      s.removeItem(INVOICE_INTAKE_RFQ_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function buildInvoiceIntakeRfqPrefillNotes(params: {
  clientTrace: string | null;
  opportunityId: string | null;
  ctx: InvoiceIntakeRfqHandoffPayload | null;
}): string {
  const lines: string[] = [];
  lines.push("Invoice intake — quote based on your current invoice");
  lines.push("");
  lines.push(`Intake reference: ${params.clientTrace ?? "—"}`);
  lines.push(`Procurement opportunity: ${params.opportunityId ?? "—"}`);
  if (params.ctx) {
    lines.push(`Upload filename: ${params.ctx.upload_filename?.trim() ? params.ctx.upload_filename.trim() : "—"}`);
    const v = params.ctx.vendor_name?.trim();
    if (v) lines.push(`Vendor (from file): ${v}`);
    const inv = params.ctx.invoice_number?.trim();
    if (inv) lines.push(`Invoice #: ${inv}`);
    lines.push(`Extracted line items (this response): ${params.ctx.extracted_line_count}`);
    lines.push(
      `Lines saved for review: ${params.ctx.persisted_line_count == null ? "—" : String(params.ctx.persisted_line_count)}`
    );
  } else if (params.clientTrace && params.opportunityId) {
    lines.push(
      "Additional invoice summary was not carried in this browser tab; intake and opportunity references above still tie this request to your upload."
    );
  }
  lines.push("");
  lines.push("Add delivery sites, case volumes, billing, and any questions for specialist review below.");
  return lines.join("\n");
}
