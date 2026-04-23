/**
 * Create suggested supplier offer records when a normalized row matches a master product.
 * Offers are linked to raw_id and normalized_id for traceability.
 *
 * DEDUPE: Same supplier + same product_id + same supplier_sku => upsert (update/merge).
 * Same product across suppliers => separate offer rows (one per supplier). No duplicate
 * live products are created here; matching attaches to existing master products only.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { logOfferUpsertFailure } from "@/lib/observability";

export interface CreateOfferInput {
  supplierId: string;
  masterProductId: string;
  supplierSku: string;
  cost: number;
  rawId: string;
  normalizedId: string;
  leadTimeDays?: number | null;
}

/**
 * Upsert a suggested supplier offer. On conflict (supplier_id, product_id, supplier_sku) we update.
 * 
 * RACE CONDITION PROTECTION: We first check if an existing offer has a newer normalized_id.
 * If so, we skip the update to avoid overwriting fresher data with stale batch data.
 */
export async function createSuggestedOffer(input: CreateOfferInput): Promise<boolean> {
  const supabase = getSupabaseCatalogos(true);

  // Check for existing offer to prevent overwriting newer data
  const { data: existing } = await supabase
    .from("supplier_offers")
    .select("id, normalized_id, updated_at")
    .eq("supplier_id", input.supplierId)
    .eq("product_id", input.masterProductId)
    .eq("supplier_sku", input.supplierSku)
    .maybeSingle();

  if (existing) {
    // If existing offer has a different normalized_id, check which is newer
    // by querying the normalized rows' batch timestamps
    if (existing.normalized_id && existing.normalized_id !== input.normalizedId) {
      const { data: existingNorm } = await supabase
        .from("supplier_products_normalized")
        .select("batch_id")
        .eq("id", existing.normalized_id)
        .single();
      const { data: newNorm } = await supabase
        .from("supplier_products_normalized")
        .select("batch_id")
        .eq("id", input.normalizedId)
        .single();
      
      if (existingNorm?.batch_id && newNorm?.batch_id) {
        const { data: existingBatch } = await supabase
          .from("import_batches")
          .select("created_at")
          .eq("id", existingNorm.batch_id)
          .single();
        const { data: newBatch } = await supabase
          .from("import_batches")
          .select("created_at")
          .eq("id", newNorm.batch_id)
          .single();
        
        // Skip if existing offer is from a newer batch
        if (existingBatch?.created_at && newBatch?.created_at) {
          if (new Date(existingBatch.created_at) > new Date(newBatch.created_at)) {
            console.warn(`[CatalogOS] Skipping offer update: existing offer from newer batch`);
            return false;
          }
        }
      }
    }
  }

  const { error } = await supabase.from("supplier_offers").upsert(
    {
      supplier_id: input.supplierId,
      product_id: input.masterProductId,
      supplier_sku: input.supplierSku,
      cost: input.cost,
      lead_time_days: input.leadTimeDays ?? null,
      raw_id: input.rawId,
      normalized_id: input.normalizedId,
      is_active: true,
    },
    { onConflict: "supplier_id,product_id,supplier_sku" }
  );

  if (error) {
    logOfferUpsertFailure("createSuggestedOffer upsert failed", {
      supplier_id: input.supplierId,
      product_id: input.masterProductId,
      supplier_sku: input.supplierSku,
      normalized_id: input.normalizedId,
      message: error.message,
    });
    return false;
  }
  return true;
}
