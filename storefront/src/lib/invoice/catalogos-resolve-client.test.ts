import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const resolveModule = () => import("@/lib/invoice/catalogos-resolve-client");

describe("resolveInvoiceLinesViaCatalogos", () => {
  const fetchMock = vi.fn();
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
    fetchMock.mockReset();
  });

  it("does not call CatalogOS in production when INTERNAL_API_KEY is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CATALOGOS_INTERNAL_URL", "https://catalogos.example.com");
    vi.stubEnv("INTERNAL_API_KEY", "");
    const { resolveInvoiceLinesViaCatalogos } = await resolveModule();
    const r = await resolveInvoiceLinesViaCatalogos(
      { lines: [{ line_id: "l1", row: { sku: "x" } }] },
      { opportunityId: "o1", uploadedInvoiceId: "u1" }
    );
    expect(r).toMatchObject({ ok: false, skipped: true });
    expect("reason" in r && r.reason).toContain("INTERNAL_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call CatalogOS in production when INTERNAL_API_KEY is the default dev key", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CATALOGOS_INTERNAL_URL", "https://catalogos.example.com");
    vi.stubEnv("INTERNAL_API_KEY", "dev-internal-key");
    const { resolveInvoiceLinesViaCatalogos } = await resolveModule();
    const r = await resolveInvoiceLinesViaCatalogos({ lines: [{ line_id: "l1", row: {} }] });
    expect(r).toMatchObject({ ok: false, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns results on successful HTTP JSON", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CATALOGOS_INTERNAL_URL", "https://catalogos.example.com");
    vi.stubEnv("INTERNAL_API_KEY", "real-key");
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            line_id: "l1",
            matched: false,
            catalog_product_id: null,
            match_confidence: 0,
            match_reason: "no_match",
            category_slug: "x",
            normalized_snapshot: {},
          },
        ],
      }),
    });
    const { resolveInvoiceLinesViaCatalogos } = await resolveModule();
    const r = await resolveInvoiceLinesViaCatalogos({ lines: [{ line_id: "l1", row: { a: 1 } }] });
    expect(r).toEqual({
      ok: true,
      results: [
        expect.objectContaining({
          line_id: "l1",
          match_reason: "no_match",
        }),
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries once on 503 then succeeds", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CATALOGOS_INTERNAL_URL", "https://catalogos.example.com");
    vi.stubEnv("INTERNAL_API_KEY", "real-key");
    const okJson = {
      results: [
        {
          line_id: "l1",
          matched: false,
          catalog_product_id: null,
          match_confidence: 0,
          match_reason: "no_match",
          category_slug: "x",
          normalized_snapshot: {},
        },
      ],
    };
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "unavailable" })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => okJson,
      });
    const { resolveInvoiceLinesViaCatalogos } = await resolveModule();
    const promise = resolveInvoiceLinesViaCatalogos({ lines: [{ line_id: "l1", row: {} }] });
    await vi.runAllTimersAsync();
    const r = await promise;
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
