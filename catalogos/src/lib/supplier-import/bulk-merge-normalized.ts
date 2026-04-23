/**
 * Bulk shallow-merge fields into supplier_products_normalized.normalized_data
 * for review workflows (same batch only; idempotent).
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

/** Keys operators may set in bulk without replacing the whole JSON document. */
const ALLOWED_TOP_LEVEL_MERGE_KEYS = new Set([
  "brand",
  "uom",
  "pack_size",
  "category_guess",
  "supplier_sku",
  "canonical_title",
  "short_description",
  "long_description",
  "image_url",
  "supplier_cost",
  "lead_time_days",
  "stock_status",
]);

const DEFAULT_MAX_ROWS = 2000;
const UPDATE_CONCURRENCY = 12;

function pickMerge(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!ALLOWED_TOP_LEVEL_MERGE_KEYS.has(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export interface BulkMergeNormalizedInput {
  batchId: string;
  /** Explicit staging row IDs (must belong to batchId) */
  normalizedIds?: string[] | null;
  /** When true, merge into every row in the batch with status = pending */
  allPending?: boolean;
  merge: Record<string, unknown>;
  maxRows?: number;
}

export interface BulkMergeNormalizedResult {
  updated: number;
  skipped: number;
  errors: string[];
}

export async function bulkMergeNormalizedDataForBatch(
  input: BulkMergeNormalizedInput
): Promise<BulkMergeNormalizedResult> {
  const merge = pickMerge(input.merge);
  if (Object.keys(merge).length === 0) {
    return { updated: 0, skipped: 0, errors: ["No allowed merge fields provided"] };
  }

  const maxRows = input.maxRows ?? DEFAULT_MAX_ROWS;
  const supabase = getSupabaseCatalogos(true);

  const { data: batch, error: batchErr } = await supabase
    .from("import_batches")
    .select("id")
    .eq("id", input.batchId)
    .maybeSingle();
  if (batchErr || !batch) {
    return { updated: 0, skipped: 0, errors: ["Batch not found"] };
  }

  let ids: string[] = [];
  if (input.normalizedIds?.length) {
    ids = [...new Set(input.normalizedIds.filter(Boolean))];
  } else if (input.allPending) {
    const { data: rows, error } = await supabase
      .from("supplier_products_normalized")
      .select("id")
      .eq("batch_id", input.batchId)
      .eq("status", "pending")
      .limit(maxRows);
    if (error) {
      return { updated: 0, skipped: 0, errors: [error.message] };
    }
    ids = (rows ?? []).map((r) => r.id as string);
  } else {
    return { updated: 0, skipped: 0, errors: ["Provide normalizedIds or allPending: true"] };
  }

  if (ids.length > maxRows) {
    ids = ids.slice(0, maxRows);
  }

  const { data: existing, error: loadErr } = await supabase
    .from("supplier_products_normalized")
    .select("id, normalized_data")
    .eq("batch_id", input.batchId)
    .in("id", ids);

  if (loadErr) {
    return { updated: 0, skipped: 0, errors: [loadErr.message] };
  }

  const byId = new Map((existing ?? []).map((r) => [r.id as string, r]));
  const validIds = ids.filter((id) => byId.has(id));
  const skipped = ids.length - validIds.length;
  const now = new Date().toISOString();
  let updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < validIds.length; i += UPDATE_CONCURRENCY) {
    const chunk = validIds.slice(i, i + UPDATE_CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (id) => {
        const row = byId.get(id)!;
        const prev = (row.normalized_data as Record<string, unknown>) ?? {};
        const next = { ...prev, ...merge };
        const { error: upErr } = await supabase
          .from("supplier_products_normalized")
          .update({ normalized_data: next, updated_at: now })
          .eq("id", id)
          .eq("batch_id", input.batchId);
        if (upErr) return { err: `${id}: ${upErr.message}` as const };
        return { ok: true as const };
      })
    );
    for (const r of chunkResults) {
      if ("err" in r && r.err != null) errors.push(r.err);
      else if (!("err" in r)) updated += 1;
    }
  }

  return { updated, skipped, errors };
}
