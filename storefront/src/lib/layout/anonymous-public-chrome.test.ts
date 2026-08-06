import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("anonymous public chrome (emergency containment)", () => {
  it("homepage uses SiteHeader without SiteHeaderLoader / force-dynamic", () => {
    const s = read("app/page.tsx");
    expect(s).toContain("<SiteHeader />");
    expect(s).not.toContain("SiteHeaderLoader");
    expect(s).not.toContain("force-dynamic");
    expect(s).toContain("revalidate");
  });

  it("PublicExperienceChrome does not call auth loaders", () => {
    const s = read("components/layout/PublicExperienceChrome.tsx");
    expect(s).toContain("<SiteHeader />");
    expect(s).not.toContain("SiteHeaderLoader");
    expect(s).not.toContain("resolveCommerceHeaderAuth");
    expect(s).not.toContain("getAdminUser");
  });

  it("store page does not call getAdminUser", () => {
    const s = read("app/store/page.tsx");
    expect(s).not.toContain("getAdminUser");
    expect(s).toContain('canonical: "/store"');
  });

  it("public PDP does not call procurement gate or getAdminUser", () => {
    const s = read("app/store/p/[slug]/page.tsx");
    expect(s).not.toContain("resolveCustomerProcurementGate");
    expect(s).not.toContain("getAdminUser");
    expect(s).not.toContain("enrichStoreProductDetailBuyerPricing");
    expect(s).toContain("isCatalogSupabaseEmergencyDisabled");
  });

  it("account and workspace retain SiteHeaderLoader", () => {
    expect(read("app/account/page.tsx")).toContain("SiteHeaderLoader");
    expect(read("app/workspace/procurement/layout.tsx")).toContain("SiteHeaderLoader");
  });
});
