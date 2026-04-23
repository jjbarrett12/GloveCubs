/**
 * Quote Notification Worker
 * 
 * Processes pending quote notifications.
 * Can be run as a cron job or background worker.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import type { QuoteNotificationRow, QuoteRequestRow } from "./types";

export interface NotificationResult {
  notificationId: string;
  success: boolean;
  error?: string;
}

export interface WorkerResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  results: NotificationResult[];
}

/**
 * Send email notification (stub - replace with actual email service)
 */
async function sendEmailNotification(
  to: string,
  subject: string,
  body: string,
  html?: string
): Promise<{ success: boolean; error?: string }> {
  // TODO: Replace with actual email service (SendGrid, Resend, etc.)
  console.log(`[NotificationWorker] Would send email to ${to}:`);
  console.log(`  Subject: ${subject}`);
  console.log(`  Body: ${body.substring(0, 100)}...`);
  
  // For now, simulate success
  // In production, integrate with your email provider:
  // 
  // import { Resend } from 'resend';
  // const resend = new Resend(process.env.RESEND_API_KEY);
  // const { data, error } = await resend.emails.send({
  //   from: 'quotes@glovecubs.com',
  //   to,
  //   subject,
  //   html,
  // });
  
  return { success: true };
}

/**
 * Build notification content based on type
 */
function buildNotificationContent(
  type: string,
  quote: QuoteRequestRow
): { subject: string; body: string; html: string } {
  const refNum = quote.reference_number || "N/A";
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://glovecubs.com";
  const statusUrl = `${baseUrl}/quote/status/${encodeURIComponent(refNum)}`;
  
  switch (type) {
    case "received":
      return {
        subject: `Quote Request Received - ${refNum}`,
        body: `Thank you for your quote request! We've received your submission and will review it shortly.\n\nReference: ${refNum}\nTrack status: ${statusUrl}`,
        html: `
          <h2>Quote Request Received</h2>
          <p>Thank you for your quote request! We've received your submission and will review it shortly.</p>
          <p><strong>Reference:</strong> ${refNum}</p>
          <p><a href="${statusUrl}">Track your quote status →</a></p>
        `,
      };
      
    case "quoted":
      return {
        subject: `Your Quote is Ready - ${refNum}`,
        body: `Great news! Your quote is ready. Please review the pricing and let us know if you'd like to proceed.\n\nReference: ${refNum}\nView quote: ${statusUrl}`,
        html: `
          <h2>Your Quote is Ready!</h2>
          <p>Great news! We've prepared a quote based on your requirements.</p>
          <p><strong>Reference:</strong> ${refNum}</p>
          <p><a href="${statusUrl}">View your quote →</a></p>
        `,
      };
      
    case "won":
      return {
        subject: `Order Confirmed - ${refNum}`,
        body: `Thank you for your order! We're processing it now and will keep you updated.\n\nReference: ${refNum}`,
        html: `
          <h2>Order Confirmed!</h2>
          <p>Thank you for your order! We're processing it now and will notify you when it ships.</p>
          <p><strong>Reference:</strong> ${refNum}</p>
        `,
      };
      
    case "lost":
      return {
        subject: `Quote Update - ${refNum}`,
        body: `We noticed you didn't proceed with your recent quote. If you have any questions or need a revised quote, please let us know.\n\nReference: ${refNum}`,
        html: `
          <h2>Quote Update</h2>
          <p>We noticed you didn't proceed with your recent quote. If you have any questions or need a revised quote, we're here to help.</p>
          <p><strong>Reference:</strong> ${refNum}</p>
          <p><a href="${baseUrl}/quote">Request a new quote →</a></p>
        `,
      };
      
    case "expired":
      return {
        subject: `Quote Expired - ${refNum}`,
        body: `Your quote has expired. If you're still interested, please submit a new request for updated pricing.\n\nReference: ${refNum}`,
        html: `
          <h2>Quote Expired</h2>
          <p>Your quote has expired. If you're still interested in these products, please submit a new request for updated pricing.</p>
          <p><strong>Reference:</strong> ${refNum}</p>
          <p><a href="${baseUrl}/quote">Request a new quote →</a></p>
        `,
      };
      
    case "reminder":
      return {
        subject: `Reminder: Your Quote is Expiring Soon - ${refNum}`,
        body: `Just a reminder that your quote will expire soon. Review and accept it to lock in the pricing.\n\nReference: ${refNum}\nView quote: ${statusUrl}`,
        html: `
          <h2>Your Quote is Expiring Soon</h2>
          <p>Just a friendly reminder that your quote will expire soon. Review and accept it to lock in the current pricing.</p>
          <p><strong>Reference:</strong> ${refNum}</p>
          <p><a href="${statusUrl}">View your quote →</a></p>
        `,
      };
      
    default:
      return {
        subject: `Quote Update - ${refNum}`,
        body: `There's an update on your quote request.\n\nReference: ${refNum}\nView details: ${statusUrl}`,
        html: `
          <h2>Quote Update</h2>
          <p>There's an update on your quote request.</p>
          <p><strong>Reference:</strong> ${refNum}</p>
          <p><a href="${statusUrl}">View details →</a></p>
        `,
      };
  }
}

