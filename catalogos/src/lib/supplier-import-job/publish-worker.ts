/**
 * Chunked, resumable publish for supplier import jobs (approved/merged staging → products + supplier_offers).
 * Idempotent: skips rows that already have a publish_events row for normalized_id.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { logBatchStep } from "@/lib/ingestion/batch-service";
import { getStagingById } from "@/lib/review/data";
import { evaluatePublishReadiness } from "@/lib/review/publish-guards";
import { buildPublishInputFromStaged, runPublish } from "@/lib/publish/publish-service";
import {
  appendSupplierImportJobError,
  getSupplierImportJob,
  patchSupplierImportJob,
} from "./service";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export const SUPPLIER_IMPORT_PUBLISH_CHUNK_DEFAULT = 30;
export const SUPPLIER_IMPORT_PUBLISH_SCAN_MULTIPLIER = 5;

export async function countUnpublishedReadyForBatch(batchId: string): Promise<number> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase.rpc("supplier_batch_unpublished_ready_count", {
    p_batch_id: batchId,
  });
  if (error) {
    throw new Error(`supplier_batch_unpublished_ready_count: ${error.message}`);
  }
  const n = typeof data === "number" ? data : Number(data);
  return Number.isFinite(n) ? n : 0;
}

type FetchChunkResult = {
  toPublish: string[];
  advanceScanToId: string | null;
  exhausted: boolean;
};

/**
 * Scan forward from scanAfterId: collect up to chunkSize normalized ids that are approved/merged,
 * have master, and have no publish_events row yet.
 */
export async function fetchNextPublishChunk(params: {
  batchId: string;
  scanAfterId: string | null;
  chunkSize: number;
}): Promise<FetchChunkResult> {
  const supabase = getSupabaseCatalogos(true);
  const scanLimit = Math.max(
    params.chunkSize * SUPPLIER_IMPORT_PUBLISH_SCAN_MULTIPLIER,
    100
  );
  const cursor = params.scanAfterId && params.scanAfterId !== ZERO_UUID ? params.scanAfterId : ZERO_UUID;

  const { data: rows, error } = await supabase
    .from("supplier_products_normalized")
    .select("id")
    .eq("batch_id", params.batchId)
    .in("status", ["approved", "merged"])
    .not("master_product_id", "is", null)
    .gt("id", cursor)
    .order("id", { ascending: true })
    .limit(scanLimit);

  if (error) throw new Error(`fetchNextPublishChunk: ${error.message}`);
  const ids = (rows ?? []).map((r: { id: string }) => r.id).filter(Boolean);
  if (ids.length === 0) {
    return { toPublish: [], advanceScanToId: null, exhausted: true };
  }

  const advanceScanToId = ids[ids.length - 1]!;

  const { data: evs, error: evErr } = await supabase
    .from("publish_events")
    .select("normalized_id")
    .in("normalized_id", ids);
  if (evErr) throw new Error(`publish_events lookup: ${evErr.message}`);
  const published = new Set((evs ?? []).map((e: { normalized_id: string }) => e.normalized_id));
  const pending = ids.filter((id) => !published.has(id));
  const toPublish = pending.slice(0, params.chunkSize);

  return {
    toPublish,
    advanceScanToId,
    exhausted: ids.length < scanLimit,
  };
}

export interface RunSupplierImportPublishWorkerParams {
  jobId: string;
  publishedBy?: string | null;
  chunkSize?: number;
  shouldAbort?: () => Promise<boolean>;
}

async function patchPublishProgress(
  jobId: string,
  scanAfterId: string | null,
  counters: {
    published: number;
    failed: number;
    skippedBlocked: number;
    queueTotal: number;
  }
): Promise<void> {
  const j = await getSupplierImportJob(jobId);
  const rc = (j?.resume_cursor ?? {}) as Record<string, unknown>;
  const denom = Math.max(counters.queueTotal, counters.published + counters.failed + counters.skippedBlocked, 1);
  await patchSupplierImportJob(jobId, {
    processed_rows: counters.published,
    error_rows: counters.failed,
    current_stage: `Publishing (${counters.published} live)`,
    resume_cursor: {
      ...rc,
      failed_stage: "publish",
      publish: { scan_after_id: scanAfterId },
    },
    stats: {
      ...(j?.stats ?? {}),
      phase: "publishing",
      publish_succeeded: counters.published,
      publish_failed: counters.failed,
      publish_skipped_blocked: counters.skippedBlocked,
      publish_queue_total: counters.queueTotal,
      percent_complete: Math.min(99, Math.round((100 * counters.published) / denom)),
    },
  });
}

/**
 * Run or resume publish: job must be `approved`, or `failed` with failed_stage publish, or `publishing` (resume).
 */
