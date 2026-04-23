/**
 * Offer matching for RFQ line items: best and alternate supplier_offers per product.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

function offerPrice(row: { cost: number; sell_price?: number | null }): number {
  return row.sell_price != null && Number.isFinite(Number(row.sell_price)) ? Number(row.sell_price) : row.cost;
}

export interface MatchedOffer {
  offer_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_sku: string;
  cost: number;
  sell_price: number | null;
  display_price: number;
  lead_time_days: number | null;
}

export interface ProductOffersResult {
  product_id: string;
  best: MatchedOffer | null;
  alternates: MatchedOffer[];
  has_offers: boolean;
}

export async function getOffersForProduct(productId: string): Promise<ProductOffersResult> {
  const supabase = getSupabaseCatalogos(true);
  const { data: rows } = await supabase
    .from("supplier_offers")
    .select("id, supplier_id, supplier_sku, cost, sell_price, lead_time_days")
    .eq("product_id", productId)
    .eq("is_active", true);

  if (!rows?.length) {
    return { product_id: productId, best: null, alternates: [], has_offers: false };
  }

  const supplierIds = [...new Set((rows as { supplier_id: string }[]).map((r) => r.supplier_id))];
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .in("id", supplierIds);
  const supplierNames = new Map((suppliers ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));

  const offers: MatchedOffer[] = (rows as { id: string; supplier_id: string; supplier_sku: string; cost: number; sell_price: number | null; lead_time_days: number | null }[]).map((r) => ({
    offer_id: r.id,
    supplier_id: r.supplier_id,
    supplier_name: supplierNames.get(r.supplier_id) ?? "—",
    supplier_sku: r.supplier_sku,
    cost: r.cost,
    sell_price: r.sell_price,
    display_price: offerPrice(r),
    lead_time_days: r.lead_time_days,
  }));

  offers.sort((a, b) => a.display_price - b.display_price);
  const best = offers[0] ?? null;
  const alternates = offers.slice(1);

  return { product_id: productId, best, alternates, has_offers: true };
}

export async function getOffersForQuoteLineItems(productIds: string[]): Promise<Map<string, ProductOffersResult>> {
  const results = await Promise.all(productIds.map((id) => getOffersForProduct(id)));
  return new Map(results.map((r) => [r.product_id, r]));
}
