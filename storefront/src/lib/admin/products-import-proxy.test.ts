import { describe, expect, it } from "vitest";
import { nonEmptyString, toCatalogosErrorResponse, validateHttpUrl } from "@/lib/admin/products-import-proxy";

describe("products-import-proxy validators", () => {
  it("validateHttpUrl accepts http/https only", () => {
    expect(validateHttpUrl("https://example.com/x").ok).toBe(true);
    expect(validateHttpUrl("http://example.com/x").ok).toBe(true);
    expect(validateHttpUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateHttpUrl("ftp://example.com").ok).toBe(false);
    expect(validateHttpUrl("not a url").ok).toBe(false);
    expect(validateHttpUrl(null).ok).toBe(false);
  });

  it("nonEmptyString trims and enforces length", () => {
    expect(nonEmptyString("  hi ").ok).toBe(true);
    expect(nonEmptyString("").ok).toBe(false);
    expect(nonEmptyString("   ").ok).toBe(false);
    expect(nonEmptyString("x".repeat(201)).ok).toBe(false);
  });

  it("toCatalogosErrorResponse maps client error kinds to HTTP statuses", () => {
    const cases: Array<{
      kind: "config" | "auth" | "http" | "network" | "parse";
      status?: number;
      expected: number;
    }> = [
      { kind: "config", expected: 503 },
      { kind: "auth", expected: 503 },
      { kind: "network", expected: 502 },
      { kind: "network", status: 408, expected: 504 },
      { kind: "http", status: 404, expected: 404 },
      { kind: "parse", expected: 502 },
    ];
    for (const c of cases) {
      const res = toCatalogosErrorResponse({
        ok: false,
        error: { kind: c.kind, message: c.kind, status: c.status },
      });
      expect(res.status).toBe(c.expected);
    }
  });
});
