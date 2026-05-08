import { ProcurementEventType } from "@/lib/procurement/event-taxonomy";
import {
  appendProcurementEvent,
  ensureOpportunityBuyerDisplayRef,
  findOpportunityByClientTraceId,
  insertProcurementOpportunity,
  updateProcurementOpportunity,
} from "@/lib/procurement/opportunity-service";
import { readBuyerDisplayRefFromMetadata } from "@/lib/procurement/buyer-display-ref";

export type SpineWriteResult = { opportunityId: string; buyerDisplayRef: string | null };

export async function recordQuoteCartSpine(
  supabase: any,
  input: {
    operationalEnvironmentKey?: string | null;
    quoteRequestId: string;
    companyName: string;
    contactName: string;
    contactEmail: string;
    lineItemCount: number;
    emailNotificationSent: boolean;
  }
): Promise<SpineWriteResult | null> {
  const created = await insertProcurementOpportunity(supabase, {
    operational_environment_key: input.operationalEnvironmentKey ?? null,
    source: "quote_cart",
    lifecycle_stage: "quote_linked",
    company_name: input.companyName,
    contact_name: input.contactName,
    contact_email: input.contactEmail,
    quote_request_id: input.quoteRequestId,
    metadata: {
      approved_product_ids: [] as string[],
      rejected_product_ids: [] as string[],
      substitution_history: [] as unknown[],
    },
  });
  if (!created) return null;
  const oid = created.id;
  await appendProcurementEvent(supabase, oid, ProcurementEventType.opportunity_created, {
    quote_request_id: input.quoteRequestId,
    operational_environment_key: input.operationalEnvironmentKey ?? null,
  });
  await appendProcurementEvent(supabase, oid, ProcurementEventType.intake_quote_cart, {
    quote_request_id: input.quoteRequestId,
  });
  await appendProcurementEvent(supabase, oid, ProcurementEventType.line_items_attached, {
    line_item_count: input.lineItemCount,
  });
  await appendProcurementEvent(
    supabase,
    oid,
    input.emailNotificationSent
      ? ProcurementEventType.notification_sent
      : ProcurementEventType.notification_failed,
    { channel: "smtp_admin", quote_request_id: input.quoteRequestId }
  );
  return { opportunityId: oid, buyerDisplayRef: created.buyer_display_ref };
}

export async function recordRequestPricingSpine(
  supabase: any,
  input: {
    operationalEnvironmentKey?: string | null;
    salesProspectId: number;
    companyName: string;
    contactName: string | null;
    contactEmail: string | null;
    emailDelivered: boolean;
    existingOpportunityId?: string | null;
    clientTraceId?: string | null;
  }
): Promise<SpineWriteResult | null> {
  let opportunityId = input.existingOpportunityId?.trim() || null;

  if (!opportunityId && input.clientTraceId) {
    const existing = await findOpportunityByClientTraceId(supabase, input.clientTraceId);
    if (existing) opportunityId = existing.id;
  }

  if (opportunityId) {
    await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.opportunity_resumed, {
      via: "request_pricing",
    });
    await updateProcurementOpportunity(supabase, opportunityId, {
      company_name: input.companyName,
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      sales_prospect_id: input.salesProspectId,
      lifecycle_stage: input.emailDelivered ? "scoped" : "sales_follow_up",
    });
    await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.intake_request_pricing, {
      sales_prospect_id: input.salesProspectId,
    });
    await appendProcurementEvent(
      supabase,
      opportunityId,
      input.emailDelivered ? ProcurementEventType.notification_sent : ProcurementEventType.notification_failed,
      { channel: "smtp_admin", sales_prospect_id: input.salesProspectId }
    );
    const buyerDisplayRef = await ensureOpportunityBuyerDisplayRef(supabase, opportunityId);
    return { opportunityId, buyerDisplayRef };
  }

  const created = await insertProcurementOpportunity(supabase, {
    operational_environment_key: input.operationalEnvironmentKey ?? null,
    source: "request_pricing",
    lifecycle_stage: input.emailDelivered ? "open" : "sales_follow_up",
    company_name: input.companyName,
    contact_name: input.contactName,
    contact_email: input.contactEmail,
    sales_prospect_id: input.salesProspectId,
    client_trace_id: input.clientTraceId ?? null,
    metadata: {
      approved_product_ids: [] as string[],
      rejected_product_ids: [] as string[],
      substitution_history: [] as unknown[],
    },
  });
  if (!created) return null;
  const oid = created.id;
  await appendProcurementEvent(supabase, oid, ProcurementEventType.opportunity_created, {
    sales_prospect_id: input.salesProspectId,
    operational_environment_key: input.operationalEnvironmentKey ?? null,
  });
  await appendProcurementEvent(supabase, oid, ProcurementEventType.intake_request_pricing, {
    sales_prospect_id: input.salesProspectId,
  });
  await appendProcurementEvent(
    supabase,
    oid,
    input.emailDelivered ? ProcurementEventType.notification_sent : ProcurementEventType.notification_failed,
    { channel: "smtp_admin", sales_prospect_id: input.salesProspectId }
  );
  return { opportunityId: oid, buyerDisplayRef: created.buyer_display_ref };
}