/**
 * Process a single notification
 */
async function processNotification(
  notification: QuoteNotificationRow,
  quote: QuoteRequestRow
): Promise<NotificationResult> {
  const supabase = getSupabaseCatalogos(true);
  
  try {
    // Build content
    const content = buildNotificationContent(notification.notification_type, quote);
    
    // Send based on channel
    let result: { success: boolean; error?: string };
    
    switch (notification.channel) {
      case "email":
        result = await sendEmailNotification(
          notification.recipient,
          content.subject,
          content.body,
          content.html
        );
        break;
        
      case "internal":
        // Internal notifications are just logged
        console.log(`[Internal Notification] ${notification.notification_type} for ${quote.reference_number}`);
        result = { success: true };
        break;
        
      case "webhook":
        // TODO: Implement webhook delivery
        console.log(`[Webhook] Would call webhook for ${quote.reference_number}`);
        result = { success: true };
        break;
        
      case "sms":
        // TODO: Implement SMS delivery
        console.log(`[SMS] Would send SMS to ${notification.recipient}`);
        result = { success: true };
        break;
        
      default:
        result = { success: false, error: `Unknown channel: ${notification.channel}` };
    }
    
    // Update notification status
    if (result.success) {
      await supabase
        .from("quote_notifications")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", notification.id);
    } else {
      await supabase
        .from("quote_notifications")
        .update({ status: "failed", error_message: result.error })
        .eq("id", notification.id);
    }
    
    return {
      notificationId: notification.id,
      success: result.success,
      error: result.error,
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    await supabase
      .from("quote_notifications")
      .update({ status: "failed", error_message: errorMessage })
      .eq("id", notification.id);
    
    return {
      notificationId: notification.id,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Process pending notifications
 */
export async function processNotifications(
  limit: number = 50
): Promise<WorkerResult> {
  const supabase = getSupabaseCatalogos(true);
  
  const result: WorkerResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    results: [],
  };
  
  try {
    // Get pending notifications with quote data
    const { data: notifications, error } = await supabase
      .from("quote_notifications")
      .select(`
        *,
        quote_requests(*)
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit);
    
    if (error) {
      console.error("[NotificationWorker] Failed to fetch notifications:", error);
      return result;
    }
    
    if (!notifications || notifications.length === 0) {
      console.log("[NotificationWorker] No pending notifications");
      return result;
    }
    
    console.log(`[NotificationWorker] Processing ${notifications.length} notifications`);
    
    for (const notification of notifications) {
      result.processed++;
      
      const quote = notification.quote_requests as unknown as QuoteRequestRow;
      
      if (!quote) {
        console.warn(`[NotificationWorker] Quote not found for notification ${notification.id}`);
        result.skipped++;
        continue;
      }
      
      const notifResult = await processNotification(
        notification as QuoteNotificationRow,
        quote
      );
      
      result.results.push(notifResult);
      
      if (notifResult.success) {
        result.sent++;
      } else {
        result.failed++;
      }
    }
    
    console.log(`[NotificationWorker] Complete: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`);
    
  } catch (error) {
    console.error("[NotificationWorker] Error:", error);
  }
  
  return result;
}

/**
 * Queue a quote reminder notification
 */
export async function queueReminderNotification(
  quoteId: string,
  email: string
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  
  await supabase.from("quote_notifications").insert({
    quote_request_id: quoteId,
    notification_type: "reminder",
    channel: "email",
    recipient: email,
    status: "pending",
    payload: { triggered_by: "expiration_check" },
  });
}

/**
 * Check and queue reminders for expiring quotes
 */
export async function checkExpiringQuotes(
  daysBeforeExpiry: number = 3
): Promise<number> {
  const supabase = getSupabaseCatalogos(true);
  
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysBeforeExpiry);
  
  const now = new Date();
  
  // Find quotes expiring soon that haven't had a reminder
  const { data: quotes, error } = await supabase
    .from("quote_requests")
    .select("id, email, reference_number, expires_at")
    .in("status", ["quoted", "reviewing", "contacted"])
    .not("expires_at", "is", null)
    .gte("expires_at", now.toISOString())
    .lte("expires_at", futureDate.toISOString());
  
  if (error || !quotes) {
    console.error("[NotificationWorker] Failed to check expiring quotes:", error);
    return 0;
  }
  
  let queued = 0;
  
  for (const quote of quotes) {
    // Check if reminder already sent
    const { data: existing } = await supabase
      .from("quote_notifications")
      .select("id")
      .eq("quote_request_id", quote.id)
      .eq("notification_type", "reminder")
      .single();
    
    if (!existing) {
      await queueReminderNotification(quote.id, quote.email);
      queued++;
    }
  }
  
  console.log(`[NotificationWorker] Queued ${queued} reminder notifications`);
  
  return queued;
}
