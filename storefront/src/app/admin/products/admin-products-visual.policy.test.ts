import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const PRODUCTS_ROOT = __dirname;

const POLICY_TEST_SUFFIX = ".policy.test.ts";

const BANNED_LIGHT_PATTERNS = [
  /\bbg-white\b/,
  /\bbg-slate-50\b/,
  /\bbg-gray-50\b/,
  /\bborder-slate-200\b/,
  /\btext-gray-500\b/,
  /\bbg-red-50\b/,
  /\bbg-yellow-50\b/,
  /\bbg-green-50\b/,
  /\btext-red-700\b/,
  /\btext-amber-700\b/,
  /\btext-green-700\b/,
];

/** Production UI source under /admin/products (excludes policy tests). */
function collectProductUiFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectProductUiFiles(full, acc);
      continue;
    }
    if (!/\.(tsx|ts)$/.test(name)) continue;
    if (name.endsWith(POLICY_TEST_SUFFIX)) continue;
    acc.push(full);
  }
  return acc;
}

const PRODUCT_UI_FILES = collectProductUiFiles(PRODUCTS_ROOT).map((abs) =>
  relative(PRODUCTS_ROOT, abs).replace(/\\/g, "/"),
);

function read(rel: string): string {
  return readFileSync(join(PRODUCTS_ROOT, rel), "utf8");
}

describe("Admin products visual policy (6D-4 final sweep)", () => {
  it("discovers product UI files to scan", () => {
    expect(PRODUCT_UI_FILES.length).toBeGreaterThan(20);
    expect(PRODUCT_UI_FILES.some((f) => f.endsWith("ProductEditorForm.tsx"))).toBe(true);
  });

  for (const file of PRODUCT_UI_FILES) {
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

  it("ProductEditorShell preserves readiness and SKU collision hooks", () => {
    const s = read("_components/ProductEditorShell.tsx");
    expect(s).toContain("computeEditorReadiness");
    expect(s).toContain("hasPublishBlockers");
    expect(s).toContain("/admin/api/products/sku-collisions");
  });

  it("ProductEditorForm preserves create action wiring", () => {
    const s = read("_components/ProductEditorForm.tsx");
    expect(s).toContain("adminCreateProductAction");
    expect(s).toContain("adminUpdateProductAction");
    expect(s).toContain("buildPayload");
  });

  it("UrlImportPanel preserves URL import endpoint", () => {
    const s = read("import/_components/UrlImportPanel.tsx");
    expect(s).toContain('"/admin/api/products/import/url"');
  });

  it("ClipboardUrlStagingClient preserves staging and promote fields", () => {
    const s = read("import/_components/ClipboardUrlStagingClient.tsx");
    expect(s).toContain("/admin/api/products/url-staging");
    expect(s).toContain("category_id");
    expect(s).toContain("product_ids");
  });

  it("ProductReviewQueueClient preserves promote/dismiss endpoints", () => {
    const s = read("review/_components/ProductReviewQueueClient.tsx");
    expect(s).toContain("/admin/api/products/ingestion/staging/");
    expect(s).toContain("/promote");
    expect(s).toContain("/dismiss");
    expect(s).toContain("confirm_awaiting_human");
  });
});