export async function ensureGloveFinderOpportunity(
  supabase: any,
  input: { clientTraceId: string; operationalEnvironmentKey: string }
): Promise<{ id: string; buyerDisplayRef: string | null } | null> {
  const existing = await findOpportunityByClientTraceId(supabase, input.clientTraceId);
  if (existing) {
    const fromMeta = readBuyerDisplayRefFromMetadata(existing.metadata);
    const buyerDisplayRef = fromMeta ?? (await ensureOpportunityBuyerDisplayRef(supabase, existing.id));
    return { id: existing.id, buyerDisplayRef };
  }
  const created = await insertProcurementOpportunity(supabase, {
    operational_environment_key: input.operationalEnvironmentKey,
    source: "glove_finder",
    company_name: "Unknown",
    contact_name: null,
    contact_email: null,
    client_trace_id: input.clientTraceId,
    metadata: {
      approved_product_ids: [] as string[],
      rejected_product_ids: [] as string[],
      substitution_history: [] as unknown[],
    },
  });
  if (!created) return null;
  await appendProcurementEvent(supabase, created.id, ProcurementEventType.opportunity_created, {
    client_trace_id: input.clientTraceId,
    operational_environment_key: input.operationalEnvironmentKey,
  });
  return { id: created.id, buyerDisplayRef: created.buyer_display_ref };
}

export async function appendGloveFinderAdvisoryEvent(
  supabase: any,
  opportunityId: string,
  payload: { candidate_count: number; model: string }
): Promise<void> {
  await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.ai_advisory_glove_finder, payload);
}

export type RecordInvoiceIntakeSpinePre = {
  phase: "pre";
  opportunityId: string;
  uploadedInvoiceId: string;
  idempotencyKey: string;
  companyId: string | null;
  document: {
    filename: string;
    mime_type: string;
    byte_size: number;
    content_sha256: string;
  };
  extractionVersion: string;
  extractionModel: string | null;
};

export type RecordInvoiceIntakeSpinePost = {
  phase: "post";
  opportunityId: string;
  uploadedInvoiceId: string;
  extraction: {
    ok: boolean;
    lineCount: number | null;
    vendorName?: string | null;
    invoiceNumber?: string | null;
    totalAmount?: number | null;
    error?: string | null;
  };
};

/**
 * Phase 1 procurement timeline for invoice intake.
 * Call `pre` before LLM extraction, then `post` after extraction so events reflect real ordering.
 * Idempotent replays must not call this again for the same opportunity.
 */
export async function recordInvoiceIntakeSpine(
  supabase: any,
  input: RecordInvoiceIntakeSpinePre | RecordInvoiceIntakeSpinePost
): Promise<boolean> {
  if (input.phase === "pre") {
    return (
      (await appendProcurementEvent(supabase, input.opportunityId, ProcurementEventType.invoice_uploaded, {
        uploaded_invoice_id: input.uploadedInvoiceId,
        idempotency_key: input.idempotencyKey,
        company_id: input.companyId,
        filename: input.document.filename,
        mime_type: input.document.mime_type,
        byte_size: input.document.byte_size,
        content_sha256: input.document.content_sha256,
      })) &&
      (await appendProcurementEvent(
        supabase,
        input.opportunityId,
        ProcurementEventType.invoice_extraction_started,
        {
          uploaded_invoice_id: input.uploadedInvoiceId,
          extraction_version: input.extractionVersion,
          extraction_model: input.extractionModel,
        }
      ))
    );
  }
  return (
    (await appendProcurementEvent(
      supabase,
      input.opportunityId,
      ProcurementEventType.invoice_extraction_completed,
      {
        uploaded_invoice_id: input.uploadedInvoiceId,
        success: input.extraction.ok,
        line_count: input.extraction.lineCount,
        vendor_name: input.extraction.vendorName ?? null,
        invoice_number: input.extraction.invoiceNumber ?? null,
        total_amount: input.extraction.totalAmount ?? null,
        error: input.extraction.error ?? null,
      }
    )) &&
    (await appendProcurementEvent(supabase, input.opportunityId, ProcurementEventType.review_required, {
      uploaded_invoice_id: input.uploadedInvoiceId,
      reason: "phase1_stub",
      detail: "Line persistence, matching, and human review land in later phases.",
    })) &&
    (await appendProcurementEvent(supabase, input.opportunityId, ProcurementEventType.assessment_pending, {
      uploaded_invoice_id: input.uploadedInvoiceId,
      awaiting: ["line_items", "matching", "pricing", "human_review"],
    }))
  );
}
