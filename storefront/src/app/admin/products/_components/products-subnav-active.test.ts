import { describe, expect, it } from "vitest";
import {
  isProductsSubnavAllProductsActive,
  isProductsSubnavHrefActive,
} from "@/app/admin/products/_components/products-subnav-active";

describe("products subnav active state", () => {
  it("marks All products for list and detail only", () => {
    expect(isProductsSubnavAllProductsActive("/admin/products")).toBe(true);
    expect(isProductsSubnavAllProductsActive("/admin/products/new")).toBe(true);
    expect(isProductsSubnavAllProductsActive("/admin/products/aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee/edit")).toBe(true);
    expect(isProductsSubnavAllProductsActive("/admin/products/import")).toBe(false);
    expect(isProductsSubnavAllProductsActive("/admin/products/review")).toBe(false);
    expect(isProductsSubnavAllProductsActive("/admin/products/catalog-health")).toBe(false);
  });

  it("marks Import for import subtree", () => {
    expect(isProductsSubnavHrefActive("/admin/products/import", "/admin/products/import")).toBe(true);
    expect(isProductsSubnavHrefActive("/admin/products/import/jobs/1", "/admin/products/import")).toBe(true);
    expect(isProductsSubnavHrefActive("/admin/products/review", "/admin/products/import")).toBe(false);
  });

  it("marks Review queue and Catalog health by prefix", () => {
    expect(isProductsSubnavHrefActive("/admin/products/review", "/admin/products/review")).toBe(true);
    expect(isProductsSubnavHrefActive("/admin/products/review/x", "/admin/products/review")).toBe(true);
    expect(isProductsSubnavHrefActive("/admin/products/catalog-health", "/admin/products/catalog-health")).toBe(true);
  });
});
