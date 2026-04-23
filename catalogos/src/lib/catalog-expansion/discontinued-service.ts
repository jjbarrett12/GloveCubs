/**
 * Apply discontinued status to supplier_offers when a discontinued candidate is confirmed.
 * Find offers by: (1) normalized_id, (2) supplier_id + supplier_sku from prior raw/normalized, (3) product linkage.
 * Preserve strict audit trail.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

const DISCONTINUED_REASON = "catalog_sync_confirmed";

export interface ApplyDiscontinuedResult {
  success: boolean;
  offersUpdated?: number;
  offerIds?: string[];
  error?: string;
}

function getSupplierSkuFromRaw(raw: Record<string, unknown>): string | null {
  const sku = raw?.sku ?? raw?.item ?? raw?.item_number ?? raw?.product_id ?? raw?.id;
  return sku != null ? String(sku).trim() || null : null;
}

function getSupplierSkuFromNormalized(nd: Record<string, unknown>): string | null {
  const sku = nd?.supplier_sku ?? nd?.sku;
  return sku != null ? String(sku).trim() || null : null;
}

/**
 * When a discontinued candidate is confirmed, mark linked supplier_offers as discontinued.
 * Fallback order: normalized_id → supplier_id + supplier_sku (from prior raw/normalized) → supplier_id + product_id (from prior normalized master_product_id).
 */
export async function applyDiscontinuedToOffers(discontinuedCandidateId: string): Promise<ApplyDiscontinuedResult> {
  const supabase = getSupabaseCatalogos(true);

  const { data: candidate, error: candErr } = await supabase
    .from("discontinued_product_candidates")
    .select("id, supplier_id, external_id, prior_raw_id, prior_normalized_id, status")
    .eq("id", discontinuedCandidateId)
    .single();

  if (candErr || !candidate) return { success: false, error: "Discontinued candidate not found" };

  const status = (candidate as { status: string }).status;
  if (status !== "confirmed_discontinued") {
    return { success: false, error: "Candidate must be confirmed_discontinued before applying to offers" };
  }

  const supplierId = (candidate as { supplier_id: string }).supplier_id;
  const priorNormalizedId = (candidate as { prior_normalized_id?: string | null }).prior_normalized_id;
  const priorRawId = (candidate as { prior_raw_id?: string | null }).prior_raw_id;
  const externalId = (candidate as { external_id: string }).external_id;

  const offerIdsSet = new Set<string>();

  const byNormalized = priorNormalizedId
    ? await supabase
        .from("supplier_offers")
        .select("id")
        .eq("normalized_id", priorNormalizedId)
        .eq("supplier_id", supplierId)
        .eq("is_active", true)
    : { data: [] as { id: string }[] };

  if (byNormalized.data?.length) {
    byNormalized.data.forEach((o) => offerIdsSet.add(o.id));
  }

  let supplierSku: string | null = null;
  if (priorNormalizedId) {
    const { data: norm } = await supabase
      .from("supplier_products_normalized")
      .select("normalized_data, master_product_id")
      .eq("id", priorNormalizedId)
      .single();
    if (norm?.normalized_data) supplierSku = getSupplierSkuFromNormalized(norm.normalized_data as Record<string, unknown>);
  }
  if (!supplierSku && priorRawId) {
    const { data: raw } = await supabase
      .from("supplier_products_raw")
      .select("raw_payload")
      .eq("id", priorRawId)
      .single();
    if (raw?.raw_payload) supplierSku = getSupplierSkuFromRaw(raw.raw_payload as Record<string, unknown>);
  }
  if (!supplierSku) supplierSku = externalId;

  if (supplierSku) {
    const bySku = await supabase
      .from("supplier_offers")
      .select("id")
      .eq("supplier_id", supplierId)
      .eq("supplier_sku", supplierSku)
      .eq("is_active", true);
    if (bySku.data?.length) bySku.data.forEach((o) => offerIdsSet.add(o.id));
  }

  if (priorNormalizedId) {
    const { data: norm } = await supabase
      .from("supplier_products_normalized")
      .select("master_product_id")
      .eq("id", priorNormalizedId)
      .single();
    const productId = (norm as { master_product_id?: string | null } | null)?.master_product_id;
    if (productId) {
      const byProduct = await supabase
        .from("supplier_offers")
        .select("id")
        .eq("supplier_id", supplierId)
        .eq("product_id", productId)
        .eq("is_active", true);
      if (byProduct.data?.length) byProduct.data.forEach((o) => offerIdsSet.add(o.id));
    }
  }

  const ids = Array.from(offerIdsSet);
  if (ids.length === 0) {
    return { success: true, offersUpdated: 0, offerIds: [] };
  }

  const { error: updateErr } = await supabase
    .from("supplier_offers")
    .update({
      is_active: false,
      discontinued_at: new Date().toISOString(),
      discontinued_reason: DISCONTINUED_REASON,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);

  if (updateErr) return { success: false, error: updateErr.message };
  return { success: true, offersUpdated: ids.length, offerIds: ids };
}
