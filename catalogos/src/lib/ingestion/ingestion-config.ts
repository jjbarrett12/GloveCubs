/**
 * Large-feed ingestion tuning. Chunk size balances request payload vs transaction scope (single multi-row INSERT).
 */

function envInt(name: string, defaultVal: number, min: number, max: number): number {
  const raw = typeof process !== "undefined" ? process.env[name] : undefined;
  if (raw == null || raw === "") return defaultVal;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return defaultVal;
  return Math.min(max, Math.max(min, n));
}

/** Rows per bulk insert to supplier_products_normalized (one DB round-trip per chunk). */
export const INGESTION_CHUNK_SIZE_DEFAULT = 200;

/** Hard cap on feed rows per run (memory / serverless timeout — use async import for large files). */
export const INGESTION_MAX_FEED_ROWS = 20000;

/** Rows per bulk insert to supplier_products_raw (reduces round-trips for 5k–20k files). */
export const RAW_INSERT_BATCH_SIZE = 250;

/** Retries per row after a failed chunk bulk insert (transient errors). */
export const INGESTION_ROW_INSERT_RETRIES = 1;

/** Rows per deferred AI slice (each slice is one runDeferredAiMatchingForBatch call). */
export const INGESTION_AI_PASS2_CHUNK_SIZE = envInt("CATALOGOS_AI_PASS2_CHUNK_SIZE", 30, 5, 80);

/** Max AI rows per serverless continuation before rescheduling (bounded wall time). */
export const INGESTION_AI_PASS2_MAX_ROWS_PER_INVOCATION = envInt(
  "CATALOGOS_AI_PASS2_MAX_PER_INVOCATION",
  120,
  20,
  500
);
