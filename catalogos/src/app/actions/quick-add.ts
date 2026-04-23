"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseCatalogos } from "@/lib/db/client";
import { createImportBatch } from "@/lib/ingestion/batch-service";
import { insertQuickAddStagingRow } from "@/lib/ingestion/quick-add-staging-insert";
import { validateUuidParam } from "@/lib/admin/commerce-validation";
import { logAdminCatalogAudit } from "@/lib/review/admin-audit";
import { applyFacetExtractionToNormalizedDataRecord } from "@/lib/extraction/staging-facet-merge";
import { persistFacetExtractionForNormalizedRow } from "@/lib/extraction/staging-facet-extraction";

const REVAL_PATHS = ["/dashboard/products/quick-add", "/dashboard/staging", "/dashboard/review", "/dashboard/publish"];

function revalidateQuickAddSurfaces() {
  for (const p of REVAL_PATHS) revalidatePath(p);
}

export interface CreateQuickAddDraftInput {
  supplier_id: string;
  sku: string;
  name: string;
  category_slug: string;
  /** Normalized case cost (USD); required so case-only publish preflight can pass. */
  normalized_case_cost: number;
}

export async function createQuickAddDraft(
  input: CreateQuickAddDraftInput
): Promise<{ success: true; normalizedId: string } | { success: false; error: string }> {
  const sidErr = validateUuidParam("supplier_id", input.supplier_id);
  if (sidErr) return { success: false, error: sidErr };
  const sku = input.sku.trim();
  const name = input.name.trim();
  const category_slug = input.category_slug.trim();
  if (!sku) return { success: false, error: "SKU is required" };
  if (!name) return { success: false, error: "Name is required" };
  if (!category_slug) return { success: false, error: "category_slug is required" };
  const cost = Number(input.normalized_case_cost);
  if (!Number.isFinite(cost) || cost < 0) return { success: false, error: "normalized_case_cost must be a non-negative number" };

  const supabase = getSupabaseCatalogos(true);
  let batchId: string;
  try {
    const batch = await createImportBatch({
      feedId: null,
      supplierId: input.supplier_id,
      sourceKind: "other",
      sourceFilename: "quick-add",
    });
    batchId = batch.batchId;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create import batch" };
  }

  const insertResult = await insertQuickAddStagingRow(supabase, {
    batchId,
    supplierId: input.supplier_id,
    sourceRowIndex: 0,
    externalId: sku,
    rawPayload: {
      source: "quick_add",
      sku,
      name,
      category_slug,
      normalized_case_cost: cost,
    },
    sku,
    name,
    category_slug,
    normalized_case_cost: cost,
  });

  if (!insertResult.success) {
    await supabase.from("import_batches").delete().eq("id", batchId);
    return { success: false, error: insertResult.error };
  }

  const { rawId, normalizedId } = insertResult;
  const persist = await persistFacetExtractionForNormalizedRow(supabase, normalizedId);
  if (!persist.success) {
    await supabase.from("supplier_products_normalized").delete().eq("id", normalizedId);
    await supabase.from("supplier_products_raw").delete().eq("id", rawId);
    await supabase.from("import_batches").delete().eq("id", batchId);
    return { success: false, error: persist.error };
  }
  await logAdminCatalogAudit({
    normalizedId,
    action: "quick_add_draft_created",
    details: { batch_id: batchId, raw_id: rawId, supplier_id: input.supplier_id },
  });
  revalidateQuickAddSurfaces();
  return { success: true, normalizedId };
}

export interface UpdateQuickAddCoreInput {
  normalizedId: string;
  name: string;
  sku: string;
  category_slug: string;
  normalized_case_cost: number;
}

export async function updateQuickAddProductCore(
  input: UpdateQuickAddCoreInput
): Promise<{ success: true } | { success: false; error: string }> {
  const idErr = validateUuidParam("normalizedId", input.normalizedId);
  if (idErr) return { success: false, error: idErr };
  const sku = input.sku.trim();
  const name = input.name.trim();
  const category_slug = input.category_slug.trim();
  if (!sku) return { success: false, error: "SKU is required" };
  if (!name) return { success: false, error: "Name is required" };
  if (!category_slug) return { success: false, error: "category_slug is required" };
  const cost = Number(input.normalized_case_cost);
  if (!Number.isFinite(cost) || cost < 0) return { success: false, error: "normalized_case_cost must be a non-negative number" };

  const supabase = getSupabaseCatalogos(true);
  const { data: row } = await supabase.from("supplier_products_normalized").select("normalized_data").eq("id", input.normalizedId).single();
  if (!row) return { success: false, error: "Not found" };
  const nd = (row.normalized_data as Record<string, unknown>) ?? {};
  const filterAttrs = (nd.filter_attributes as Record<string, unknown>) ?? {};
  const updated: Record<string, unknown> = {
    ...nd,
    name,
    canonical_title: name,
    supplier_sku: sku,
    sku,
    category_slug,
    supplier_cost: cost,
    normalized_case_cost: cost,
    pricing: {
      ...(typeof nd.pricing === "object" && nd.pricing !== null ? (nd.pricing as object) : {}),
      sell_unit: "case",
      normalized_case_cost: cost,
    },
    filter_attributes: filterAttrs,
    attributes: filterAttrs,
  };

  const finalNd = applyFacetExtractionToNormalizedDataRecord(updated);
  const finalAttrs = (finalNd.filter_attributes as Record<string, unknown>) ?? {};

  const { error } = await supabase
    .from("supplier_products_normalized")
    .update({
      normalized_data: finalNd,
      attributes: finalAttrs,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.normalizedId);

  if (error) return { success: false, error: error.message };
  await logAdminCatalogAudit({
    normalizedId: input.normalizedId,
    action: "quick_add_core_updated",
    details: { keys: ["name", "sku", "category_slug", "normalized_case_cost"] },
  });
  revalidateQuickAddSurfaces();
  return { success: true };
}
