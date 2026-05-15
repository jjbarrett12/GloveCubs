import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin companies directory (Phase A)", () => {
  it("read model uses gc_commerce.companies without public.users", () => {
    const p = join(process.cwd(), "src/lib/admin/admin-companies-read-model.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain('schema("gc_commerce")');
    expect(s).toContain("companies");
    expect(s).toContain("company_members");
    expect(s).toContain("company_quicklist_items");
    expect(s).not.toContain('from("users")');
    expect(s).not.toContain("public.users");
    expect(s).not.toContain("procurement_reorder_memory");
    expect(s).not.toContain("saved_lists");
    expect(s).not.toContain("product_favorites");
    expect(s).not.toContain("stripe");
    expect(s).not.toContain("card");
  });

  it("list UI has Add Customer, search, and customer account workspace", () => {
    const client = join(process.cwd(), "src/app/admin/companies/CompaniesDirectoryClient.tsx");
    const card = join(process.cwd(), "src/components/admin/CustomerAccountCard.tsx");
    const s = readFileSync(client, "utf8");
    const k = readFileSync(card, "utf8");
    expect(s).toContain("+ Add Customer");
    expect(k).toContain("Preferred products");
    expect(s).toContain("CustomerAccountCard");
    expect(s).not.toContain("CompanyB2bTierSelect");
  });
});
