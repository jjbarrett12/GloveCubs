export type SupplierImportJobStatus =
  | "uploaded"
  | "parsing"
  | "normalizing"
  | "matching"
  | "variant_grouping"
  | "image_enrichment"
  | "ready_for_review"
  | "approved"
  | "publishing"
  | "published"
  | "failed"
  | "cancelled";

export interface SupplierImportJobRow {
  id: string;
  organization_id: string | null;
  supplier_id: string;
  status: SupplierImportJobStatus;
  total_rows: number;
  processed_rows: number;
  error_rows: number;
  current_stage: string;
  file_path: string | null;
  file_type: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
  error_log: unknown;
  batch_id: string | null;
  preview_session_id: string | null;
  resume_cursor: Record<string, unknown>;
  stats: Record<string, unknown>;
  cancel_requested_at: string | null;
}

export interface SupplierImportJobPublic extends SupplierImportJobRow {
  percent_complete: number;
}
