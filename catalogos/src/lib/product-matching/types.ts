/**
 * Product Matching Agent — types.
 */

export type MatchRunScope = "batch" | "all_pending";

export type MatchRunStatus = "running" | "completed" | "failed" | "cancelled";

export interface ProductMatchRunRow {
  id: string;
  batch_id: string | null;
  scope: MatchRunScope;
  status: MatchRunStatus;
  started_at: string;
  completed_at: string | null;
  stats: MatchRunStats;
  config: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
}

export interface MatchRunStats {
  total?: number;
  matched?: number;
  uncertain?: number;
  no_match?: number;
  duplicates_found?: number;
}

export type MatchReason =
  | "upc_exact"
  | "attribute_match"
  | "fuzzy_title"
  | "no_match"
  | "no_candidates";

export interface CandidateEntry {
  product_id: string;
  score: number;
  matched_attrs?: string[];
}

export interface ProductMatchCandidateRow {
  id: string;
  run_id: string;
  normalized_id: string;
  suggested_master_product_id: string | null;
  confidence: number;
  reason: MatchReason | string;
  candidate_list: CandidateEntry[];
  duplicate_warning: boolean;
  requires_review: boolean;
  created_at: string;
}

export type DuplicateCandidateStatus = "pending_review" | "merged" | "dismissed";

export interface ProductDuplicateCandidateRow {
  id: string;
  run_id: string | null;
  product_id_a: string;
  product_id_b: string;
  score: number;
  reason: string | null;
  status: DuplicateCandidateStatus;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export interface MatchResult {
  suggested_master_product_id: string | null;
  confidence: number;
  reason: MatchReason;
  candidate_list: CandidateEntry[];
  duplicate_warning: boolean;
  requires_review: boolean;
}
