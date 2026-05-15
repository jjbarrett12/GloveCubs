import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Phase 1b portal read models (no fake commerce)", () => {
  it("buyer account snapshot scopes quote queries to gc_company_id", () => {
    const p = join(__dirname, "buyer-account-snapshot.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain('.eq("gc_company_id", companyId)');
    expect(s).toContain(".eq(\"company_id\", companyId)");
  });

  it("admin home snapshot type does not advertise revenue or margin fields", () => {
    const p = join(__dirname, "../admin/admin-home-snapshot.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("canonicalOrdersCount");
    expect(s.toLowerCase()).not.toContain("revenue");
    expect(s.toLowerCase()).not.toContain("margin");
  });

  it("buyer account page copy stays honest about checkout and points to order records", () => {
    const p = join(__dirname, "../../app/account/page.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("not enabled");
    expect(s).toContain("/account/orders");
    expect(s).not.toMatch(/fake/i);
  });
});
