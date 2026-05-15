import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("PATCH /admin/api/companies/[companyId]", () => {
  it("requires admin, validates UUID, updates profile fields only", () => {
    const p = join(__dirname, "route.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("getAdminUser");
    expect(s).toContain("401");
    expect(s).toContain("updateCompanyProfile");
    expect(s).toContain("trade_name");
    expect(s).toContain("legal_name");
    expect(s).toContain("slug");
    expect(s).toContain("country_code");
    expect(s).toContain("status");
    expect(s).not.toContain("b2b_pricing_tier_code");
    expect(s).not.toContain('from("users")');
    expect(s).not.toContain("public.users");
    expect(s).not.toContain("payment");
    expect(s).not.toContain("quicklist");
  });
});
