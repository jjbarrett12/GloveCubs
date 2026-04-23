/**
 * Resolve CatalogOS / storefront catalog UUID for legacy public.order_items rows.
 * Prefer persisted canonical_product_id; fall back to catalogos.products.live_product_id → id mapping.
 */

export type OrderItemProductRefs = {
  canonical_product_id?: string | null;
  product_id?: number | string | null;
};

export function resolveOrderItemCatalogProductId(
  row: OrderItemProductRefs,
  liveProductIdToCatalogUuid: ReadonlyMap<number, string>
): string | null {
  if (row.canonical_product_id && typeof row.canonical_product_id === "string") {
    return row.canonical_product_id;
  }
  const pid = row.product_id;
  if (pid == null) return null;
  const n = typeof pid === "number" ? pid : Number(pid);
  if (!Number.isFinite(n)) return null;
  return liveProductIdToCatalogUuid.get(n) ?? null;
}
