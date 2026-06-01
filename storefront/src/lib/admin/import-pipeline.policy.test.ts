import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");

const PIPELINE_FILES = [
  "src/lib/admin/clipboard-url-staging.ts",
  "src/app/admin/api/products/url-staging/[stagingId]/promote/route.ts",
  "src/lib/admin/unified-ingestion-promote.ts",
];

const EDITOR_UI_FILES = [
  "src/app/admin/products/_components/ProductEditorShell.tsx",
  "src/app/admin/products/_components/ImportIntelligencePanel.tsx",
  "src/app/admin/products/_components/ProductAttributeEditor.tsx",
  "src/app/admin/products/_components/VariantSizeMatrix.tsx",
];

const FORBIDDEN = ["extractPageEvidence", "jsonLdProductHints", "extractJsonLdProduct"];

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

describe("import pipeline policy", () => {
  it("clipboard staging uses productExtraction import draft path", () => {
    const s = readFileSync(join(ROOT, "src/lib/admin/clipboard-url-staging.ts"), "utf8");
    expect(s).toContain("extractProductFromHtml");
    expect(s).toContain("toImportDraftProductV1");
    expect(s).not.toContain("extractPageEvidence");
  });

  for (const rel of PIPELINE_FILES) {
    it(`${rel} does not import html-evidence parsing helpers`, () => {
      const s = readFileSync(join(ROOT, rel), "utf8");
      for (const sym of FORBIDDEN) {
        expect(s).not.toContain(sym);
      }
    });
  }

  for (const rel of EDITOR_UI_FILES) {
    it(`${rel} does not import productExtraction parser`, () => {
      const s = readFileSync(join(ROOT, rel), "utf8");
      expect(s).not.toContain("productExtraction");
      expect(s).not.toContain("extractProductFromHtml");
    });
  }

  it("html-evidence is fetch-only", () => {
    const s = readFileSync(join(ROOT, "src/lib/admin/html-evidence.ts"), "utf8");
    expect(s).toContain("fetchHtmlForImport");
    expect(s).not.toContain("extractPageEvidence");
    expect(s).not.toContain("jsonLdProductHints");
  });

  it("only productExtraction.ts defines extractProductFromHtml in admin lib", () => {
    const adminDir = join(ROOT, "src/lib/admin");
    const hits: string[] = [];
    for (const file of walkTsFiles(adminDir)) {
      const base = file.split(/[/\\]/).pop() ?? "";
      if (base === "productExtraction.ts") continue;
      const s = readFileSync(file, "utf8");
      if (/function\s+extractProductFromHtml/.test(s)) hits.push(base);
    }
    expect(hits).toEqual([]);
  });
});
