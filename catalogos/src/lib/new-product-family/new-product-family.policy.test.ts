import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

const FILES = [
  "lib/new-product-family/persist.ts",
  "lib/new-product-family/draft.ts",
  "lib/new-product-family/gates.ts",
  "lib/new-product-family/cost.ts",
  "lib/new-product-family/staging-plan.ts",
  "lib/new-product-family/promote.ts",
  "app/actions/new-product-family.ts",
  "components/new-product-family/NewFamilyWizardPageClient.tsx",
  "components/new-product-family/StepSizeFamily.tsx",
  "components/new-product-family/StepPackaging.tsx",
  "components/new-product-family/StepSupplierCost.tsx",
  "components/new-product-family/StepPricing.tsx",
  "components/new-product-family/StepReview.tsx",
];

describe("New Product Family phase 1 does not publish commerce", () => {
  it("does not write a customer price or call live publish", () => {
    for (const rel of FILES) {
      const src = readFileSync(path.join(ROOT, rel), "utf8");
      expect(src).not.toMatch(/sell_price/);
      expect(src).not.toMatch(/withOperatorApprovedSellPrice/);
      expect(src).not.toMatch(/supplier_offers/);
      expect(src).not.toMatch(/publishStagedToLive/);
      expect(src).not.toMatch(/publishVariantGroup/);
      expect(src).not.toMatch(/runPublish/);
      expect(src).not.toMatch(/catalog_variant_id/);
      expect(src).not.toMatch(/sell_price_verified_at/);
    }
  });

  it("creates one master without publishing", () => {
    const src = readFileSync(path.join(ROOT, "lib/new-product-family/promote-live.ts"), "utf8");
    expect(src).toContain("createNewMasterProduct");
    expect(src).toContain("publishToLive: false");
    expect(src).toContain("list_price_minor: 0");
    expect(src).not.toMatch(/sell_price/);
    expect(src).not.toMatch(/publishStagedToLive/);
    expect(src).not.toMatch(/runPublish/);
    expect(src).not.toMatch(/withOperatorApprovedSellPrice/);
  });

  it("does not call AI or poll", () => {
    const src = readFileSync(path.join(ROOT, "components/new-product-family/NewFamilyWizardPageClient.tsx"), "utf8");
    expect(src).not.toMatch(/openai|anthropic|fetch\(.*poll|setInterval/i);
  });
});
