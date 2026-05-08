/**
 * Phase 7 — append customer procurement events to the spine with dedupe for noisy "viewed" signals.
 */

import { appendProcurementEvent } from "@/lib/procurement/opportunity-service";
import type { ProcurementEventTypeId } from "@/lib/procurement/event-taxonomy";
import { ProcurementEventType } from "@/lib/procurement/event-taxonomy";

const VIEW_DEDUPE_HOURS = 6;

async function fetchProcurementOpportunityIdForSavings(
  supabase: any,
  companyId: string,
  savingsOpportunityId: string
): Promise<string | null> {
  const { data: so, error } = await supabase
    .schema("gc_commerce")
    .from("savings_opportunities")
    .select("id, company_id, source_invoice_line_id, trust_status")
    .eq("id", savingsOpportunityId)
    .eq("company_id", companyId)
    .eq("trust_status", "approved_for_customer")
    .maybeSingle();
  if (error || !so) return null;
  const lineId = String((so as { source_invoice_line_id: string }).source_invoice_line_id);
  const { data: line } = await supabase
    .schema("gc_commerce")
    .from("invoice_lines")
    .select("uploaded_invoice_id")
    .eq("id", lineId)
    .maybeSingle();
  const uploadId = line ? String((line as { uploaded_invoice_id: string }).uploaded_invoice_id) : "";
  if (!uploadId) return null;
  const { data: up } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select("procurement_opportunity_id, company_id")
    .eq("id", uploadId)
    .maybeSingle();
  if (!up || String((up as { company_id: string }).company_id) !== companyId) return null;
  const oid = (up as { procurement_opportunity_id: string | null }).procurement_opportunity_id;
  return oid ? String(oid) : null;
}

async function hasRecentCustomerEvent(
  supabase: any,
  procurementOpportunityId: string,
  eventType: ProcurementEventTypeId,
  savingsOpportunityId: string | undefined
): Promise<boolean> {
  const since = new Date(Date.now() - VIEW_DEDUPE_HOURS * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("procurement_events")
    .select("id, payload, created_at")
    .eq("opportunity_id", procurementOpportunityId)
    .eq("event_type", eventType)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data?.length) return false;
  for (const row of data as { payload: unknown }[]) {
    const p = row.payload as Record<string, unknown> | null;
    if (!savingsOpportunityId) return true;
    if (p && String(p.savings_opportunity_id ?? "") === savingsOpportunityId) return true;
  }
  return false;
}

