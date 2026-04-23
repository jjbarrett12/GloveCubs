/**
 * Unit tests: RPC wrapper, retry loop, queue processor (mocked Supabase).
 */
import { describe, it, expect, vi } from "vitest";
import {
  invokeSyncCanonicalProducts,
  syncCanonicalProductsWithRetry,
  processCanonicalSyncRetryQueue,
} from "./canonical-sync-service";

describe("invokeSyncCanonicalProducts", () => {
  it("returns ok false when RPC returns error", async () => {
    const catalogos = { rpc: vi.fn().mockResolvedValue({ error: { message: "rpc failed" } }) };
    const r = await invokeSyncCanonicalProducts(catalogos as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("rpc failed");
  });

  it("returns ok true when RPC has no error", async () => {
    const catalogos = { rpc: vi.fn().mockResolvedValue({ error: null }) };
    const r = await invokeSyncCanonicalProducts(catalogos as never);
    expect(r.ok).toBe(true);
  });
});

describe("syncCanonicalProductsWithRetry", () => {
  it("succeeds on first successful RPC", async () => {
    const catalogos = { rpc: vi.fn().mockResolvedValue({ error: null }) };
    const r = await syncCanonicalProductsWithRetry(catalogos as never, {
      attempts: 3,
      delaysMs: [1, 1, 1],
    });
    expect(r.ok).toBe(true);
    expect(catalogos.rpc).toHaveBeenCalledTimes(1);
  });

  it("retries until attempts exhausted", async () => {
    const catalogos = { rpc: vi.fn().mockResolvedValue({ error: { message: "bad" } }) };
    const r = await syncCanonicalProductsWithRetry(catalogos as never, {
      attempts: 3,
      delaysMs: [1, 1, 1],
    });
    expect(r.ok).toBe(false);
    expect(catalogos.rpc).toHaveBeenCalledTimes(3);
  });
});
