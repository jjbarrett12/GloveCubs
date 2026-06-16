import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn(() => ({ from: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}));

describe("getSupabaseCatalogos schema routing", () => {
  beforeEach(() => {
    createClient.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("targets catalogos.url_import_jobs via db.schema, not public", async () => {
    const { getSupabaseCatalogos } = await import("./client");
    getSupabaseCatalogos(true);

    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-role-key",
      expect.objectContaining({
        db: { schema: "catalogos" },
      })
    );
    expect(createClient.mock.calls[0]?.[2]).not.toHaveProperty("global.headers.Accept-Profile");
  });
});
