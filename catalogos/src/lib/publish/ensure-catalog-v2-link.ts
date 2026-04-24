/**
 * catalog_v2 is the only product SoT. Upsert gc_commerce.sellable_products for a v2 parent id.
 * catalogos.products listing table is removed from the runtime path.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/db/client";

/** Matches supabase/migrations/20260331100002_catalog_v2_legacy_migration_prereqs.sql */
export const CATALOG_V2_LEGACY_GLOVE_PRODUCT_TYPE_ID = "b1111111-1111-4111-8111-111111111111";

export type EnsureCatalogV2Result = { ok: true; catalogProductId: string } | { ok: false; message: string };

export async function upsertSellableForCatalogV2Product(
  catalogProductId: string,
  row: {
    name: string;
    internalSku: string;
    listPriceMinor: number | null;
    isActive: boolean;
  }
): Promise<EnsureCatalogV2Result> {
  const publicDb = getSupabase(true);
  const gc = publicDb.schema("gc_commerce");
  const now = new Date().toISOString();

  const { error: sellErr } = await gc.from("sellable_products").upsert(
    {
      sku: row.internalSku,
      display_name: row.name,
      catalog_product_id: catalogProductId,
      currency_code: "USD",
      list_price_minor: row.listPriceMinor,
      is_active: row.isActive,
      updated_at: now,
    },
    { onConflict: "sku" }
  );

  if (sellErr) {
    return { ok: false, message: `gc_commerce.sellable_products upsert: ${sellErr.message}` };
  }

  return { ok: true, catalogProductId };
}

/** @deprecated Listing bridge removed — use upsertSellableForCatalogV2Product after v2 write. */
export async function ensureCatalogV2ProductForListing(
  _catalogos: SupabaseClient,
  _listingProductId: string
): Promise<EnsureCatalogV2Result> {
  return {
    ok: false,
    message: "ensureCatalogV2ProductForListing removed: publish writes catalog_v2.catalog_products directly.",
  };
}
