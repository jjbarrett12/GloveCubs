import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PRODUCTS_DIR = __dirname;

function read(rel: string): string {
  return readFileSync(join(PRODUCTS_DIR, rel), "utf8");
}

const PHASE_6D_2_FILES = [
  "[productId]/page.tsx",
  "[productId]/edit/page.tsx",
  "new/page.tsx",
  "_components/ProductEditorShell.tsx",
  "_components/ProductCommandHeader.tsx",
  "_components/PublishReadinessPanel.tsx",
  "_components/VariantSizeMatrix.tsx",
  "_components/CasePalletSetupPanel.tsx",
  "_components/PresetNumericInput.tsx",
  "_components/ProductAttributeEditor.tsx",
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

describe("Admin Phase 6D-2 product editor/detail consistency", () => {
  for (const file of PHASE_6D_2_FILES) {
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

  it("ProductCommandHeader preserves publish blocker guard", () => {
    const s = read("_components/ProductCommandHeader.tsx");
    expect(s).toContain("hasPublishBlockers");
    expect(s).toContain("publishBlocked");
    expect(s).toMatch(/disabled=\{pending \|\| publishBlocked\}/);
  });

  it("ProductAttributeEditor preserves blocking and required safety hooks", () => {
    const s = read("_components/ProductAttributeEditor.tsx");
    expect(s).toContain("blockingSet");
    expect(s).toContain("blockingKeys");
    expect(s).toContain("wrapBlocking");
    expect(s).toMatch(/Required/);
  });

  it("VariantSizeMatrix preserves variant field semantics", () => {
    const s = read("_components/VariantSizeMatrix.tsx");
    expect(s).toContain("manufacturerSku");
    expect(s).toContain("sizeCode");
    expect(s).toContain("sortVariantsByGloveSize");
  });

  it("CasePalletSetupPanel preserves core packaging field names", () => {
    const s = read("_components/CasePalletSetupPanel.tsx");
    expect(s).toContain("units_per_case");
    expect(s).toContain("cases_per_pallet");
    expect(s).toContain("sell_by_pallet_enabled");
  });
});
