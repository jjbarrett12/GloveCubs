/**
 * Catalog sync runs and item results — CRUD and persistence.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import type { SyncRunStats } from "./types";
import type { CompareResult } from "./comparison";
import { supersedeOlderUnresolved } from "./lifecycle";

export interface CreateSyncRunInput {
  feedId: string;
  supplierId: string;
  config?: Record<string, unknown>;
}

export interface CreateSyncRunResult {
  runId: string;
}

export async function createSyncRun(input: CreateSyncRunInput): Promise<CreateSyncRunResult> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("catalog_sync_runs")
    .insert({
      feed_id: input.feedId,
      supplier_id: input.supplierId,
      status: "running",
      config: input.config ?? {},
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create sync run: ${error.message}`);
  return { runId: data.id as string };
}

export async function completeSyncRun(
  runId: string,
  stats: SyncRunStats,
  errorMessage?: string | null
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase
    .from("catalog_sync_runs")
    .update({
      status: errorMessage ? "failed" : "completed",
      completed_at: new Date().toISOString(),
      stats,
      error_message: errorMessage ?? null,
    })
    .eq("id", runId);
  if (error) throw new Error(`Failed to complete sync run: ${error.message}`);
}

/** Map external_id -> parsed row for storing current_snapshot (new/changed/unchanged). */
export type CurrentRowMap = Map<string, Record<string, unknown>>;

export async function insertSyncItemResults(
  runId: string,
  results: CompareResult[],
  supplierId: string,
  currentRowMap?: CurrentRowMap
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);

  const itemRows = results.map((r) => ({
    run_id: runId,
    external_id: r.external_id,
    result_type: r.result_type,
    prior_raw_id: r.prior_raw_id ?? null,
    prior_normalized_id: r.prior_normalized_id ?? null,
    current_batch_raw_id: null,
    change_summary: r.change_summary,
    requires_review: r.requires_review,
    current_snapshot: currentRowMap?.get(r.external_id) ?? null,
    lifecycle_status: "pending",
  }));

  if (itemRows.length > 0) {
    const { data: inserted, error: insErr } = await supabase
      .from("catalog_sync_item_results")
      .insert(itemRows)
      .select("id, run_id, external_id, result_type");
    if (insErr) throw new Error(`Failed to insert sync item results: ${insErr.message}`);
    for (const row of inserted ?? []) {
      if (row.result_type === "new" || row.result_type === "changed") {
        await supersedeOlderUnresolved(row.id as string, row.run_id as string, row.external_id as string, supplierId);
      }
    }
  }

  const missingResults = results.filter((r) => r.result_type === "missing");
  const discontinuedRows = missingResults.map((r) => ({
    run_id: runId,
    supplier_id: supplierId,
    external_id: r.external_id,
    prior_raw_id: r.prior_raw_id ?? null,
    prior_normalized_id: r.prior_normalized_id ?? null,
    status: "pending_review",
  }));

  if (discontinuedRows.length > 0) {
    const { error: discErr } = await supabase.from("discontinued_product_candidates").insert(discontinuedRows);
    if (discErr) throw new Error(`Failed to insert discontinued candidates: ${discErr.message}`);
  }
}

export async function getSyncRunById(runId: string) {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("catalog_sync_runs")
    .select(
      "id, feed_id, supplier_id, status, started_at, completed_at, stats, config, error_message, created_at"
    )
    .eq("id", runId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listSyncRuns(options: { feedId?: string; supplierId?: string; limit?: number } = {}) {
  const supabase = getSupabaseCatalogos(true);
  let q = supabase
    .from("catalog_sync_runs")
    .select("id, feed_id, supplier_id, status, started_at, completed_at, stats, created_at")
    .order("started_at", { ascending: false })
    .limit(options.limit ?? 50);
  if (options.feedId) q = q.eq("feed_id", options.feedId);
  if (options.supplierId) q = q.eq("supplier_id", options.supplierId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listSyncItemResults(runId: string, filters?: { result_type?: string; requires_review?: boolean }) {
  const supabase = getSupabaseCatalogos(true);
  let q = supabase
    .from("catalog_sync_item_results")
    .select("*")
    .eq("run_id", runId)
    .order("result_type")
    .order("external_id");
  if (filters?.result_type) q = q.eq("result_type", filters.result_type);
  if (filters?.requires_review != null) q = q.eq("requires_review", filters.requires_review);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listDiscontinuedCandidates(runId: string) {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("discontinued_product_candidates")
    .select("*")
    .eq("run_id", runId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type DiscontinuedResolution = "confirmed_discontinued" | "false_positive";

export async function updateDiscontinuedCandidate(
  id: string,
  status: DiscontinuedResolution,
  options?: { resolved_by?: string; notes?: string }
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase
    .from("discontinued_product_candidates")
    .update({
      status,
      resolved_at: new Date().toISOString(),
      resolved_by: options?.resolved_by ?? null,
      notes: options?.notes ?? null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function resolveSyncItemResult(
  itemResultId: string,
  resolution: "approved" | "rejected"
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const promotion_status = resolution === "rejected" ? "rejected" : undefined;
  const lifecycle_status = resolution === "rejected" ? "rejected" : undefined;
  const updates: { resolved_at: string; resolution: string; promotion_status?: string; lifecycle_status?: string; lifecycle_updated_at?: string } = {
    resolved_at: new Date().toISOString(),
    resolution,
  };
  if (promotion_status) updates.promotion_status = promotion_status;
  if (lifecycle_status) {
    updates.lifecycle_status = lifecycle_status;
    updates.lifecycle_updated_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from("catalog_sync_item_results")
    .update(updates)
    .eq("id", itemResultId);
  if (error) throw new Error(error.message);
}
