/**
 * Quote requests CRUD and submission.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { logRpcFailure } from "@/lib/observability";
import type { QuoteRequestRow, QuoteLineItemRow, QuoteStatus, QuotePriority } from "./types";
import type { SubmitQuoteRequestInput } from "./schemas";

const now = () => new Date().toISOString();

/** Max quote submissions per email per hour (P0-4 rate limiting). */
export const QUOTE_SUBMIT_RATE_LIMIT_PER_HOUR = 15;

/**
 * Count quote requests submitted by this email in the last window minutes. Used for rate limiting.
 */
export async function getQuoteSubmitCountRecent(
  email: string,
  windowMinutes: number = 60
): Promise<number> {
  const supabase = getSupabaseCatalogos(true);
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("quote_requests")
    .select("id", { count: "exact", head: true })
    .eq("email", email.trim().toLowerCase())
    .gte("created_at", since);
  if (error) return 0;
  return count ?? 0;
}

export async function createQuoteRequest(input: SubmitQuoteRequestInput): Promise<{ id: string; reference_number: string }> {
  const supabase = getSupabaseCatalogos(true);
  const { data: rows, error } = await supabase.rpc("create_quote_with_lines", {
    p_idempotency_key: input.idempotency_key ?? null,
    p_company_name: input.company_name,
    p_contact_name: input.contact_name,
    p_email: input.email,
    p_phone: input.phone ?? "",
    p_notes: input.notes ?? "",
    p_urgency: input.urgency ?? null,
    p_items: input.items.map((item) => ({
      productId: item.productId,
      canonicalProductId: item.canonicalProductId ?? item.productId,
      slug: item.slug,
      name: item.name,
      quantity: item.quantity,
      notes: item.notes ?? "",
    })),
  });
  if (error) {
    logRpcFailure("create_quote_with_lines RPC failed", {
      message: error.message,
      email_domain: input.email.includes("@") ? input.email.split("@")[1] : undefined,
      item_count: input.items.length,
    });
    throw new Error(error.message);
  }
  // PostgREST may return RPC result as array or single object; normalize to one row.
  const row =
    Array.isArray(rows) && rows.length > 0
      ? rows[0]
      : rows && typeof rows === "object" && !Array.isArray(rows) && "id" in rows
        ? (rows as { id: string; reference_number: string })
        : null;
  if (!row || !row.id) throw new Error("Failed to create quote request");
  const quoteId = row.id as string;
  const referenceNumber = row.reference_number as string;

  const { notifyTeamNewRfq, sendBuyerConfirmation } = await import("./notifications");
  notifyTeamNewRfq({
    quoteId,
    referenceNumber,
    companyName: input.company_name.trim(),
    contactEmail: input.email.trim().toLowerCase(),
    urgency: input.urgency ?? null,
  }).catch(() => {});
  sendBuyerConfirmation({
    email: input.email.trim().toLowerCase(),
    referenceNumber,
    companyName: input.company_name.trim(),
  }).catch(() => {});

  return { id: quoteId, reference_number: referenceNumber };
}

export async function listQuoteRequests(filters?: { status?: QuoteStatus; limit?: number }): Promise<QuoteRequestRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const limit = Math.min(filters?.limit ?? 50, 100);
  let q = supabase
    .from("quote_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (filters?.status) q = q.eq("status", filters.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as QuoteRequestRow[];
}

