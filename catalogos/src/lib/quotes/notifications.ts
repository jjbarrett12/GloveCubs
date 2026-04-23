/**
 * RFQ notification hooks. Stub implementations; wire to email/in-app later.
 */

export interface NewRfqPayload {
  quoteId: string;
  referenceNumber: string;
  companyName: string;
  contactEmail: string;
  urgency: string | null;
}

export async function notifyTeamNewRfq(_payload: NewRfqPayload): Promise<void> {
  // TODO: Send to internal channel (email digest, Slack, etc.)
}

export async function notifyAssigneeAssigned(_quoteId: string, _referenceNumber: string, _assigneeId: string): Promise<void> {
  // TODO: Email or in-app notification to assignee
}

export async function sendBuyerConfirmation(_payload: { email: string; referenceNumber: string; companyName: string }): Promise<void> {
  // TODO: Send confirmation email to buyer
}
