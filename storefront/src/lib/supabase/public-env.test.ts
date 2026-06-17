import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSupabasePublicEnv } from "./public-env";

describe("resolveSupabasePublicEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats blank NEXT_PUBLIC values as missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "   ");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key-value");

    const result = resolveSupabasePublicEnv();
    expect(result.url).toBe("https://example.supabase.co");
    expect(result.anon).toBe("anon-key-value");
    expect(result.configured).toBe(true);
  });

  it("returns configured false when all candidates are blank", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");

    const result = resolveSupabasePublicEnv();
    expect(result.url).toBe("");
    expect(result.anon).toBe("");
    expect(result.configured).toBe(false);
  });

  it("prefers NEXT_PUBLIC values when non-blank", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://public.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-anon");
    vi.stubEnv("SUPABASE_URL", "https://server.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "server-anon");

    const result = resolveSupabasePublicEnv();
    expect(result.url).toBe("https://public.supabase.co");
    expect(result.anon).toBe("public-anon");
    expect(result.configured).toBe(true);
  });
});
