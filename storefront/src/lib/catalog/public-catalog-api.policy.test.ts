import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("catalog API cache posture", () => {
  it("route handler does not read Request/searchParams (keeps CDN cacheable)", () => {
    const s = read("app/api/store/catalog/route.ts");
    expect(s).toContain('dynamic = "force-static"');
    expect(s).toContain("revalidate = 300");
    expect(s).toContain("s-maxage=300");
    expect(s).toContain("getPublicAnonymousCatalogDataset");
    expect(s).not.toMatch(/export async function GET\(\s*request/);
    expect(s).not.toContain("request.url");
    expect(s).not.toMatch(/url\.searchParams|new URL\(request/);
    expect(s).not.toContain("cookies(");
    expect(s).not.toContain("headers(");
  });

  it("public dataset uses unstable_cache with a fixed key (no query inputs)", () => {
    const s = read("lib/catalog/public-catalog-dataset.ts");
    expect(s).toContain("unstable_cache");
    expect(s).toContain("public-anonymous-store-catalog-v1");
    expect(s).toContain("revalidate: 300");
    expect(s).not.toContain("searchParams");
  });

  it("client fetches canonical API only and filters locally", () => {
    const s = read("components/store/StoreCatalogClient.tsx");
    expect(s).toContain('fetch("/api/store/catalog"');
    expect(s).toContain("filterPublicCatalogClient");
    expect(s).toContain("loadPublicCatalogOnce");
    expect(s).not.toContain("/api/store/catalog?");
    expect(s).toContain("catalogUnavailable");
  });

  it("public catalog JSON shape excludes private pricing enrichment hooks", () => {
    const route = read("app/api/store/catalog/route.ts");
    const dataset = read("lib/catalog/public-catalog-dataset.ts");
    expect(route + dataset).not.toContain("enrichStoreProductDetailBuyerPricing");
    expect(route + dataset).not.toContain("getAdminUser");
    expect(route + dataset).not.toContain("resolveCustomerProcurementGate");
  });
});
