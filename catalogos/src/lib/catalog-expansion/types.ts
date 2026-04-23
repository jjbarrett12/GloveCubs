/**
 * Catalog Expansion Agent — types and change detection models.
 */

export type SyncResultType = "new" | "changed" | "unchanged" | "missing";

export interface CatalogSyncRunRow {
  id: string;
  feed_id: string;
  supplier_id: string;
  status: "running" | "completed" | "failed" | "cancelled";
  started_at: string;
  completed_at: string | null;
  stats: SyncRunStats;
  config: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
}

export interface SyncRunStats {
  new_count?: number;
  changed_count?: number;
  unchanged_count?: number;
  missing_count?: number;
  error_count?: number;
}

export interface CatalogSyncItemResultRow {
  id: string;
  run_id: string;
  external_id: string;
  result_type: SyncResultType;
  prior_raw_id: string | null;
  prior_normalized_id: string | null;
  current_batch_raw_id: string | null;
  change_summary: ChangeSummary;
  requires_review: boolean;
  created_at: string;
}

export interface ChangeSummary {
  title_changed?: boolean;
  cost_old?: number;
  cost_new?: number;
  normalized_case_cost_old?: number;
  normalized_case_cost_new?: number;
  case_qty_old?: number;
  case_qty_new?: number;
  price_basis_changed?: boolean;
  availability_changed?: boolean;
  packaging_changed?: boolean;
  [key: string]: unknown;
}

export interface PriorRow {
  external_id: string;
  raw_id: string;
  raw_payload: Record<string, unknown>;
  normalized_id: string | null;
  normalized_data: Record<string, unknown>;
  attributes: Record<string, unknown>;
}

export interface DiscontinuedCandidateRow {
  id: string;
  run_id: string;
  supplier_id: string;
  external_id: string;
  prior_raw_id: string | null;
  prior_normalized_id: string | null;
  status: "pending_review" | "confirmed_discontinued" | "false_positive";
  resolved_at: string | null;
  resolved_by: string | null;
  notes: string | null;
  created_at: string;
}
