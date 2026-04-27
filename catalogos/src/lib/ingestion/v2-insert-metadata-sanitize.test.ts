import { describe, it, expect } from "vitest";
import { stripPricingKeysForV2ProductMetadata } from "./v2-insert-metadata-sanitize";

describe("stripPricingKeysForV2ProductMetadata", () => {
  it("removes top-level pricing keys and keeps merchandising", () => {
    const out = stripPricingKeysForV2ProductMetadata(
      { brand: "Acme", list_price: 19.99, import_auto_pricing: { tier_d_price: 1 } },
      { name: "Glove", pricing: { sell_unit: "case" }, category_slug: "disposable_gloves" }
    );
    expect(out.brand).toBe("Acme");
    expect(out.name).toBe("Glove");
    expect(out.category_slug).toBe("disposable_gloves");
    expect("list_price" in out).toBe(false);
    expect("pricing" in out).toBe(false);
    expect("import_auto_pricing" in out).toBe(false);
  });

  it("strips pricing keys from facet_attributes", () => {
    const out = stripPricingKeysForV2ProductMetadata(
      {},
      {
        facet_attributes: { color: "blue", list_price: 5, tier_d_price: 4 },
      }
    );
    const facet = out.facet_attributes as Record<string, unknown>;
    expect(facet.color).toBe("blue");
    expect("list_price" in facet).toBe(false);
    expect("tier_d_price" in facet).toBe(false);
  });
});
