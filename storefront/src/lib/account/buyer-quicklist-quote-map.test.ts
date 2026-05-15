import { describe, expect, it } from "vitest";
import { buyerQuicklistRowToQuoteCartLine, type BuyerQuicklistRow } from "./buyer-quicklist-read-model";

const baseRow: BuyerQuicklistRow = {
  id: "ql-1",
  catalog_product_id: "p1",
  catalog_variant_id: "v1",
  product_name: "Nitrile glove",
  product_slug: "nitrile-glove",
  brand_name: "Acme",
  variant_sku: "SKU-1",
  size_code: "L",
  product_status: "active",
  variant_is_active: true,
  sort_order: 0,
  availability: "available",
  availability_note: null,
};

describe("buyerQuicklistRowToQuoteCartLine", () => {
  it("maps catalog ids and display fields without price fields", () => {
    const line = buyerQuicklistRowToQuoteCartLine(baseRow);
    expect(line).toEqual({
      product_id: "p1",
      name: "Nitrile glove",
      slug: "nitrile-glove",
      brandName: "Acme",
      catalog_variant_id: "v1",
      variant_sku: "SKU-1",
      size_code: "L",
      line_note: null,
    });
    expect(line).not.toHaveProperty("price");
    expect(line).not.toHaveProperty("company_id");
  });
});
