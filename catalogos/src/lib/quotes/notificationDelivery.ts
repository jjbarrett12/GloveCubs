/**
 * Quote notification delivery. Email transport is not wired yet — delivery must fail closed.
 */

export const NOTIFICATION_NOT_CONFIGURED = "NOT_CONFIGURED" as const;

export type NotificationDeliveryResult =
  | { success: true }
  | { success: false; error: string; code: typeof NOTIFICATION_NOT_CONFIGURED | "TRANSPORT_ERROR" };

/**
 * Attempt email delivery. Until a real SMTP/provider is wired, always returns NOT_CONFIGURED.
 * Never returns success without a confirmed transport send.
 */
export async function deliverQuoteEmailNotification(_input: {
  to: string;
  subject: string;
}): Promise<NotificationDeliveryResult> {
  // Intentionally no recipient/subject body in logs (PII / quote content).
  console.warn(
    JSON.stringify({
      category: "quote_notification",
      event: "delivery_not_configured",
      code: NOTIFICATION_NOT_CONFIGURED,
      ts: new Date().toISOString(),
    }),
  );
  return {
    success: false,
    code: NOTIFICATION_NOT_CONFIGURED,
    error: "Email transport is not configured for CatalogOS quote notifications",
  };
}

export async function deliverQuoteChannelNotification(input: {
  channel: string;
  to: string;
  subject: string;
}): Promise<NotificationDeliveryResult> {
  switch (input.channel) {
    case "email":
      return deliverQuoteEmailNotification({ to: input.to, subject: input.subject });
    case "internal":
    case "webhook":
    case "sms":
      return {
        success: false,
        code: NOTIFICATION_NOT_CONFIGURED,
        error: `Channel "${input.channel}" transport is not configured`,
      };
    default:
      return {
        success: false,
        code: "TRANSPORT_ERROR",
        error: `Unknown channel: ${input.channel}`,
      };
  }
}
