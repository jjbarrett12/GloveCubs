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

  it("store page is force-static and does not read server searchParams", () => {
    const s = read("app/store/page.tsx");
    expect(s).not.toContain("getAdminUser");
    expect(s).toContain('canonical: "/store"');
    expect(s).toContain('dynamic = "force-static"');
    expect(s).toContain("revalidate = 300");
    expect(s).toContain("StoreCatalogClient");
    expect(s).not.toMatch(/function StorePage\(\{\s*searchParams/);
    expect(s).not.toContain("cookies(");
    expect(s).not.toContain("headers(");
  });

  it("store filter hydration uses one canonical cached catalog API + local filters", () => {
    const client = read("components/store/StoreCatalogClient.tsx");
    const api = read("app/api/store/catalog/route.ts");
    expect(client).toContain("useSearchParams");
    expect(client).toContain('fetch("/api/store/catalog"');
    expect(client).toContain("filterPublicCatalogClient");
    expect(client).not.toContain("/api/store/catalog?");
    expect(api).toContain("Cache-Control");
    expect(api).toContain("s-maxage=300");
    expect(api).toContain('dynamic = "force-static"');
    expect(api).not.toMatch(/GET\(\s*request/);
  });

  it("request-pricing page is force-static", () => {
    const s = read("app/request-pricing/page.tsx");
    expect(s).toContain('dynamic = "force-static"');
    expect(s).toContain("revalidate = 600");
  });

  it("login page is force-static and does not read server searchParams", () => {
    const s = read("app/login/page.tsx");
    const client = read("app/login/LoginClient.tsx");
    expect(s).toContain('dynamic = "force-static"');
    expect(s).toContain("revalidate = 600");
    expect(s).toContain("LoginClient");
    expect(s).toContain("Suspense");
    expect(s).not.toMatch(/function LoginPage\(\{\s*searchParams/);
    expect(s).not.toContain("cookies(");
    expect(s).not.toContain("headers(");
    expect(client).toContain("useSearchParams");
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
