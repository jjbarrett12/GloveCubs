import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTE = join(__dirname, "route.ts");

describe("admin sku-collisions route", () => {
  it("gates on getAdminUser and returns 401", () => {
    const s = readFileSync(ROUTE, "utf8");
    expect(s).toContain("getAdminUser");
    expect(s).toContain("401");
  });

  it("is read-only (GET only, no mutations)", () => {
    const s = readFileSync(ROUTE, "utf8");
    expect(s).toContain("export async function GET");
    expect(s).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP)\b/);
  });

  it("supports parentSku, variantSkus, excludeProductId, excludeVariantIds", () => {
    const s = readFileSync(ROUTE, "utf8");
    expect(s).toContain("parentSku");
    expect(s).toContain("variantSkus");
    expect(s).toContain("excludeProductId");
    expect(s).toContain("excludeVariantIds");
  });
});
