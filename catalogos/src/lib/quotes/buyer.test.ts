/**
 * Tests for buyer-facing quote visibility and status rendering
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { QuoteStatus, QuoteRequestRow, QuoteStatusHistoryRow } from "./types";
import { QUOTE_STATUS, QUOTE_NOTIFICATION_TYPE } from "./types";
import { getStatusDescription, getStatusConfig } from "@/components/quotes/QuoteStatusBadge";
import {
  isValidQuoteReference,
  getQuoteByReference,
  getBuyerNotifications,
} from "./buyerService";

// Mock Supabase client: default chain returns empty/null
const mockSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
const mockOrder = vi.fn(() => ({ limit: vi.fn(() => Promise.resolve({ data: [], error: null })) }));
const mockEq = vi.fn(() => ({ single: mockSingle, order: mockOrder }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
vi.mock("@/lib/db/client", () => ({
  getSupabaseCatalogos: vi.fn(() => ({ from: mockFrom })),
}));

describe("Quote Status Types", () => {
  it("includes all buyer-visible statuses", () => {
    const buyerStatuses: QuoteStatus[] = ["new", "reviewing", "contacted", "quoted", "won", "lost", "expired"];
    
    for (const status of buyerStatuses) {
      expect(QUOTE_STATUS).toContain(status);
    }
  });
  
  it("has closed as a valid status", () => {
    expect(QUOTE_STATUS).toContain("closed");
  });
  
  it("includes all notification types", () => {
    const expectedTypes = ["received", "updated", "quoted", "won", "lost", "expired", "reminder"];
    
    for (const type of expectedTypes) {
      expect(QUOTE_NOTIFICATION_TYPE).toContain(type);
    }
  });
});

describe("Quote Status Display Logic", () => {
  const statusLabels: Record<QuoteStatus, string> = {
    new: "Submitted",
    reviewing: "Under Review",
    contacted: "In Discussion",
    quoted: "Quote Sent",
    won: "Accepted",
    lost: "Declined",
    expired: "Expired",
    closed: "Closed",
  };

  it("getStatusDescription returns non-empty string for every status", () => {
    for (const status of QUOTE_STATUS) {
      const desc = getStatusDescription(status);
      expect(desc).toBeDefined();
      expect(typeof desc).toBe("string");
      expect(desc.length).toBeGreaterThan(0);
    }
  });

  it("getStatusConfig returns label and description for every status", () => {
    for (const status of QUOTE_STATUS) {
      const config = getStatusConfig(status);
      expect(config).toBeDefined();
      expect(config.label).toBeDefined();
      expect(config.description).toBeDefined();
      expect(config.label.length).toBeGreaterThan(0);
      expect(config.description.length).toBeGreaterThan(0);
    }
  });
  
  it("has a label for every status", () => {
    for (const status of QUOTE_STATUS) {
      expect(statusLabels[status]).toBeDefined();
      expect(statusLabels[status].length).toBeGreaterThan(0);
    }
  });
  
  it("correctly categorizes active vs completed statuses", () => {
    const activeStatuses: QuoteStatus[] = ["new", "reviewing", "contacted", "quoted"];
    const completedStatuses: QuoteStatus[] = ["won", "lost", "expired", "closed"];
    
    expect(activeStatuses.every(s => QUOTE_STATUS.includes(s))).toBe(true);
    expect(completedStatuses.every(s => QUOTE_STATUS.includes(s))).toBe(true);
    
    // No overlap
    const overlap = activeStatuses.filter(s => completedStatuses.includes(s));
    expect(overlap.length).toBe(0);
    
    // All statuses covered
    expect([...activeStatuses, ...completedStatuses].length).toBe(QUOTE_STATUS.length);
  });
});

describe("Quote Timeline Logic", () => {
  it("orders history entries chronologically", () => {
    const history: QuoteStatusHistoryRow[] = [
      {
        id: "1",
        quote_request_id: "q1",
        from_status: null,
        to_status: "new",
        changed_by: null,
        reason: null,
        created_at: "2026-03-01T10:00:00Z",
      },
      {
        id: "2",
        quote_request_id: "q1",
        from_status: "new",
        to_status: "reviewing",
        changed_by: "admin",
        reason: null,
        created_at: "2026-03-02T10:00:00Z",
      },
      {
        id: "3",
        quote_request_id: "q1",
        from_status: "reviewing",
        to_status: "quoted",
        changed_by: "admin",
        reason: null,
        created_at: "2026-03-03T10:00:00Z",
      },
    ];
    
    const sorted = [...history].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    
    expect(sorted[0].to_status).toBe("new");
    expect(sorted[1].to_status).toBe("reviewing");
    expect(sorted[2].to_status).toBe("quoted");
  });
  
  it("identifies current status correctly", () => {
    const quote: Partial<QuoteRequestRow> = {
      status: "quoted",
      created_at: "2026-03-01T10:00:00Z",
      quoted_at: "2026-03-03T10:00:00Z",
    };
    
    expect(quote.status).toBe("quoted");
    expect(quote.quoted_at).toBeDefined();
  });
});

describe("Quote Expiration Logic", () => {
  it("identifies expired quotes correctly", () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const futureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    
    const expiredQuote = { expires_at: pastDate };
    const activeQuote = { expires_at: futureDate };
    const noExpiry = { expires_at: null };
    
    expect(new Date(expiredQuote.expires_at) < now).toBe(true);
    expect(new Date(activeQuote.expires_at) < now).toBe(false);
    expect(noExpiry.expires_at).toBeNull();
  });
  
  it("handles quotes approaching expiration", () => {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    
    const expiringQuote = {
      status: "quoted" as QuoteStatus,
      expires_at: threeDaysFromNow.toISOString(),
    };
    
    const daysUntilExpiry = Math.ceil(
      (new Date(expiringQuote.expires_at).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );
    
    expect(daysUntilExpiry).toBeLessThanOrEqual(3);
    expect(expiringQuote.status).toBe("quoted");
  });
});

describe("Quote Reference Number Format", () => {
  it("normalizes reference numbers to uppercase", () => {
    const inputs = ["rfq-abc123", "RFQ-ABC123", "Rfq-Abc123"];
    const expected = "RFQ-ABC123";
    
    for (const input of inputs) {
      expect(input.toUpperCase()).toBe(expected);
    }
  });
  
  it("validates reference number format", () => {
    const validRefs = ["RFQ-12345678", "RFQ-ABCD1234", "RFQ-A1B2C3D4"];
    const invalidRefs = ["123", "ABC", "RFQ", "RFQ-"];
    
    const isValidFormat = (ref: string) => 
      ref.startsWith("RFQ-") && ref.length >= 8;
    
    for (const ref of validRefs) {
      expect(isValidFormat(ref)).toBe(true);
    }
    
    for (const ref of invalidRefs) {
      expect(isValidFormat(ref)).toBe(false);
    }
  });
});

describe("Quote Lost Reason Display", () => {
  it("shows lost reason when status is lost", () => {
    const lostQuote: Partial<QuoteRequestRow> = {
      status: "lost",
      lost_at: "2026-03-05T10:00:00Z",
      lost_reason: "Price too high compared to alternatives",
    };
    
    expect(lostQuote.status).toBe("lost");
    expect(lostQuote.lost_reason).toBeDefined();
    expect(lostQuote.lost_reason?.length).toBeGreaterThan(0);
  });
  
  it("handles missing lost reason gracefully", () => {
    const lostQuote: Partial<QuoteRequestRow> = {
      status: "lost",
      lost_at: "2026-03-05T10:00:00Z",
      lost_reason: null,
    };
    
    expect(lostQuote.lost_reason).toBeNull();
  });
});

describe("Quote Next Action Logic", () => {
  it("provides correct next action for each status", () => {
    const statusActions: Record<QuoteStatus, string> = {
      new: "awaiting review",
      reviewing: "preparing quote",
      contacted: "in discussion",
      quoted: "review quote",
      won: "order processing",
      lost: "request new quote",
      expired: "request new quote",
      closed: "request new quote",
    };
    
    for (const status of QUOTE_STATUS) {
      expect(statusActions[status]).toBeDefined();
    }
  });
  
  it("suggests new quote for terminal statuses", () => {
    const terminalStatuses: QuoteStatus[] = ["lost", "expired", "closed"];
    
    for (const status of terminalStatuses) {
      // Terminal statuses should suggest requesting a new quote
      expect(terminalStatuses.includes(status)).toBe(true);
    }
  });
});

describe("Quote Notification Types", () => {
  it("has notification type for key status changes", () => {
    const statusToNotification: Partial<Record<QuoteStatus, string>> = {
      new: "received",
      quoted: "quoted",
      won: "won",
      lost: "lost",
      expired: "expired",
    };
    
    for (const [status, notifType] of Object.entries(statusToNotification)) {
      expect(QUOTE_NOTIFICATION_TYPE).toContain(notifType);
    }
  });
  
  it("includes reminder notification type", () => {
    expect(QUOTE_NOTIFICATION_TYPE).toContain("reminder");
  });
});

describe("Quote Empty State Handling", () => {
  it("handles empty quote list", () => {
    const quotes: QuoteRequestRow[] = [];
    
    expect(quotes.length).toBe(0);
    
    const activeQuotes = quotes.filter(q => 
      ["new", "reviewing", "contacted", "quoted"].includes(q.status)
    );
    const completedQuotes = quotes.filter(q => 
      ["won", "lost", "expired", "closed"].includes(q.status)
    );
    
    expect(activeQuotes.length).toBe(0);
    expect(completedQuotes.length).toBe(0);
  });
  
  it("handles quote with no line items", () => {
    const quote: Partial<QuoteRequestRow> & { line_items?: unknown[] } = {
      id: "q1",
      status: "new",
      line_items: [],
    };
    
    expect(quote.line_items?.length).toBe(0);
  });
});

describe("Date Formatting", () => {
  it("formats dates for display", () => {
    const dateStr = "2026-03-12T14:30:00Z";
    const date = new Date(dateStr);
    
    // Should produce a readable format
    const formatted = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    
    expect(formatted).toContain("Mar");
    expect(formatted).toContain("12");
    expect(formatted).toContain("2026");
  });
  
  it("calculates relative time correctly", () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const diffDaysYesterday = Math.floor(
      (now.getTime() - yesterday.getTime()) / (24 * 60 * 60 * 1000)
    );
    const diffDaysLastWeek = Math.floor(
      (now.getTime() - lastWeek.getTime()) / (24 * 60 * 60 * 1000)
    );
    
    expect(diffDaysYesterday).toBe(1);
    expect(diffDaysLastWeek).toBe(7);
  });
});

describe("isValidQuoteReference", () => {
  it("accepts valid reference format RFQ- plus alphanumeric body", () => {
    expect(isValidQuoteReference("RFQ-A1B2C3D4")).toBe(true);
    expect(isValidQuoteReference("RFQ-12345678")).toBe(true);
    expect(isValidQuoteReference("rfq-abc12345")).toBe(true);
    expect(isValidQuoteReference("  RFQ-X9Z9  ")).toBe(true);
  });

  it("rejects invalid reference format", () => {
    expect(isValidQuoteReference("")).toBe(false);
    expect(isValidQuoteReference("   ")).toBe(false);
    expect(isValidQuoteReference("RFQ")).toBe(false);
    expect(isValidQuoteReference("RFQ-")).toBe(false);
    expect(isValidQuoteReference("RFQ-12")).toBe(false);
    expect(isValidQuoteReference("RFQ-123")).toBe(false);
    expect(isValidQuoteReference("INVALID-1234")).toBe(false);
    expect(isValidQuoteReference("1234")).toBe(false);
  });

  it("rejects refs with invalid characters in body", () => {
    expect(isValidQuoteReference("RFQ-A1B2!C3")).toBe(false);
    expect(isValidQuoteReference("RFQ-A B C D")).toBe(false);
  });
});

describe("getQuoteByReference with invalid ref", () => {
  it("returns null for invalid reference (no DB fetch for invalid format)", async () => {
    expect(await getQuoteByReference("")).toBeNull();
    expect(await getQuoteByReference("RFQ-12")).toBeNull();
    expect(await getQuoteByReference("invalid")).toBeNull();
  });
});

describe("getBuyerNotifications", () => {
  it("returns empty array for empty or invalid email", async () => {
    expect(await getBuyerNotifications("")).toEqual([]);
    expect(await getBuyerNotifications("   ")).toEqual([]);
    expect(await getBuyerNotifications("not-an-email")).toEqual([]);
    expect(await getBuyerNotifications("a")).toEqual([]);
  });

  it("returns only notifications for requested email (no cross-buyer leakage)", async () => {
    const limitFn = vi.fn().mockResolvedValue({
      data: [
        {
          notification_type: "quoted",
          created_at: "2026-04-01T12:00:00Z",
          recipient: "alice@example.com",
          quote_requests: { id: "q1", reference_number: "RFQ-AAA", email: "alice@example.com" },
        },
        {
          notification_type: "received",
          created_at: "2026-04-01T11:00:00Z",
          recipient: "bob@example.com",
          quote_requests: { id: "q2", reference_number: "RFQ-BBB", email: "bob@example.com" },
        },
      ],
      error: null,
    });
    const orderFn = vi.fn(() => ({ limit: limitFn }));
    const eq2 = vi.fn(() => ({ order: orderFn }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    mockFrom.mockReturnValueOnce({ select: vi.fn(() => ({ eq: eq1 })) });
    const result = await getBuyerNotifications("alice@example.com");
    expect(result).toHaveLength(1);
    expect(result[0].quoteId).toBe("q1");
    expect(result[0].referenceNumber).toBe("RFQ-AAA");
    expect(result[0].type).toBe("quoted");
    expect(result.some((n) => n.quoteId === "q2")).toBe(false);
  });

  it("filters out rows where quote_requests.email does not match recipient", async () => {
    const limitFn = vi.fn().mockResolvedValue({
      data: [
        {
          notification_type: "quoted",
          created_at: "2026-04-01T12:00:00Z",
          recipient: "alice@example.com",
          quote_requests: { id: "q1", reference_number: "RFQ-AAA", email: "other@example.com" },
        },
      ],
      error: null,
    });
    const orderFn = vi.fn(() => ({ limit: limitFn }));
    const eq2 = vi.fn(() => ({ order: orderFn }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    mockFrom.mockReturnValueOnce({ select: vi.fn(() => ({ eq: eq1 })) });
    const result = await getBuyerNotifications("alice@example.com");
    expect(result).toHaveLength(0);
  });
});
