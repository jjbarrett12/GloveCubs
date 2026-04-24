/**
 * Hand-maintained Supabase `Database` shape + strict row types for hot paths.
 *
 * Full introspection belongs in `database.from-remote.ts` (run `npm run gen:db-types` from repo root).
 * This file stays as a **permissive** fallback so the storefront compiles when the remote file is absent.
 *
 * Do not use `Database["public"]["Tables"][*]["Row"]` in UI code — import row types from
 * `@/lib/contracts` or `@/lib/supabase/database.manual` explicit exports only.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** One row of JSON stored in `gc_commerce.carts.items` (server-side cart; see dataService). */
export interface CartItemStored {
  id: number | string;
  product_id: number;
  size?: string | null;
  quantity: number;
  /** Catalog master UUID when known (aligns with order_items.canonical_product_id). */
  canonical_product_id?: string | null;
}

type GenericRelation = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
};

/**
 * Permissive: every `.from("…")` is typed with `Record<string, unknown>` rows.
 * Prefer Zod + `@/lib/contracts` at API boundaries and explicit row types below for commerce.
 */
export interface Database {
  public: {
    Tables: {
      [table_name: string]: GenericRelation;
    };
    Views: {
      [view_name: string]: {
        Row: Record<string, unknown>;
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// --- Strict slices (commerce + catalog read surface) — align with supabase/migrations ---

export interface CanonicalProductRow {
  id: string;
  name: string;
  title: string | null;
  sku: string;
  category_id: string | null;
  category: string | null;
  brand_id: string | null;
  description: string | null;
  attributes: Json;
  material: string | null;
  glove_type: string | null;
  size: string | null;
  color: string | null;
  pack_size: number | null;
  product_line_code?: string;
  family_id?: string | null;
  is_listing_primary?: boolean;
  search_vector: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: number;
  order_id: number;
  product_id: number;
  canonical_product_id: string | null;
  quantity: number;
  size: string | null;
  unit_price: number;
  created_at: string;
}

export interface OrdersRow {
  id: number;
  user_id: number;
  order_number: string;
  status: string;
  payment_method: string | null;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  shipping_address: Json | null;
  ship_to_id: number | null;
  notes: string | null;
  stripe_payment_intent_id: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  created_at: string;
  updated_at: string;
  /** gc_commerce.orders.company_id; not public.users.company_id (removed by structural cleanup). */
  company_id: string | null;
  /** gc_commerce.orders placer (auth UUID string in production). */
  placed_by_user_id: string | null;
  inventory_reserved_at: string | null;
  inventory_released_at: string | null;
  inventory_deducted_at: string | null;
  buyer_id?: string | null;
  facility?: string | null;
  department?: string | null;
  total_amount?: number | null;
}

export interface InventoryRow {
  id: number;
  /** Legacy live_product_id (public.products.id) when present; API may derive from legacy listing live_product_id. */
  product_id?: number | null;
  canonical_product_id: string | null;
  quantity_on_hand: number;
  quantity_reserved: number;
  reorder_point: number | null;
  updated_at: string;
  bin_location?: string | null;
  last_count_at?: string | null;
  incoming_quantity?: number;
}

/** gc_commerce.carts (no bigint id required; match server upsert shape). */
export interface CartsRow {
  cart_key: string;
  items: Json;
  updated_at: string;
  user_id?: string | null;
  company_id?: string | null;
}

export interface ProductsRow {
  id: number;
  sku: string;
  name: string | null;
  brand: string | null;
  cost: number | null;
  image_url: string | null;
  manufacturer_id: number | null;
  created_at: string | null;
  updated_at: string | null;
  slug?: string | null;
  price?: number | null;
  bulk_price?: number | null;
  in_stock?: number | null;
  featured?: number | null;
}
