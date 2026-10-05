import { createNewMasterProduct } from "@/app/actions/review";
import { validateUuidParam } from "@/lib/admin/commerce-validation";
import { getSupabaseCatalogos } from "@/lib/db/client";
import { createImportBatch } from "@/lib/ingestion/batch-service";
import { insertQuickAddStagingRow } from "@/lib/ingestion/quick-add-staging-insert";
import { CATALOG_V2_LEGACY_GLOVE_PRODUCT_TYPE_ID } from "@/lib/publish/ensure-catalog-v2-link";
import { NEW_PRODUCT_FAMILY_FILENAME } from "./types";
import type { ExistingFamilyPromotion, FamilyPromotionPort } from "./promote";

async function loadPromotion(
  supabase: ReturnType<typeof getSupabaseCatalogos>,
  batchId: string
): Promise<ExistingFamilyPromotion> {
  const { data: rows, error: rowErr } = await supabase
    .from("supplier_products_normalized")
    .select("id, raw_id, master_product_id")
    .eq("batch_id", batchId);
  if (rowErr) throw new Error(rowErr.message);
  return {
    batchId,
    rows: (rows ?? []).map((row) => {
      const r = row as { id: string; raw_id?: string | null; master_product_id?: string | null };
      return { id: r.id, rawId: r.raw_id ?? null, masterProductId: r.master_product_id ?? null };
    }),
  };
}

/**
 * Live CatalogOS port. Creates one master and links sibling sizes.
 * Does not call publish. list price cents are zero because customer price is not set here.
 * PostgREST has no multi-table transaction, so a failed promotion deletes the rows it created.
 */
export function liveFamilyPromotionPort(): FamilyPromotionPort {
  const supabase = getSupabaseCatalogos(true);
  return {
    async findByDraftId(draftId) {
      const idErr = validateUuidParam("batch", draftId);
      if (idErr) return null;
      const { data: batches, error } = await supabase
        .from("import_batches")
        .select("id")
        .eq("preview_session_id", draftId)
        .eq("source_filename", NEW_PRODUCT_FAMILY_FILENAME)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(1);
      if (error) throw new Error(error.message);
      const batchId = batches?.[0]?.id as string | undefined;
      if (!batchId) return null;
      return loadPromotion(supabase, batchId);
    },
    async createBatch(draftId, supplierId) {
      try {
        const batch = await createImportBatch({
          feedId: null,
          supplierId,
          sourceKind: "other",
          previewSessionId: draftId,
          sourceFilename: NEW_PRODUCT_FAMILY_FILENAME,
        });
        return { ok: true, batchId: batch.batchId };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to create import batch";
        if (/uq_import_batches_new_family_draft|duplicate key value violates unique constraint/i.test(message)) {
          return { ok: false, conflict: true };
        }
        return { ok: false, error: message };
      }
    },
    async claimDraft(draftId, batchId) {
      const { data: batches, error } = await supabase
        .from("import_batches")
        .select("id")
        .eq("preview_session_id", draftId)
        .eq("source_filename", NEW_PRODUCT_FAMILY_FILENAME)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw new Error(error.message);
      const ids = (batches ?? []).map((batch) => batch.id as string);
      if (!ids.includes(batchId)) throw new Error("Import batch disappeared before it could be claimed.");
      if (ids[0] === batchId) return { won: true };
      const { count, error: countErr } = await supabase
        .from("supplier_products_normalized")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", batchId);
      if (countErr) {
        return { won: false, winner: await loadPromotion(supabase, ids[0]!), error: countErr.message };
      }
      if ((count ?? 0) > 0) {
        return {
          won: false,
          winner: await loadPromotion(supabase, ids[0]!),
          error: "Another submission of this draft is already running. Wait, then send to review again.",
        };
      }
      const { error: delErr } = await supabase.from("import_batches").delete().eq("id", batchId);
      return {
        won: false,
        winner: await loadPromotion(supabase, ids[0]!),
        error: delErr
          ? `Another submission of this draft is already running. Cleanup failed: ${delErr.message}`
          : "Another submission of this draft is already running. Wait, then send to review again.",
      };
    },
    insertRow(input) {
      return insertQuickAddStagingRow(supabase, input);
    },
    async annotateRow(normalizedId, patch) {
      const { error } = await supabase.from("supplier_products_normalized").update(patch).eq("id", normalizedId);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    async deleteNormalized(id) {
      const { error } = await supabase.from("supplier_products_normalized").delete().eq("id", id);
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    async deleteRaw(id) {
      const { error } = await supabase.from("supplier_products_raw").delete().eq("id", id);
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    async deleteBatch(id) {
      const { error } = await supabase.from("import_batches").delete().eq("id", id);
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    async createMaster(input) {
      const created = await createNewMasterProduct(
        input.normalizedId,
        {
          sku: input.sku,
          name: input.name,
          category_id: input.categoryId,
          brand_id: input.brandId ?? undefined,
          product_type_id: CATALOG_V2_LEGACY_GLOVE_PRODUCT_TYPE_ID,
          list_price_minor: 0,
        },
        { publishToLive: false, skipRevalidate: true }
      );
      if (!created.success || !created.masterProductId) {
        return { ok: false, error: created.error ?? "Failed to create the catalog product." };
      }
      return { ok: true, masterProductId: created.masterProductId };
    },
    async linkSibling(normalizedId, masterProductId) {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("supplier_products_normalized")
        .update({
          status: "approved",
          master_product_id: masterProductId,
          reviewed_at: now,
          updated_at: now,
          search_publish_status: "approved",
        })
        .eq("id", normalizedId);
      if (error) return { ok: false, error: error.message };
      const { error: decisionErr } = await supabase.from("review_decisions").insert({
        normalized_id: normalizedId,
        decision: "approved",
        master_product_id: masterProductId,
        decided_by: "admin",
        notes: "Attached to new product family master",
      });
      if (decisionErr) return { ok: false, error: decisionErr.message };
      return { ok: true };
    },
    async discardMaster(masterProductId) {
      const { count, error: stillErr } = await supabase
        .from("supplier_products_normalized")
        .select("id", { count: "exact", head: true })
        .eq("master_product_id", masterProductId);
      if (stillErr) return { ok: false, error: stillErr.message };
      if ((count ?? 0) > 0) return { ok: false, error: "Catalog product still has staging rows." };
      const { data: product, error: readErr } = await supabase
        .schema("catalog_v2")
        .from("catalog_products")
        .select("id, status")
        .eq("id", masterProductId)
        .maybeSingle();
      if (readErr) return { ok: false, error: readErr.message };
      if (!product) return { ok: true };
      if ((product as { status?: string }).status !== "draft") {
        return { ok: false, error: "Refusing to delete a catalog product that is not a draft." };
      }
      const { error } = await supabase.schema("catalog_v2").from("catalog_products").delete().eq("id", masterProductId).eq("status", "draft");
      return error ? { ok: false, error: error.message } : { ok: true };
    },
  };
}
