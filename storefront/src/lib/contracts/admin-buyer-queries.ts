/**
 * Shapes for **specific** Supabase selects in admin buyer intelligence —
 * not full table rows. Keeps pages independent of `Database` row typing.
 */

/** `getSpendAnalytics` join result: order_items + orders (+ resolved catalog id for rollups) */
export interface BuyerSpendOrderItemJoined {
  quantity: number | string;
  unit_price: number | string;
  product_id: number | string;
  canonical_product_id?: string | null;
  orders: {
    created_at: string;
    status: string;
  };
  products?: {
    name: string;
    category: string;
    brand: string;
  };
}
