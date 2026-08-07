import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "src");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("quote cart contact prefill policy", () => {
  it("quote cart fetches account prefill and shows edit hint for signed-in buyers", () => {
    const page = read("app/quote-cart/page.tsx");
    expect(page).toContain("/api/account/quote-contact-prefill");
    expect(page).toContain("applyQuoteContactPrefillToFields");
    expect(page).toContain("We pre-filled this from your account. You can edit it before submitting.");
    expect(page).not.toMatch(/gc_company_id|company_id:\s*prefill/i);
  });

  it("prefill API resolves contact from procurement gate and company row", () => {
    const route = read("app/api/account/quote-contact-prefill/route.ts");
    const resolver = read("lib/quote-cart/resolve-quote-contact-prefill.ts");
    expect(route).toContain("resolveQuoteContactPrefill");
    expect(resolver).toContain("resolveCustomerProcurementGate");
    expect(resolver).toContain("assertCustomerCompanyAccess");
    expect(resolver).toContain('.from("companies")');
    expect(resolver).toContain("trade_name");
    expect(resolver).not.toContain("SUPABASE_SERVICE_ROLE");
    expect(resolver).not.toMatch(/body\.company_id|gc_company_id.*request/i);
  });

  it("quote-request route still links gc_company_id from server gate only", () => {
    const route = read("app/api/quote-request/route.ts");
    expect(route).toContain("resolveCustomerProcurementGate");
    expect(route).not.toMatch(/parsed\.data\.gc_company_id|body\.gc_company_id/i);
    expect(route).not.toContain("createBrowserClient");
  });

  it("anonymous prefill API returns null prefill without secrets", () => {
    const route = read("app/api/account/quote-contact-prefill/route.ts");
    expect(route).toContain("{ prefill: null }");
    expect(route).not.toContain("service_role");
  });
});
