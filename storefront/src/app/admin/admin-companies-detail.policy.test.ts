import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin company detail page (Phase C + D2 quicklist + ship-to)", () => {
  it("includes profile, pricing, members, quotes, orders, quicklist manager, ship-to manager, payment placeholder", () => {
    const p = join(process.cwd(), "src/app/admin/companies/[companyId]/page.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("CompanyProfileForm");
    expect(s).toContain("CompanyB2bTierSelect");
    expect(s).toContain("CompanyQuicklistManager");
    expect(s).toContain("CompanyShipToAddressesManager");
    expect(s).toContain("fetchCompanyQuicklistItems");
    expect(s).toContain("fetchAdminShipToAddresses");
    expect(s).toContain("Member contact from auth identity");
    expect(s).toContain("Quote activity");
    expect(s).toContain("Order activity");
    expect(s).toContain("View order records");
    expect(s).toContain("order records");
    expect(s).toContain("Pricing is resolved server-side");
    expect(s).toContain("Payment method setup is not enabled yet");
    expect(s).toContain("not revenue or margin reporting");
    expect(s).not.toContain("profit");
    expect(s).not.toContain("checkout");
    expect(s).not.toContain("procurement_reorder_memory");
    expect(s).not.toContain("saved_lists");
    expect(s).not.toContain("dedicated quicklist data model approved in Phase D");
  });
});
