import type { ProcurementEventTypeId } from "@/lib/procurement/event-taxonomy";
import { PROCUREMENT_EVENT_SCHEMA_VERSION } from "@/lib/procurement/event-taxonomy";
import {
  ensureBuyerDisplayRefInMetadata,
  readBuyerDisplayRefFromMetadata,
} from "@/lib/procurement/buyer-display-ref";

export type ProcurementOpportunityRow = {
  id: string;
  operational_environment_key: string | null;
  lifecycle_stage: string;
  source: string;
  company_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  sales_prospect_id: number | null;
  quote_request_id: string | null;
  client_trace_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function findOpportunityByClientTraceId(
  supabase: any,
  clientTraceId: string
): Promise<ProcurementOpportunityRow | null> {
  const { data, error } = await supabase
    .from("procurement_opportunities")
    .select("*")
    .eq("client_trace_id", clientTraceId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ProcurementOpportunityRow;
}

export async function findOpportunityByIdempotencyKey(
  supabase: any,
  idempotencyKey: string
): Promise<ProcurementOpportunityRow | null> {
  const { data, error } = await supabase
    .from("procurement_opportunities")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error || !data) return null;
  return data as ProcurementOpportunityRow;
}

export async function insertProcurementOpportunity(
  supabase: any,
  row: {
    operational_environment_key?: string | null;
    lifecycle_stage?: string;
    source: string;
    company_name?: string | null;
    contact_name?: string | null;
    contact_email?: string | null;
    sales_prospect_id?: number | null;
    quote_request_id?: string | null;
    client_trace_id?: string | null;
    idempotency_key?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<{ id: string; buyer_display_ref: string } | null> {
  const { metadata, buyer_display_ref } = ensureBuyerDisplayRefInMetadata(row.metadata ?? {});
  const { data, error } = await supabase
    .from("procurement_opportunities")
    .insert({
      operational_environment_key: row.operational_environment_key ?? null,
      lifecycle_stage: row.lifecycle_stage ?? "open",
      source: row.source,
      company_name: row.company_name ?? null,
      contact_name: row.contact_name ?? null,
      contact_email: row.contact_email ?? null,
      sales_prospect_id: row.sales_prospect_id ?? null,
      quote_request_id: row.quote_request_id ?? null,
      client_trace_id: row.client_trace_id ?? null,
      idempotency_key: row.idempotency_key ?? null,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .select("id, metadata")
    .single();
  if (error || !data) return null;
  const id = String((data as { id: string }).id);
  const ref = readBuyerDisplayRefFromMetadata((data as { metadata: unknown }).metadata) ?? buyer_display_ref;
  return { id, buyer_display_ref: ref };
}

/** Ensures JSON metadata includes buyer_display_ref (backfill for legacy rows). */
export async function ensureOpportunityBuyerDisplayRef(
  supabase: any,
  opportunityId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("procurement_opportunities")
    .select("metadata")
    .eq("id", opportunityId)
    .maybeSingle();
  if (error || !data) return null;
  const existing = readBuyerDisplayRefFromMetadata((data as { metadata: unknown }).metadata);
  if (existing) return existing;
  const { metadata, buyer_display_ref } = ensureBuyerDisplayRefInMetadata(
    ((data as { metadata: Record<string, unknown> | null }).metadata ?? {}) as Record<string, unknown>
  );
  const ok = await updateProcurementOpportunity(supabase, opportunityId, { metadata });
  return ok ? buyer_display_ref : null;
}

export async function updateProcurementOpportunity(
  supabase: any,
  opportunityId: string,
  patch: Partial<{
    company_name: string | null;
    contact_name: string | null;
    contact_email: string | null;
    sales_prospect_id: number | null;
    quote_request_id: string | null;
    lifecycle_stage: string;
    metadata: Record<string, unknown>;
  }>
): Promise<boolean> {
  const { error } = await supabase
    .from("procurement_opportunities")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", opportunityId);
  return !error;
}

export async function appendProcurementEvent(
  supabase: any,
  opportunityId: string,
  eventType: ProcurementEventTypeId,
  payload: Record<string, unknown>
): Promise<boolean> {
  const { error } = await supabase.from("procurement_events").insert({
    opportunity_id: opportunityId,
    event_type: eventType,
    schema_version: PROCUREMENT_EVENT_SCHEMA_VERSION,
    payload,
  });
  return !error;
}
