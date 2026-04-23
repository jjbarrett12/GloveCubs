/**
 * Types for AI CSV import: mapping, preview session, validation.
 */

import type { CanonicalFieldName } from "./canonical-fields";

export interface FieldMappingItem {
  source_column: string;
  mapped_field: CanonicalFieldName | string;
  confidence: number;
  notes?: string;
}

export interface InferredMappingResult {
  mappings: FieldMappingItem[];
  unmapped_columns: string[];
  average_confidence: number;
  warnings: string[];
}

export interface ValidationSummary {
  valid_count: number;
  invalid_count: number;
  errors: string[];
  row_errors: { row_index: number; messages: string[] }[];
}

export interface ConfidenceSummary {
  average: number;
  per_field: Record<string, number>;
  low_confidence_fields: string[];
  rows_below_threshold: number;
}

export interface ImportPreviewSessionRow {
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
}
