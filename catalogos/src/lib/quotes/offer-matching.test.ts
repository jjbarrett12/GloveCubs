import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOffersForProduct } from "./offer-matching";

vi.mock("@/lib/db/client", () => ({
  getSupabaseCatalogos: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  }),
}));

describe("offer-matching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getOffersForProduct returns has_offers false when no rows", async () => {
    const result = await getOffersForProduct("product-uuid");
    expect(result.product_id).toBe("product-uuid");
    expect(result.has_offers).toBe(false);
    expect(result.best).toBeNull();
    expect(result.alternates).toEqual([]);
  });
});
