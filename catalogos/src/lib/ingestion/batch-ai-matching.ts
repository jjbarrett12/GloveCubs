/**
 * Pass 2: deferred AI matching for rows ingested with ai_match_status = pending.
 * Runs a bounded number of rows per invocation (caller may loop or cron).
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { loadMasterProducts, type MasterProductRow } from "./match-service";
import { createAIMatchingService } from "@/lib/ai/matching-service";
import type { NormalizedData } from "./types";
import type { AIMatchingOutput } from "@/lib/ai/types";
import { AI_MATCHING_ENABLED } from "@/lib/ai/config";

export async function countPendingAiMatchesForBatch(batchId: string): Promise<number> {
  const supabase = getSupabaseCatalogos(true);
  const { count, error } = await supabase
    .from("supplier_products_normalized")
    .select("*", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .eq("status", "pending")
    .eq("ai_match_status", "pending");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export interface RunDeferredAiMatchingOptions {
  maxRows: number;
  categoryId: string;
}

export interface RunDeferredAiMatchingResult {
  batchId: string;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: string[];
  remainingPendingEstimate?: number;
}

function normalizedDataFromRowJson(nd: Record<string, unknown>): NormalizedData {
  const attrs = (nd.filter_attributes as Record<string, unknown>) ?? nd.attributes ?? {};
  return {
    name: (nd.canonical_title as string) ?? (nd.name as string) ?? "",
    sku: (nd.supplier_sku as string) ?? (nd.sku as string) ?? undefined,
    brand: nd.brand as string | undefined,
    description: (nd.long_description as string) ?? (nd.short_description as string) ?? undefined,
    upc: nd.upc as string | undefined,
    image_url: nd.image_url as string | undefined,
    cost: typeof nd.supplier_cost === "number" ? nd.supplier_cost : Number(nd.supplier_cost) || 0,
    attributes: attrs as NormalizedData["attributes"],
  };
}

async function claimRowForAiProcessing(
  supabase: ReturnType<typeof getSupabaseCatalogos>,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("supplier_products_normalized")
    .update({ ai_match_status: "processing", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("ai_match_status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return false;
  return !!data?.id;
}

/**
 * Process up to maxRows pending AI matches for a batch. Idempotent for completed rows.
 */
export async function runDeferredAiMatchingForBatch(
  batchId: string,
  options: RunDeferredAiMatchingOptions
): Promise<RunDeferredAiMatchingResult> {
  const supabase = getSupabaseCatalogos(true);
  const errors: string[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  if (!AI_MATCHING_ENABLED) {
    return {
      batchId,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      errors: ["AI matching is disabled (AI_MATCHING_ENABLED=false)"],
    };
  }

  const { data: pendingRows, error: fetchErr } = await supabase
    .from("supplier_products_normalized")
    .select("id, normalized_data, match_confidence, match_explanation")
    .eq("batch_id", batchId)
    .eq("status", "pending")
    .eq("ai_match_status", "pending")
    .order("created_at", { ascending: true })
    .limit(Math.max(1, options.maxRows));

  if (fetchErr) {
    return {
      batchId,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      errors: [fetchErr.message],
    };
  }

  const rows = pendingRows ?? [];
  let masterCandidates: MasterProductRow[] | null = null;
  const service = createAIMatchingService();

  for (const row of rows) {
    const id = row.id as string;
    const claimed = await claimRowForAiProcessing(supabase, id);
    if (!claimed) {
      skipped++;
      continue;
    }

    if (!masterCandidates) {
      masterCandidates = await loadMasterProducts(options.categoryId);
    }

    const nd = (row.normalized_data ?? {}) as Record<string, unknown>;
    const normalized = normalizedDataFromRowJson(nd);
    const rulesConf = row.match_confidence != null ? Number(row.match_confidence) : 0;
    const rulesReason = (row.match_explanation as string) ?? "deferred_pass";

    let aiResult: AIMatchingOutput | null = null;
    try {
      aiResult = await service.match({
        normalizedName: normalized.name ?? "",
        normalizedSku: normalized.sku ?? null,
        normalizedAttributes: (normalized.attributes ?? {}) as Record<string, unknown>,
        categoryId: options.categoryId,
        candidateSummaries: masterCandidates.map((c) => ({ id: c.id, sku: c.sku, name: c.name })),
        rulesMatchReason: rulesReason,
        rulesMatchConfidence: rulesConf,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${id}: ${msg}`);
      failed++;
      await supabase
        .from("supplier_products_normalized")
        .update({
          ai_match_status: "failed",
          ai_matching_used: true,
          match_explanation: `AI matching error: ${msg}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      continue;
    }

    if (!aiResult) {
      await supabase
        .from("supplier_products_normalized")
        .update({
          ai_match_status: "completed",
          ai_matching_used: true,
          ai_suggested_master_product_id: null,
          ai_confidence: null,
          ai_match_result: null,
          match_explanation: row.match_explanation ?? "AI returned no result",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      succeeded++;
      continue;
    }

    const validIds = new Set(masterCandidates.map((c) => c.id));
    const suggestedId =
      aiResult.suggested_master_product_id && validIds.has(aiResult.suggested_master_product_id)
        ? aiResult.suggested_master_product_id
        : null;

    const { error: upErr } = await supabase
      .from("supplier_products_normalized")
      .update({
        ai_match_status: "completed",
        ai_matching_used: true,
        ai_suggested_master_product_id: suggestedId,
        ai_confidence: aiResult.match_confidence,
        ai_match_result: aiResult as unknown as Record<string, unknown>,
        match_explanation: aiResult.explanation ?? row.match_explanation,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (upErr) {
      errors.push(`${id}: ${upErr.message}`);
      failed++;
      await supabase
        .from("supplier_products_normalized")
        .update({
          ai_match_status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    } else {
      succeeded++;
    }
  }

  const { count: remaining } = await supabase
    .from("supplier_products_normalized")
    .select("*", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .eq("ai_match_status", "pending");

  return {
    batchId,
    attempted: rows.length,
    succeeded,
    failed,
    skipped,
    errors,
    remainingPendingEstimate: remaining ?? undefined,
  };
}
