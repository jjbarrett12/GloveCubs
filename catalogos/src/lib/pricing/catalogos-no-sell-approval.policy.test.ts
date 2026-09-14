import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "path";

const REVIEW = path.resolve(__dirname, "../../app/actions/review.ts");
const DETAIL = path.resolve(__dirname, "../../components/review/StagedProductDetail.tsx");
const CSV_MAP = path.resolve(__dirname, "../../components/bulk-add/CsvMapAndImport.tsx");
const BULK_CSV = path.resolve(__dirname, "../../app/actions/bulk-csv-add.ts");
const QUICK_ADD_CLIENT = path.resolve(__dirname, "../../components/quick-add/QuickAddPageClient.tsx");
const ADMIN_ROUTE = path.resolve(
  __dirname,
  "../../../../storefront/src/app/admin/api/products/[productId]/offer-variant-map/route.ts"
);

describe("CatalogOS cannot verify published list via Sell", () => {
  it("review offer admin rejects sell_price and does not call withOperatorApprovedSellPrice", () => {
    const review = readFileSync(REVIEW, "utf8");
    expect(review).toContain("CatalogOS cannot approve or edit published list");
    expect(review).not.toContain("withOperatorApprovedSellPrice");
    expect(review).not.toContain("validatePublishedListApproval");
    expect(review).not.toContain("sell_price_verified_at");
  });

  it("CatalogOS review UI has no Sell input that writes sell_price", () => {
    const detail = readFileSync(DETAIL, "utf8");
    expect(detail).not.toMatch(/label[^>]*>Sell</);
    expect(detail).not.toMatch(/sell_price:/);
    expect(detail).toContain("Landed case cost (USD)");
    expect(detail).toContain("Published list is approved in storefront admin");
  });

  it("storefront OfferVariantMapPanel remains the explicit list approval path", () => {
    const route = readFileSync(ADMIN_ROUTE, "utf8");
    expect(route).toContain("validatePublishedListApproval");
    expect(route).toContain("withOperatorApprovedSellPrice");
    expect(route).toContain("sellPrice");
  });

  it("CSV bulk import does not auto-map generic price or approve list", () => {
    const map = readFileSync(CSV_MAP, "utf8");
    const bulk = readFileSync(BULK_CSV, "utf8");
    expect(map).toContain("guessCsvLandedCostColumnIndex");
    expect(map).toContain("cost_column_header");
    expect(map).not.toContain('"price", "unit_cost"');
    expect(bulk).toContain("csvCostMappingTrust");
    expect(bulk).toContain("landed_cost_trusted");
    expect(bulk).not.toMatch(/sell_price/);
  });

  it("Quick Add create-master does not require import_auto_pricing", () => {
    const src = readFileSync(QUICK_ADD_CLIENT, "utf8");
    expect(src).not.toContain("import_auto_pricing");
    expect(src).not.toContain("effectiveImportPricing");
    expect(src).toContain("list_price_minor: 0");
  });
});
