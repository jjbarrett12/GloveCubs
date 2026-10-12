/**
 * Public/customer offer DTOs — supplier cost never leaves the server.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import type { ProductOffersSummary } from "./types";

export function publicSellPrice(row: { sell_price?: number | null }): number | null {
  return row.sell_price != null && Number.isFinite(row.sell_price) ? row.sell_price : null;
}

export function toPublicOffersSummaryFromRows(
  productId: string,
  rows: Array<{
    supplier_id: string;
    supplier_sku: string;
    sell_price?: number | null;
    lead_time_days: number | null;
  }>,
): ProductOffersSummary {
  const offers = rows.map((r) => ({
    supplier_id: r.supplier_id,
    supplier_sku: r.supplier_sku,
    sell_price: publicSellPrice(r),
    lead_time_days: r.lead_time_days,
  }));
  const prices = offers.map((o) => o.sell_price).filter((n): n is number => n != null);
  return {
    product_id: productId,
    offers,
    best_price: prices.length ? Math.min(...prices) : 0,
    offer_count: offers.length,
  };
}

export async function toPublicOffersSummary(productId: string): Promise<ProductOffersSummary> {
  const supabase = getSupabaseCatalogos(true);
  const { data: rows } = await supabase
    .from("supplier_offers")
    .select("supplier_id, supplier_sku, sell_price, lead_time_days")
    .eq("product_id", productId)
    .eq("is_active", true);
  return toPublicOffersSummaryFromRows(
    productId,
    (rows ?? []) as Array<{
      supplier_id: string;
      supplier_sku: string;
      sell_price?: number | null;
      lead_time_days: number | null;
    }>,
  );
}

export function publicDtoContainsCost(payload: unknown): boolean {
  return JSON.stringify(payload).includes('"cost"');
}
