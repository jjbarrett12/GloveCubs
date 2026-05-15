import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FORBIDDEN = ["canonical", "gc_commerce", "tenant", "gc_company_id"];

describe("admin companies directory UI copy (premium workspace)", () => {
  it("list page and directory client avoid internal schema jargon in user-facing copy", () => {
    const page = join(process.cwd(), "src/app/admin/companies/page.tsx");
    const client = join(process.cwd(), "src/app/admin/companies/CompaniesDirectoryClient.tsx");
    const card = join(process.cwd(), "src/components/admin/CustomerAccountCard.tsx");
    const p = readFileSync(page, "utf8");
    const c = readFileSync(client, "utf8");
    const k = readFileSync(card, "utf8");
    for (const bad of FORBIDDEN) {
      expect(p, `page should not mention ${bad}`).not.toContain(bad);
      expect(c, `client should not mention ${bad}`).not.toContain(bad);
      expect(k, `card should not mention ${bad}`).not.toContain(bad);
    }
    expect(p).toContain("Customer accounts");
    expect(c).toContain("+ Add Customer");
    expect(c).toContain("CustomerAccountCard");
    expect(k).toContain("Preferred products");
    expect(c).toContain("No customer accounts yet");
    expect(c).toContain("No customers match your search");
  });
});
