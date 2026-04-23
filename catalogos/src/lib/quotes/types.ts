/**
 * Quote / RFQ domain types.
 */

export const QUOTE_STATUS = ["new", "reviewing", "contacted", "quoted", "won", "lost", "expired", "closed"] as const;
export type QuoteStatus = (typeof QUOTE_STATUS)[number];

export const QUOTE_URGENCY = ["standard", "urgent", "asap"] as const;
export type QuoteUrgency = (typeof QUOTE_URGENCY)[number];

export const QUOTE_PRIORITY = ["low", "normal", "high", "urgent"] as const;
export type QuotePriority = (typeof QUOTE_PRIORITY)[number];

export const QUOTE_NOTIFICATION_TYPE = ["received", "updated", "quoted", "won", "lost", "expired", "reminder"] as const;
export type QuoteNotificationType = (typeof QUOTE_NOTIFICATION_TYPE)[number];

export interface QuoteRequestRow {
  id: string;
  reference_number: string | null;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  urgency: QuoteUrgency | null;
  status: QuoteStatus;
  created_at: string;
  updated_at: string;
  assigned_to: string | null;
  priority: QuotePriority;
  due_by: string | null;
  source: string | null;
  internal_notes: string | null;
  submitted_at: string | null;
  first_viewed_at: string | null;
  first_contacted_at: string | null;
  quoted_at: string | null;
  closed_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  expired_at: string | null;
  expires_at: string | null;
  lost_reason: string | null;
  won_order_id: string | null;
}

export interface QuoteStatusHistoryRow {
  id: string;
  quote_request_id: string;
  from_status: QuoteStatus | null;
  to_status: QuoteStatus;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}

export interface QuoteNotificationRow {
  id: string;
  quote_request_id: string;
  notification_type: QuoteNotificationType;
  channel: 'email' | 'sms' | 'webhook' | 'internal';
  recipient: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  payload: Record<string, unknown> | null;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

/** Queue filter for RFQ list. */
export type RfqQueueFilter = "all" | "unassigned" | "mine" | "overdue" | "urgent" | "awaiting_response";

export interface QuoteLineItemRow {
  id: string;
  quote_request_id: string;
  product_id: string;
  quantity: number;
  notes: string | null;
  product_snapshot: Record<string, unknown>;
  created_at: string;
}

export interface QuoteFileRow {
  id: string;
  quote_request_id: string;
  storage_key: string;
  filename: string;
  content_type: string | null;
  created_at: string;
}

/** Client-side basket item (before submit). */
export interface QuoteBasketItem {
  productId: string;
  /** Catalog master UUID for snapshots and downstream order alignment (defaults to productId when omitted). */
  canonicalProductId?: string;
  slug: string;
  name: string;
  quantity: number;
  notes: string;
  /** Optional: unit price at add time for display */
  unitPrice?: number | null;
  sku?: string | null;
}
