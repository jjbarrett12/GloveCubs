/**
 * Sellable catalog for invoice recommendations — must match gc_commerce.sellable_products
 * (same purchasable SKU layer as checkout), not glove_products.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type SellableCatalogItem = {
  sku: string;
  displayName: string;
  listPriceCents: number;
  /** gc_commerce.sellable_products.id */
  optionalInternalId?: string;
};

type SellableRow = {
  id: string;
  sku: string;
  display_name: string;
  list_price_minor: number | string | null;
};

function toMinorInt(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * Loads active sellable products with a usable list price for comparison.
 * @throws When Supabase returns an error (caller maps to 503).
 */
export async function fetchSellableCatalogForInvoice(
  supabase: SupabaseClient<Database>
): Promise<SellableCatalogItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- gc_commerce not on Database generic
  const sb = supabase as any;
  const { data, error } = await sb
    .schema("gc_commerce")
    .from("sellable_products")
    .select("id, sku, display_name, list_price_minor")
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message || "sellable_products query failed");
  }

  const rows = (data ?? []) as SellableRow[];
  const out: SellableCatalogItem[] = [];

  for (const row of rows) {
    const sku = typeof row.sku === "string" ? row.sku.trim() : "";
    const displayName = typeof row.display_name === "string" ? row.display_name.trim() : "";
    const minor = toMinorInt(row.list_price_minor);
    if (!sku || !displayName || minor === null) continue;

    out.push({
      sku,
      displayName,
      listPriceCents: minor,
      optionalInternalId: row.id,
    });
  }

  return out;
}
