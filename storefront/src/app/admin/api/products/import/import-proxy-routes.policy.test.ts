import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES = [
  "url/route.ts",
  "url/jobs/route.ts",
  "url/jobs/[jobId]/route.ts",
  "url/jobs/[jobId]/bridge/route.ts",
  "status/route.ts",
];

describe("admin product import proxy routes", () => {
  it.each(ROUTES)("%s gates on getAdminUser and returns 401", (rel) => {
    const p = join(__dirname, rel);
    const s = readFileSync(p, "utf8");
    expect(s).toContain("getAdminUser");
    expect(s).toContain("401");
  });

  it.each(ROUTES.filter((r) => r !== "status/route.ts"))(
    "%s never imports getSupabaseAdmin or touches catalog_v2/catalogos",
    (rel) => {
      const p = join(__dirname, rel);
      const s = readFileSync(p, "utf8");
      expect(s).not.toContain("getSupabaseAdmin");
      expect(s).not.toMatch(/catalog_v2/);
      expect(s).not.toMatch(/from\(["']catalogos[._]/);
    }
  );

  it("POST /url validates start_url and crawl mode and forwards to CatalogOS", () => {
    const p = join(__dirname, "url/route.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("validateHttpUrl");
    expect(s).toContain('"/api/admin/url-import"');
    expect(s).toContain("catalogosInternalRequest");
    expect(s).toContain("single_product");
  });

  it("bridge route rejects empty product_ids and forwards selected ids only", () => {
    const p = join(__dirname, "url/jobs/[jobId]/bridge/route.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("Select at least one extracted product");
    expect(s).toContain("product_ids");
    expect(s).toContain("/bridge");
  });

  it("import proxy code does not use the legacy productExtraction or urlFetch helpers", () => {
    function walk(dir: string): string[] {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) out.push(...walk(full));
        else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
      }
      return out;
    }
    const files = walk(__dirname);
    for (const f of files) {
      if (f.endsWith(".test.ts")) continue;
      const s = readFileSync(f, "utf8");
      expect(s).not.toMatch(/\bproductExtraction\b/);
      expect(s).not.toMatch(/\burlFetch\b/);
    }
  });
});
