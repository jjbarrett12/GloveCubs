export type QuoteCartItem = {
  /** catalog_v2.catalog_products.id */
  product_id: string;
  name: string;
  slug: string;
  brandName: string | null;
  quantity: number;
  /** catalog_v2.catalog_variants.id — when set, line merges on variant, not product-only. */
  catalog_variant_id?: string | null;
  variant_sku?: string | null;
  size_code?: string | null;
};

export const QUOTE_CART_STORAGE_KEY = "glovecubs-quote-cart-v1";
