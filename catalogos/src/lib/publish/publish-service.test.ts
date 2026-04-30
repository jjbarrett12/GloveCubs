/**
 * Tests for publish service: buildPublishInputFromStaged, runPublish (publishSafe block), idempotency contract.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { buildPublishInputFromStaged, runPublish } from "./publish-service";
import { publishSafe } from "@/lib/catalogos/validation-modes";
import * as productAttributeSync from "./product-attribute-sync";
import * as productAttributesSnapshot from "./product-attributes-snapshot";
import * as catalogVariantIngest from "./catalog-variant-ingest";
import * as dbClient from "@/lib/db/client";

describe("publish service", () => {
  describe("buildPublishInputFromStaged", () => {
    it("returns null when supplier_id or raw_id missing", () => {
      expect(
        buildPublishInputFromStaged(
          "norm-1",
          { normalized_data: { canonical_title: "Gloves", supplier_sku: "SKU1" }, attributes: {} }
        )
      ).toBeNull();
      expect(
        buildPublishInputFromStaged("norm-1", {
          supplier_id: "sup-1",
          normalized_data: {},
          attributes: {},
        })
      ).toBeNull();
      expect(
        buildPublishInputFromStaged("norm-1", {
          raw_id: "raw-1",
          normalized_data: {},
          attributes: {},
        })
      ).toBeNull();
    });

    it("builds PublishInput from normalized_data and attributes", () => {
      const row = {
        supplier_id: "sup-1",
        raw_id: "raw-1",
        normalized_data: {
          canonical_title: "Nitrile Gloves",
          supplier_sku: "NG-100",
          supplier_cost: 12.5,
          brand: "Acme",
          category_slug: "disposable_gloves",
        },
        attributes: { material: "nitrile", size: "m", color: "blue" },
      };
      const input = buildPublishInputFromStaged("norm-1", row, { masterProductId: "master-1" });
      expect(input).not.toBeNull();
      expect(input!.normalizedId).toBe("norm-1");
      expect(input!.masterProductId).toBe("master-1");
      expect(input!.supplierId).toBe("sup-1");
      expect(input!.rawId).toBe("raw-1");
      expect(input!.stagedContent.canonical_title).toBe("Nitrile Gloves");
      expect(input!.stagedContent.supplier_sku).toBe("NG-100");
      expect(input!.stagedContent.supplier_cost).toBe(12.5);
      expect(input!.stagedContent.brand).toBe("Acme");
      expect(input!.categorySlug).toBe("disposable_gloves");
      expect(input!.stagedFilterAttributes).toEqual({ material: "nitrile", size: "m", color: "blue" });
    });

    it("uses attributes when normalized_data.filter_attributes missing", () => {
      const row = {
        supplier_id: "sup-1",
        raw_id: "raw-1",
        normalized_data: { canonical_title: "Gloves", supplier_sku: "X", supplier_cost: 0 },
        attributes: { material: "nitrile" },
      };
      const input = buildPublishInputFromStaged("n2", row, {});
      expect(input!.stagedFilterAttributes).toEqual({ material: "nitrile" });
    });

    it("uses normalized_case_cost for supplier_cost when present", () => {
      const row = {
        supplier_id: "sup-1",
        raw_id: "raw-1",
        normalized_data: {
          canonical_title: "Gloves",
          supplier_sku: "X",
          supplier_cost: 10,
          normalized_case_cost: 100,
          pricing: { sell_unit: "case", normalized_case_cost: 100 },
          category_slug: "disposable_gloves",
        },
        attributes: { material: "nitrile" },
      };
      const input = buildPublishInputFromStaged("n2", row, {});
      expect(input!.stagedContent.supplier_cost).toBe(100);
      expect(input!.pricingCaseCostUnavailable).toBeFalsy();
    });

    it("maps staged UPC/GTIN/EAN and MPN onto PublishInput for variant publish", () => {
      const row = {
        supplier_id: "sup-1",
        raw_id: "raw-1",
        normalized_data: {
          canonical_title: "Gloves",
          supplier_sku: "VAR-1",
          supplier_cost: 10,
          category_slug: "disposable_gloves",
          gtin: " 012345678905 ",
          manufacturer_part_number: "MPN-ABC",
        },
        attributes: { material: "nitrile" },
      };
      const input = buildPublishInputFromStaged("n-gtin", row, {});
      expect(input!.stagedContent.gtin).toBe("012345678905");
      expect(input!.stagedContent.mpn).toBe("MPN-ABC");
    });

    it("prefers normalized_data identifiers over duplicate attributes keys", () => {
      const row = {
        supplier_id: "sup-1",
        raw_id: "raw-1",
        normalized_data: {
          canonical_title: "Gloves",
          supplier_sku: "VAR-1",
          supplier_cost: 10,
          category_slug: "disposable_gloves",
          upc: "111111111111",
        },
        attributes: { upc: "222222222222", mpn: "ATTR-MPN" },
      };
      const input = buildPublishInputFromStaged("n-pref", row, {});
      expect(input!.stagedContent.gtin).toBe("111111111111");
      expect(input!.stagedContent.mpn).toBe("ATTR-MPN");
    });

    it("sets pricingCaseCostUnavailable when sell unit is case but normalized_case_cost missing", () => {
      const row = {
        supplier_id: "sup-1",
        raw_id: "raw-1",
        normalized_data: {
          canonical_title: "Gloves",
          supplier_sku: "X",
          supplier_cost: 10,
          normalized_case_cost: null,
          pricing: { sell_unit: "case", normalized_case_cost: null },
          category_slug: "disposable_gloves",
        },
        attributes: { material: "nitrile" },
      };
      const input = buildPublishInputFromStaged("n2", row, {});
      expect(input!.pricingCaseCostUnavailable).toBe(true);
      expect(input!.stagedContent.supplier_cost).toBe(10);
    });
  });

  describe("publishSafe integration", () => {
    it("blocks publish when required attributes missing (disposable_gloves)", () => {
      const r = publishSafe("disposable_gloves", { material: "nitrile" });
      expect(r.publishable).toBe(false);
      expect(r.error).toContain("missing required");
    });
    it("returns clear error listing missing required attributes", () => {
      const r = publishSafe("disposable_gloves", { material: "nitrile", size: "m" });
      expect(r.publishable).toBe(false);
      expect(r.error).toMatch(/Cannot publish|missing required/);
      expect(r.error).toContain("disposable_gloves");
      expect(r.error).toMatch(/color|brand|packaging|powder|grade/);
    });
    it("allows publish when required attributes present", () => {
      const attrs = {
        category: "disposable_gloves",
        material: "nitrile",
        size: "m",
        color: "blue",
        brand: "Acme",
        packaging: "case_1000_ct",
        powder: "powder_free",
        grade: "industrial_grade",
      };
      const r = publishSafe("disposable_gloves", attrs);
      expect(r.publishable).toBe(true);
    });
    it("allows publish when strongly preferred are missing (warn only)", () => {
      const attrs = {
        category: "disposable_gloves",
        material: "nitrile",
        size: "m",
        color: "blue",
        brand: "Acme",
        packaging: "case_1000_ct",
        powder: "powder_free",
        grade: "industrial_grade",
      };
      const r = publishSafe("disposable_gloves", attrs);
      expect(r.publishable).toBe(true);
    });
  });

  describe("runPublish", () => {
    const hasSupabase = !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY;

    it("returns error when required attributes missing (no DB write)", async () => {
      if (!hasSupabase) return;
      const result = await runPublish({
        normalizedId: "n1",
        stagedContent: { canonical_title: "G", supplier_sku: "S", supplier_cost: 10 },
        stagedFilterAttributes: { material: "nitrile" },
        categorySlug: "disposable_gloves",
        supplierId: "s1",
        rawId: "r1",
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/missing required|Cannot publish/);
    });
    it("returns error when pricingCaseCostUnavailable (case cost could not be computed)", async () => {
      const result = await runPublish({
        normalizedId: "n1",
        masterProductId: "master-1",
        stagedContent: { canonical_title: "G", supplier_sku: "S", supplier_cost: 10 },
        stagedFilterAttributes: {
          category: "disposable_gloves",
          material: "nitrile",
          size: "m",
          color: "blue",
          brand: "B",
          packaging: "case_1000_ct",
          powder: "powder_free",
          grade: "industrial_grade",
        },
        categorySlug: "disposable_gloves",
        supplierId: "s1",
        rawId: "r1",
        pricingCaseCostUnavailable: true,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/case only|Normalized case cost|cannot be computed/i);
    });

    it("returns error when neither masterProductId nor newProductPayload", async () => {
      if (!hasSupabase) return;
      const result = await runPublish({
        normalizedId: "n1",
        masterProductId: undefined,
        newProductPayload: undefined,
        stagedContent: { canonical_title: "G", supplier_sku: "S", supplier_cost: 10 },
        stagedFilterAttributes: {
          category: "disposable_gloves",
          material: "nitrile",
          size: "m",
          color: "blue",
          brand: "B",
          packaging: "case_1000_ct",
          powder: "powder_free",
          grade: "industrial_grade",
        },
        categorySlug: "disposable_gloves",
        supplierId: "s1",
        rawId: "r1",
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/masterProductId|newProductPayload|required/);
    });
  });

  describe("runPublish: attribute sync blocks snapshot (no silent drift)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("fails before snapshot when syncProductAttributesFromStaged returns errors; snapshot not invoked", async () => {
      const masterProductId = "11111111-1111-1111-1111-111111111111";
      const categoryId = "22222222-2222-2222-2222-222222222222";

      const syncSpy = vi.spyOn(productAttributeSync, "syncProductAttributesFromStaged").mockResolvedValue({
        errors: ["color: insert failed"],
        synced: 0,
      });
      const snapshotSpy = vi.spyOn(productAttributesSnapshot, "refreshProductAttributesJsonSnapshot").mockResolvedValue({
        ok: true,
      });

      const disposableAttrs = {
        category: "disposable_gloves",
        material: "nitrile",
        size: "m",
        color: "blue",
        brand: "Acme",
        packaging: "case_1000_ct",
        powder: "powder_free",
        grade: "industrial_grade",
      };

      vi.spyOn(catalogVariantIngest, "upsertCatalogVariantFromGloveIngest").mockResolvedValue({ ok: true });

      const adminMock = {
        schema: vi.fn(() => ({
          from: vi.fn((table: string) => {
            if (table !== "catalog_products") {
              throw new Error(`unexpected catalog_v2 table in runPublish mock: ${table}`);
            }
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: {
                  id: masterProductId,
                  internal_sku: "SKU-1",
                  slug: "slug-1",
                  name: "Glove",
                  description: null,
                  brand_id: null,
                },
                error: null,
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }),
        })),
      };

      const catalogosMock = {
        from: vi.fn((table: string) => {
          if (table === "categories") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: categoryId }, error: null }),
            };
          }
          throw new Error(`unexpected catalogos table in runPublish mock: ${table}`);
        }),
      };

      vi.spyOn(dbClient, "getSupabase").mockReturnValue(adminMock as never);
      vi.spyOn(dbClient, "getSupabaseCatalogos").mockReturnValue(catalogosMock as never);

      const result = await runPublish({
        normalizedId: "norm-attr-1",
        masterProductId,
        stagedContent: { canonical_title: "Glove", supplier_sku: "SKU-1", supplier_cost: 10 },
        stagedFilterAttributes: disposableAttrs,
        categorySlug: "disposable_gloves",
        supplierId: "sup-1",
        rawId: "raw-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/product_attributes sync failed/);
      expect(syncSpy).toHaveBeenCalledOnce();
      expect(snapshotSpy).not.toHaveBeenCalled();
    });
  });
});