export async function runSupplierImportPublishWorker(
  params: RunSupplierImportPublishWorkerParams
): Promise<void> {
  const { jobId, publishedBy } = params;
  const chunkSize = params.chunkSize ?? SUPPLIER_IMPORT_PUBLISH_CHUNK_DEFAULT;
  const shouldAbort = params.shouldAbort ?? (async () => false);

  const now = () => new Date().toISOString();
  let job = await getSupplierImportJob(jobId);
  if (!job?.batch_id) return;

  const batchId = job.batch_id;
  let resume = (job.resume_cursor ?? {}) as Record<string, unknown>;
  let publishMeta = (resume.publish ?? {}) as { scan_after_id?: string | null; started_at?: string };
  let scanAfterId: string | null =
    typeof publishMeta.scan_after_id === "string" ? publishMeta.scan_after_id : null;

  const canStart =
    job.status === "approved" ||
    job.status === "publishing" ||
    (job.status === "failed" && resume.failed_stage === "publish");

  if (!canStart) {
    throw new Error(`Publish not allowed in status ${job.status}`);
  }

  await patchSupplierImportJob(jobId, {
    status: "publishing",
    current_stage: "Publishing to live catalog",
    completed_at: null,
    resume_cursor: {
      ...resume,
      failed_stage: "publish",
      publish: {
        ...publishMeta,
        started_at: publishMeta.started_at ?? now(),
      },
    },
  });

  await logBatchStep(batchId, "supplier_import_publish", "started", undefined, { job_id: jobId });

  let published = Number(job.stats?.publish_succeeded ?? 0);
  let skippedBlocked = Number(job.stats?.publish_skipped_blocked ?? 0);
  let failed = Number(job.stats?.publish_failed ?? 0);

  if (job.status === "approved") {
    published = 0;
    skippedBlocked = 0;
    failed = 0;
    scanAfterId = null;
  }

  let queueTotal = 0;
  try {
    queueTotal = await countUnpublishedReadyForBatch(batchId);
  } catch {
    queueTotal = 0;
  }

  const mergeJobSnapshot = async () => {
    const next = (await getSupplierImportJob(jobId)) ?? job;
    if (!next) return;
    job = next;
    resume = (job.resume_cursor ?? {}) as Record<string, unknown>;
    publishMeta = (resume.publish ?? {}) as { scan_after_id?: string | null };
  };

  try {
    for (;;) {
      if (await shouldAbort()) {
        await mergeJobSnapshot();
        await patchSupplierImportJob(jobId, {
          status: "cancelled",
          completed_at: now(),
          current_stage: "Cancelled during publish",
          resume_cursor: {
            ...resume,
            failed_stage: "publish",
            publish: { ...publishMeta, scan_after_id: scanAfterId },
          },
          stats: {
            ...(job.stats ?? {}),
            phase: "cancelled",
            publish_succeeded: published,
            publish_failed: failed,
            publish_skipped_blocked: skippedBlocked,
            publish_queue_total: queueTotal,
          },
        });
        await logBatchStep(batchId, "supplier_import_publish", "failed", "Cancelled", {
          job_id: jobId,
          published,
        });
        return;
      }

      const { toPublish, advanceScanToId, exhausted } = await fetchNextPublishChunk({
        batchId,
        scanAfterId,
        chunkSize,
      });

      if (toPublish.length === 0) {
        if (advanceScanToId) {
          scanAfterId = advanceScanToId;
          await mergeJobSnapshot();
          await patchSupplierImportJob(jobId, {
            resume_cursor: {
              ...resume,
              failed_stage: "publish",
              publish: { ...publishMeta, scan_after_id: scanAfterId },
            },
          });
        }
        if (exhausted) break;
        continue;
      }

      let abortedChunk = false;
      for (const normalizedId of toPublish) {
        if (await shouldAbort()) {
          abortedChunk = true;
          break;
        }

        const row = await getStagingById(normalizedId);
        if (!row) {
          failed++;
          await appendSupplierImportJobError(jobId, {
            stage: "publish",
            message: `${normalizedId}: staging row not found`,
          });
          continue;
        }

        const status = row.status as string;
        if (status !== "approved" && status !== "merged") {
          skippedBlocked++;
          await appendSupplierImportJobError(jobId, {
            stage: "publish",
            message: `${normalizedId}: not approved (status=${status})`,
          });
          continue;
        }

        const masterId = row.master_product_id as string | null;
        if (!masterId) {
          skippedBlocked++;
          await appendSupplierImportJobError(jobId, {
            stage: "publish",
            message: `${normalizedId}: missing master_product_id`,
          });
          continue;
        }

        const readiness = await evaluatePublishReadiness(normalizedId);
        if (!readiness.canPublish) {
          skippedBlocked++;
          await appendSupplierImportJobError(jobId, {
            stage: "publish",
            message: `${normalizedId}: ${readiness.blockers.join("; ")}`,
          });
          continue;
        }

        const input = buildPublishInputFromStaged(normalizedId, row, {
          masterProductId: masterId,
          publishedBy: publishedBy ?? undefined,
        });
        if (!input) {
          failed++;
          await appendSupplierImportJobError(jobId, {
            stage: "publish",
            message: `${normalizedId}: could not build publish input`,
          });
          continue;
        }

        const result = await runPublish(input);
        if (!result.success) {
          failed++;
          await appendSupplierImportJobError(jobId, {
            stage: "publish",
            message: `${normalizedId}: ${result.error}`,
          });
          continue;
        }

        published++;
        scanAfterId = normalizedId;
      }

      await patchPublishProgress(jobId, scanAfterId, {
        published,
        failed,
        skippedBlocked,
        queueTotal,
      });

      if (abortedChunk) {
        await mergeJobSnapshot();
        await patchSupplierImportJob(jobId, {
          status: "cancelled",
          completed_at: now(),
          current_stage: "Cancelled during publish",
          resume_cursor: {
            ...resume,
            failed_stage: "publish",
            publish: { ...publishMeta, scan_after_id: scanAfterId },
          },
          stats: {
            ...(job.stats ?? {}),
            phase: "cancelled",
            publish_succeeded: published,
            publish_failed: failed,
            publish_skipped_blocked: skippedBlocked,
            publish_queue_total: queueTotal,
          },
        });
        await logBatchStep(batchId, "supplier_import_publish", "failed", "Cancelled", {
          job_id: jobId,
          published,
        });
        return;
      }
    }

    await mergeJobSnapshot();
    let remaining: number | null = null;
    try {
      remaining = await countUnpublishedReadyForBatch(batchId);
    } catch {
      remaining = null;
    }

    const successPayload = {
      job_id: jobId,
      published,
      skipped_blocked: skippedBlocked,
      failed,
      remaining_unpublished: remaining,
    };

    if (remaining != null && remaining > 0) {
      await patchSupplierImportJob(jobId, {
        status: "approved",
        completed_at: null,
        current_stage: `${remaining} row(s) still queued for publish — call POST …/publish again`,
        processed_rows: published,
        error_rows: failed,
        resume_cursor: {
          ...resume,
          failed_stage: null,
          publish: { ...publishMeta, scan_after_id: null, paused_at: now(), remaining },
        },
        stats: {
          ...(job.stats ?? {}),
          phase: "approved",
          publish_succeeded: published,
          publish_failed: failed,
          publish_skipped_blocked: skippedBlocked,
          publish_queue_total: queueTotal,
          percent_complete: queueTotal > 0 ? Math.min(99, Math.round((100 * published) / queueTotal)) : 100,
          publish_remaining_after_run: remaining,
        },
      });
      await logBatchStep(batchId, "supplier_import_publish", "success", undefined, {
        ...successPayload,
        note: "paused_with_remaining",
      });
      return;
    }

    await patchSupplierImportJob(jobId, {
      status: "published",
      completed_at: now(),
      current_stage: remaining == null ? "Published (count RPC skipped)" : "Published",
      processed_rows: published,
      error_rows: failed,
      resume_cursor: {
        ...resume,
        failed_stage: null,
        publish: { ...publishMeta, scan_after_id: null, completed_at: now() },
      },
      stats: {
        ...(job.stats ?? {}),
        phase: "published",
        publish_succeeded: published,
        publish_failed: failed,
        publish_skipped_blocked: skippedBlocked,
        publish_queue_total: queueTotal,
        percent_complete: 100,
        publish_remaining_after_run: 0,
      },
    });
    await logBatchStep(batchId, "supplier_import_publish", "success", undefined, successPayload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await mergeJobSnapshot();
    await appendSupplierImportJobError(jobId, { stage: "publish", message: msg });
    await patchSupplierImportJob(jobId, {
      status: "failed",
      completed_at: now(),
      current_stage: "Publish failed",
      resume_cursor: {
        ...resume,
        failed_stage: "publish",
        publish: { ...publishMeta, scan_after_id: scanAfterId },
        last_error: msg,
      },
      stats: {
        ...(job.stats ?? {}),
        phase: "failed",
        publish_succeeded: published,
        publish_failed: failed,
        publish_skipped_blocked: skippedBlocked,
      },
    });
    await logBatchStep(batchId, "supplier_import_publish", "failed", msg, { job_id: jobId });
  }
}
