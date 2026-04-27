"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseCatalogos } from "@/lib/db/client";
import { createImportBatch } from "@/lib/ingestion/batch-service";
import { insertQuickAddStagingRow } from "@/lib/ingestion/quick-add-staging-insert";
import { validateUuidParam } from "@/lib/admin/commerce-validation";
import { logAdminCatalogAudit } from "@/lib/review/admin-audit";
import { persistFacetExtractionForNormalizedRow } from "@/lib/extraction/staging-facet-extraction";
import { allocateBulkCsvExternalId } from "@/lib/ingestion/bulk-csv-external-id";

const REVAL_PATHS = [
  "/dashboard/products/quick-add",
  "/dashboard/products/bulk-add",
  "/dashboard/staging",
  "/dashboard/review",
  "/dashboard/publish",
];

function revalidateBulkSurfaces() {
  for (const p of REVAL_PATHS) revalidatePath(p);
}

export interface BulkCsvImportRowInput {
  sku?: string | null;
  name?: string | null;
  category_slug?: string | null;
  /** Raw cell; empty / invalid → 0 and counts as default for review flag */
  normalized_case_cost?: string | null;
}

export interface BulkCsvImportRowResult {
  normalizedId?: string;
  sku: string;
  name: string;
  category_slug: string;
  error?: string;
}

function parseCost(raw: string | null | undefined): { value: number; defaulted: boolean } {
  if (raw == null || String(raw).trim() === "") return { value: 0, defaulted: true };
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0) return { value: 0, defaulted: true };
  return { value: n, defaulted: false };
}

export async function createBulkCsvImport(input: {
  supplier_id: string;
  source_filename?: string | null;
  rows: BulkCsvImportRowInput[];
}): Promise<
  | { success: true; batchId: string; results: BulkCsvImportRowResult[] }
  | { success: false; error: string }
> {
  const sidErr = validateUuidParam("supplier_id", input.supplier_id);
  if (sidErr) return { success: false, error: sidErr };
  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    return { success: false, error: "At least one data row is required" };
  }

  const supabase = getSupabaseCatalogos(true);
  let batchId: string;
  try {
    const batch = await createImportBatch({
      feedId: null,
      supplierId: input.supplier_id,
      sourceKind: "csv_upload",
      sourceFilename: input.source_filename?.trim() || "bulk-csv",
    });
    batchId = batch.batchId;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create import batch" };
  }

  const assignedExternalIds = new Set<string>();
  const results: BulkCsvImportRowResult[] = [];
  let successCount = 0;
  let firstNormalizedId: string | undefined;

  for (let i = 0; i < input.rows.length; i++) {
    const row = input.rows[i]!;
    const sourceRowIndex = i + 1;
    const trimmedSku = (row.sku ?? "").trim();
    const name = (row.name ?? "").trim();
    const category_slug = (row.category_slug ?? "").trim();
    const { value: cost, defaulted: costDefaulted } = parseCost(row.normalized_case_cost ?? undefined);

    const externalId = allocateBulkCsvExternalId(batchId, sourceRowIndex, trimmedSku, assignedExternalIds);

    const needsReview = costDefaulted || externalId !== trimmedSku;
    const normalizedDataExtra = needsReview ? { csv_bulk_needs_review: true } : undefined;

    const raw_payload: Record<string, unknown> = {
      source: "csv_bulk",
      sku: trimmedSku,
      name,
      category_slug,
      normalized_case_cost: cost,
      source_row_index: sourceRowIndex,
    };

    const insertResult = await insertQuickAddStagingRow(supabase, {
      batchId,
      supplierId: input.supplier_id,
      sourceRowIndex,
      externalId,
      rawPayload: raw_payload,
      sku: trimmedSku,
      name,
      category_slug,
      normalized_case_cost: cost,
      normalizedDataExtra,
    });

    if (!insertResult.success) {
      results.push({
        sku: trimmedSku,
        name,
        category_slug,
        error: insertResult.error,
      });
      continue;
    }

    const persist = await persistFacetExtractionForNormalizedRow(supabase, insertResult.normalizedId);
    if (!persist.success) {
      results.push({
        normalizedId: insertResult.normalizedId,
        sku: trimmedSku,
        name,
        category_slug,
        error: `Row inserted but facet extraction failed: ${persist.error}`,
      });
      continue;
    }

    successCount++;
    if (!firstNormalizedId) firstNormalizedId = insertResult.normalizedId;
    results.push({
      normalizedId: insertResult.normalizedId,
      sku: trimmedSku,
      name,
      category_slug,
    });
  }

  if (successCount > 0) {
    await logAdminCatalogAudit({
      normalizedId: firstNormalizedId ?? null,
      action: "csv_bulk_import_created",
      details: {
        batch_id: batchId,
        supplier_id: input.supplier_id,
        row_count: input.rows.length,
        success_count: successCount,
      },
    });
  }

  revalidateBulkSurfaces();
  return { success: true, batchId, results };
}
