/**
 * P0-6: Quote idempotency, rate limiting, and atomic create (RPC) behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createQuoteRequest,
  getQuoteSubmitCountRecent,
  QUOTE_SUBMIT_RATE_LIMIT_PER_HOUR,
} from "./service";
import type { SubmitQuoteRequestInput } from "./schemas";

const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockSupabase = {
  from: mockFrom,
  rpc: mockRpc,
};
vi.mock("@/lib/db/client", () => ({
  getSupabaseCatalogos: () => mockSupabase,
}));
vi.mock("./notifications", () => ({
  notifyTeamNewRfq: vi.fn().mockResolvedValue(undefined),
  sendBuyerConfirmation: vi.fn().mockResolvedValue(undefined),
}));

const baseInput: SubmitQuoteRequestInput = {
  company_name: "Acme Inc",
  contact_name: "Jane Doe",
  email: "jane@acme.com",
  items: [{ productId: "00000000-0000-0000-0000-000000000001", slug: "gloves", name: "Gloves", quantity: 10 }],
};

describe("Quote submit P0", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
  });

  describe("idempotency", () => {
    it("createQuoteRequest calls create_quote_with_lines RPC with idempotency_key when provided", async () => {
      mockRpc.mockResolvedValue({
        data: [{ id: "quote-1", reference_number: "RFQ-ABC12345" }],
        error: null,
      });
      await createQuoteRequest({ ...baseInput, idempotency_key: "key-123" });
      expect(mockRpc).toHaveBeenCalledWith("create_quote_with_lines", expect.objectContaining({
        p_idempotency_key: "key-123",
        p_company_name: baseInput.company_name,
        p_email: baseInput.email,
        p_items: expect.any(Array),
      }));
    });

    it("createQuoteRequest passes null idempotency_key when not provided", async () => {
      mockRpc.mockResolvedValue({
        data: [{ id: "quote-2", reference_number: "RFQ-XYZ67890" }],
        error: null,
      });
      await createQuoteRequest(baseInput);
      expect(mockRpc).toHaveBeenCalledWith("create_quote_with_lines", expect.objectContaining({
        p_idempotency_key: null,
      }));
    });

    it("createQuoteRequest sends canonicalProductId on each line for RPC snapshot", async () => {
      mockRpc.mockResolvedValue({
        data: [{ id: "quote-canonical", reference_number: "RFQ-CANON" }],
        error: null,
      });
      const pid = "00000000-0000-0000-0000-000000000099";
      await createQuoteRequest({
        ...baseInput,
        items: [{ productId: pid, slug: "g", name: "G", quantity: 2, canonicalProductId: pid }],
      });
      expect(mockRpc).toHaveBeenCalledWith(
        "create_quote_with_lines",
        expect.objectContaining({
          p_items: expect.arrayContaining([expect.objectContaining({ canonicalProductId: pid, productId: pid })]),
        })
      );
    });
  });

  describe("atomic create (RPC)", () => {
    it("createQuoteRequest uses RPC and returns id and reference_number", async () => {
      mockRpc.mockResolvedValue({
        data: [{ id: "quote-atomic-1", reference_number: "RFQ-ATOMIC1" }],
        error: null,
      });
      const result = await createQuoteRequest(baseInput);
      expect(result).toEqual({ id: "quote-atomic-1", reference_number: "RFQ-ATOMIC1" });
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("createQuoteRequest throws when RPC returns no row", async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });
      await expect(createQuoteRequest(baseInput)).rejects.toThrow("Failed to create quote request");
    });
  });

  describe("quote + line transaction safety (P3)", () => {
    it("parent and line items created in single RPC only — no separate from() inserts", async () => {
      mockRpc.mockResolvedValue({
        data: [{ id: "quote-1", reference_number: "RFQ-ABCD1234" }],
        error: null,
      });
      await createQuoteRequest(baseInput);
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith("create_quote_with_lines", expect.any(Object));
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe("rate limiting", () => {
    it("QUOTE_SUBMIT_RATE_LIMIT_PER_HOUR is a sane positive number", () => {
      expect(QUOTE_SUBMIT_RATE_LIMIT_PER_HOUR).toBeGreaterThan(0);
      expect(QUOTE_SUBMIT_RATE_LIMIT_PER_HOUR).toBeLessThanOrEqual(100);
    });

    it("getQuoteSubmitCountRecent returns number from count query", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ count: 3, error: null }),
          }),
        }),
      });
      const count = await getQuoteSubmitCountRecent("jane@acme.com", 60);
      expect(count).toBe(3);
    });

    it("getQuoteSubmitCountRecent returns 0 on error", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ count: null, error: new Error("DB error") }),
          }),
        }),
      });
      const count = await getQuoteSubmitCountRecent("jane@acme.com");
      expect(count).toBe(0);
    });
  });
});
