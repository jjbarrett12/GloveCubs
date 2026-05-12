import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("GET /admin/api/products/import/status", () => {
  it("requires admin and returns non-secret JSON shape", () => {
    const p = join(__dirname, "status/route.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("getAdminUser");
    expect(s).toContain("401");
    expect(s).toContain("computeProductsImportConnectionStatus");
    expect(s).toContain("catalogos_url_configured");
    expect(s).toContain("production_key_safe");
    expect(s).not.toMatch(/INTERNAL_API_KEY/);
  });
});

describe("import foundation has no canonical catalog writes", () => {
  it("status route does not import supabase admin for mutations", () => {
    const p = join(__dirname, "status/route.ts");
    const s = readFileSync(p, "utf8");
    expect(s).not.toContain("getSupabaseAdmin");
    expect(s).not.toContain("catalog_v2");
  });
});
