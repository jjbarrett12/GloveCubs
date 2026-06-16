/**
 * Unit tests: deprecated sync path (no RPC).
 */
import { describe, it, expect, vi } from "vitest";
import { invokeSyncCanonicalProducts, syncCanonicalProductsWithRetry } from "./canonical-sync-service";

describe("invokeSyncCanonicalProducts", () => {
  it("does not call sync_canonical_products RPC (deprecated)", async () => {
    const catalogos = { rpc: vi.fn() };
    const r = await invokeSyncCanonicalProducts(catalogos as never);
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(true);
    expect(r.reason).toContain("20261111120400");
    expect(catalogos.rpc).not.toHaveBeenCalled();
  });
});

describe("syncCanonicalProductsWithRetry", () => {
  it("returns skipped without RPC or retries", async () => {
    const catalogos = { rpc: vi.fn() };
    const r = await syncCanonicalProductsWithRetry(catalogos as never, {
      attempts: 3,
      delaysMs: [1, 1, 1],
    });
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(true);
    expect(catalogos.rpc).not.toHaveBeenCalled();
  });
});
