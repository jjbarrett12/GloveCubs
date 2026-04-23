/**
 * Resume normalize/match for raw rows that never received supplier_products_normalized
 * (idempotent; uses catalogos.supplier_raw_rows_missing_normalized RPC).
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { loadSynonymMap } from "@/lib/catalogos/dictionary-service";
import { runIngestionChunks, type ChunkRunnerResult } from "./ingestion-chunk-runner";
import type { ParsedRow } from "./types";
import { INGESTION_CHUNK_SIZE_DEFAULT } from "./ingestion-config";

type GapRow = {
  id: string;
  external_id: string;
  raw_payload: Record<string, unknown>;
  source_row_index: number;
};

function mergeChunkResults(parts: ChunkRunnerResult[]): ChunkRunnerResult {
  if (parts.length === 0) {
    return {
      rowResults: [],
      matchedCount: 0,
      anomalyRowCount: 0,
      errors: [],
      processingTimeMs: 0,
      chunksProcessed: 0,
      rowsRetried: 0,
    };
  }
  return {
    rowResults: parts.flatMap((p) => p.rowResults),
    matchedCount: parts.reduce((s, p) => s + p.matchedCount, 0),
    anomalyRowCount: parts.reduce((s, p) => s + p.anomalyRowCount, 0),
    errors: parts.flatMap((p) => p.errors),
    processingTimeMs: parts.reduce((s, p) => s + p.processingTimeMs, 0),
    chunksProcessed: parts.reduce((s, p) => s + p.chunksProcessed, 0),
    rowsRetried: parts.reduce((s, p) => s + p.rowsRetried, 0),
    aborted: parts.some((p) => p.aborted),
  };
}

export async function runNormalizationGapsForBatch(input: {
  batchId: string;
  supplierId: string;
  categoryId: string;
  chunkSize?: number;
  errors: string[];
  onChunkComplete?: Parameters<typeof runIngestionChunks>[0]["onChunkComplete"];
  shouldAbort?: Parameters<typeof runIngestionChunks>[0]["shouldAbort"];
}): Promise<ChunkRunnerResult> {
  const supabase = getSupabaseCatalogos(true);
  const chunkSize = input.chunkSize ?? INGESTION_CHUNK_SIZE_DEFAULT;
  const synonymMap = await loadSynonymMap();
  const parts: ChunkRunnerResult[] = [];
  const safetyMaxIterations = 5000;
  let iterations = 0;

  while (iterations < safetyMaxIterations) {
    iterations++;
    const { data, error } = await supabase.rpc("supplier_raw_rows_missing_normalized", {
      p_batch_id: input.batchId,
      p_limit: chunkSize,
    });
    if (error) {
      input.errors.push(`Gap RPC failed: ${error.message}`);
      break;
    }
    const gapRows = (data ?? []) as GapRow[];
    if (gapRows.length === 0) break;

    const rawIds = gapRows.map((r) => ({
      externalId: r.external_id,
      rawId: r.id,
    }));
    const parsedRows = gapRows.map((r) => (r.raw_payload ?? {}) as ParsedRow);

    const chunkOut = await runIngestionChunks({
      batchId: input.batchId,
      supplierId: input.supplierId,
      categoryId: input.categoryId,
      rawIds,
      parsedRows,
      synonymMap,
      errors: input.errors,
      chunkSize: gapRows.length,
      onChunkComplete: input.onChunkComplete,
      shouldAbort: input.shouldAbort,
    });
    parts.push(chunkOut);
    if (await input.shouldAbort?.()) break;
  }

  return mergeChunkResults(parts);
}
