import { describe, it, expect, vi } from "vitest";
import {
  linkOrphanQuoteRequestsByEmail,
  normalizeBuyerEmail,
} from "@/lib/admin/admin-company-member-write";

describe("linkOrphanQuoteRequestsByEmail", () => {
  it("normalizes email and updates unlinked quote requests", async () => {
    const updateMock = vi.fn().mockReturnThis();
    const eqMock = vi.fn().mockReturnThis();
    const isMock = vi.fn().mockReturnThis();
    const selectMock = vi.fn().mockResolvedValue({
      data: [{ id: "q1" }, { id: "q2" }],
      error: null,
    });

    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          update: updateMock,
        }),
      }),
    };
    updateMock.mockReturnValue({ eq: eqMock });
    eqMock.mockReturnValue({ is: isMock });
    isMock.mockReturnValue({ select: selectMock });

    const result = await linkOrphanQuoteRequestsByEmail(supabase, {
      email: "  BUYER@Example.COM  ",
      companyId: "company-123",
    });

    expect(supabase.schema).toHaveBeenCalledWith("catalogos");
    expect(updateMock).toHaveBeenCalledWith({ gc_company_id: "company-123" });
    expect(eqMock).toHaveBeenCalledWith("email", "buyer@example.com");
    expect(isMock).toHaveBeenCalledWith("gc_company_id", null);
    expect(result.linked_count).toBe(2);
  });

  it("returns zero when no rows match", async () => {
    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    const result = await linkOrphanQuoteRequestsByEmail(supabase, {
      email: "nobody@example.com",
      companyId: "company-456",
    });

    expect(result.linked_count).toBe(0);
  });

  it("throws on invalid email", async () => {
    const supabase = { schema: vi.fn() };
    await expect(
      linkOrphanQuoteRequestsByEmail(supabase, { email: "invalid", companyId: "c" }),
    ).rejects.toThrow("invalid_email");
  });

  it("throws on database error", async () => {
    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: "db error" },
                }),
              }),
            }),
          }),
        }),
      }),
    };

    await expect(
      linkOrphanQuoteRequestsByEmail(supabase, { email: "test@example.com", companyId: "c" }),
    ).rejects.toEqual({ message: "db error" });
  });

  it("is idempotent - only updates rows where gc_company_id IS NULL", async () => {
    const isMock = vi.fn();
    const supabase = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: isMock.mockReturnValue({
                select: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    await linkOrphanQuoteRequestsByEmail(supabase, {
      email: "test@example.com",
      companyId: "c1",
    });

    expect(isMock).toHaveBeenCalledWith("gc_company_id", null);
  });
});

describe("normalizeBuyerEmail", () => {
  it("trims and lowercases email", () => {
    expect(normalizeBuyerEmail("  TEST@EXAMPLE.COM  ")).toBe("test@example.com");
  });

  it("throws on empty email", () => {
    expect(() => normalizeBuyerEmail("")).toThrow("invalid_email");
    expect(() => normalizeBuyerEmail("   ")).toThrow("invalid_email");
  });

  it("throws on malformed email", () => {
    expect(() => normalizeBuyerEmail("notanemail")).toThrow("invalid_email");
    expect(() => normalizeBuyerEmail("@example.com")).toThrow("invalid_email");
    expect(() => normalizeBuyerEmail("test@")).toThrow("invalid_email");
  });
});
