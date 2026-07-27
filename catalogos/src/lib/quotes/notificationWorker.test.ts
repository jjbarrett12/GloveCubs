import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuoteNotificationRow, QuoteRequestRow } from "./types";
import {
  NOTIFICATION_NOT_CONFIGURED,
  deliverQuoteChannelNotification,
  deliverQuoteEmailNotification,
} from "./notificationDelivery";
import { NotificationNotConfiguredError, notifyTeamNewRfq } from "./notifications";

const updateEq = vi.fn();
const update = vi.fn(() => ({ eq: updateEq }));
const selectLimit = vi.fn();
const selectOrder = vi.fn(() => ({ limit: selectLimit }));
const selectEq = vi.fn(() => ({ order: selectOrder }));
const select = vi.fn(() => ({ eq: selectEq }));
const from = vi.fn((table: string) => {
  if (table === "quote_notifications") {
    return { select, update, insert: vi.fn() };
  }
  return { select, update };
});

vi.mock("@/lib/db/client", () => ({
  getSupabaseCatalogos: vi.fn(() => ({ from })),
}));

describe("notificationDelivery", () => {
  it("email transport returns NOT_CONFIGURED and never success", async () => {
    const r = await deliverQuoteEmailNotification({ to: "a@b.com", subject: "x" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.code).toBe(NOTIFICATION_NOT_CONFIGURED);
    }
  });

  it("stub channels fail closed", async () => {
    for (const channel of ["email", "internal", "webhook", "sms"] as const) {
      const r = await deliverQuoteChannelNotification({
        channel,
        to: "ops",
        subject: "s",
      });
      expect(r.success).toBe(false);
    }
  });
});

describe("notifications hooks", () => {
  it("throws typed NOT_CONFIGURED instead of resolving success", async () => {
    await expect(
      notifyTeamNewRfq({
        quoteId: "q",
        referenceNumber: "RFQ-1",
        companyName: "Co",
        contactEmail: "a@b.com",
        urgency: null,
      }),
    ).rejects.toBeInstanceOf(NotificationNotConfiguredError);
  });
});

describe("processNotifications truthfulness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateEq.mockResolvedValue({ error: null });
  });

  it("marks pending email notifications failed, never sent, when transport unavailable", async () => {
    const notification: QuoteNotificationRow = {
      id: "n1",
      quote_request_id: "q1",
      notification_type: "received",
      channel: "email",
      recipient: "buyer@example.com",
      status: "pending",
      payload: {},
      error_message: null,
      sent_at: null,
      created_at: "2026-07-27T00:00:00Z",
    } as QuoteNotificationRow;

    const quote: QuoteRequestRow = {
      id: "q1",
      reference_number: "RFQ-123",
      email: "buyer@example.com",
      company_name: "Co",
      status: "new",
    } as QuoteRequestRow;

    selectLimit.mockResolvedValue({
      data: [{ ...notification, quote_requests: quote }],
      error: null,
    });

    const { processNotifications } = await import("./notificationWorker");
    const result = await processNotifications(10);

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(update).toHaveBeenCalled();
    const firstCall = (update as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const updateArg = firstCall?.[0] as { status?: string; error_message?: string } | undefined;
    expect(updateArg?.status).toBe("failed");
    expect(updateArg?.status).not.toBe("sent");
    expect(String(updateArg?.error_message || "")).toMatch(/not configured/i);
  });

  it("duplicate worker run does not re-send already failed rows (only pending selected)", async () => {
    selectLimit.mockResolvedValue({ data: [], error: null });
    const { processNotifications } = await import("./notificationWorker");
    const result = await processNotifications(10);
    expect(result.processed).toBe(0);
    expect(result.sent).toBe(0);
    expect(selectEq).toHaveBeenCalledWith("status", "pending");
  });
});
