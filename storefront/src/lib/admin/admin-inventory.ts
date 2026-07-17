import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Legacy product-level inventory (public.inventory) is read-only compatibility.
 * All warehouse writes go through catalog_v2.variant_inventory + variant_stock_history.
 */
import { adjustAdminVariantInventory } from "@/lib/admin/admin-variant-inventory";
import { resolveSingleStockedVariantForProduct } from "@/lib/admin/variant-fulfillment-admin";

const V2 = "catalog_v2";
const COS = "catalogos";
const GC = "gc_commerce";

const CANONICAL_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminInventoryRow = {
  product_id: string;
  canonical_product_id: string | null;
  sku: string;
  name: string;
  brand: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  available_stock: number;
  reorder_point: number;
  bin_location: string;
  last_count_at: string | null;
};

export type AdminInventoryStock = {
  stock_on_hand: number;
  stock_reserved: number;
  available_stock: number;
};

export type AdminInventoryAdjustInput = {
  product_id: string;
  delta: number;
  reason?: string;
};

export const INVENTORY_CANONICAL_REQUIRED = "INVENTORY_CANONICAL_REQUIRED";
export const VARIANT_SELECTION_REQUIRED = "VARIANT_SELECTION_REQUIRED";

export function normalizeCanonicalUuidInput(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (!s || !CANONICAL_UUID_RE.test(s)) return null;
  return s.toLowerCase();
}

function pickSellableForListing(rows: { sku?: string | null }[]): { sku?: string | null } | null {
  const list = (rows || []).filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0]!;
  return list.slice().sort((a, b) => String(a.sku || "").localeCompare(String(b.sku || "")))[0]!;
}

function inventoryRowsByCanonicalProductId(
  inventoryList: Record<string, unknown>[],
): Map<string, Record<string, unknown>> {
  const byCanon = new Map<string, Record<string, unknown>>();
  for (const row of inventoryList || []) {
    const key = normalizeCanonicalUuidInput(row.canonical_product_id);
    if (key) byCanon.set(key, row);
  }
  return byCanon;
}

async function loadBrandNamesByIds(
  supabase: SupabaseClient,
  brandIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(brandIds.filter(Boolean))];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase.schema(COS).from("brands").select("id, name").in("id", ids);
  if (error) throw error;
  for (const row of data ?? []) {
    map.set(String(row.id), row.name != null ? String(row.name) : "");
  }
  return map;
}

async function fetchActiveSellableMap(
  supabase: SupabaseClient,
  catalogIds: string[],
): Promise<Map<string, { sku?: string | null }>> {
  const ids = [...new Set(catalogIds.map((id) => String(id).trim()).filter(Boolean))];
  const map = new Map<string, { sku?: string | null }>();
  if (ids.length === 0) return map;

  const { data, error } = await supabase
    .schema(GC)
    .from("sellable_products")
    .select("catalog_product_id, sku")
    .in("catalog_product_id", ids)
    .eq("is_active", true);
  if (error) throw error;

  const groups = new Map<string, { sku?: string | null }[]>();
  for (const row of data ?? []) {
    const cid = String(row.catalog_product_id);
    const list = groups.get(cid) ?? [];
    list.push(row);
    groups.set(cid, list);
  }
  for (const [cid, rows] of groups) {
    const sp = pickSellableForListing(rows);
    if (sp) map.set(cid, sp);
  }
  return map;
}

async function resolveListingProduct(
  supabase: SupabaseClient,
  listingId: string,
): Promise<{ id: string; sku: string; name: string; brand: string; catalog_v2_product_id: string | null } | null> {
  const { data: product, error } = await supabase
    .schema(V2)
    .from("catalog_products")
    .select("id, internal_sku, name, brand_id")
    .eq("id", listingId)
    .maybeSingle();
  if (error) throw error;
  if (!product) return null;

  const sellableMap = await fetchActiveSellableMap(supabase, [String(product.id)]);
  if (!sellableMap.has(String(product.id))) return null;

  const brandById = await loadBrandNamesByIds(supabase, [product.brand_id != null ? String(product.brand_id) : ""]);
  const brand = product.brand_id != null ? brandById.get(String(product.brand_id)) ?? "" : "";

  return {
    id: String(product.id),
    sku: product.internal_sku != null ? String(product.internal_sku) : "",
    name: product.name != null ? String(product.name) : "",
    brand,
    catalog_v2_product_id: normalizeCanonicalUuidInput(product.id),
  };
}

