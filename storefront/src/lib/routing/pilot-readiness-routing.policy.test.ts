import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const storefrontRoot = join(__dirname, "../../..");

function readStorefront(relativePath: string): string {
  return readFileSync(join(storefrontRoot, relativePath), "utf8");
}

describe("pilot readiness routing (Fix 1)", () => {
  it("does not reference broken /account/quicklists in public storefront sources", () => {
    const industry = readStorefront("src/components/industry/IndustryLandingTemplate.tsx");
    expect(industry).not.toContain("/account/quicklists");
    expect(industry).toContain("/account/quicklist");
  });

  it("redirects /portal-order/* to order-status, not homepage", () => {
    const cfg = readFileSync(join(storefrontRoot, "next.config.mjs"), "utf8");
    expect(cfg).toContain("/order-status?source=legacy-order-link");
    expect(cfg).not.toMatch(/portal-order\/:path\*',\s*destination:\s*'\/'/);
  });

  it("order-status page offers procurement fallbacks", () => {
    const page = readStorefront("src/app/order-status/page.tsx");
    expect(page).toContain("/request-pricing");
    expect(page).toContain("/quote-cart");
    expect(page).toContain("/account");
    expect(page).toContain("/login");
  });

  it("industry landings avoid checkout/payment trust copy and keep valid CTAs", () => {
    const industry = readStorefront("src/components/industry/IndustryLandingTemplate.tsx");
    expect(industry).not.toContain("Invoice-friendly checkout");
    expect(industry).not.toContain("Get set up for B2B ordering in 2 minutes");
    expect(industry).toContain("/request-pricing");
    expect(industry).toContain("/invoice-savings");
    expect(industry).toContain("/account/quicklist");
  });

  it("footer uses procurement trust signals instead of card brands", () => {
    const footer = readStorefront("src/components/home/SiteFooter.tsx");
    expect(footer).not.toContain("Visa");
    expect(footer).not.toContain("PayPal");
    expect(footer).toContain("FOOTER_PROCUREMENT_TRUST_SIGNALS");
    expect(footer).toContain("Business procurement support");
  });
});
