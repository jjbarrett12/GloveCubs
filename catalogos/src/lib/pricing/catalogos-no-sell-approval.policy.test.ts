import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "path";

const REVIEW = path.resolve(__dirname, "../../app/actions/review.ts");
const DETAIL = path.resolve(__dirname, "../../components/review/StagedProductDetail.tsx");
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
});