/** List inventory rows (mirrors Express GET /api/admin/inventory). */
export async function fetchAdminInventory(
  supabase: SupabaseClient,
): Promise<{ rows: AdminInventoryRow[]; error: string | null; status: number }> {
  const { data: catalogProducts, error: productsErr } = await supabase
    .schema(V2)
    .from("catalog_products")
    .select("id, internal_sku, name, brand_id")
    .eq("status", "active")
    .order("internal_sku", { ascending: true })
    .limit(10000);

  if (productsErr) {
    return { rows: [], error: productsErr.message, status: 500 };
  }

  const normalized = catalogProducts ?? [];
  const brandById = await loadBrandNamesByIds(
    supabase,
    normalized.map((p) => (p.brand_id != null ? String(p.brand_id) : "")).filter(Boolean),
  );
  const sellableMap = await fetchActiveSellableMap(
    supabase,
    normalized.map((p) => String(p.id)),
  );

  const products = normalized
    .filter((p) => sellableMap.has(String(p.id)))
    .map((p) => {
      const idStr = String(p.id);
      const brand = p.brand_id != null ? brandById.get(String(p.brand_id)) ?? "" : "";
      return {
        id: idStr,
        sku: p.internal_sku != null ? String(p.internal_sku) : "",
        name: p.name != null ? String(p.name) : "",
        brand,
        catalog_v2_product_id: normalizeCanonicalUuidInput(idStr),
      };
    });

  const { data: invList, error: invErr } = await supabase.from("inventory").select("*");
  if (invErr) {
    return { rows: [], error: invErr.message, status: 500 };
  }

  const byCanon = inventoryRowsByCanonicalProductId((invList ?? []) as Record<string, unknown>[]);
  const rows: AdminInventoryRow[] = products.map((p) => {
    const canonKey = normalizeCanonicalUuidInput(p.catalog_v2_product_id);
    const inv = canonKey ? byCanon.get(canonKey) : null;
    const onHand = inv ? Number(inv.quantity_on_hand ?? 0) : 0;
    const reserved = inv ? Number(inv.quantity_reserved ?? 0) : 0;
    const available = Math.max(0, onHand - reserved);
    return {
      product_id: p.id,
      canonical_product_id: inv?.canonical_product_id != null
        ? normalizeCanonicalUuidInput(inv.canonical_product_id)
        : canonKey,
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      quantity_on_hand: onHand,
      quantity_reserved: reserved,
      available_stock: available,
      reorder_point: inv ? Number(inv.reorder_point ?? 0) : 0,
      bin_location: inv ? String(inv.bin_location || "") : "",
      last_count_at: inv?.last_count_at != null ? String(inv.last_count_at) : null,
    };
  });

  return { rows, error: null, status: 200 };
}

/** Legacy product_id adjust: resolves to sole stocked variant or returns VARIANT_SELECTION_REQUIRED. */
export async function adjustAdminInventory(
  supabase: SupabaseClient,
  operatorId: string,
  input: AdminInventoryAdjustInput,
): Promise<{
  success: boolean;
  stock: AdminInventoryStock | null;
  error: string | null;
  code: string | null;
  status: number;
}> {
  const listingId = normalizeCanonicalUuidInput(input.product_id);
  if (!listingId) {
    return {
      success: false,
      stock: null,
      error: "product_id must be a catalog listing UUID",
      code: null,
      status: 400,
    };
  }

  const d = Number(input.delta);
  if (!Number.isFinite(d) || d === 0) {
    return {
      success: false,
      stock: null,
      error: "delta must be a non-zero integer",
      code: null,
      status: 400,
    };
  }

  const reason = input.reason?.trim();
  if (!reason) {
    return {
      success: false,
      stock: null,
      error: "reason is required for manual adjustments",
      code: null,
      status: 400,
    };
  }

  let product: Awaited<ReturnType<typeof resolveListingProduct>>;
  try {
    product = await resolveListingProduct(supabase, listingId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load product";
    return { success: false, stock: null, error: message, code: null, status: 500 };
  }

  if (!product) {
    return { success: false, stock: null, error: "Product not found", code: null, status: 404 };
  }

  const v2 = normalizeCanonicalUuidInput(product.catalog_v2_product_id);
  if (!v2) {
    return {
      success: false,
      stock: null,
      error: "Product must resolve to catalog_v2 before stock adjustments.",
      code: INVENTORY_CANONICAL_REQUIRED,
      status: 422,
    };
  }

  const resolved = await resolveSingleStockedVariantForProduct(supabase, v2);
  if (!resolved.variantId) {
    return {
      success: false,
      stock: null,
      error: resolved.error ?? "Select exact SKU for adjustment",
      code: resolved.code ?? VARIANT_SELECTION_REQUIRED,
      status: 422,
    };
  }

  const variantResult = await adjustAdminVariantInventory(supabase, operatorId, {
    catalog_variant_id: resolved.variantId,
    delta: d,
    reason,
  });

  if (!variantResult.success || !variantResult.stock) {
    return {
      success: false,
      stock: null,
      error: variantResult.error,
      code: variantResult.code,
      status: variantResult.status,
    };
  }

  return {
    success: true,
    stock: {
      stock_on_hand: variantResult.stock.quantity_on_hand,
      stock_reserved: variantResult.stock.quantity_reserved,
      available_stock: variantResult.stock.available_stock,
    },
    error: null,
    code: null,
    status: 200,
  };
}
