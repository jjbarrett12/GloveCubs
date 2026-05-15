/**
 * Buyer-facing company glove quicklist — gc_commerce.company_quicklist_items only.
 * Server-only. No procurement_reorder_memory, saved_lists, product_favorites, or price truth.
 */

import type { QuoteCartItem } from "@/lib/quote-cart/types";

export type BuyerQuicklistAvailability = "available" | "product_inactive" | "variant_inactive" | "unavailable";

export type BuyerQuicklistRow = {
  id: string;
  catalog_product_id: string;
  catalog_variant_id: string;
  product_name: string;
  product_slug: string;
  brand_name: string | null;
  variant_sku: string;
  size_code: string | null;
  product_status: string;
  variant_is_active: boolean;
  sort_order: number;
  availability: BuyerQuicklistAvailability;
  availability_note: string | null;
};

function resolveAvailability(
  product: { status: string } | undefined,
  variant: { is_active: boolean } | undefined
): { availability: BuyerQuicklistAvailability; availability_note: string | null } {
  if (!product || !variant) {
    return {
      availability: "unavailable",
      availability_note: "This catalog row is no longer available. Ask your GloveCubs contact to refresh the list.",
    };
  }
  if (product.status !== "active") {
    return { availability: "product_inactive", availability_note: "Product is not active in the catalog." };
  }
  if (!variant.is_active) {
    return { availability: "variant_inactive", availability_note: "This size/SKU variant is not active in the catalog." };
  }
  return { availability: "available", availability_note: null };
}

export function buyerQuicklistRowToQuoteCartLine(row: BuyerQuicklistRow): Omit<QuoteCartItem, "quantity"> {
  return {
    product_id: row.catalog_product_id,
    name: row.product_name,
    slug: row.product_slug,
    brandName: row.brand_name,
    catalog_variant_id: row.catalog_variant_id,
    variant_sku: row.variant_sku,
    size_code: row.size_code,
    line_note: null,
  };
}

export async function fetchBuyerQuicklistForCompany(
  supabase: any,
  companyId: string
): Promise<{ rows: BuyerQuicklistRow[]; error: string | null }> {
  const { data: items, error: iErr } = await supabase
    .schema("gc_commerce")
    .from("company_quicklist_items")
    .select("id, catalog_product_id, catalog_variant_id, sort_order, created_at")
    .eq("company_id", companyId)
    .is("valid_to", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (iErr) {
    return { rows: [], error: iErr.message };
  }

  const list = (items ?? []) as Array<{
    id: string;
    catalog_product_id: string;
    catalog_variant_id: string;
    sort_order: number;
    created_at: string;
  }>;

  if (list.length === 0) {
    return { rows: [], error: null };
  }

  const productIds = Array.from(new Set(list.map((r) => r.catalog_product_id)));
  const variantIds = Array.from(new Set(list.map((r) => r.catalog_variant_id)));

  const [{ data: products }, { data: variants }] = await Promise.all([
    supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, name, slug, status, brand_id")
      .in("id", productIds),
    supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("id, catalog_product_id, variant_sku, size_code, is_active")
      .in("id", variantIds),
  ]);

  const productById = new Map(
    ((products ?? []) as { id: string; name: string; slug: string; status: string; brand_id: string | null }[]).map(
      (p) => [p.id, p]
    )
  );
  const variantById = new Map(
    (
      (variants ?? []) as {
        id: string;
        catalog_product_id: string;
        variant_sku: string;
        size_code: string | null;
        is_active: boolean;
      }[]
    ).map((v) => [v.id, v])
  );

  const brandIds = Array.from(
    new Set(
      ((products ?? []) as { brand_id: string | null }[])
        .map((p) => p.brand_id)
        .filter((x): x is string => Boolean(x))
    )
  );
  const brandMap = new Map<string, string>();
  if (brandIds.length > 0) {
    const { data: brands } = await supabase.schema("catalogos").from("brands").select("id, name").in("id", brandIds);
    for (const b of (brands ?? []) as { id: string; name: string }[]) {
      brandMap.set(b.id, b.name);
    }
  }

  const rows: BuyerQuicklistRow[] = list.map((it) => {
    const p = productById.get(it.catalog_product_id);
    const v = variantById.get(it.catalog_variant_id);
    const product_name = p?.name?.trim() ? p.name : "Unknown product";
    const product_slug = p?.slug ?? "";
    const product_status = p?.status ?? "unknown";
    const variant_is_active = v?.is_active ?? false;
    const variant_sku = v?.variant_sku ?? "—";
    const size_code = v?.size_code ?? null;
    const brand_name = p?.brand_id ? brandMap.get(p.brand_id) ?? null : null;
    const { availability, availability_note } = resolveAvailability(p, v);

    return {
      id: it.id,
      catalog_product_id: it.catalog_product_id,
      catalog_variant_id: it.catalog_variant_id,
      product_name,
      product_slug,
      brand_name,
      variant_sku,
      size_code,
      product_status,
      variant_is_active,
      sort_order: it.sort_order,
      availability,
      availability_note,
    };
  });

  return { rows, error: null };
}
