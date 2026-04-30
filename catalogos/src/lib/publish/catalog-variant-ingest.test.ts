/**
 * @vitest-environment node
 */

import { describe, it, expect, vi } from "vitest";
import {
  extractSizeCodeFromFilterAttributes,
  isGloveCategorySlug,
  mergeVariantIdentifierField,
  omitSizeFromProductAttributesFilter,
  upsertCatalogVariantFromGloveIngest,
  validatePurchaseItemNumber,
} from "./catalog-variant-ingest";

describe("catalog-variant-ingest helpers", () => {
  it("isGloveCategorySlug recognizes glove slugs", () => {
    expect(isGloveCategorySlug("disposable_gloves")).toBe(true);
    expect(isGloveCategorySlug("reusable_work_gloves")).toBe(true);
    expect(isGloveCategorySlug("other")).toBe(false);
  });

  it("omitSizeFromProductAttributesFilter removes size only", () => {
    expect(
      omitSizeFromProductAttributesFilter({
        category: "disposable_gloves",
        material: "nitrile",
        size: "l",
        color: "blue",
      })
    ).toEqual({ category: "disposable_gloves", material: "nitrile", color: "blue" });
  });

  it("extractSizeCodeFromFilterAttributes handles string and array", () => {
    expect(extractSizeCodeFromFilterAttributes({ size: "  m " })).toBe("m");
    expect(extractSizeCodeFromFilterAttributes({ size: ["xl"] })).toBe("xl");
    expect(extractSizeCodeFromFilterAttributes({ size: "" })).toBe(null);
    expect(extractSizeCodeFromFilterAttributes({})).toBe(null);
  });

  it("validatePurchaseItemNumber rejects blank", () => {
    expect(validatePurchaseItemNumber("  N125F-S  ").ok).toBe(true);
    expect(validatePurchaseItemNumber("").ok).toBe(false);
    expect(validatePurchaseItemNumber("   ").ok).toBe(false);
  });

  it("mergeVariantIdentifierField: staged non-empty wins; empty/undefined preserves existing", () => {
    expect(mergeVariantIdentifierField("111", "222")).toBe("222");
    expect(mergeVariantIdentifierField("111", "")).toBe("111");
    expect(mergeVariantIdentifierField("111", undefined)).toBe("111");
    expect(mergeVariantIdentifierField(null, "333")).toBe("333");
    expect(mergeVariantIdentifierField(undefined, undefined)).toBe(null);
  });
});

describe("upsertCatalogVariantFromGloveIngest", () => {
  it("returns error when variant_sku already belongs to another product", async () => {
    const variantChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "v1", catalog_product_id: "other-product" },
        error: null,
      }),
    };
    const admin = {
      schema: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue(variantChain),
      })),
    };
    const r = await upsertCatalogVariantFromGloveIngest(admin as never, {
      catalogProductId: "prod-a",
      sizeCode: "s",
      variantSku: "SHARED-SKU",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already used/);
  });

  it("updates catalog_variants with merged gtin/mpn when matching by size (staging → variant row)", async () => {
    let updatePayload: Record<string, unknown> | null = null;

    const skuLookup = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const sizeLookup = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "v-size-1", variant_sku: "OLD-SKU", gtin: "000111", mpn: "OLD-MPN" },
        error: null,
      }),
    };

    let fromN = 0;
    const admin = {
      schema: vi.fn().mockImplementation(() => ({
        from: vi.fn(() => {
          fromN += 1;
          if (fromN === 1) return skuLookup;
          if (fromN === 2) return sizeLookup;
          return {
            update: vi.fn((payload: Record<string, unknown>) => {
              updatePayload = payload;
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }),
      })),
    };

    const r = await upsertCatalogVariantFromGloveIngest(admin as never, {
      catalogProductId: "prod-a",
      sizeCode: "m",
      variantSku: "NEW-SKU",
      gtin: "012345678905",
      mpn: "MPN-STAGED",
    });

    expect(r.ok).toBe(true);
    expect(updatePayload).not.toBeNull();
    expect(updatePayload!.gtin).toBe("012345678905");
    expect(updatePayload!.mpn).toBe("MPN-STAGED");
  });

  it("preserves existing gtin/mpn when staged omits them (idempotent re-publish)", async () => {
    let updatePayload: Record<string, unknown> | null = null;

    const skuLookup = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const sizeLookup = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "v-size-2", variant_sku: "SKU-2", gtin: "9998887776665", mpn: "TRUSTED-MPN" },
        error: null,
      }),
    };

    let fromN = 0;
    const admin = {
      schema: vi.fn().mockImplementation(() => ({
        from: vi.fn(() => {
          fromN += 1;
          if (fromN === 1) return skuLookup;
          if (fromN === 2) return sizeLookup;
          return {
            update: vi.fn((payload: Record<string, unknown>) => {
              updatePayload = payload;
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }),
      })),
    };

    const r = await upsertCatalogVariantFromGloveIngest(admin as never, {
      catalogProductId: "prod-b",
      sizeCode: "l",
      variantSku: "SKU-2",
    });

    expect(r.ok).toBe(true);
    expect(updatePayload!.gtin).toBe("9998887776665");
    expect(updatePayload!.mpn).toBe("TRUSTED-MPN");
  });

});
