/**
 * Permissive Supabase `Database` typing for CatalogOS until `database.from-remote.ts` is generated.
 * `getSupabaseCatalogos()` uses schema `catalogos`; `getSupabase()` uses `public`.
 *
 * Do not use `Row` from here in UI — use `@/lib/contracts` query DTOs where added.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type GenericRelation = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
};

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
  catalogos: {
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

/** `catalogos.products` master row (core columns + common extensions). */
export interface CatalogosProductRow {
  id: string;
  sku: string;
  name: string;
  category_id: string;
  brand_id: string | null;
  description: string | null;
  attributes: Json;
  is_active: boolean;
  published_at: string | null;
  live_product_id: number | null;
  created_at: string;
  updated_at: string;
  slug?: string | null;
  family_id?: string | null;
}
