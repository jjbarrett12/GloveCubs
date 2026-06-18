import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PRODUCTS_DIR = __dirname;

function read(rel: string): string {
  return readFileSync(join(PRODUCTS_DIR, rel), "utf8");
}

const PHASE_6D_1_FILES = [
  "layout.tsx",
  "page.tsx",
  "catalog-health/page.tsx",
  "review/page.tsx",
  "_components/ProductsSubnav.tsx",
  "_components/ProductsWorkspaceTabs.tsx",
  "_components/ProductsCommandActions.tsx",
  "_components/ProductListTable.tsx",
  "_components/ProductListRowActions.tsx",
  "review/_components/ProductReviewQueueClient.tsx",
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

const SUBNAV_LINKS = [
  "/admin/products",
  "/admin/products/import",
  "/admin/products/review",
  "/admin/products/catalog-health",
];

const WORKSPACE_TAB_LINKS = [
  "/admin/products",
  "/admin/products?tab=products",
  "/admin/products?tab=drafts",
  "/admin/products?tab=url-imports",
  "/admin/products?tab=needs-review",
  "/admin/products?tab=archived",
];

describe("Admin Phase 6D-1 product workspace consistency", () => {
  for (const file of PHASE_6D_1_FILES) {
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

  it("ProductsSubnav preserves product module route links", () => {
    const s = read("_components/ProductsSubnav.tsx");
    for (const href of SUBNAV_LINKS) {
      expect(s).toContain(href);
    }
  });

  it("ProductsWorkspaceTabs preserves workspace tab links", () => {
    const s = read("_components/ProductsWorkspaceTabs.tsx");
    for (const href of WORKSPACE_TAB_LINKS) {
      expect(s).toContain(href);
    }
  });

  it("ProductListTable still calls bulk delete endpoint", () => {
    const s = read("_components/ProductListTable.tsx");
    expect(s).toContain("/admin/api/products/delete-drafts");
    expect(s).toContain("product_ids");
  });

  it("ProductListRowActions still calls per-row delete endpoint", () => {
    const s = read("_components/ProductListRowActions.tsx");
    expect(s).toContain("/admin/api/products/");
    expect(s).toContain("/delete-draft");
  });

  it("ProductReviewQueueClient still references promote and dismiss endpoints", () => {
    const s = read("review/_components/ProductReviewQueueClient.tsx");
    expect(s).toContain("/admin/api/products/ingestion/staging/");
    expect(s).toContain("/promote");
    expect(s).toContain("/dismiss");
    expect(s).toContain("/admin/api/products/url-staging/");
    expect(s).toContain("category_id");
    expect(s).toContain("confirm_awaiting_human");
  });
});
