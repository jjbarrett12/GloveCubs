import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateBuyerDisplayRef, readBuyerDisplayRefFromMetadata } from "@/lib/procurement/buyer-display-ref";
import { projectPrepLineCardFacts } from "@/lib/prep-line/card-projection";
import type { StoreProductRow } from "@/lib/catalog/store-products";
import { PrepLineOperationalCopy, assertPrepLineCopyHasNoBannedLanguage } from "@/lib/prep-line/operational-copy";
import { PREP_LINE_CHECKLIST_ITEMS } from "@/lib/prep-line/guidance";

describe("prep-line governance (Phase 2C)", () => {
  it("buyer_display_ref is opaque and matches expected prefix", () => {
    const a = generateBuyerDisplayRef();
    const b = generateBuyerDisplayRef();
    expect(a).toMatch(/^GC-PREP-[0-9A-F]{12}$/);
    expect(b).toMatch(/^GC-PREP-[0-9A-F]{12}$/);
    expect(a).not.toBe(b);
    expect(readBuyerDisplayRefFromMetadata({ buyer_display_ref: a })).toBe(a);
    expect(readBuyerDisplayRefFromMetadata({ buyer_display_ref: "not-a-ref" })).toBe(null);
  });

  it("projectPrepLineCardFacts is deterministic and avoids fabricated N/A", () => {
    const row: StoreProductRow = {
      id: "550e8400-e29b-41d4-a716-446655440001",
      name: "Test",
      slug: "test",
      brandName: "B",
      brandId: null,
      imageUrl: null,
      internalSku: "INT-1",
      catalogVariantId: null,
      variantSku: null,
      sizeCode: "M",
      materialHint: "Nitrile",
      badges: [],
      bestPrice: 12.5,
      commercialUseSummary: "Food handling",
      certificationHints: ["FDA", "Food safe"],
      protectionHint: null,
    };
    const once = projectPrepLineCardFacts(row);
    const twice = projectPrepLineCardFacts(row);
    expect(once).toEqual(twice);
    expect(once.map((f) => f.label)).toContain("Material (listing)");
    expect(once.some((f) => /N\/A/i.test(f.value))).toBe(false);
  });

  it("checklist item order is fixed (local UI must not re-sort)", () => {
    expect(PREP_LINE_CHECKLIST_ITEMS.map((i) => i.id)).toEqual([
      "wet_hands",
      "frequent_changes",
      "knife_adjacent",
      "grease_exposure",
      "fast_don_doff",
      "extended_wear",
      "color_coding",
    ]);
  });

  it("governed operational copy avoids banned ecommerce / AI phrases", () => {
    for (const val of Object.values(PrepLineOperationalCopy)) {
      if (typeof val === "string") assertPrepLineCopyHasNoBannedLanguage(val);
      if (typeof val === "function") {
        assertPrepLineCopyHasNoBannedLanguage((val as (s: string) => string)("GC-PREP-ABCDEF012345"));
      }
    }
  });

  it("checklist disclaimer copy is present for buyer trust boundary", () => {
    expect(PrepLineOperationalCopy.checklistDisclaimer).toContain("does not change catalog results");
  });

  it("ResultsView does not regress banned labels (drift guard)", () => {
    const p = join(__dirname, "../../components/glove-finder/ResultsView.tsx");
    const src = readFileSync(p, "utf8");
    for (const banned of ["Option ", "Assistant suggestion", "Why this works", "Compare gloves", "View product"]) {
      expect(src.includes(banned), `unexpected drift token: ${banned}`).toBe(false);
    }
  });
});
