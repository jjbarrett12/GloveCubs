/**
 * Product Matching Agent — match runs and candidates CRUD.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import type { MatchRunStats } from "./types";
import type { MatchResult } from "./types";
import type { DuplicatePair } from "./duplicate-detection";

export interface CreateMatchRunInput {
  batchId?: string | null;
  scope: "batch" | "all_pending";
}

export async function createMatchRun(input: CreateMatchRunInput): Promise<{ runId: string }> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("product_match_runs")
    .insert({
      batch_id: input.batchId ?? null,
      scope: input.scope,
      status: "running",
      config: {},
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { runId: data.id as string };
}

export async function completeMatchRun(
  runId: string,
  stats: MatchRunStats,
  errorMessage?: string | null
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase
    .from("product_match_runs")
    .update({
      status: errorMessage ? "failed" : "completed",
      completed_at: new Date().toISOString(),
      stats,
      error_message: errorMessage ?? null,
    })
    .eq("id", runId);
  if (error) throw new Error(error.message);
}

export async function insertMatchCandidate(
  runId: string,
  normalizedId: string,
  result: MatchResult
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase.from("product_match_candidates").upsert(
    {
      run_id: runId,
      normalized_id: normalizedId,
      suggested_master_product_id: result.suggested_master_product_id,
      confidence: result.confidence,
      reason: result.reason,
      candidate_list: result.candidate_list,
      duplicate_warning: result.duplicate_warning,
      requires_review: result.requires_review,
    },
    { onConflict: "run_id,normalized_id" }
  );
  if (error) throw new Error(error.message);
}

export async function insertDuplicateCandidates(
  runId: string,
  pairs: DuplicatePair[]
): Promise<void> {
  if (pairs.length === 0) return;
  const supabase = getSupabaseCatalogos(true);
  const rows = pairs.map((p) => ({
    run_id: runId,
    product_id_a: p.product_id_a,
    product_id_b: p.product_id_b,
    score: p.score,
    reason: p.reason,
    status: "pending_review",
  }));
  const { error } = await supabase.from("product_duplicate_candidates").insert(rows);
  if (error) throw new Error(error.message);
}

export async function getMatchRunById(runId: string) {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("product_match_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listMatchRuns(options: { batchId?: string; limit?: number } = {}) {
  const supabase = getSupabaseCatalogos(true);
  let q = supabase
    .from("product_match_runs")
    .select("id, batch_id, scope, status, started_at, completed_at, stats, created_at")
    .order("started_at", { ascending: false })
    .limit(options.limit ?? 50);
  if (options.batchId) q = q.eq("batch_id", options.batchId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listMatchCandidates(
  runId: string,
  filters?: { requires_review?: boolean }
) {
  const supabase = getSupabaseCatalogos(true);
  let q = supabase
    .from("product_match_candidates")
    .select("*")
    .eq("run_id", runId)
    .order("confidence", { ascending: false });
  if (filters?.requires_review != null) q = q.eq("requires_review", filters.requires_review);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listDuplicateCandidates(runId: string) {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("product_duplicate_candidates")
    .select("*")
    .eq("run_id", runId)
    .order("score", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateStagingFromMatch(
  normalizedId: string,
  suggestedMasterId: string | null,
  confidence: number
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase
    .from("supplier_products_normalized")
    .update({
      master_product_id: suggestedMasterId,
      match_confidence: confidence,
      updated_at: new Date().toISOString(),
    })
    .eq("id", normalizedId);
  if (error) throw new Error(error.message);
}

export type DuplicateResolution = "merged" | "dismissed";

export async function updateDuplicateCandidateStatus(
  id: string,
  status: DuplicateResolution,
  options?: { resolved_by?: string }
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase
    .from("product_duplicate_candidates")
    .update({
      status,
      resolved_at: new Date().toISOString(),
      resolved_by: options?.resolved_by ?? null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Merge two master products: move supplier_offers from mergeProductId to keepProductId, then deactivate mergeProductId.
 * On unique conflict (supplier_id, product_id, supplier_sku), deactivate the offer being moved instead.
 */
export async function mergeDuplicateProducts(
  keepProductId: string,
  mergeProductId: string
): Promise<{ success: boolean; error?: string; offersMoved?: number }> {
  const supabase = getSupabaseCatalogos(true);
  const { data: offers } = await supabase
    .from("supplier_offers")
    .select("id, supplier_id, supplier_sku")
    .eq("product_id", mergeProductId);

  if (!offers?.length) {
    const { error: upErr } = await supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", mergeProductId);
    if (upErr) return { success: false, error: upErr.message };
    return { success: true, offersMoved: 0 };
  }

  let offersMoved = 0;
  for (const off of offers) {
    const { error: upErr } = await supabase
      .from("supplier_offers")
      .update({ product_id: keepProductId, updated_at: new Date().toISOString() })
      .eq("id", off.id);
    if (upErr) {
      if (upErr.code === "23505") {
        await supabase.from("supplier_offers").update({ is_active: false }).eq("id", off.id);
      } else {
        return { success: false, error: upErr.message };
      }
    } else {
      offersMoved++;
    }
  }

  const { error: prodErr } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", mergeProductId);
  if (prodErr) return { success: false, error: prodErr.message };
  return { success: true, offersMoved };
}
