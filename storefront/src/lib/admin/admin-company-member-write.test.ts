import { describe, it, expect, vi } from "vitest";
import {
  linkOrphanQuoteRequestsByEmail,
  tryLinkOrphanQuoteRequestsByEmail,
  normalizeBuyerEmail,
} from "@/lib/admin/admin-company-member-write";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function rpcClient(impl: (args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>) {
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => impl(args));
  return {
    schema: vi.fn().mockReturnValue({ rpc }),
    __rpc: rpc,
  };
}

describe("normalizeBuyerEmail", () => {
  it("trims and lowercases; preserves plus tags", () => {
    expect(normalizeBuyerEmail("  Buyer+Tag@Example.COM  ")).toBe("buyer+tag@example.com");
  });

  it("rejects invalid email", () => {
    expect(() => normalizeBuyerEmail("not-an-email")).toThrow("invalid_email");
  });
});

describe("linkOrphanQuoteRequestsByEmail (unit — RPC contract)", () => {
  it("links exact lowercase email via RPC (not ILIKE)", async () => {
    const supabase = rpcClient(async () => ({
      data: { linked_count: 2, linked_ids: ["q1", "q2"] },
      error: null,
    }));

    const result = await linkOrphanQuoteRequestsByEmail(supabase, {
      email: "buyer@example.com",
      companyId: "company-123",
      userId: "user-1",
    });

    expect(supabase.schema).toHaveBeenCalledWith("catalogos");
    expect(supabase.__rpc).toHaveBeenCalledWith("gc_link_orphan_quote_requests_by_email", {
      p_email: "buyer@example.com",
      p_company_id: "company-123",
      p_user_id: "user-1",
    });
    expect(result).toEqual({ linked_count: 2, linked_ids: ["q1", "q2"] });
  });

  it("normalizes uppercase and whitespace before RPC", async () => {
    const supabase = rpcClient(async (args) => {
      expect(args.p_email).toBe("buyer@example.com");
      return { data: { linked_count: 1, linked_ids: ["q1"] }, error: null };
    });

    await linkOrphanQuoteRequestsByEmail(supabase, {
      email: "  BUYER@Example.COM  ",
      companyId: "c1",
    });
  });

  it("preserves plus-alias in normalized email (does not strip +tag)", async () => {
    const supabase = rpcClient(async (args) => {
      expect(args.p_email).toBe("buyer+pilot@example.com");
      return { data: { linked_count: 0, linked_ids: [] }, error: null };
    });

    await linkOrphanQuoteRequestsByEmail(supabase, {
      email: "Buyer+Pilot@Example.com",
      companyId: "c1",
      userId: "u1",
    });
  });

  it("throws on invalid email before RPC", async () => {
    const supabase = rpcClient(async () => ({ data: null, error: null }));
    await expect(
      linkOrphanQuoteRequestsByEmail(supabase, { email: "invalid", companyId: "c" }),
    ).rejects.toThrow("invalid_email");
    expect(supabase.__rpc).not.toHaveBeenCalled();
  });

  it("throws on RPC database error", async () => {
    const supabase = rpcClient(async () => ({
      data: null,
      error: { message: "db error", code: "XX000" },
    }));
    await expect(
      linkOrphanQuoteRequestsByEmail(supabase, { email: "a@b.co", companyId: "c" }),
    ).rejects.toEqual({ message: "db error", code: "XX000" });
  });

  it("surfaces membership_required from RPC", async () => {
    const supabase = rpcClient(async () => ({
      data: null,
      error: { message: "membership_required", code: "42501" },
    }));
    await expect(
      linkOrphanQuoteRequestsByEmail(supabase, {
        email: "a@b.co",
        companyId: "c",
        userId: "outsider",
      }),
    ).rejects.toMatchObject({ message: "membership_required" });
  });
});

describe("tryLinkOrphanQuoteRequestsByEmail", () => {
  it("returns warning instead of swallowing silently on failure", async () => {
    const supabase = rpcClient(async () => ({
      data: null,
      error: { message: "boom" },
    }));
    const result = await tryLinkOrphanQuoteRequestsByEmail(supabase, {
      email: "a@b.co",
      companyId: "c",
      userId: "u",
    });
    expect(result).toEqual({
      linked_count: 0,
      linked_ids: [],
      warning: "quote_link_failed",
    });
  });

  it("returns null warning on success", async () => {
    const supabase = rpcClient(async () => ({
      data: { linked_count: 3, linked_ids: ["a", "b", "c"] },
      error: null,
    }));
    const result = await tryLinkOrphanQuoteRequestsByEmail(supabase, {
      email: "a@b.co",
      companyId: "c",
      userId: "u",
    });
    expect(result.warning).toBeNull();
    expect(result.linked_count).toBe(3);
  });
});

describe("wildcard email safety (behavioral contract + SQL proof)", () => {
  it("underscore emails normalize distinctly from single-char substitution", () => {
    expect(normalizeBuyerEmail("buyer_one@example.com")).toBe("buyer_one@example.com");
    expect(normalizeBuyerEmail("buyerXone@example.com")).toBe("buyerxone@example.com");
    expect(normalizeBuyerEmail("buyer_one@example.com")).not.toBe(
      normalizeBuyerEmail("buyerXone@example.com"),
    );
  });

  it("percent-literal emails normalize without becoming wildcards at app layer", () => {
    // Product emails rarely contain %; if present, exact equality must not treat as LIKE.
    const a = "buyer%one@example.com";
    expect(normalizeBuyerEmail(a)).toBe("buyer%one@example.com");
    expect(normalizeBuyerEmail("buyerZone@example.com")).not.toBe(normalizeBuyerEmail(a));
  });

  it("migration RPC uses lower(trim(...)) equality and does not use ILIKE", () => {
    const sqlPath = join(
      process.cwd(),
      "..",
      "supabase",
      "migrations",
      "20261220120000_gc_commerce_company_invitations.sql",
    );
    const sql = readFileSync(sqlPath, "utf8");
    expect(sql).toContain("gc_link_orphan_quote_requests_by_email");
    expect(sql).toMatch(/lower\(trim\(both from qr\.email\)\)\s*=\s*v_email/i);
    expect(sql.toLowerCase()).not.toMatch(/\bilike\b/);
    expect(sql.toLowerCase()).not.toMatch(/(?<![a-z])like(?![a-z])/);
  });

  it("application linkage module source does not call .ilike on email", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/admin/admin-company-member-write.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\.ilike\(\s*["']email["']/);
    expect(src).toContain("gc_link_orphan_quote_requests_by_email");
  });
});

/**
 * Real Postgres proofs (staging /test):
 * - buyer_one@ vs buyerXone@ do not cross-link
 * - buyer%one@ exact only
 * - already-owned gc_company_id not reassigned
 * - membership_required without membership
 * - multiple orphans for exact email link together
 */
describe("quote linkage — requires real Postgres (staging)", () => {
  it.todo("buyer_one@example.com does not match buyerXone@example.com in DB");
  it.todo("already-owned quote is not reassigned to another company");
  it.todo("user without membership cannot link when p_user_id set");
  it.todo("multiple eligible anonymous quotes for exact email link together");
});
