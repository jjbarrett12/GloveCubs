/**
 * Buyer-facing quote service.
 * 
 * Public functions for quote status lookup by reference number.
 * Does NOT require authentication - uses reference number as access key.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import type { QuoteRequestRow, QuoteStatusHistoryRow, QuoteLineItemRow } from "./types";

export interface QuoteWithLineItems extends QuoteRequestRow {
  line_items: QuoteLineItemRow[];
}

/** Min length for ref body after "RFQ-" (e.g. RFQ-A1B2C3D4). */
const REF_PREFIX = "RFQ-";
const REF_MIN_LENGTH = 8;

/**
 * Validates quote reference format before any fetch.
 * Format: RFQ- + at least 4 alphanumeric chars (total length >= 8).
 */
export function isValidQuoteReference(ref: string): boolean {
  const trimmed = String(ref || "").trim().toUpperCase();
  if (trimmed.length < REF_MIN_LENGTH) return false;
  if (!trimmed.startsWith(REF_PREFIX)) return false;
  const body = trimmed.slice(REF_PREFIX.length);
  return body.length >= 4 && /^[A-Z0-9-]+$/i.test(body);
}

/**
 * Get quote by reference number.
 * This is the public lookup - no auth required.
 */
export async function getQuoteByReference(
  referenceNumber: string
): Promise<QuoteWithLineItems | null> {
  if (!isValidQuoteReference(referenceNumber)) {
    return null;
  }
  const supabase = getSupabaseCatalogos(true);
  const ref = referenceNumber.toUpperCase().trim();

  const { data: quote, error } = await supabase
    .from("quote_requests")
    .select("*")
    .eq("reference_number", ref)
    .single();

  if (error || !quote) {
    return null;
  }
  
  // Get line items
  const { data: lineItems } = await supabase
    .from("quote_line_items")
    .select("*")
    .eq("quote_request_id", quote.id)
    .order("created_at");
  
  return {
    ...(quote as QuoteRequestRow),
    line_items: (lineItems || []) as QuoteLineItemRow[],
  };
}

/**
 * Get status history for a quote.
 */
export async function getQuoteStatusHistory(
  quoteId: string
): Promise<QuoteStatusHistoryRow[]> {
  const supabase = getSupabaseCatalogos(true);
  
  const { data, error } = await supabase
    .from("quote_status_history")
    .select("*")
    .eq("quote_request_id", quoteId)
    .order("created_at", { ascending: true });
  
  if (error) {
    console.error("Failed to get quote status history:", error);
    return [];
  }
  
  return (data || []) as QuoteStatusHistoryRow[];
}

/**
 * Get recent quotes by email.
 * For logged-in users to see their quote history.
 */
export async function getQuotesByEmail(
  email: string,
  limit: number = 20
): Promise<QuoteRequestRow[]> {
  const supabase = getSupabaseCatalogos(true);
  
  const { data, error } = await supabase
    .from("quote_requests")
    .select("*")
    .eq("email", email.toLowerCase().trim())
    .order("created_at", { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error("Failed to get quotes by email:", error);
    return [];
  }
  
  return (data || []) as QuoteRequestRow[];
}

/**
 * Check if a quote exists and get basic info.
 * Used for quick status checks.
 */
export async function checkQuoteStatus(
  referenceNumber: string
): Promise<{ exists: boolean; status?: string; updatedAt?: string }> {
  const supabase = getSupabaseCatalogos(true);
  
  const ref = referenceNumber.toUpperCase().trim();
  
  const { data, error } = await supabase
    .from("quote_requests")
    .select("status, updated_at")
    .eq("reference_number", ref)
    .single();
  
  if (error || !data) {
    return { exists: false };
  }
  
  return {
    exists: true,
    status: data.status,
    updatedAt: data.updated_at,
  };
}

/**
 * Get pending notifications for buyer display.
 * Shows notifications that haven't been delivered yet.
 *
 * SECURITY: Call only with email from server-side session (e.g. cookie). Never pass
 * client-supplied email to avoid cross-buyer notification leakage.
 */
export async function getBuyerNotifications(
  email: string,
  limit: number = 10
): Promise<Array<{
  quoteId: string;
  referenceNumber: string;
  type: string;
  createdAt: string;
}>> {
  const normalizedEmail = email?.toLowerCase?.()?.trim?.() ?? "";
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return [];
  }

  const supabase = getSupabaseCatalogos(true);

  const { data, error } = await supabase
    .from("quote_notifications")
    .select(`
      id,
      notification_type,
      created_at,
      recipient,
      quote_requests!inner(id, reference_number, email)
    `)
    .eq("recipient", normalizedEmail)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to get buyer notifications:", error);
    return [];
  }

  type Qr = { id: string; reference_number: string | null; email: string };
  const rows = (data || []) as Array<{
    notification_type: string;
    created_at: string;
    recipient: string;
    quote_requests: Qr | Qr[] | null;
  }>;

  function quoteRequest(n: (typeof rows)[number]): Qr | null {
    const qr = n.quote_requests;
    if (!qr) return null;
    return Array.isArray(qr) ? qr[0] ?? null : qr;
  }

  return rows
    .filter((n) => {
      const q = quoteRequest(n);
      return n.recipient === normalizedEmail && q?.email?.toLowerCase?.() === normalizedEmail;
    })
    .map((n) => {
      const q = quoteRequest(n);
      return {
        quoteId: q?.id ?? "",
        referenceNumber: q?.reference_number ?? "",
        type: n.notification_type,
        createdAt: n.created_at,
      };
    });
}
