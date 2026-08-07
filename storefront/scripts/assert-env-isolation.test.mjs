import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

describe("assert-env-isolation (unit)", () => {
  it("fails when staging points at production Supabase ref", async () => {
    const mod = await import(
      pathToFileURL(path.resolve(process.cwd(), "scripts/assert-env-isolation.mjs")).href
    );
    const result = mod.assertEnvIsolation({
      GC_EXPECTED_ENV: "staging",
      NEXT_PUBLIC_SITE_URL: "https://glovecubs-staging.vercel.app",
      NEXT_PUBLIC_SUPABASE_URL: "https://mnmagwsenzvetwngaszv.supabase.co",
      FEATURE_GC_ORDER_HISTORY: "0",
      FEATURE_GC_REORDER_TO_QUOTE: "0",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("production_ref"))).toBe(true);
  });

  it("passes for staging ref with order flags off", async () => {
    const mod = await import(
      pathToFileURL(path.resolve(process.cwd(), "scripts/assert-env-isolation.mjs")).href
    );
    const result = mod.assertEnvIsolation({
      GC_EXPECTED_ENV: "staging",
      NEXT_PUBLIC_SITE_URL: "https://glovecubs-staging.vercel.app",
      NEXT_PUBLIC_SUPABASE_URL: "https://fmrupehxifzkpfphiyvm.supabase.co",
      FEATURE_GC_ORDER_HISTORY: "0",
      FEATURE_GC_REORDER_TO_QUOTE: "0",
    });
    expect(result.ok).toBe(true);
    expect(result.supabaseRef).toBe("fmrupehxifzkpfphiyvm");
  });
});
