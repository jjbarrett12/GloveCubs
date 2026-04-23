/**
 * Deterministic row transform: apply mapping to produce standardized ParsedRow for existing pipeline.
 */

import type { FieldMappingItem } from "./types";
import type { ParsedRow } from "@/lib/ingestion/types";

function coerce(value: unknown): unknown {
  if (value == null || value === "") return undefined;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "boolean") return value;
  const s = String(value).trim();
  if (s.toLowerCase() === "true") return true;
  if (s.toLowerCase() === "false") return false;
  const n = Number(s);
  if (!Number.isNaN(n) && s !== "") return n;
  return s;
}

/**
 * Transform a single CSV row (with source column keys) into a standardized row
 * using the given mapping. Result is a ParsedRow with canonical keys for runNormalization.
 */
export function transformRow(
  sourceRow: Record<string, unknown>,
  mappings: FieldMappingItem[]
): ParsedRow {
  const out: ParsedRow = {};
  const sourceColumnToField = new Map(mappings.map((m) => [m.source_column, m.mapped_field]));

  for (const [sourceCol, mappedField] of sourceColumnToField) {
    const raw = sourceRow[sourceCol];
    if (raw === undefined && !(sourceCol in sourceRow)) continue;
    const value = coerce(raw);
    if (value !== undefined && value !== "") {
      out[mappedField] = value;
    }
  }

  return out;
}

/**
 * Transform many rows. Rows are expected to have the same keys (same CSV structure).
 */
export function transformRows(
  sourceRows: Record<string, unknown>[],
  mappings: FieldMappingItem[]
): ParsedRow[] {
  return sourceRows.map((row) => transformRow(row, mappings));
}
