import { describe, expect, it } from "vitest";
import {
  buildInvoiceIdempotencyScope,
  invoiceIdempotencyScopeMatches,
} from "@/lib/invoice/idempotency-scope";

describe("invoice idempotency scope", () => {
  it("prefers company scope over user and anon", () => {
    expect(
      buildInvoiceIdempotencyScope(
        {
          company_id: "co-a",
          user_id: "user-a",
          anonymous_session_id: "anon-a",
        },
        "ephem-1",
      ),
    ).toBe("company:co-a");
  });

  it("uses user scope when company missing", () => {
    expect(
      buildInvoiceIdempotencyScope(
        { company_id: null, user_id: "user-b", anonymous_session_id: "anon-b" },
        "ephem-2",
      ),
    ).toBe("user:user-b");
  });

  it("uses anonymous session when unauthenticated", () => {
    expect(
      buildInvoiceIdempotencyScope(
        { company_id: null, user_id: null, anonymous_session_id: "sess-123" },
        "ephem-3",
      ),
    ).toBe("anon:sess-123");
  });

  it("uses ephemeral scope when no stable identity (cannot replay across callers)", () => {
    expect(
      buildInvoiceIdempotencyScope(
        { company_id: null, user_id: null, anonymous_session_id: null },
        "ephem-unique",
      ),
    ).toBe("ephemeral:ephem-unique");
  });

  it("rejects cross-tenant scope matches", () => {
    expect(invoiceIdempotencyScopeMatches("company:a", "company:b")).toBe(false);
    expect(invoiceIdempotencyScopeMatches("company:a", "company:a")).toBe(true);
    expect(invoiceIdempotencyScopeMatches(null, "company:a")).toBe(false);
    expect(invoiceIdempotencyScopeMatches("user:x", "anon:x")).toBe(false);
  });

  it("proves same key under different tenants cannot share scope", () => {
    const key = "client-shared-key";
    const scopeA = buildInvoiceIdempotencyScope(
      { company_id: "tenant-a", user_id: null, anonymous_session_id: null },
      "e1",
    );
    const scopeB = buildInvoiceIdempotencyScope(
      { company_id: "tenant-b", user_id: null, anonymous_session_id: null },
      "e2",
    );
    expect(scopeA).toBe("company:tenant-a");
    expect(scopeB).toBe("company:tenant-b");
    expect(invoiceIdempotencyScopeMatches(scopeA, scopeB)).toBe(false);
    // Lookup keys are composite (scope + key); identical client keys remain isolated.
    expect(`${scopeA}|${key}`).not.toBe(`${scopeB}|${key}`);
  });
});
