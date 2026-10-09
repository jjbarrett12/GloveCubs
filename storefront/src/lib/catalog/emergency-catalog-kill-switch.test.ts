import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdmin = vi.fn(() => {
  throw new Error("getSupabaseAdmin must not run under emergency catalog kill switch");
});
const isSupabaseConfigured = vi.fn(() => true);

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: <T extends (...args: never[]) => unknown>(fn: T) => fn };
});

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfigured: () => isSupabaseConfigured(),
  getSupabaseAdmin: () => getSupabaseAdmin(),
}));

import { isCatalogSupabaseEmergencyDisabled, isPublicAiEmergencyDisabled } from "@/lib/catalog/emergency-catalog-kill-switch";
import { fetchStoreCatalogPage } from "@/lib/catalog/store-products";
import { fetchStoreProductDetail } from "@/lib/catalog/store-product-detail";
import { fetchCompareWizardProducts } from "@/lib/catalog/compare-wizard-products";
import { fetchEducationHubCatalogCandidates } from "@/lib/education-hub/fetch-education-hub-candidates";
import {
  fetchStoreProductCommercialAttrsByProductIds,
  fetchStoreProductRowsByIds,
} from "@/lib/catalog/store-products";

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

  it("helper is true only for exact string 1", () => {
    expect(isCatalogSupabaseEmergencyDisabled()).toBe(false);
    vi.stubEnv("GC_EMERGENCY_DISABLE_CATALOG_SUPABASE", "1");
    expect(isCatalogSupabaseEmergencyDisabled()).toBe(true);
    vi.stubEnv("GC_EMERGENCY_DISABLE_CATALOG_SUPABASE", "true");
    expect(isCatalogSupabaseEmergencyDisabled()).toBe(false);
  });

  it("public AI emergency helper is true only for exact string 1", () => {
    expect(isPublicAiEmergencyDisabled()).toBe(false);
    vi.stubEnv("GC_EMERGENCY_DISABLE_PUBLIC_AI", "1");
    expect(isPublicAiEmergencyDisabled()).toBe(true);
    vi.stubEnv("GC_EMERGENCY_DISABLE_PUBLIC_AI", "true");
    expect(isPublicAiEmergencyDisabled()).toBe(false);
  });

  it("fetchStoreCatalogPage returns catalogUnavailable before any Supabase client when flag is 1", async () => {
    vi.stubEnv("GC_EMERGENCY_DISABLE_CATALOG_SUPABASE", "1");

    const result = await fetchStoreCatalogPage({ page: 2 });

    expect(getSupabaseAdmin).not.toHaveBeenCalled();
    expect(result.catalogUnavailable).toBe(true);
    expect(result.products).toEqual([]);
  });

  it("fetchEducationHubCatalogCandidates returns empty unavailable before any Supabase client when flag is 1", async () => {
    vi.stubEnv("GC_EMERGENCY_DISABLE_CATALOG_SUPABASE", "1");

    const result = await fetchEducationHubCatalogCandidates();

    expect(getSupabaseAdmin).not.toHaveBeenCalled();
    expect(result).toEqual({ candidates: [], catalogUnavailable: true });
  });

  it("product detail / compare / by-id hydrations do not call Supabase when flag is 1", async () => {
    vi.stubEnv("GC_EMERGENCY_DISABLE_CATALOG_SUPABASE", "1");

    await expect(fetchStoreProductDetail("any-slug")).resolves.toBeNull();
    await expect(fetchCompareWizardProducts()).resolves.toEqual({ rows: [], catalogUnavailable: true });
    await expect(fetchStoreProductRowsByIds(["00000000-0000-4000-8000-000000000001"])).resolves.toEqual([]);
    await expect(
      fetchStoreProductCommercialAttrsByProductIds(["00000000-0000-4000-8000-000000000001"]),
    ).resolves.toEqual(new Map());

    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("flag absent preserves existing configured=false short-circuit for store catalog", async () => {
    isSupabaseConfigured.mockReturnValue(false);

    const result = await fetchStoreCatalogPage({});

    expect(getSupabaseAdmin).not.toHaveBeenCalled();
    expect(result.catalogUnavailable).toBe(true);
    expect(result.products).toEqual([]);
    expect(result.error).toBeNull();
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
