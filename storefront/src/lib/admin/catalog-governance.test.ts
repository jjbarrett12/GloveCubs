import { describe, it, expect } from "vitest";
import {
  computeProductWarnings,
  isGloveAttributeCandidate,
  isMissingGloveAttributesForKeys,
  productHasOnlyPlaceholderImagery,
  THIN_PDP_MIN_ATTRIBUTE_ROWS,
} from "./catalog-governance";

function ctx(partial: Partial<import("./catalog-governance").ProductGovernanceContext>): import("./catalog-governance").ProductGovernanceContext {
  return {
    productId: "p1",
    status: "active",
    metadata: {},
    imageRows: [],
    attributeRowCount: 10,
    activeVariantCount: 2,
    activeVariantGtins: [],
    activeVariantSignatures: [],
    categoryId: null,
    categoryIdValid: true,
    attributeKeysWithValues: new Set(["material", "grade", "uses"]),
    pendingMatchReviewCount: 0,
    globalGtinCollisionGtins: new Set(),
    globalSignatureCollisionKeys: new Set(),
    ...partial,
  };
}

describe("catalog-governance", () => {
  it("flags thin PDP for active products below attribute threshold", () => {
    const w = computeProductWarnings(ctx({ attributeRowCount: THIN_PDP_MIN_ATTRIBUTE_ROWS - 1 }));
    expect(w.some((x) => x.code === "thin_pdp")).toBe(true);
  });

  it("does not flag thin PDP for drafts", () => {
    const w = computeProductWarnings(
      ctx({ status: "draft", attributeRowCount: 0, imageRows: [{ metadata: {} }] })
    );
    expect(w.some((x) => x.code === "thin_pdp")).toBe(false);
  });

  it("flags missing images for active or draft without rows", () => {
    expect(computeProductWarnings(ctx({ status: "active", imageRows: [] })).some((x) => x.code === "missing_images")).toBe(
      true
    );
    expect(computeProductWarnings(ctx({ status: "draft", imageRows: [] })).some((x) => x.code === "missing_images")).toBe(
      true
    );
  });

  it("flags placeholder-only when all image rows are placeholder provenance", () => {
    const rows = [{ metadata: { image_provenance: "placeholder" } }, { metadata: { image_provenance: "placeholder" } }];
    expect(productHasOnlyPlaceholderImagery(rows)).toBe(true);
    const w = computeProductWarnings(ctx({ status: "active", imageRows: rows, attributeRowCount: 10 }));
    expect(w.some((x) => x.code === "placeholder_only_images")).toBe(true);
  });

  it("detects glove candidates and missing glove attributes", () => {
    expect(isGloveAttributeCandidate({ product_line_code: "ppe_gloves" })).toBe(true);
    expect(isMissingGloveAttributesForKeys(new Set(["material"]))).toBe(true);
    expect(isMissingGloveAttributesForKeys(new Set(["material", "grade", "uses"]))).toBe(false);
  });

  it("flags duplicate GTIN when global set contains variant GTIN", () => {
    const w = computeProductWarnings(
      ctx({
        activeVariantGtins: ["00012345"],
        globalGtinCollisionGtins: new Set(["00012345"]),
      })
    );
    expect(w.some((x) => x.code === "duplicate_gtin")).toBe(true);
  });
});
