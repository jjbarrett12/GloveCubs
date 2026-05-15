import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("POST /admin/api/companies", () => {
  it("requires admin and inserts into gc_commerce.companies with defaults", () => {
    const p = join(__dirname, "route.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("getAdminUser");
    expect(s).toContain("401");
    expect(s).toContain("createCompany");
    expect(s).toContain("b2b_pricing_tier_code");
    expect(s).not.toContain('from("users")');
    expect(s).not.toContain("public.users");
    expect(s).not.toContain("contact_email");
    expect(s).not.toContain("billing");
    expect(s).not.toContain("stripe");
    expect(s).not.toContain("card");
    expect(s).not.toContain("quicklist");
    expect(s).not.toContain("procurement_reorder_memory");
  });

  it("write helper defaults cub and active status", () => {
    const p = join(process.cwd(), "src/lib/admin/admin-company-write.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain('"cub"');
    expect(s).toContain('"active"');
    expect(s).toContain("ensureUniqueCompanySlug");
    expect(s).not.toContain('from("users")');
  });
});
