/**
 * Resume storage for a New Product Family draft.
 * Catalog staging rows are created later by promoteFamilyToStaging, not here.
 */

import { getSupabase, getSupabaseCatalogos } from "@/lib/db/client";
import { validateUuidParam } from "@/lib/admin/commerce-validation";
import {
  NEW_PRODUCT_FAMILY_DRAFT_HEADER,
  NEW_PRODUCT_FAMILY_FILENAME,
  type NewProductFamilyDraft,
} from "./types";
import { parseFamilyDraft } from "./draft";
import { collectStagedGloveCubsSkus, skusOwnedByOthers, type SkuOwnerRow } from "./sku-assist";

export async function saveFamilyDraftDocument(
  draft: NewProductFamilyDraft,
  existingId?: string | null
): Promise<{ success: true; batchId: string } | { success: false; error: string }> {
  const supabase = getSupabaseCatalogos(true);
  const payload = {
    supplier_id: null,
    filename: NEW_PRODUCT_FAMILY_FILENAME,
    headers_json: [NEW_PRODUCT_FAMILY_DRAFT_HEADER],
    sample_rows_json: [draft],
    status: "draft",
  };

  if (existingId) {
    const idErr = validateUuidParam("batch", existingId);
    if (idErr) return { success: false, error: idErr };
    const existing = await loadFamilyDraftDocument(existingId);
    if (!existing.success) return existing;
    const { error } = await supabase
      .from("import_preview_sessions")
      .update({
        sample_rows_json: [draft],
        filename: NEW_PRODUCT_FAMILY_FILENAME,
        headers_json: [NEW_PRODUCT_FAMILY_DRAFT_HEADER],
        status: "draft",
      })
      .eq("id", existingId);
    if (error) return { success: false, error: error.message };
    return { success: true, batchId: existingId };
  }

  const { data, error } = await supabase.from("import_preview_sessions").insert(payload).select("id").single();
  if (error || !data?.id) {
    return { success: false, error: error?.message ?? "Failed to save family draft" };
  }
  return { success: true, batchId: data.id as string };
}

export async function loadFamilyDraftDocument(
  batchId: string
): Promise<{ success: true; draft: NewProductFamilyDraft } | { success: false; error: string }> {
  const idErr = validateUuidParam("batch", batchId);
  if (idErr) return { success: false, error: idErr };
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("import_preview_sessions")
    .select("id, filename, headers_json, sample_rows_json, status")
    .eq("id", batchId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Family draft not found." };
  const headers = Array.isArray(data.headers_json) ? data.headers_json : [];
  if (data.filename !== NEW_PRODUCT_FAMILY_FILENAME || headers[0] !== NEW_PRODUCT_FAMILY_DRAFT_HEADER) {
    return { success: false, error: "Not a New Product Family draft." };
  }
  const rows = Array.isArray(data.sample_rows_json) ? data.sample_rows_json : [];
  const draft = parseFamilyDraft(rows[0]);
  if (!draft) return { success: false, error: "Family draft is unreadable." };
  return { success: true, draft };
}

export async function listCatalogBrands(): Promise<{ id: string; name: string }[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase.from("brands").select("id, name").order("name").limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string }[];
}

export async function loadExistingGloveCubsSkus(excludeDraftId?: string | null): Promise<{
  parentSkus: string[];
  variantSkus: string[];
}> {
  const admin = getSupabase(true);
  const catalogos = getSupabaseCatalogos(true);
  const [parents, variants, staged, ownBatches] = await Promise.all([
    admin.schema("catalog_v2").from("catalog_products").select("id, internal_sku"),
    admin.schema("catalog_v2").from("catalog_variants").select("catalog_product_id, variant_sku"),
    catalogos
      .from("supplier_products_normalized")
      .select("batch_id, master_product_id, inferred_base_sku, normalized_data"),
    excludeDraftId
      ? catalogos
          .from("import_batches")
          .select("id")
          .eq("preview_session_id", excludeDraftId)
          .eq("source_filename", NEW_PRODUCT_FAMILY_FILENAME)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (parents.error) throw new Error(parents.error.message);
  if (variants.error) throw new Error(variants.error.message);
  if (staged.error) throw new Error(staged.error.message);
  if (ownBatches.error) throw new Error(ownBatches.error.message);

  const ownedBatchIds = new Set((ownBatches.data ?? []).map((row) => String((row as { id: string }).id)));
  const stagedRows = (staged.data ?? []) as Array<{
    batch_id?: string | null;
    master_product_id?: string | null;
    inferred_base_sku?: string | null;
    normalized_data?: unknown;
  }>;
  const ownedMasterIds = new Set<string>();
  for (const row of stagedRows) {
    if (row.batch_id && ownedBatchIds.has(row.batch_id) && row.master_product_id) {
      ownedMasterIds.add(row.master_product_id);
    }
  }

  const parentRows: SkuOwnerRow[] = [];
  const variantRows: SkuOwnerRow[] = [];
  for (const product of parents.data ?? []) {
    const row = product as { id?: string; internal_sku?: string };
    if (!row.internal_sku) continue;
    parentRows.push({ sku: row.internal_sku, ownedByDraft: Boolean(row.id && ownedMasterIds.has(row.id)) });
  }
  for (const variant of variants.data ?? []) {
    const row = variant as { catalog_product_id?: string; variant_sku?: string };
    if (!row.variant_sku) continue;
    variantRows.push({
      sku: row.variant_sku,
      ownedByDraft: Boolean(row.catalog_product_id && ownedMasterIds.has(row.catalog_product_id)),
    });
  }
  for (const row of stagedRows) {
    const owned = Boolean(row.batch_id && ownedBatchIds.has(row.batch_id));
    const collected = collectStagedGloveCubsSkus([row]);
    for (const sku of collected.parentSkus) parentRows.push({ sku, ownedByDraft: owned });
    for (const sku of collected.variantSkus) variantRows.push({ sku, ownedByDraft: owned });
  }
  return {
    parentSkus: skusOwnedByOthers(parentRows),
    variantSkus: skusOwnedByOthers(variantRows),
  };
}
