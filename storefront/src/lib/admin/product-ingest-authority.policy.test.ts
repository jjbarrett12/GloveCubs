/**
 * Static policy guards for storefront product ingest — no new split-brain paths.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(__dirname, "../../..");

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walkTsFiles(p, out);
    } else if (/\.(tsx?)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe("product ingest authority (storefront)", () => {
  it("src/ does not reference Express parse-product-url", () => {
    const forbidden = ["parse-product-url", "parseProductUrl"];
    const hits: string[] = [];
    for (const file of walkTsFiles(join(SRC_ROOT, "src"))) {
      if (file.endsWith("product-ingest-authority.policy.test.ts")) continue;
      if (file.endsWith("route.policy.test.ts")) continue;
      const s = readFileSync(file, "utf8");
      if (forbidden.some((token) => s.includes(token))) {
        hits.push(file.replace(/\\/g, "/").split("/src/").pop() ?? file);
      }
    }
    expect(hits).toEqual([]);
  });

  it("promoteStagingToDraftProduct always creates draft catalog products", () => {
    const s = readFileSync(join(__dirname, "product-write.ts"), "utf8");
    const fn = s.indexOf("export async function promoteStagingToDraftProduct");
    expect(fn).toBeGreaterThan(-1);
    const body = s.slice(fn, fn + 800);
    expect(body).toContain("status: \"draft\"");
    expect(body).not.toContain("status: \"active\"");
  });

  it("clipboard staging does not publish or auto-activate catalog products", () => {
    const s = readFileSync(join(__dirname, "clipboard-url-staging.ts"), "utf8");
    expect(s).toContain('"needs_review"');
    expect(s).not.toMatch(/\brunPublish\b/i);
    expect(s).not.toMatch(/status:\s*[\"']active[\"']/);
  });

  it("clipboard staging delegates URL extraction to CatalogOS when configured", () => {
    const s = readFileSync(join(__dirname, "clipboard-url-staging.ts"), "utf8");
    expect(s).toContain("extractClipboardViaCatalogosUrl");
    expect(s).toContain("clipboard-url-catalogos-extract");
    expect(s).toContain("catalogos_v2");
  });

  it("clipboard promote guards module blocks active status for URL imports", () => {
    const s = readFileSync(join(__dirname, "clipboard-promote-guards.ts"), "utf8");
    expect(s).toContain("clipboardUrlImportActiveStatusError");
    expect(s).toContain("clipboardPromoteStatusOverrideError");
    expect(s).not.toMatch(/\brunPublish\b/i);
  });

  it("import-draft contract keeps parallel-but-aligned core field names", () => {
    const s = readFileSync(join(__dirname, "import-draft-types.ts"), "utf8");
    expect(s).toContain("source_url");
    expect(s).toContain("manufacturer_sku");
    expect(s).toContain("commerce_packaging");
    expect(s).toContain("IMPORT_DRAFT_PARSER_VERSION");
    expect(s).toContain("productExtraction.v2");
  });

  it("bulk URL import proxy routes forward to CatalogOS only", () => {
    const urlRoute = readFileSync(
      join(SRC_ROOT, "src/app/admin/api/products/import/url/route.ts"),
      "utf8"
    );
    expect(urlRoute).toContain("catalogosInternalRequest");
    expect(urlRoute).toContain("/api/admin/url-import");
    expect(urlRoute).not.toMatch(/\bproductExtraction\b/);
  });

  it("product-write blocks URL-import active publish and never calls runPublish", () => {
    const s = readFileSync(join(__dirname, "product-write.ts"), "utf8");
    expect(s).toContain("evaluateActivePublishReadiness");
    expect(s).not.toMatch(/\brunPublish\b/);
  });

  it("product-write insert forces draft when importStagingId is set", () => {
    const s = readFileSync(join(__dirname, "product-write.ts"), "utf8");
    const fn = s.indexOf("export async function insertCatalogProduct");
    expect(fn).toBeGreaterThan(-1);
    const fnEnd = s.indexOf("export async function updateCatalogProduct", fn);
    const body = s.slice(fn, fnEnd > fn ? fnEnd : fn + 2500);
    expect(body).toContain('input.importStagingId?.trim() ? "draft" : input.status');
    expect(body).toMatch(/status:\s*"draft"/);
  });

  it("product-editor-actions delegate to product-write without runPublish", () => {
    const s = readFileSync(
      join(SRC_ROOT, "src/app/admin/products/_components/product-editor-actions.ts"),
      "utf8"
    );
    expect(s).toContain("insertCatalogProduct");
    expect(s).toContain("updateCatalogProduct");
    expect(s).not.toMatch(/\brunPublish\b/);
  });
});
