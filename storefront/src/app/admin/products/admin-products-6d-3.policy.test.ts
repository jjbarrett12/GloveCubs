import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PRODUCTS_DIR = __dirname;
const IMPORT_DIR = join(PRODUCTS_DIR, "import");

function read(relFromProducts: string): string {
  return readFileSync(join(PRODUCTS_DIR, relFromProducts), "utf8");
}

function readImport(rel: string): string {
  return readFileSync(join(IMPORT_DIR, rel), "utf8");
}

const PHASE_6D_3_FILES = [
  "import/page.tsx",
  "import/url/page.tsx",
  "import/csv/page.tsx",
  "import/jobs/page.tsx",
  "import/jobs/[jobId]/page.tsx",
  "import/_components/UrlImportPanel.tsx",
  "import/_components/UrlJobsPanel.tsx",
  "import/_components/UrlJobDetailClient.tsx",
  "import/_components/ClipboardUrlStagingClient.tsx",
  "import/_components/UrlImportBridgeSuccessBanner.tsx",
  "import/_components/ImportStatusBadge.tsx",
  "_components/ImportIntelligencePanel.tsx",
];

const BANNED_LIGHT_PATTERNS = [
  /\bbg-white\b/,
  /\bbg-slate-50\b/,
  /\bbg-gray-50\b/,
  /\bborder-slate-200\b/,
  /\btext-gray-500\b/,
  /\bbg-red-50\b/,
  /\bbg-yellow-50\b/,
  /\bbg-green-50\b/,
];

describe("Admin Phase 6D-3 product import/review/promote UI consistency", () => {
  for (const file of PHASE_6D_3_FILES) {
    it(`${file} avoids banned light-only surface patterns`, () => {
      const s = read(file);
      for (const pattern of BANNED_LIGHT_PATTERNS) {
        expect(s, `${file} ${String(pattern)}`).not.toMatch(pattern);
      }
    });

    it(`${file} does not render JWT_SECRET or NEXT_PUBLIC_GLOVECUBS_API`, () => {
      const s = read(file);
      expect(s).not.toContain("JWT_SECRET");
      expect(s).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
    });
  }

  it("UrlImportPanel preserves URL import endpoint and offline disable", () => {
    const s = readImport("_components/UrlImportPanel.tsx");
    expect(s).toContain('"/admin/api/products/import/url"');
    expect(s).toContain("offline");
    expect(s).toContain("disabled");
  });

  it("UrlJobsPanel preserves job list endpoint", () => {
    const s = readImport("_components/UrlJobsPanel.tsx");
    expect(s).toContain("/admin/api/products/import/url/jobs");
  });

  it("UrlJobDetailClient preserves bridge endpoint and product_ids payload", () => {
    const s = readImport("_components/UrlJobDetailClient.tsx");
    expect(s).toContain("/admin/api/products/import/url/jobs/");
    expect(s).toContain("/bridge");
    expect(s).toContain("product_ids: Array.from(selected)");
    expect(s).toContain("UrlImportBridgeSuccessBanner");
    expect(s).toContain("catalogosBaseUrl");
  });

  it("ClipboardUrlStagingClient preserves staging/promote endpoints and fields", () => {
    const s = readImport("_components/ClipboardUrlStagingClient.tsx");
    expect(s).toContain("/admin/api/products/url-staging");
    expect(s).toContain("/admin/api/products/url-staging/delete");
    expect(s).toContain("/admin/api/products/url-staging/");
    expect(s).toContain("/promote");
    expect(s).toContain("product_ids");
    expect(s).toContain("category_id");
    expect(s).toContain("storefrontUrlImportBridgeApiPath");
    expect(s).toContain("Bridge to CatalogOS review");
    expect(s).toContain("Promote to draft (fallback)");
  });

  it("UrlImportBridgeSuccessBanner preserves CatalogOS-first link builder", () => {
    const s = readImport("_components/UrlImportBridgeSuccessBanner.tsx");
    expect(s).toContain("buildUrlImportBridgeSuccessLinks");
    expect(s).toContain("secondaryHref");
    expect(s).toContain("Bridged to CatalogOS import batch");
  });

  it("ImportIntelligencePanel preserves apply logic hooks", () => {
    const s = read("_components/ImportIntelligencePanel.tsx");
    expect(s).toContain("buildSafeApplyAllPatch");
    expect(s).toContain("filterSafeSuggestions");
    expect(s).toContain("applySuggestionToPatch");
    expect(s).toContain("buildSkuProposalApplyPatch");
  });
});
