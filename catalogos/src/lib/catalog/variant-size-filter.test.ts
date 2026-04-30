/**
 * Variant-driven size filtering: OR within sizes, AND with PA facets; no size via product_attributes.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAllFilterableFacetKeys } from "@/lib/product-types";

const mockCatalogFrom = vi.fn();
const mockAdminSchemaFrom = vi.fn();

vi.mock("@/lib/db/client", () => ({
  getSupabaseCatalogos: () => ({ from: (...a: unknown[]) => mockCatalogFrom(...a) }),
  getSupabase: () => ({
    schema: (name: string) => ({
      from: (...a: unknown[]) => mockAdminSchemaFrom(name, ...a),
    }),
  }),
}));

describe("variant size catalog filters", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    mockCatalogFrom.mockImplementation(() => {
      throw new Error("unexpected catalogos.from in this test");
    });
  });

  it("registry PA facet keys omit size (size is variant-only)", () => {
    expect(getAllFilterableFacetKeys()).not.toContain("size");
  });

  it("query.ts and facets.ts do not resolve size via getAttributeDefinitionIdsByKey", () => {
    const dir = join(__dirname);
    const q = readFileSync(join(dir, "query.ts"), "utf8");
    const f = readFileSync(join(dir, "facets.ts"), "utf8");
    expect(q).not.toMatch(/getAttributeDefinitionIdsByKey\(\s*["']size["']/);
    expect(f).not.toMatch(/getAttributeDefinitionIdsByKey\(\s*["']size["']/);
  });

  it("size=S returns parent ids with active matching variants", async () => {
    mockAdminSchemaFrom.mockImplementation((_schema: string, table: string) => {
      expect(table).toBe("catalog_variants");
      return {
        select: () => ({
          eq: () => ({
            not: () => ({
              in: (_col: string, codes: string[]) => {
                expect(codes).toEqual(expect.arrayContaining(["S", "s"]));
                return {
                  limit: () =>
                    Promise.resolve({
                      data: [{ catalog_product_id: "parent-s" }],
                      error: null,
                    }),
                };
              },
            }),
          }),
        }),
      };
    });

    const { getFilteredProductIds } = await import("./query");
    const ids = await getFilteredProductIds({ size: ["S"] });
    expect(ids).toEqual(new Set(["parent-s"]));
    expect(mockCatalogFrom).not.toHaveBeenCalled();
  });

  it("size=S,M uses OR (union of parent ids)", async () => {
    mockAdminSchemaFrom.mockImplementation((_schema: string, table: string) => {
      expect(table).toBe("catalog_variants");
      return {
        select: () => ({
          eq: () => ({
            not: () => ({
              in: (_col: string, codes: string[]) => {
                expect(new Set(codes)).toEqual(new Set(["S", "s", "M", "m"]));
                return {
                  limit: () =>
                    Promise.resolve({
                      data: [{ catalog_product_id: "a" }, { catalog_product_id: "b" }],
                      error: null,
                    }),
                };
              },
            }),
          }),
        }),
      };
    });

    const { getFilteredProductIds } = await import("./query");
    const ids = await getFilteredProductIds({ size: ["S", "M"] });
    expect(ids).toEqual(new Set(["a", "b"]));
  });

  it("size intersects with material (PA) filter", async () => {
    mockCatalogFrom.mockImplementation((table: string) => {
      if (table === "attribute_definitions") {
        return {
          select: () => ({
            in: () => ({
              limit: () =>
                Promise.resolve({
                  data: [{ id: "def-m", attribute_key: "material" }],
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "product_attributes") {
        return {
          select: () => ({
            in: () => ({
              in: () => ({
                limit: () =>
                  Promise.resolve({
                    data: [{ product_id: "p1" }, { product_id: "p2" }],
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          in: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      };
    });
    mockAdminSchemaFrom.mockImplementation((_schema: string, table: string) => {
      expect(table).toBe("catalog_variants");
      return {
        select: () => ({
          eq: () => ({
            not: () => ({
              in: () => ({
                limit: () =>
                  Promise.resolve({
                    data: [{ catalog_product_id: "p1" }],
                    error: null,
                  }),
              }),
            }),
          }),
        }),
      };
    });

    const { getFilteredProductIds } = await import("./query");
    const ids = await getFilteredProductIds({ material: ["nitrile"], size: ["S"] });
    expect(ids).toEqual(new Set(["p1"]));
  });
});
