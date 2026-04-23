/**
 * Batch approval actions for supplier import jobs: bulk row approve + job status → approved.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { getSupplierImportJob, patchSupplierImportJob } from "./service";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export interface ApproveSupplierImportJobBody {
  /** Set specific pending rows to approved (must belong to job batch, have master). */
  normalized_ids?: string[];
  /** Auto-approve pending rows with rules/ingest match confidence ≥ threshold. */
  auto_high_confidence?: {
    min_confidence?: number;
    max_rows?: number;
  };
  /**
   * Mark the import job approved (ready for POST …/publish).
   * Call after review; idempotent if already approved.
   */
  confirm_batch?: boolean;
}

export interface ApproveSupplierImportJobResult {
  job_id: string;
  batch_id: string;
  updated_row_count: number;
  auto_approved_count: number;
  id_approved_count: number;
  job_status: string;
  message?: string;
}

const DEFAULT_AUTO_MIN_CONFIDENCE = 0.85;
const DEFAULT_AUTO_MAX_ROWS = 5000;

/**
 * At least one of normalized_ids, auto_high_confidence, or confirm_batch must be provided.
 */
export async function approveSupplierImportJobActions(
  jobId: string,
  body: ApproveSupplierImportJobBody
): Promise<ApproveSupplierImportJobResult> {
  const hasIds = Array.isArray(body.normalized_ids) && body.normalized_ids.length > 0;
  const hasAuto = body.auto_high_confidence != null;
  const hasConfirm = body.confirm_batch === true;
  if (!hasIds && !hasAuto && !hasConfirm) {
    throw new Error(
      "Provide normalized_ids, auto_high_confidence, and/or confirm_batch: true"
    );
  }

  const job = await getSupplierImportJob(jobId);
  if (!job?.batch_id) throw new Error("Job not found or has no batch");
  if (job.status !== "ready_for_review" && job.status !== "approved") {
    throw new Error(`Job must be ready_for_review or approved (current: ${job.status})`);
  }

  const batchId = job.batch_id;
  const supabase = getSupabaseCatalogos(true);
  let autoApproved = 0;
  let idApproved = 0;

  if (hasAuto) {
    const minConf =
      typeof body.auto_high_confidence?.min_confidence === "number"
        ? body.auto_high_confidence.min_confidence
        : DEFAULT_AUTO_MIN_CONFIDENCE;
    const maxRows =
      typeof body.auto_high_confidence?.max_rows === "number"
        ? Math.min(10_000, Math.max(1, Math.floor(body.auto_high_confidence.max_rows)))
        : DEFAULT_AUTO_MAX_ROWS;

    const { data: candidates, error: selErr } = await supabase
      .from("supplier_products_normalized")
      .select("id")
      .eq("batch_id", batchId)
      .eq("status", "pending")
      .not("master_product_id", "is", null)
      .gte("match_confidence", minConf)
      .order("match_confidence", { ascending: false })
      .limit(maxRows);

    if (selErr) throw new Error(`auto_high_confidence query: ${selErr.message}`);
    const ids = (candidates ?? []).map((r: { id: string }) => r.id).filter(Boolean);
    if (ids.length > 0) {
      const { data: updated, error: upErr } = await supabase
        .from("supplier_products_normalized")
        .update({ status: "approved", updated_at: new Date().toISOString() })
        .in("id", ids)
        .eq("batch_id", batchId)
        .eq("status", "pending")
        .select("id");
      if (upErr) throw new Error(`auto_high_confidence update: ${upErr.message}`);
      autoApproved = (updated ?? []).length;
    }
  }

  if (hasIds) {
    const valid = body.normalized_ids!.filter((x) => typeof x === "string" && UUID_RE.test(x));
    if (valid.length === 0) throw new Error("No valid normalized_ids (UUIDs)");
    const { data: updated, error: upErr } = await supabase
      .from("supplier_products_normalized")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .in("id", valid)
      .eq("batch_id", batchId)
      .eq("status", "pending")
      .not("master_product_id", "is", null)
      .select("id");
    if (upErr) throw new Error(`normalized_ids update: ${upErr.message}`);
    idApproved = (updated ?? []).length;
  }

  const latest = await getSupplierImportJob(jobId);
  if (!latest) throw new Error("Job missing after approve actions");
  const nextAuto = Number(latest.stats?.approve_auto_count ?? 0) + autoApproved;
  const nextId = Number(latest.stats?.approve_id_count ?? 0) + idApproved;

  if (hasConfirm) {
    await patchSupplierImportJob(jobId, {
      status: "approved",
      current_stage: "Approved for publish",
      completed_at: null,
      stats: {
        ...latest.stats,
        phase: "approved",
        approve_auto_count: nextAuto,
        approve_id_count: nextId,
      },
    });
  } else if (autoApproved > 0 || idApproved > 0) {
    await patchSupplierImportJob(jobId, {
      stats: {
        ...latest.stats,
        phase: latest.status === "approved" ? "approved" : "ready_for_review",
        approve_auto_count: nextAuto,
        approve_id_count: nextId,
      },
    });
  }

  const refreshed = await getSupplierImportJob(jobId);
  return {
    job_id: jobId,
    batch_id: batchId,
    updated_row_count: autoApproved + idApproved,
    auto_approved_count: autoApproved,
    id_approved_count: idApproved,
    job_status: refreshed?.status ?? job.status,
    message: hasConfirm
      ? "Job marked approved; call POST …/publish to push to live catalog."
      : undefined,
  };
}
