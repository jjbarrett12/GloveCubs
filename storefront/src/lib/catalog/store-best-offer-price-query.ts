/**
 * Server read model for catalogos.product_best_offer_price (listing filter/sort + PDP bestPrice).
 * View is defined in catalogos schema — not public.
 */
export function catalogBestOfferPriceQuery(supabase: {
  schema: (name: string) => { from: (table: string) => any };
}): any {
  return supabase.schema("catalogos").from("product_best_offer_price");
}
