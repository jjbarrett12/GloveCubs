import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolvePostLoginRedirectPath } from "@/lib/auth/post-login-path";
import { buyerQuoteStatusLabel } from "@/lib/procurement/buyer-lifecycle-copy";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("buyer portal coherence (Slice 1C)", () => {
  it("defaults linked buyers to quote history when no explicit next", () => {
    expect(
      resolvePostLoginRedirectPath({
        hasExplicitNext: false,
        safeNextPath: "/account",
        isActiveAdmin: false,
        buyerDefaultPath: "/account/quotes",
      }),
    ).toBe("/account/quotes");
  });

  it("keeps onboarding buyers on account when company is not linked", () => {
    expect(
      resolvePostLoginRedirectPath({
        hasExplicitNext: false,
        safeNextPath: "/account",
        isActiveAdmin: false,
        buyerDefaultPath: "/account",
      }),
    ).toBe("/account");
  });

  it("preserves explicit deep links for buyers", () => {
    expect(
      resolvePostLoginRedirectPath({
        hasExplicitNext: true,
        safeNextPath: "/quote-cart",
        isActiveAdmin: false,
        buyerDefaultPath: "/account/quotes",
      }),
    ).toBe("/quote-cart");
  });

  it("maps quote statuses to buyer-safe labels", () => {
    expect(buyerQuoteStatusLabel("new")).toBe("Received");
    expect(buyerQuoteStatusLabel("quoted")).toBe("Formal pricing shared");
    expect(buyerQuoteStatusLabel("unknown_internal")).toBe("In progress");
  });

  it("quote detail route uses company-scoped read model and buyer status labels", () => {
    const page = read("app/account/quotes/[quoteId]/page.tsx");
    const model = read("lib/account/buyer-account-snapshot.ts");
    expect(page).toContain("fetchBuyerQuoteDetail");
    expect(page).toContain("buyerQuoteStatusLabel");
    expect(model).toContain('.eq("gc_company_id", companyId)');
    expect(model).not.toMatch(/\btotal_minor\b|\bsubtotal\b/i);
  });

  it("post-login destination API resolves buyer default path", () => {
    const route = read("app/api/auth/post-login-destination/route.ts");
    expect(route).toContain("buyer_default_path");
    expect(route).toContain('"/account/quotes"');
    expect(route).toContain("resolveCustomerProcurementGate");
  });

  it("account and workspace surfaces avoid one-click reorder language", () => {
    const paths = [
      "app/account/page.tsx",
      "app/account/quotes/page.tsx",
      "app/workspace/procurement/reorder/page.tsx",
      "app/workspace/procurement/CustomerProcurementClient.tsx",
    ];
    for (const p of paths) {
      const s = read(p).toLowerCase();
      expect(s, p).not.toMatch(/one click|one-click/);
    }
  });

  it("quote history links to detail pages", () => {
    const s = read("app/account/quotes/page.tsx");
    expect(s).toContain("/account/quotes/");
    expect(s).toContain("buyerQuoteStatusLabel");
  });
});
