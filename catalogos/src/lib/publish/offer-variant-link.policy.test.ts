import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const PUBLISH = path.resolve(__dirname, "publish-service.ts");
const VARIANT_GROUP = path.resolve(__dirname, "publish-variant-group.ts");
const INGEST = path.resolve(__dirname, "catalog-variant-ingest.ts");

describe("CatalogOS publish writes explicit variant relationship", () => {
  it("publish-service keeps supplier_sku and only writes resolved catalog_variant_id", () => {
    const src = readFileSync(PUBLISH, "utf8");
    expect(src).toContain("withResolvedCatalogVariantId");
    expect(src).toContain("supplier_sku: input.stagedContent.supplier_sku");
    expect(src).toContain("catalogVariantId = vr.catalogVariantId");
  });

  it("variant-group publish keeps supplier_sku and only writes resolved catalog_variant_id", () => {
    const src = readFileSync(VARIANT_GROUP, "utf8");
    expect(src).toContain("withResolvedCatalogVariantId");
    expect(src).toContain("supplier_sku: supplierSku");
  });

  it("variant ingest returns catalogVariantId", () => {
    const src = readFileSync(INGEST, "utf8");
    expect(src).toContain("catalogVariantId: string");
    expect(src).toContain("return { ok: true, catalogVariantId:");
  });
});
