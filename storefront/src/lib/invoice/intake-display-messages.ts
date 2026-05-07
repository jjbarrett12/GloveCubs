import type { InvoiceIntakeContract, IntakeStatus, InvoiceIntakeExtractionState } from "@/lib/invoice/intake-types";

/** User-facing label for `intake_status` from the intake API (honest, no fake progress). */
export function intakeStatusHeadline(status: IntakeStatus): string {
  switch (status) {
    case "received":
      return "Invoice received";
    case "extracting":
      return "Reading your invoice";
    case "extracted_ok":
      return "Line items extracted";
    case "extracted_failed":
      return "Could not read line items";
    case "intake_failed":
      return "Upload could not be completed";
    default:
      return "Invoice status updated";
  }
}

/** Short label for `aggregate_review_status` in status summaries (no governance internals). */
export function aggregateReviewStatusLabel(aggregate: string | null | undefined): string {
  if (aggregate == null || aggregate === "") return "Not reported yet";
  switch (aggregate) {
    case "cleared":
      return "Cleared";
    case "pending_review":
    case "assessment_pending":
      return "Pending review";
    case "review_required":
      return "Review required";
    case "ambiguous":
      return "Needs clarification";
    case "no_match":
      return "No catalog match yet";
    default:
      return aggregate.replace(/_/g, " ");
  }
}

/** Plain explanation for `aggregate_review_status` (phase 2), when present. */
export function aggregateReviewSummary(aggregate: string | null | undefined): string | null {
  if (aggregate == null || aggregate === "") return null;
  switch (aggregate) {
    case "cleared":
      return "Initial line matching completed. Approved alternates, when available, are confirmed through our sourcing review—not instant auto-substitution.";
    case "pending_review":
    case "assessment_pending":
      return "Your lines are in review so we can match them to governed catalog options.";
    case "review_required":
      return "One or more lines need a closer look before we can show approved alternates. A specialist can walk through this with you.";
    case "ambiguous":
      return "Some line descriptions need clarification before we can match them reliably.";
    case "no_match":
      return "Some lines did not match a catalog path yet; we will help map them manually.";
    default:
      return "Our team will confirm review status for this invoice with you.";
  }
}

export function nextStepHonestyBlurb(contract: InvoiceIntakeContract): string {
  const hasLines = (contract.lines?.length ?? 0) > 0;
  const extractOk = contract.extraction.state === "ok" && contract.intake_status === "extracted_ok";
  if (extractOk && hasLines) {
    return "Your invoice has been received and matched for review. We'll use the extracted line items to identify approved alternates where available.";
  }
  return "When extraction succeeds, we use those line items to match against governed glove options. Approved alternates appear only after that review path—not from a generic swap list.";
}

/** Customer-facing label for `extraction.state` (no model names, no confidence). */
export function extractionStateCustomerLabel(state: InvoiceIntakeExtractionState): string {
  switch (state) {
    case "ok":
      return "Line items extracted";
    case "failed":
      return "Extraction did not complete";
    case "skipped":
      return "Extraction not run for this upload";
    default:
      return "Extraction status updated";
  }
}

export function errorMessageFromIntakeFailure(
  status: number,
  body: Record<string, unknown>
): string {
  const err =
    typeof body.error === "string" ? body.error : body.error != null ? String(body.error) : "";
  const msg = typeof body.message === "string" ? body.message : "";

  if (status === 429) {
    return "Too many uploads in a short window. Please wait a minute and try again.";
  }
  if (status === 400) {
    if (err === "duplicate_invoice_bytes" || msg.includes("unique")) {
      return "This exact file was already uploaded for your account. Use a new invoice or contact us if you need it reopened.";
    }
    if (err.includes("file") || err.includes("Missing") || msg.includes("file")) {
      return "No file was attached, or the upload was incomplete. Choose a PDF or photo under 10 MB and try again.";
    }
    return msg || err || "The file could not be accepted. Check format and size, then try again.";
  }
  if (status === 500) {
    if (err === "Supabase not configured") {
      return "Invoices are temporarily unavailable. Please try again later or contact us.";
    }
    if (err === "spine_pre_failed" || err === "spine_post_failed") {
      return "We could not finish saving your invoice. Please try again, or reach out so we can process it manually.";
    }
    return "Something went wrong on our side. Try again in a few minutes, or email us the invoice.";
  }
  return msg || err || "Upload failed. Please try again or contact support.";
}

export function extractionFailureHint(contract: InvoiceIntakeContract): string {
  const detail = contract.extraction.error?.trim();
  if (detail) return `Details: ${detail}. Try a clearer scan, a straight-on photo of the line items, or a text-based PDF.`;
  return "Try a clearer scan, a straight-on photo of the line items, or a text-based PDF.";
}
