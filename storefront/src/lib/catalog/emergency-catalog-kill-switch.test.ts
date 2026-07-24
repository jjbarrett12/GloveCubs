import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdmin = vi.fn(() => {
  throw new Error("getSupabaseAdmin must not run under emergency catalog kill switch");
});
const isSupabaseConfigured = vi.fn(() => true);

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfigured: () => isSupabaseConfigured(),
  getSupabaseAdmin: () => getSupabaseAdmin(),
}));

import { fetchStoreCatalogPage } from "@/lib/catalog/store-products";
import { fetchEducationHubCatalogCandidates } from "@/lib/education-hub/fetch-education-hub-candidates";

describe("GC_EMERGENCY_DISABLE_CATALOG_SUPABASE", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    getSupabaseAdmin.mockClear();
    isSupabaseConfigured.mockReset();
    isSupabaseConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fetchStoreCatalogPage returns catalogUnavailable before any Supabase client when flag is 1", async () => {
    vi.stubEnv("GC_EMERGENCY_DISABLE_CATALOG_SUPABASE", "1");

    const result = await fetchStoreCatalogPage({ page: 2 });

    expect(getSupabaseAdmin).not.toHaveBeenCalled();
    expect(result).toEqual({
      products: [],
      total: 0,
      page: 2,
      limit: result.limit,
      brands: [],
      facetCounts: {},
      facetMeta: {},
      error: null,
      catalogUnavailable: true,
    });
    expect(result.limit).toBeGreaterThan(0);
    expect(Array.isArray(result.products)).toBe(true);
  });

  it("fetchEducationHubCatalogCandidates returns empty unavailable before any Supabase client when flag is 1", async () => {
    vi.stubEnv("GC_EMERGENCY_DISABLE_CATALOG_SUPABASE", "1");

    const result = await fetchEducationHubCatalogCandidates();

    expect(getSupabaseAdmin).not.toHaveBeenCalled();
    expect(result).toEqual({ candidates: [], catalogUnavailable: true });
  });

  it("flag absent preserves existing configured=false short-circuit for store catalog", async () => {
    isSupabaseConfigured.mockReturnValue(false);

    const result = await fetchStoreCatalogPage({});

    expect(getSupabaseAdmin).not.toHaveBeenCalled();
    expect(result.catalogUnavailable).toBe(true);
    expect(result.products).toEqual([]);
    expect(result.error).toBeNull();
  });

  it("flag absent preserves existing configured=false short-circuit for education hub", async () => {
    isSupabaseConfigured.mockReturnValue(false);

    const result = await fetchEducationHubCatalogCandidates();

    expect(getSupabaseAdmin).not.toHaveBeenCalled();
    expect(result).toEqual({ candidates: [], catalogUnavailable: true });
  });

  it("flag absent still reaches Supabase admin client when configured", async () => {
    isSupabaseConfigured.mockReturnValue(true);
    getSupabaseAdmin.mockImplementation(() => {
      throw new Error("probe-reached-admin-client");
    });

    await expect(fetchStoreCatalogPage({})).rejects.toThrow("probe-reached-admin-client");
    expect(getSupabaseAdmin).toHaveBeenCalled();
  });

  it("flag absent still reaches Supabase admin client for education hub when configured", async () => {
    isSupabaseConfigured.mockReturnValue(true);
    getSupabaseAdmin.mockImplementation(() => {
      throw new Error("probe-reached-admin-client");
    });

    await expect(fetchEducationHubCatalogCandidates()).rejects.toThrow("probe-reached-admin-client");
    expect(getSupabaseAdmin).toHaveBeenCalled();
  });
});
