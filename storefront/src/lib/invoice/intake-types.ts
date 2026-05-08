/** Phase 1 invoice intake — API contract + status values (gc_commerce.uploaded_invoices). */

export const INVOICE_INTAKE_EXTRACTION_VERSION = "invoice-intake-v1" as const;

export type IntakeStatus =
  | "received"
  | "extracting"
  | "extracted_ok"
  | "extracted_failed"
  | "intake_failed";

export type InvoiceIntakeIdentity = {
  authenticated: boolean;
  company_id: string | null;
  user_id: string | null;
  anonymous_session_id: string | null;
};

export type InvoiceIntakeDocument = {
  filename: string;
  mime_type: string;
  byte_size: number;
  content_sha256: string;
};

export type InvoiceIntakeExtractionState = "ok" | "failed" | "skipped";

export type InvoiceIntakeContract = {
  intake_id: string;
  procurement_opportunity_id: string;
  intake_status: IntakeStatus;
  identity: InvoiceIntakeIdentity;
  document: InvoiceIntakeDocument;
  idempotency_key: string;
  extraction: {
    state: InvoiceIntakeExtractionState;
    version: string;
    model: string | null;
    completed_at: string | null;
    error: string | null;
  };
  timestamps: {
    created_at: string;
    updated_at: string;
  };
  idempotent_replay: boolean;
  vendor_name?: string | null;
  invoice_number?: string | null;
  total_amount?: number | null;
  lines?: Array<{
    description: string;
    quantity: number;
    unit_price: number | null;
    total: number | null;
    sku_or_code?: string | null;
  }>;
  /** Phase 2 — populated from gc_commerce.uploaded_invoices when present */
  persisted_line_count?: number | null;
  aggregate_review_status?: string | null;
  phase2_error?: string | null;
};
