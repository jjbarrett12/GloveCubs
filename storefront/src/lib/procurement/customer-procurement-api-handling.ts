/**
 * Phase 7 — server-side handling for customer procurement POST actions (events + optional internal email).
 */

import { getAdminNotificationEmail, isSmtpConfigured, sendSmtpMail } from "@/lib/email/smtp";
import type { CustomerProcurementSession } from "@/lib/procurement/customer-procurement-session";
import {
  appendCustomerAcknowledgedRecommendation,
  appendCustomerAskAboutAlternate,
  appendCustomerContactedProcurementAdvisor,
  appendCustomerRequestedQuote,
  appendCustomerRequestedReorder,
  appendCustomerViewedProcurementHistory,
  appendCustomerViewedRecommendation,
} from "@/lib/procurement/customer-procurement-events";
import { fetchCustomerOpportunityPresentationState } from "@/lib/procurement/customer-procurement-read-models";

async function notifyInternal(subject: string, text: string): Promise<void> {
  if (!isSmtpConfigured()) return;
  const to = getAdminNotificationEmail();
  await sendSmtpMail({ to, subject, text });
}

export type CustomerProcurementActionBody =
  | { action: "viewed_recommendation"; savings_opportunity_id: string }
  | { action: "acknowledge_recommendation"; savings_opportunity_id: string }
  | { action: "request_reorder"; savings_opportunity_id?: string; reorder_memory_id?: string; message?: string }
  | { action: "request_quote"; savings_opportunity_id: string; message?: string }
  | { action: "ask_about_alternate"; savings_opportunity_id: string; message: string }
  | { action: "viewed_procurement_history" }
  | { action: "contact_advisor"; message: string };

export async function handleCustomerProcurementAction(
  supabase: any,
  session: CustomerProcurementSession,
  body: CustomerProcurementActionBody
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { companyId, userId } = session;

  const requireActiveOpportunity = async (savingsOpportunityId: string) => {
    const st = await fetchCustomerOpportunityPresentationState(supabase, companyId, savingsOpportunityId);
    return st?.kind === "active" ? st.dto : null;
  };

  switch (body.action) {
    case "viewed_recommendation": {
      const dto = await requireActiveOpportunity(body.savings_opportunity_id);
      if (!dto) return { ok: false, status: 404, error: "recommendation_not_available" };
      const r = await appendCustomerViewedRecommendation(supabase, {
        companyId,
        userId,
        savingsOpportunityId: body.savings_opportunity_id,
      });
      return r.ok ? { ok: true } : { ok: false, status: 500, error: r.error };
    }
    case "acknowledge_recommendation": {
      const dto = await requireActiveOpportunity(body.savings_opportunity_id);
      if (!dto) return { ok: false, status: 404, error: "recommendation_not_available" };
      const r = await appendCustomerAcknowledgedRecommendation(supabase, {
        companyId,
        userId,
        savingsOpportunityId: body.savings_opportunity_id,
      });
      if (!r.ok) return { ok: false, status: 500, error: r.error };
      await notifyInternal(
        `[GloveCubs] Customer acknowledged approved procurement note`,
        `Company: ${companyId}\nUser: ${userId}\nSavings opportunity: ${body.savings_opportunity_id}\n`
      );
      return { ok: true };
    }
    case "request_reorder": {
      const r = await appendCustomerRequestedReorder(supabase, {
        companyId,
        userId,
        savingsOpportunityId: body.savings_opportunity_id ?? null,
        reorderMemoryId: body.reorder_memory_id ?? null,
        message: body.message ?? null,
      });
      if (!r.ok) return { ok: false, status: 400, error: r.error };
      await notifyInternal(
        `[GloveCubs] Customer reorder request`,
        `Company: ${companyId}\nUser: ${userId}\nSavings opportunity: ${body.savings_opportunity_id ?? "—"}\nReorder memory: ${body.reorder_memory_id ?? "—"}\nMessage: ${body.message ?? "—"}\n`
      );
      return { ok: true };
    }
    case "request_quote": {
      const dto = await requireActiveOpportunity(body.savings_opportunity_id);
      if (!dto) return { ok: false, status: 404, error: "recommendation_not_available" };
      const r = await appendCustomerRequestedQuote(supabase, {
        companyId,
        userId,
        savingsOpportunityId: body.savings_opportunity_id,
        message: body.message ?? null,
      });
      if (!r.ok) return { ok: false, status: 500, error: r.error };
      await notifyInternal(
        `[GloveCubs] Customer quote request (procurement workspace)`,
        `Company: ${companyId}\nUser: ${userId}\nSavings opportunity: ${body.savings_opportunity_id}\nMessage: ${body.message ?? "—"}\n`
      );
      return { ok: true };
    }
    case "ask_about_alternate": {
      const dto = await requireActiveOpportunity(body.savings_opportunity_id);
      if (!dto) return { ok: false, status: 404, error: "recommendation_not_available" };
      const r = await appendCustomerAskAboutAlternate(supabase, {
        companyId,
        userId,
        savingsOpportunityId: body.savings_opportunity_id,
        message: body.message,
      });
      if (!r.ok) return { ok: false, status: 500, error: r.error };
      await notifyInternal(
        `[GloveCubs] Customer question on approved alternate`,
        `Company: ${companyId}\nUser: ${userId}\nSavings opportunity: ${body.savings_opportunity_id}\nMessage:\n${body.message}\n`
      );
      return { ok: true };
    }
    case "viewed_procurement_history": {
      const r = await appendCustomerViewedProcurementHistory(supabase, { companyId, userId });
      return r.ok ? { ok: true } : { ok: false, status: 400, error: r.error };
    }
    case "contact_advisor": {
      const r = await appendCustomerContactedProcurementAdvisor(supabase, {
        companyId,
        userId,
        message: body.message,
      });
      if (!r.ok) return { ok: false, status: 400, error: r.error };
      await notifyInternal(
        `[GloveCubs] Customer contacted procurement advisor`,
        `Company: ${companyId}\nUser: ${userId}\nMessage:\n${body.message}\n`
      );
      return { ok: true };
    }
    default:
      return { ok: false, status: 400, error: "unknown_action" };
  }
}
