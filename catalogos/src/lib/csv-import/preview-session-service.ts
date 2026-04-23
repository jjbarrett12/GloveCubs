/**
 * Import preview session: create on upload, store headers/sample, update with inferred mapping.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import type { InferredMappingResult, ValidationSummary, ConfidenceSummary } from "./types";

export interface CreatePreviewSessionInput {
  supplierId: string | null;
  filename: string | null;
  headers: string[];
  sampleRows: Record<string, unknown>[];
}

export async function createPreviewSession(
  input: CreatePreviewSessionInput
): Promise<{ id: string }> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("import_preview_sessions")
    .insert({
      supplier_id: input.supplierId,
      filename: input.filename,
      headers_json: input.headers,
      sample_rows_json: input.sampleRows,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: (data as { id: string }).id };
}

export async function updatePreviewSessionMapping(
  sessionId: string,
  inferred: InferredMappingResult,
  validationSummary: ValidationSummary | null,
  confidenceSummary: ConfidenceSummary
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase
    .from("import_preview_sessions")
    .update({
      inferred_mapping_json: inferred,
      validation_summary_json: validationSummary,
      confidence_summary_json: confidenceSummary,
      status: "draft",
    })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

export async function getPreviewSession(sessionId: string) {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("import_preview_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (error || !data) return null;
  return data as {
    id: string;
    supplier_id: string | null;
    filename: string | null;
    headers_json: string[];
    sample_rows_json: Record<string, unknown>[];
    inferred_mapping_json: InferredMappingResult | null;
    validation_summary_json: ValidationSummary | null;
    confidence_summary_json: ConfidenceSummary | null;
    status: string;
    created_at: string;
  };
}

export async function setPreviewSessionStatus(
  sessionId: string,
  status: "confirmed" | "imported" | "cancelled"
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase
    .from("import_preview_sessions")
    .update({ status })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}