export async function getQuoteRequestById(id: string): Promise<(QuoteRequestRow & { line_items: QuoteLineItemRow[] }) | null> {
  const supabase = getSupabaseCatalogos(true);
  const { data: quote, error: quoteErr } = await supabase
    .from("quote_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (quoteErr || !quote) return null;
  const { data: items } = await supabase
    .from("quote_line_items")
    .select("*")
    .eq("quote_request_id", id)
    .order("created_at");
  return {
    ...(quote as QuoteRequestRow),
    line_items: (items ?? []) as QuoteLineItemRow[],
  };
}

export async function updateQuoteRequestStatus(
  id: string, 
  status: QuoteStatus, 
  options?: { reason?: string; changedBy?: string; orderId?: string }
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const updates: Record<string, unknown> = { status, updated_at: now() };
  
  // Set timestamp based on status
  if (status === "contacted") updates.first_contacted_at = now();
  if (status === "quoted") updates.quoted_at = now();
  if (status === "won") {
    updates.won_at = now();
    updates.closed_at = now();
    if (options?.orderId) updates.won_order_id = options.orderId;
  }
  if (status === "lost") {
    updates.lost_at = now();
    updates.closed_at = now();
    if (options?.reason) updates.lost_reason = options.reason;
  }
  if (status === "expired") {
    updates.expired_at = now();
    updates.closed_at = now();
  }
  if (status === "closed") updates.closed_at = now();
  
  // Get old status for history
  const { data: oldQuote } = await supabase
    .from("quote_requests")
    .select("status, email")
    .eq("id", id)
    .single();
  
  // Update the quote
  const { error } = await supabase.from("quote_requests").update(updates).eq("id", id);
  if (error) throw new Error(error.message);
  
  // Record status change in history
  const { error: historyError } = await supabase.from("quote_status_history").insert({
    quote_request_id: id,
    from_status: oldQuote?.status ?? null,
    to_status: status,
    changed_by: options?.changedBy ?? null,
    reason: options?.reason ?? null,
  });
  if (historyError) console.error("Failed to record status history:", historyError);
  
  // Queue notification for significant status changes
  const notifiableStatuses = ["quoted", "won", "lost", "expired"];
  if (notifiableStatuses.includes(status) && oldQuote?.email) {
    const { error: notifError } = await supabase.from("quote_notifications").insert({
      quote_request_id: id,
      notification_type: status as "quoted" | "won" | "lost" | "expired",
      recipient: oldQuote.email,
      payload: {
        quote_id: id,
        from_status: oldQuote.status,
        to_status: status,
        reason: options?.reason,
      },
    });
    if (notifError) console.error("Failed to queue notification:", notifError);
  }
}

export async function updateQuoteRequest(
  id: string,
  patch: {
    assigned_to?: string | null;
    priority?: QuotePriority;
    due_by?: string | null;
    internal_notes?: string | null;
  }
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const updates: Record<string, unknown> = { updated_at: now() };
  if (patch.assigned_to !== undefined) updates.assigned_to = patch.assigned_to;
  if (patch.priority !== undefined) updates.priority = patch.priority;
  if (patch.due_by !== undefined) updates.due_by = patch.due_by;
  if (patch.internal_notes !== undefined) updates.internal_notes = patch.internal_notes;
  const { error } = await supabase.from("quote_requests").update(updates).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function recordFirstViewed(id: string): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { data } = await supabase.from("quote_requests").select("first_viewed_at").eq("id", id).single();
  if (data && (data as { first_viewed_at: string | null }).first_viewed_at == null) {
    await supabase.from("quote_requests").update({ first_viewed_at: now(), updated_at: now() }).eq("id", id);
  }
}

// ============================================================================
// Quote Lifecycle Functions
// ============================================================================

/**
 * Mark a quote as won (customer accepted).
 */
export async function markQuoteWon(id: string, orderId?: string, changedBy?: string): Promise<void> {
  await updateQuoteRequestStatus(id, "won", { orderId, changedBy });
}

/**
 * Mark a quote as lost (customer declined).
 */
export async function markQuoteLost(id: string, reason?: string, changedBy?: string): Promise<void> {
  await updateQuoteRequestStatus(id, "lost", { reason, changedBy });
}

/**
 * Set quote expiration date.
 */
export async function setQuoteExpiration(id: string, expiresAt: Date): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase
    .from("quote_requests")
    .update({ expires_at: expiresAt.toISOString(), updated_at: now() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Get pending notifications for a quote.
 */
export async function getPendingNotifications(quoteId?: string): Promise<import("./types").QuoteNotificationRow[]> {
  const supabase = getSupabaseCatalogos(true);
  let q = supabase
    .from("quote_notifications")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (quoteId) q = q.eq("quote_request_id", quoteId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as import("./types").QuoteNotificationRow[];
}

/**
 * Mark a notification as sent.
 */
export async function markNotificationSent(notificationId: string): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase
    .from("quote_notifications")
    .update({ status: "sent", sent_at: now() })
    .eq("id", notificationId);
  if (error) throw new Error(error.message);
}

/**
 * Mark a notification as failed.
 */
export async function markNotificationFailed(notificationId: string, errorMessage: string): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase
    .from("quote_notifications")
    .update({ status: "failed", error_message: errorMessage })
    .eq("id", notificationId);
  if (error) throw new Error(error.message);
}

/**
 * Get quotes expiring soon (for admin dashboard).
 */
export async function getExpiringQuotes(daysAhead: number = 7): Promise<QuoteRequestRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);
  
  const { data, error } = await supabase
    .from("quote_requests")
    .select("*")
    .in("status", ["quoted", "reviewing", "contacted"])
    .not("expires_at", "is", null)
    .lte("expires_at", futureDate.toISOString())
    .order("expires_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as QuoteRequestRow[];
}

/**
 * Get quote lifecycle stats.
 */
export async function getQuoteLifecycleStats(): Promise<{
  status: QuoteStatus;
  count: number;
  last_7_days: number;
  last_30_days: number;
  avg_hours_to_close: number | null;
}[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("quote_lifecycle_stats")
    .select("*");
  if (error) {
    console.error("Failed to get lifecycle stats:", error);
    return [];
  }
  return (data ?? []) as {
    status: QuoteStatus;
    count: number;
    last_7_days: number;
    last_30_days: number;
    avg_hours_to_close: number | null;
  }[];
}
