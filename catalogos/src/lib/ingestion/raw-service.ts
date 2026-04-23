/**
 * Insert raw supplier product rows. Never overwrite; each row is immutable per batch.
 * Uses batched multi-row INSERT for large files (5k–20k rows).
 */

import type { ParsedRow } from "./types";
import { getSupabaseCatalogos } from "@/lib/db/client";
import { deriveExternalIdForParsedRow } from "./external-id";
import { logValidationFailure } from "@/lib/observability";
import { RAW_INSERT_BATCH_SIZE } from "./ingestion-config";

export interface InsertRawInput {
  batchId: string;
  supplierId: string;
  rows: ParsedRow[];
  /** When set, rows whose external_id is already present are skipped (idempotent resume). */
  skipExternalIds?: Set<string>;
}

export interface InsertRawResult {
  rawIds: { externalId: string; rawId: string }[];
  errors: string[];
}

async function insertRawRowsOneByOne(
  supabase: ReturnType<typeof getSupabaseCatalogos>,
  input: InsertRawInput,
  startIndex: number
): Promise<InsertRawResult> {
  const rawIds: { externalId: string; rawId: string }[] = [];
  const errors: string[] = [];
  for (let i = 0; i < input.rows.length; i++) {
    const row = input.rows[i];
    const idx = startIndex + i;
    const extId = deriveExternalIdForParsedRow(row, idx);
    const { data, error } = await supabase
      .from("supplier_products_raw")
      .insert({
        batch_id: input.batchId,
        supplier_id: input.supplierId,
        external_id: extId,
        raw_payload: row ?? {},
        source_row_index: idx,
      })
      .select("id")
      .single();
    if (error) errors.push(`Row ${idx} (${extId}): ${error.message}`);
    else if (data?.id) rawIds.push({ externalId: extId, rawId: data.id as string });
  }
  return { rawIds, errors };
}

/**
 * Insert parsed rows into supplier_products_raw (batched INSERT + per-row fallback).
 */
export async function insertRawRows(input: InsertRawInput): Promise<InsertRawResult> {
  if (!input.batchId?.trim() || !input.supplierId?.trim()) {
    const msg = "insertRawRows: batchId and supplierId are required";
    logValidationFailure(msg, { batchId: input.batchId, supplierId: input.supplierId });
    return { rawIds: [], errors: [msg] };
  }
  if (!input.rows?.length) {
    logValidationFailure("insertRawRows: no rows", { batchId: input.batchId });
    return { rawIds: [], errors: ["No rows to insert"] };
  }

  const supabase = getSupabaseCatalogos(true);
  const rawIds: { externalId: string; rawId: string }[] = [];
  const errors: string[] = [];
  const skip = input.skipExternalIds;

  for (let i = 0; i < input.rows.length; i += RAW_INSERT_BATCH_SIZE) {
    const slice = input.rows.slice(i, i + RAW_INSERT_BATCH_SIZE);
    const records = slice
      .map((row, j) => {
        const idx = i + j;
        const external_id = deriveExternalIdForParsedRow(row, idx);
        return {
          batch_id: input.batchId,
          supplier_id: input.supplierId,
          external_id,
          raw_payload: row ?? {},
          source_row_index: idx,
        };
      })
      .filter((rec) => !skip?.has(rec.external_id));
    if (records.length === 0) continue;

    const { data, error } = await supabase
      .from("supplier_products_raw")
      .insert(records)
      .select("id, external_id");

    if (!error && data && data.length === records.length) {
      for (const row of data) {
        rawIds.push({
          externalId: row.external_id as string,
          rawId: row.id as string,
        });
      }
      continue;
    }

    const bulkMsg = error?.message ?? "bulk insert count mismatch";
    errors.push(`Bulk raw insert rows ${i}-${i + slice.length - 1}: ${bulkMsg}; falling back per-row`);
    for (const rec of records) {
      const { data: one, error: oneErr } = await supabase
        .from("supplier_products_raw")
        .insert({
          batch_id: input.batchId,
          supplier_id: input.supplierId,
          external_id: rec.external_id,
          raw_payload: rec.raw_payload,
          source_row_index: rec.source_row_index,
        })
        .select("id")
        .single();
      if (oneErr) errors.push(`Row ${rec.source_row_index} (${rec.external_id}): ${oneErr.message}`);
      else if (one?.id) rawIds.push({ externalId: rec.external_id, rawId: one.id as string });
    }
  }

  return { rawIds, errors };
}

/** All external_id values already stored for this batch (for idempotent raw insert). */
export async function fetchExistingRawExternalIds(batchId: string): Promise<Set<string>> {
  const supabase = getSupabaseCatalogos(true);
  const out = new Set<string>();
  const page = 5000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("supplier_products_raw")
      .select("external_id")
      .eq("batch_id", batchId)
      .order("id", { ascending: true })
      .range(from, from + page - 1);
    if (error) break;
    const chunk = data ?? [];
    for (const r of chunk) out.add(r.external_id as string);
    if (chunk.length < page) break;
  }
  return out;
}

/** Full ordered raw row list for batch (after idempotent inserts, for normalize pipeline). */
export async function listRawRowsOrderedForBatch(batchId: string): Promise<{
  rawIds: { externalId: string; rawId: string }[];
  parsedRows: ParsedRow[];
}> {
  const supabase = getSupabaseCatalogos(true);
  const rawIds: { externalId: string; rawId: string }[] = [];
  const parsedRows: ParsedRow[] = [];
  const page = 2000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("supplier_products_raw")
      .select("id, external_id, raw_payload, source_row_index")
      .eq("batch_id", batchId)
      .order("source_row_index", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(`listRawRowsOrderedForBatch: ${error.message}`);
    const chunk = data ?? [];
    for (const r of chunk) {
      rawIds.push({ rawId: r.id as string, externalId: r.external_id as string });
      parsedRows.push((r.raw_payload ?? {}) as ParsedRow);
    }
    if (chunk.length < page) break;
  }
  return { rawIds, parsedRows };
}
