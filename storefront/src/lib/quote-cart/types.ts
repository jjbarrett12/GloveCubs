export type QuoteCartSellUnit = "case" | "pallet";

export type QuoteCartItem = {
  /** catalog_v2.catalog_products.id */
  product_id: string;
  name: string;
  slug: string;
  brandName: string | null;
  quantity: number;
  /** Buyer note for this line (merged key with product + variant). */
  line_note?: string | null;
  /** catalog_v2.catalog_variants.id — when set, line merges on variant, not product-only. */
  catalog_variant_id?: string | null;
  variant_sku?: string | null;
  size_code?: string | null;
  /** Customer-facing sell unit; omitted legacy lines default to case. */
  sell_unit?: QuoteCartSellUnit;
  unit_price_major?: number | null;
  units_per_case?: number | null;
  cases_per_pallet?: number | null;
  units_per_pallet?: number | null;
  unit_noun?: "gloves" | "pairs" | "units";
  commerce_summary?: string | null;
  line_unit_label?: string | null;
};

export const QUOTE_CART_STORAGE_KEY = "glovecubs-quote-cart-v1";
