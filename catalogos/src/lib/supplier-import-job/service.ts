/**
 * CRUD + progress helpers for catalogos.supplier_import_jobs.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import type { SupplierImportJobPublic, SupplierImportJobRow, SupplierImportJobStatus } from "./types";

const MAX_ERROR_LOG = 100;

export function computePercentComplete(job: Pick<SupplierImportJobRow, "total_rows" | "processed_rows">): number {
  const t = job.total_rows;
  if (!t || t <= 0) return 0;
  return Math.min(100, Math.round((job.processed_rows / t) * 100));
}

export function toPublicJob(row: SupplierImportJobRow): SupplierImportJobPublic {
  return {
    ...row,
    percent_complete: computePercentComplete(row),
  };
}

export async function insertSupplierImportJob(input: {
  organizationId?: string | null;
  supplierId: string;
  batchId: string;
  previewSessionId?: string | null;
  filePath?: string | null;
  fileType?: string | null;
}): Promise<SupplierImportJobRow> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("supplier_import_jobs")
    .insert({
      organization_id: input.organizationId ?? null,
      supplier_id: input.supplierId,
      batch_id: input.batchId,
      preview_session_id: input.previewSessionId ?? null,
      file_path: input.filePath ?? null,
      file_type: input.fileType ?? null,
      status: "uploaded",
      current_stage: "Queued",
      stats: { phase: "uploaded" },
    })
    .select("*")
    .single();
  if (error) throw new Error(`insertSupplierImportJob: ${error.message}`);
  return data as SupplierImportJobRow;
}

export async function getSupplierImportJob(id: string): Promise<SupplierImportJobRow | null> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase.from("supplier_import_jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SupplierImportJobRow) ?? null;
}

export async function listSupplierImportJobs(options: {
  supplierId?: string;
  organizationId?: string;
  limit?: number;
}): Promise<SupplierImportJobRow[]> {
  const supabase = getSupabaseCatalogos(true);
  let q = supabase.from("supplier_import_jobs").select("*").order("created_at", { ascending: false });
  if (options.supplierId) q = q.eq("supplier_id", options.supplierId);
  if (options.organizationId) q = q.eq("organization_id", options.organizationId);
  q = q.limit(options.limit ?? 50);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierImportJobRow[];
}

/**
 * Jobs visible to an organization: organization_id matches, or legacy rows (null org) tied to a supplier in that org.
 */
export async function listSupplierImportJobsForOrganization(options: {
  organizationId: string;
  supplierId?: string;
  limit?: number;
}): Promise<SupplierImportJobRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const limit = options.limit ?? 50;
  const chunk = Math.min(200, Math.max(limit * 2, 60));

  const { data: orgSuppliers, error: supErr } = await supabase
    .from("suppliers")
    .select("id")
    .eq("organization_id", options.organizationId);
  if (supErr) throw new Error(supErr.message);
  const supplierIds = (orgSuppliers ?? []).map((r: { id: string }) => r.id).slice(0, 500);

  let qTagged = supabase
    .from("supplier_import_jobs")
    .select("*")
    .eq("organization_id", options.organizationId)
    .order("created_at", { ascending: false })
    .limit(chunk);
  if (options.supplierId) qTagged = qTagged.eq("supplier_id", options.supplierId);
  const { data: tagged, error: tErr } = await qTagged;
  if (tErr) throw new Error(tErr.message);

  const rowsTagged = (tagged ?? []) as SupplierImportJobRow[];
  if (supplierIds.length === 0) {
    return rowsTagged.slice(0, limit);
  }

  let qLegacy = supabase
    .from("supplier_import_jobs")
    .select("*")
    .is("organization_id", null)
    .in("supplier_id", supplierIds)
    .order("created_at", { ascending: false })
    .limit(chunk);
  if (options.supplierId) qLegacy = qLegacy.eq("supplier_id", options.supplierId);
  const { data: legacy, error: lErr } = await qLegacy;
  if (lErr) throw new Error(lErr.message);

  const byId = new Map<string, SupplierImportJobRow>();
  for (const r of rowsTagged) byId.set(r.id, r);
  for (const r of (legacy ?? []) as SupplierImportJobRow[]) {
    if (!byId.has(r.id)) byId.set(r.id, r);
  }
  return [...byId.values()]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit);
}

export async function patchSupplierImportJob(
  id: string,
  patch: Partial<{
    status: SupplierImportJobStatus;
    total_rows: number;
    processed_rows: number;
    error_rows: number;
    current_stage: string;
    started_at: string | null;
    completed_at: string | null;
    error_log: unknown[];
    resume_cursor: Record<string, unknown>;
    stats: Record<string, unknown>;
    cancel_requested_at: string | null;
  }>
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase
    .from("supplier_import_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function appendSupplierImportJobError(
  id: string,
  entry: { stage: string; message: string; at?: string }
): Promise<void> {
  const job = await getSupplierImportJob(id);
  if (!job) return;
  const prev = Array.isArray(job.error_log) ? [...(job.error_log as unknown[])] : [];
  prev.push({
    at: entry.at ?? new Date().toISOString(),
    stage: entry.stage,
    message: entry.message,
  });
  const trimmed = prev.slice(-MAX_ERROR_LOG);
  await patchSupplierImportJob(id, { error_log: trimmed as unknown[] });
}
