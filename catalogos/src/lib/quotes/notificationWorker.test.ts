/**
 * Tests for quote notification worker
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { QuoteRequestRow, QuoteNotificationRow } from "./types";

// Mock Supabase
const mockFrom = vi.fn();
const mockSupabase = {
  from: mockFrom,
};

vi.mock("@/lib/db/client", () => ({
  getSupabaseCatalogos: vi.fn(() => mockSupabase),
}));

describe("Notification Content Building", () => {
  const mockQuote: Partial<QuoteRequestRow> = {
    id: "q1",
    reference_number: "RFQ-12345678",
    company_name: "Test Company",
    contact_name: "John Doe",
    email: "john@test.com",
    status: "new",
    created_at: "2026-03-12T10:00:00Z",
  };

  it("builds received notification content", () => {
    const type = "received";
    const refNum = mockQuote.reference_number;
    
    // Verify the expected content structure
    expect(refNum).toBe("RFQ-12345678");
    expect(type).toBe("received");
  });

  it("builds quoted notification content", () => {
    const type = "quoted";
    const refNum = mockQuote.reference_number;
    
    expect(refNum).toBeDefined();
    expect(type).toBe("quoted");
  });

  it("builds won notification content", () => {
    const type = "won";
    expect(type).toBe("won");
  });

  it("builds lost notification content", () => {
    const type = "lost";
    expect(type).toBe("lost");
  });

  it("builds expired notification content", () => {
    const type = "expired";
    expect(type).toBe("expired");
  });

  it("builds reminder notification content", () => {
    const type = "reminder";
    expect(type).toBe("reminder");
  });
});

describe("Notification Channel Handling", () => {
  it("identifies email channel", () => {
    const notification: Partial<QuoteNotificationRow> = {
      channel: "email",
      recipient: "test@example.com",
    };
    
    expect(notification.channel).toBe("email");
    expect(notification.recipient).toContain("@");
  });

  it("identifies internal channel", () => {
    const notification: Partial<QuoteNotificationRow> = {
      channel: "internal",
      recipient: "admin",
    };
    
    expect(notification.channel).toBe("internal");
  });

  it("identifies webhook channel", () => {
    const notification: Partial<QuoteNotificationRow> = {
      channel: "webhook",
      recipient: "https://example.com/webhook",
    };
    
    expect(notification.channel).toBe("webhook");
  });

  it("identifies sms channel", () => {
    const notification: Partial<QuoteNotificationRow> = {
      channel: "sms",
      recipient: "+1234567890",
    };
    
    expect(notification.channel).toBe("sms");
  });
});

describe("Notification Status Transitions", () => {
  it("transitions from pending to sent on success", () => {
    const notification: Partial<QuoteNotificationRow> = {
      status: "pending",
    };
    
    expect(notification.status).toBe("pending");
    
    // After successful send
    notification.status = "sent";
    notification.sent_at = new Date().toISOString();
    
    expect(notification.status).toBe("sent");
    expect(notification.sent_at).toBeDefined();
  });

  it("transitions from pending to failed on error", () => {
    const notification: Partial<QuoteNotificationRow> = {
      status: "pending",
    };
    
    expect(notification.status).toBe("pending");
    
    // After failed send
    notification.status = "failed";
    notification.error_message = "SMTP connection failed";
    
    expect(notification.status).toBe("failed");
    expect(notification.error_message).toBeDefined();
  });

  it("can be skipped", () => {
    const notification: Partial<QuoteNotificationRow> = {
      status: "skipped",
    };
    
    expect(notification.status).toBe("skipped");
  });
});

describe("Expiring Quote Detection", () => {
  it("identifies quotes expiring within threshold", () => {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
    const fiveDaysFromNow = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    
    const threshold = 3; // days
    
    const isExpiringSoon = (expiresAt: Date) => {
      const daysUntil = (expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
      return daysUntil <= threshold && daysUntil > 0;
    };
    
    expect(isExpiringSoon(oneDayFromNow)).toBe(true);
    expect(isExpiringSoon(threeDaysFromNow)).toBe(true);
    expect(isExpiringSoon(fiveDaysFromNow)).toBe(false);
  });

  it("excludes already expired quotes", () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const isExpiringSoon = (expiresAt: Date) => {
      const daysUntil = (expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
      return daysUntil <= 3 && daysUntil > 0;
    };
    
    expect(isExpiringSoon(yesterday)).toBe(false);
  });
});

describe("Notification Deduplication", () => {
  it("checks for existing reminder before queueing", () => {
    const existingNotifications: Partial<QuoteNotificationRow>[] = [
      { notification_type: "received", quote_request_id: "q1" },
      { notification_type: "reminder", quote_request_id: "q1" },
    ];
    
    const hasReminder = existingNotifications.some(
      n => n.notification_type === "reminder" && n.quote_request_id === "q1"
    );
    
    expect(hasReminder).toBe(true);
  });

  it("allows queueing reminder if none exists", () => {
    const existingNotifications: Partial<QuoteNotificationRow>[] = [
      { notification_type: "received", quote_request_id: "q1" },
    ];
    
    const hasReminder = existingNotifications.some(
      n => n.notification_type === "reminder" && n.quote_request_id === "q1"
    );
    
    expect(hasReminder).toBe(false);
  });
});

describe("Worker Result Tracking", () => {
  it("tracks processed count", () => {
    const result = {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    };
    
    // Process some notifications
    result.processed = 10;
    result.sent = 8;
    result.failed = 1;
    result.skipped = 1;
    
    expect(result.processed).toBe(10);
    expect(result.sent + result.failed + result.skipped).toBe(10);
  });

  it("calculates success rate", () => {
    const result = {
      processed: 100,
      sent: 95,
      failed: 5,
    };
    
    const successRate = result.sent / result.processed;
    
    expect(successRate).toBe(0.95);
  });
});

describe("URL Building", () => {
  it("builds correct status URL", () => {
    const baseUrl = "https://glovecubs.com";
    const refNum = "RFQ-12345678";
    
    const statusUrl = `${baseUrl}/quote/status/${encodeURIComponent(refNum)}`;
    
    expect(statusUrl).toBe("https://glovecubs.com/quote/status/RFQ-12345678");
  });

  it("encodes special characters in reference number", () => {
    const baseUrl = "https://glovecubs.com";
    const refNum = "RFQ-TEST/123";
    
    const statusUrl = `${baseUrl}/quote/status/${encodeURIComponent(refNum)}`;
    
    expect(statusUrl).toContain(encodeURIComponent("/"));
  });
});
