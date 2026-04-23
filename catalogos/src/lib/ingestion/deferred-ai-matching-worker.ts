/**
 * Pass 2: chunked, resumable drain of deferred AI matching for an import batch.
 * Does not run during pass-1 ingestion; schedules after ingest completes (see supplier-import-job runner).
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { AI_MATCHING_ENABLED } from "@/lib/ai/config";
import {
  INGESTION_AI_PASS2_CHUNK_SIZE,
  INGESTION_AI_PASS2_MAX_ROWS_PER_INVOCATION,
} from "@/lib/ingestion/ingestion-config";
import { logBatchStep } from "@/lib/ingestion/batch-service";
import {
  countPendingAiMatchesForBatch,
  runDeferredAiMatchingForBatch,
} from "@/lib/ingestion/batch-ai-matching";
import { getSupplierImportJob, patchSupplierImportJob } from "@/lib/supplier-import-job/service";

function scheduleBackground(fn: () => Promise<void>): void {
  void (async () => {
    try {
      const mod = await import("@vercel/functions");
      if (typeof mod.waitUntil === "function") {
        mod.waitUntil(fn());
        return;
      }
    } catch {
      /* */
    }
    void fn();
  })();
}

async function resolveCategoryId(slug: string): Promise<string> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase.from("categories").select("id").eq("slug", slug).single();
  if (error || !data?.id) throw new Error(`Category not found: ${slug}`);
  return data.id as string;
}

async function isImportJobCancelled(jobId: string): Promise<boolean> {
  const j = await getSupplierImportJob(jobId);
  return Boolean(j?.cancel_requested_at);
}

export interface DeferredAiDrainOptions {
  batchId: string;
  jobId: string;
  chunkSize?: number;
  maxRowsThisInvocation?: number;
}

/**
 * Process up to `maxRowsThisInvocation` AI matches in slices of `chunkSize`, then reschedule if backlog remains.
 */
export async function runDeferredAiMatchingDrainStep(options: DeferredAiDrainOptions): Promise<void> {
  const { batchId, jobId } = options;
  const chunkSize = options.chunkSize ?? INGESTION_AI_PASS2_CHUNK_SIZE;
  const maxRowsThisInvocation =
    options.maxRowsThisInvocation ?? INGESTION_AI_PASS2_MAX_ROWS_PER_INVOCATION;

  if (!AI_MATCHING_ENABLED) {
    return;
  }

  const jobRow = await getSupplierImportJob(jobId);
  if (!jobRow) return;

  if (await isImportJobCancelled(jobId)) {
    return;
  }

  const categoryId = await resolveCategoryId("disposable_gloves");
  let processedThisInvocation = 0;
  let lastRemaining = await countPendingAiMatchesForBatch(batchId).catch(() => 0);

  if (lastRemaining === 0) {
    await patchSupplierImportJob(jobId, {
      stats: {
        ...jobRow.stats,
        ai_pass2_pending: 0,
        ai_pass2_phase: "complete",
      },
    });
    return;
  }

  await patchSupplierImportJob(jobId, {
    current_stage: `AI matching (pass 2, ~${lastRemaining} queued)`,
    stats: {
      ...jobRow.stats,
      phase: "ai_matching_deferred",
      ai_pass2_pending: lastRemaining,
      ai_pass2_phase: "running",
    },
  });

  await logBatchStep(batchId, "deferred_ai_matching", "started", undefined, {
    job_id: jobId,
    pending_estimate: lastRemaining,
  });

  while (processedThisInvocation < maxRowsThisInvocation) {
    if (await isImportJobCancelled(jobId)) {
      await logBatchStep(batchId, "deferred_ai_matching", "failed", "cancelled", { job_id: jobId });
      return;
    }

    const slice = Math.min(chunkSize, maxRowsThisInvocation - processedThisInvocation);
    if (slice <= 0) break;

    const result = await runDeferredAiMatchingForBatch(batchId, { maxRows: slice, categoryId });
    processedThisInvocation += result.succeeded + result.failed;
    lastRemaining = result.remainingPendingEstimate ?? 0;

    const j = await getSupplierImportJob(jobId);
    await patchSupplierImportJob(jobId, {
      stats: {
        ...(j?.stats ?? {}),
        ai_pass2_pending: lastRemaining,
        ai_pass2_last_slice: {
          attempted: result.attempted,
          succeeded: result.succeeded,
          failed: result.failed,
          skipped: result.skipped,
        },
      },
    });

    if (lastRemaining === 0) break;
    if (result.attempted === 0) break;
  }

  const remaining = await countPendingAiMatchesForBatch(batchId).catch(() => lastRemaining);
  const latest = await getSupplierImportJob(jobId);

  if (remaining > 0 && !latest?.cancel_requested_at) {
    await patchSupplierImportJob(jobId, {
      current_stage: `AI matching (pass 2, ~${remaining} queued)`,
      stats: {
        ...(latest?.stats ?? {}),
        ai_pass2_pending: remaining,
        ai_pass2_phase: "running",
      },
    });
    scheduleBackground(() => runDeferredAiMatchingDrainStep(options));
    return;
  }

  await patchSupplierImportJob(jobId, {
    current_stage:
      remaining > 0
        ? `Ready for review (${remaining} still in AI backlog — use POST …/run-ai-matching)`
        : "Ready for review",
    stats: {
      ...(await getSupplierImportJob(jobId))?.stats,
      ai_pass2_pending: remaining,
      ai_pass2_phase: remaining > 0 ? "incomplete" : "complete",
      phase: "ready_for_review",
    },
  });

  await logBatchStep(batchId, "deferred_ai_matching", "success", undefined, {
    job_id: jobId,
    remaining_pending: remaining,
    processed_this_invocation: processedThisInvocation,
  });
}

/**
 * Queue pass-2 drain after pass-1 completes (non-blocking).
 */
export function scheduleDeferredAiMatchingAfterIngest(batchId: string, jobId: string): void {
  if (!AI_MATCHING_ENABLED) {
    return;
  }
  scheduleBackground(() => runDeferredAiMatchingDrainStep({ batchId, jobId }));
}
