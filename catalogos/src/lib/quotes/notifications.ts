/**
 * RFQ notification hooks. Delivery is not configured — fail closed (do not pretend success).
 */

import { NOTIFICATION_NOT_CONFIGURED } from "./notificationDelivery";

export interface NewRfqPayload {
  quoteId: string;
  referenceNumber: string;
  companyName: string;
  contactEmail: string;
  urgency: string | null;
}

export class NotificationNotConfiguredError extends Error {
  readonly code = NOTIFICATION_NOT_CONFIGURED;
  constructor(message = "CatalogOS RFQ notification transport is not configured") {
    super(message);
    this.name = "NotificationNotConfiguredError";
  }
}

function logNotConfigured(event: string): void {
  console.warn(
    JSON.stringify({
      category: "quote_notification",
      event,
      code: NOTIFICATION_NOT_CONFIGURED,
      ts: new Date().toISOString(),
    }),
  );
}

export async function notifyTeamNewRfq(_payload: NewRfqPayload): Promise<void> {
  logNotConfigured("notify_team_new_rfq_not_configured");
  throw new NotificationNotConfiguredError();
}

export async function notifyAssigneeAssigned(
  _quoteId: string,
  _referenceNumber: string,
  _assigneeId: string,
): Promise<void> {
  logNotConfigured("notify_assignee_not_configured");
  throw new NotificationNotConfiguredError();
}

export async function sendBuyerConfirmation(_payload: {
  email: string;
  referenceNumber: string;
  companyName: string;
}): Promise<void> {
  logNotConfigured("buyer_confirmation_not_configured");
  throw new NotificationNotConfiguredError();
}
