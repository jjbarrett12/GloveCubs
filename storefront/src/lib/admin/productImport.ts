/**
 * Product import — read-only audit helpers for legacy `product_import_candidates`.
 * Mutating import/approve/reject is disabled; ingestion runs in CatalogOS → catalog_v2 → sync projection.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { FetchResult } from "./urlFetch";
import type { ExtractedProductData, ExtractionResult } from "./productExtraction";

/** Lazy proxy: avoids calling `getSupabaseAdmin()` at import time (Next build collects routes without env). */
const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabaseAdmin() as unknown as SupabaseClient)[prop as keyof SupabaseClient];
  },
}) as SupabaseClient;

/** Same message as POST /admin/api/product-import (410). */
export const PRODUCT_IMPORT_DEPRECATED =
  "Product import runs in the catalog sync service. Use Import from URL in admin.";

// ============================================================================
// TYPES
// ============================================================================

export type CandidateStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "auto_created"
  | "merged";

export interface ProductCandidate {
  id: string;
  source_url: string;
  source_domain: string;
  status: CandidateStatus;

  extracted_data: ExtractedProductData;

  overall_confidence: number;
  field_confidence: Record<string, number>;
  extraction_reasoning: string;
  extraction_sources: string[];
  extraction_warnings: string[];

  potential_duplicates: Array<{
    canonical_product_id: string;
    product_name: string;
    similarity_score: number;
    match_reasons: string[];
  }>;
  duplicate_confidence: number;

  created_by: string;
  created_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;

  created_product_id?: string;
  merged_into_product_id?: string;
}

export interface ImportResult {
  success: boolean;
  candidate_id?: string;
  status: CandidateStatus | "fetch_failed" | "extraction_failed" | "validation_failed";
  candidate?: ProductCandidate;
  fetch_result?: FetchResult;
  extraction_result?: ExtractionResult;
  duplicates?: ProductCandidate["potential_duplicates"];
  error?: string;
}

export interface ApprovalResult {
  success: boolean;
  action: "created" | "merged" | "rejected";
  product_id?: string;
  error?: string;
}

// ============================================================================
// Disabled mutators (no DB writes — CatalogOS is the ingestion path)
// ============================================================================

export async function importProductFromUrl(_url: string, _adminUserId: string): Promise<ImportResult> {
  return {
    success: false,
    status: "validation_failed",
    error: PRODUCT_IMPORT_DEPRECATED,
  };
}

export async function approveCandidate(
  _candidateId: string,
  _adminUserId: string,
  _options: {
    action: "create" | "merge";
    merge_into_product_id?: string;
    override_fields?: Partial<ExtractedProductData>;
    notes?: string;
  }
): Promise<ApprovalResult> {
  return { success: false, action: "rejected", error: PRODUCT_IMPORT_DEPRECATED };
}

export async function rejectCandidate(
  _candidateId: string,
  _adminUserId: string,
  _reason: string
): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: PRODUCT_IMPORT_DEPRECATED };
}

// ============================================================================
// Read-only audit (GET /admin/api/product-import)
// ============================================================================

export async function getPendingCandidates(
  limit: number = 20,
  offset: number = 0
): Promise<{ candidates: ProductCandidate[]; total: number }> {
  const { data, error, count } = await supabaseAdmin
    .from("product_import_candidates")
    .select("*", { count: "exact" })
    .eq("status", "pending_review")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return { candidates: [], total: 0 };
  }

  return {
    candidates: (data || []) as unknown as ProductCandidate[],
    total: count || 0,
  };
}

export async function getCandidate(candidateId: string): Promise<ProductCandidate | null> {
  const { data, error } = await supabaseAdmin
    .from("product_import_candidates")
    .select("*")
    .eq("id", candidateId)
    .single();

  if (error || !data) return null;

  return data as unknown as ProductCandidate;
}
