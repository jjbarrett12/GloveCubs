import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("account quicklist route (Phase D3)", () => {
  it("page uses buyer gate and server read model; no browser supabase", () => {
    const p = join(process.cwd(), "src/app/account/quicklist/page.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("resolveCustomerProcurementGate");
    expect(s).toContain("assertCustomerCompanyAccess");
    expect(s).toContain("fetchBuyerQuicklistForCompany");
    expect(s).toContain("getSupabaseAdmin");
    expect(s).not.toContain("createBrowserClient");
    expect(s).not.toContain("createClient(");
    expect(s).not.toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(s).not.toContain("buy now");
    expect(s).not.toContain("checkout");
    expect(s).not.toContain("place order");
    expect(s).toContain("Quote request cart");
  });

  it("client uses quote cart only for cart writes", () => {
    const p = join(process.cwd(), "src/app/account/quicklist/BuyerQuicklistClient.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("useQuoteCart");
    expect(s).toContain("addItem");
    expect(s).toContain("buyerQuicklistRowToQuoteCartLine");
    expect(s).not.toContain("createBrowserClient");
    expect(s).not.toContain("supabase");
    expect(s).not.toContain("pay");
    expect(s).not.toContain("checkout");
    expect(s).toContain("No quicklist items yet");
    expect(s).toContain("Add selected to quote request cart");
    expect(s).toContain("Pricing and availability are confirmed when your quote is reviewed");
  });

  it("account home links to quicklist", () => {
    const p = join(process.cwd(), "src/app/account/page.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("/account/quicklist");
    expect(s).toContain("Glove quicklist");
  });
});
