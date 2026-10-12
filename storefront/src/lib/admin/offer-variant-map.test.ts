import { describe, expect, it } from "vitest";
import {
  canMapOfferToVariant,
  detectApparentOfferCandidates,
  planManualVariantOffers,
  selectVariantBestSellPrice,
} from "@/lib/admin/offer-variant-map";
import { requireApprovedListToMap } from "@/lib/pricing/published-list-pricing";

const VARIANT_A = "11111111-1111-4111-8111-111111111111";
const VARIANT_B = "22222222-2222-4222-8222-222222222222";
const PRODUCT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PRODUCT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("variant best sell price contract (FK, sell_price only)", () => {
  it("resolves when a mapped offer has sell_price", () => {
    expect(
      selectVariantBestSellPrice({
        variantId: VARIANT_A,
        variantActive: true,
        offers: [{ catalogVariantId: VARIANT_A, isActive: true, sellPrice: 42, sellPriceVerifiedAt: "2026-09-11T00:00:00Z", cost: 9 }],
      })
    ).toBe(42);
  });

  it("resolves when GloveCubs SKU and supplier SKU differ (identity is FK)", () => {
    expect(
      selectVariantBestSellPrice({
        variantId: VARIANT_A,
        variantActive: true,
        offers: [{ catalogVariantId: VARIANT_A, isActive: true, sellPrice: 18.5, sellPriceVerifiedAt: "2026-09-11T00:00:00Z", cost: 7 }],
      })
    ).toBe(18.5);
  });

  it("returns no price when a family offer is not mapped to the selected variant", () => {
    expect(
      selectVariantBestSellPrice({
        variantId: VARIANT_A,
        variantActive: true,
        offers: [{ catalogVariantId: VARIANT_B, isActive: true, sellPrice: 10, cost: 4 }],
      })
    ).toBeNull();
  });

  it("selects the minimum sell_price among multiple mapped active offers", () => {
    expect(
      selectVariantBestSellPrice({
        variantId: VARIANT_A,
        variantActive: true,
        offers: [
          { catalogVariantId: VARIANT_A, isActive: true, sellPrice: 20, sellPriceVerifiedAt: "2026-09-11T00:00:00Z", cost: 8 },
          { catalogVariantId: VARIANT_A, isActive: true, sellPrice: 15, sellPriceVerifiedAt: "2026-09-11T00:00:00Z", cost: 11 },
        ],
      })
    ).toBe(15);
  });

  it("ignores inactive mapped offers", () => {
    expect(
      selectVariantBestSellPrice({
        variantId: VARIANT_A,
        variantActive: true,
        offers: [{ catalogVariantId: VARIANT_A, isActive: false, sellPrice: 12, cost: 3 }],
      })
    ).toBeNull();
  });

  it("does not use supplier cost when sell_price is missing", () => {
    expect(
      selectVariantBestSellPrice({
        variantId: VARIANT_A,
        variantActive: true,
        offers: [{ catalogVariantId: VARIANT_A, isActive: true, sellPrice: null, cost: 99 }],
      })
    ).toBeNull();
  });

  it("does not use unverified sell_price as published list", () => {
    expect(
      selectVariantBestSellPrice({
        variantId: VARIANT_A,
        variantActive: true,
        offers: [{ catalogVariantId: VARIANT_A, isActive: true, sellPrice: 85, sellPriceVerifiedAt: null, cost: 85 }],
      })
    ).toBeNull();
  });
});

describe("manual offer planning", () => {
  it("does not copy variant_sku into supplier_sku", () => {
    const plans = planManualVariantOffers({
      inputVariants: [{ variantSku: "GLV-GL-N125L", manufacturerSku: "GL-N125F-L" }],
      dbVariants: [{ id: VARIANT_A, variant_sku: "GLV-GL-N125L" }],
    });
    expect(plans).toEqual([
      {
        kind: "upsert",
        catalogVariantId: VARIANT_A,
        variantSku: "GLV-GL-N125L",
        supplierSku: "GL-N125F-L",
      },
    ]);
  });

  it("skips when supplier SKU is unknown rather than inventing one", () => {
    const plans = planManualVariantOffers({
      inputVariants: [{ variantSku: "GLV-GL-N125L" }],
      dbVariants: [{ id: VARIANT_A, variant_sku: "GLV-GL-N125L" }],
    });
    expect(plans).toEqual([{ kind: "skip", variantSku: "GLV-GL-N125L", reason: "supplier_sku_missing" }]);
  });

  it("keeps one GloveCubs variant id when two supplier offers are planned", () => {
    const plans = planManualVariantOffers({
      inputVariants: [
        { variantSku: "GLV-GL-N125L", manufacturerSku: "GL-N125F-L" },
        { variantSku: "GLV-GL-N125L", manufacturerSku: "ALT-N125-L" },
      ],
      dbVariants: [{ id: VARIANT_A, variant_sku: "GLV-GL-N125L" }],
    });
    expect(plans.every((p) => p.kind === "upsert" && p.catalogVariantId === VARIANT_A)).toBe(true);
    expect(plans.map((p) => (p.kind === "upsert" ? p.supplierSku : null))).toEqual(["GL-N125F-L", "ALT-N125-L"]);
  });
});

describe("mapping integrity", () => {
  it("rejects mapping an offer onto a variant of a different product", () => {
    expect(
      canMapOfferToVariant({
        offerProductId: PRODUCT,
        variantCatalogProductId: OTHER_PRODUCT,
        catalogVariantId: VARIANT_A,
      })
    ).toEqual({ ok: false, reason: "variant_not_on_offer_product" });
  });

  it("allows mapping onto a variant of the same product", () => {
    expect(
      canMapOfferToVariant({
        offerProductId: PRODUCT,
        variantCatalogProductId: PRODUCT,
        catalogVariantId: VARIANT_A,
      })
    ).toEqual({ ok: true });
  });

  it("blocks MAP unless published list is approved", () => {
    expect(requireApprovedListToMap({ sellPrice: 85, verifiedAt: null })).toEqual({
      ok: false,
      reason: "list_unapproved",
    });
  });

  it("reports exact manufacturer-SKU candidates without auto-approving size conflicts", () => {
    const candidates = detectApparentOfferCandidates({
      variants: [
        {
          id: VARIANT_A,
          variantSku: "GLV-GL-N125L",
          sizeCode: "L",
          manufacturerSku: "GL-N125F-S",
        },
      ],
      offers: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          supplierSku: "GL-N125F-S",
          supplierId: PRODUCT,
          sellPrice: 10,
          catalogVariantId: null,
        },
      ],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.sizeConflict).toBe(true);
  });
});
