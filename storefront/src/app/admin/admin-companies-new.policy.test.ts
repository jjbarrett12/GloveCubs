import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin add customer onboarding (UI-only)", () => {
  it("new page uses checklist and customer account language", () => {
    const p = join(process.cwd(), "src/app/admin/companies/new/page.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("SetupChecklist");
    expect(s).toContain("Customer accounts");
    expect(s).not.toContain("gc_commerce");
    expect(s).not.toContain("canonical");
  });

  it("create form posts only supported fields and uses honest placeholders", () => {
    const p = join(process.cwd(), "src/app/admin/companies/CompanyCreateForm.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("trade_name");
    expect(s).toContain("legal_name");
    expect(s).toContain("country_code");
    expect(s).toContain("b2b_pricing_tier_code");
    expect(s).toContain("/admin/api/companies");
    expect(s).toContain("?tab=delivery");
    expect(s).toContain("Online payment setup and billing workflows are not enabled yet");
    expect(s).toContain("Invite buyers and manage roles in a future phase");
    expect(s).not.toContain('type="password"');
    expect(s).not.toContain("public.users");
    expect(s).not.toContain("creditCard");
    expect(s).not.toContain("card_number");
  });
});