export async function appendCustomerViewedRecommendation(
  supabase: any,
  input: { companyId: string; userId: string; savingsOpportunityId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const oppId = await fetchProcurementOpportunityIdForSavings(supabase, input.companyId, input.savingsOpportunityId);
  if (!oppId) return { ok: false, error: "opportunity_anchor_not_found" };
  const duped = await hasRecentCustomerEvent(
    supabase,
    oppId,
    ProcurementEventType.customer_viewed_recommendation,
    input.savingsOpportunityId
  );
  if (duped) return { ok: true };
  const now = new Date().toISOString();
  const ok = await appendProcurementEvent(supabase, oppId, ProcurementEventType.customer_viewed_recommendation, {
    company_id: input.companyId,
    customer_user_id: input.userId,
    savings_opportunity_id: input.savingsOpportunityId,
    occurred_at: now,
  });
  return ok ? { ok: true } : { ok: false, error: "event_append_failed" };
}

export async function appendCustomerAcknowledgedRecommendation(
  supabase: any,
  input: { companyId: string; userId: string; savingsOpportunityId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const oppId = await fetchProcurementOpportunityIdForSavings(supabase, input.companyId, input.savingsOpportunityId);
  if (!oppId) return { ok: false, error: "opportunity_anchor_not_found" };
  const now = new Date().toISOString();
  const ok = await appendProcurementEvent(supabase, oppId, ProcurementEventType.customer_acknowledged_recommendation, {
    company_id: input.companyId,
    customer_user_id: input.userId,
    savings_opportunity_id: input.savingsOpportunityId,
    occurred_at: now,
  });
  return ok ? { ok: true } : { ok: false, error: "event_append_failed" };
}

export async function appendCustomerRequestedReorder(
  supabase: any,
  input: {
    companyId: string;
    userId: string;
    savingsOpportunityId?: string | null;
    reorderMemoryId?: string | null;
    message?: string | null;
  }
): Promise<{ ok: true; procurement_opportunity_id: string } | { ok: false; error: string }> {
  let oppId: string | null = null;
  if (input.savingsOpportunityId?.trim()) {
    oppId = await fetchProcurementOpportunityIdForSavings(supabase, input.companyId, input.savingsOpportunityId.trim());
  }
  if (!oppId && input.reorderMemoryId?.trim()) {
    const { data: mem } = await supabase
      .schema("gc_commerce")
      .from("procurement_reorder_memory")
      .select("id, company_id")
      .eq("id", input.reorderMemoryId.trim())
      .eq("company_id", input.companyId)
      .is("valid_to", null)
      .maybeSingle();
    if (mem) {
      const { data: up } = await supabase
        .schema("gc_commerce")
        .from("uploaded_invoices")
        .select("procurement_opportunity_id")
        .eq("company_id", input.companyId)
        .not("procurement_opportunity_id", "is", null)
        .limit(1)
        .maybeSingle();
      oppId = up?.procurement_opportunity_id != null ? String(up.procurement_opportunity_id) : null;
    }
  }
  if (!oppId) return { ok: false, error: "opportunity_anchor_not_found" };
  const now = new Date().toISOString();
  const ok = await appendProcurementEvent(supabase, oppId, ProcurementEventType.customer_requested_reorder, {
    company_id: input.companyId,
    customer_user_id: input.userId,
    savings_opportunity_id: input.savingsOpportunityId?.trim() || null,
    reorder_memory_id: input.reorderMemoryId?.trim() || null,
    message: input.message?.trim().slice(0, 4000) || null,
    occurred_at: now,
  });
  return ok ? { ok: true, procurement_opportunity_id: oppId } : { ok: false, error: "event_append_failed" };
}

export async function appendCustomerRequestedQuote(
  supabase: any,
  input: { companyId: string; userId: string; savingsOpportunityId: string; message?: string | null }
): Promise<{ ok: true; procurement_opportunity_id: string } | { ok: false; error: string }> {
  const oppId = await fetchProcurementOpportunityIdForSavings(supabase, input.companyId, input.savingsOpportunityId);
  if (!oppId) return { ok: false, error: "opportunity_anchor_not_found" };
  const now = new Date().toISOString();
  const ok = await appendProcurementEvent(supabase, oppId, ProcurementEventType.customer_requested_quote, {
    company_id: input.companyId,
    customer_user_id: input.userId,
    savings_opportunity_id: input.savingsOpportunityId,
    message: input.message?.trim().slice(0, 4000) || null,
    occurred_at: now,
  });
  return ok ? { ok: true, procurement_opportunity_id: oppId } : { ok: false, error: "event_append_failed" };
}

export async function appendCustomerViewedProcurementHistory(
  supabase: any,
  input: { companyId: string; userId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: up } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select("procurement_opportunity_id")
    .eq("company_id", input.companyId)
    .not("procurement_opportunity_id", "is", null)
    .limit(1)
    .maybeSingle();
  const oppId = up?.procurement_opportunity_id != null ? String(up.procurement_opportunity_id) : null;
  if (!oppId) return { ok: false, error: "opportunity_anchor_not_found" };
  const duped = await hasRecentCustomerEvent(
    supabase,
    oppId,
    ProcurementEventType.customer_viewed_procurement_history,
    undefined
  );
  if (duped) return { ok: true };
  const now = new Date().toISOString();
  const ok = await appendProcurementEvent(supabase, oppId, ProcurementEventType.customer_viewed_procurement_history, {
    company_id: input.companyId,
    customer_user_id: input.userId,
    occurred_at: now,
  });
  return ok ? { ok: true } : { ok: false, error: "event_append_failed" };
}

export async function appendCustomerAskAboutAlternate(
  supabase: any,
  input: { companyId: string; userId: string; savingsOpportunityId: string; message: string }
): Promise<{ ok: true; procurement_opportunity_id: string } | { ok: false; error: string }> {
  const oppId = await fetchProcurementOpportunityIdForSavings(supabase, input.companyId, input.savingsOpportunityId);
  if (!oppId) return { ok: false, error: "opportunity_anchor_not_found" };
  const now = new Date().toISOString();
  const ok = await appendProcurementEvent(supabase, oppId, ProcurementEventType.customer_asked_about_alternate, {
    company_id: input.companyId,
    customer_user_id: input.userId,
    savings_opportunity_id: input.savingsOpportunityId,
    message: input.message.trim().slice(0, 4000),
    occurred_at: now,
  });
  return ok ? { ok: true, procurement_opportunity_id: oppId } : { ok: false, error: "event_append_failed" };
}

export async function appendCustomerContactedProcurementAdvisor(
  supabase: any,
  input: { companyId: string; userId: string; message: string }
): Promise<{ ok: true; procurement_opportunity_id: string } | { ok: false; error: string }> {
  const { data: up } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select("procurement_opportunity_id")
    .eq("company_id", input.companyId)
    .not("procurement_opportunity_id", "is", null)
    .limit(1)
    .maybeSingle();
  const oppId = up?.procurement_opportunity_id != null ? String(up.procurement_opportunity_id) : null;
  if (!oppId) return { ok: false, error: "opportunity_anchor_not_found" };
  const now = new Date().toISOString();
  const ok = await appendProcurementEvent(
    supabase,
    oppId,
    ProcurementEventType.customer_contacted_procurement_advisor,
    {
      company_id: input.companyId,
      customer_user_id: input.userId,
      message: input.message.trim().slice(0, 4000),
      occurred_at: now,
    }
  );
  return ok ? { ok: true, procurement_opportunity_id: oppId } : { ok: false, error: "event_append_failed" };
}
