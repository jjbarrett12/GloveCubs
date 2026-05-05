export type QuoteCartItem = {
  /** catalog_v2.catalog_products.id */
  product_id: string;
  name: string;
  slug: string;
  brandName: string | null;
  quantity: number;
};

export const QUOTE_CART_STORAGE_KEY = "glovecubs-quote-cart-v1";
