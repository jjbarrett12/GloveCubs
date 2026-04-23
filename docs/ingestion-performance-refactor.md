# Ingestion performance and reliability refactor

This document describes how large supplier feeds are ingested in CatalogOS after the performance pass: batched master-product loading, chunked writes, optional background execution, per-chunk atomicity (at the Postgres statement level), row-level retry, richer batch telemetry, and publish-time catalog sync alerting.

## Goals addressed

| Issue | Mitigation |
|--------|------------|
| N+1 master product queries | One `loadMasterProducts(categoryId)` per batch; candidates passed as `masterCandidates` into rules + AI matching (`matchToMaster`, `runMatchingWithAIFallback`). |
| Short API timeout | `POST /api/ingest` `maxDuration` raised to **300s**; optional **`async: true`** returns **202** immediately and runs the pipeline in the background when the runtime supports continuation (see below). |
| Partial / fragile batches | Normalized rows are inserted in **chunks** (multi-row `INSERT`). If the bulk insert fails, the chunk falls back to **per-row inserts** with a small **retry** count. |
| No clear lifecycle | DB column `import_batches.status` stays coarse (`running` / `completed` / `failed`). Detailed lifecycle is stored in **`import_batches.stats.ingestion_phase`** (see below). |
| Publish sync silent failure | After a successful product/offer write, `sync_canonical_products` failures are logged under **`sync_canonical_products_failure`** and **`publish_failure`**, surfaced as a **warning** on the publish result, and sent to **Sentry** / **`error_telemetry`** where configured. |

## Code map

| Component | Role |
|-----------|------|
| `catalogos/src/lib/ingestion/ingestion-config.ts` | Defaults: chunk size (**200**), max feed rows (**5000**), row insert retries (**1**). |
| `catalogos/src/lib/ingestion/match-service.ts` | `MatchInput.masterCandidates`; `loadMasterProducts` exported for batch-level loading. |
| `catalogos/src/lib/ingestion/ai-orchestration.ts` | Forwards `masterCandidates` to `matchToMaster` and reuses the same list for AI candidate summaries. |
| `catalogos/src/lib/ingestion/ingestion-chunk-runner.ts` | Builds normalized rows per chunk, **bulk `INSERT`**, fallback **per-row + retry**, then suggested offers. |
| `catalogos/src/lib/ingestion/run-pipeline.ts` | `runPipeline`, `runPipelineBody`, `startAsyncIngest`, `runPipelineFromParsedRows` / `runPipelineFromParsedBody`; merges metrics into batch stats. |
| `catalogos/src/lib/ingestion/batch-service.ts` | `patchImportBatchStats` for progressive updates; `updateBatchCompletion` merges JSON stats. |
| `catalogos/src/app/api/ingest/route.ts` | `async`, `chunk_size`, `maxDuration`. |
| `catalogos/src/lib/publish/publish-service.ts` | `sync_canonical_products` with dual logging + operator warning. |

## Chunking and “transaction per chunk”

- Each chunk performs a **single** `insert([...rows])` into `supplier_products_normalized`. In Postgres, one `INSERT` with multiple rows is **one statement** and commits atomically with the surrounding transaction (Supabase/PostgREST uses the default transaction per request).
- If that bulk call errors (network, constraint, payload size, etc.), the same chunk is retried **row-by-row** with up to **`INGESTION_ROW_INSERT_RETRIES`** extra attempts per row. Those single-row statements are **not** one atomic chunk; operators should treat a failed bulk + partial row retry as a signal to inspect `import_batch_logs` and `stats`.
- Tuning: **`chunk_size`** on the ingest API is clamped between **50** and **500** to balance payload size, lock duration, and retry blast radius.

## Background (`async`) ingestion

- Request body: `"async": true` (with the usual `feed_id` or `supplier_id` + `feed_url`).
- Response: **202** with `{ batchId, accepted: true, async: true, ... }`.
- Execution: `startAsyncIngest` schedules `runPipelineBody` via **`waitUntil`** from **`@vercel/functions`** when that API exists (typical **Vercel** Node runtime). If the module or API is unavailable, the work is still **started** as a floating promise (`void fn()`), which is sufficient on long-lived Node servers but **may not finish** on a local `next dev` process if the HTTP request lifecycle does not wait—**prefer sync ingest for local smoke tests**, or run ingestion from a worker you control.

## Batch status model

### Column: `import_batches.status` (existing)

Unchanged enum semantics: **`running`**, **`completed`**, **`failed`** (plus any other values your migration already defines). This stays the primary filter for “is the job done?”.

### JSON: `import_batches.stats.ingestion_phase` (new / extended)

Written by the pipeline for operator dashboards and monitoring:

| Phase | Meaning |
|-------|---------|
| **`pending`** | Async job created; worker not started or not yet writing progress. |
| **`processing`** | Fetch/parse/raw insert and/or chunked normalize in progress. |
| **`staged`** | Run **completed** with `import_batches.status = completed`, no anomalies and no recorded row-level errors. |
| **`needs_review`** | Run **completed** but `anomaly_row_count > 0` and/or `error_count > 0` (non-fatal row issues, parse skips, etc.). |
| **`failed`** | Run **failed** (`import_batches.status = failed`) or zero normalized rows when raw rows were expected. |

**`approved`**, **`published`**: not set by the ingestion pipeline. Reserve these for review/publish workflows (e.g. when batch-level approval or “all rows published” jobs run). Document them in the UI as future phases that **overwrite or extend** `ingestion_phase` when those features write to `stats`.

## Metrics (`import_batches.stats`)

Populated on the batch row (merged over the run):

| Field | Description |
|-------|-------------|
| **`rows_processed`** | Count of rows processed through the chunk runner (equals raw row count when all indices produce a result row). |
| **`rows_failed`** | `raw_count - normalized_count` at completion (rows without a normalized id). |
| **`rows_retried`** | Number of **extra** insert attempts after a failed bulk chunk (per-row retry loop). |
| **`processing_time_ms`** | Wall time inside `runIngestionChunks` (normalize + match + bulk insert + offers for all chunks). |
| **`chunks_processed`** / **`chunks_total`** | Progress during `processing`; final `chunks_processed` equals the number of chunk iterations. |
| **`async_ingest`** | `true` when started via `startAsyncIngest`. |

Core counters (`raw_count`, `normalized_count`, `matched_count`, `anomaly_row_count`, `error_count`) remain on `stats` for backward compatibility.

## API: `POST /api/ingest`

Additional optional fields (Zod: `triggerImportSchema`):

- **`async`**: `boolean` — background mode (202).
- **`chunk_size`**: integer **50–500** — overrides default chunk size for that run.

`maxDuration` for this route is **300** seconds (sync runs).

## Publish: `sync_canonical_products` and alerting

After a successful publish of product, attributes, and offer, the service calls:

```sql
select sync_canonical_products();
```

On failure:

1. **`logSyncCanonicalProductsFailure`** — category `sync_canonical_products_failure`, severity **high**, **Sentry** + **`error_telemetry`** when configured.
2. **`logPublishFailure`** — category `publish_failure`, ties the incident to the normalized row / product for on-call searches.
3. The publish call still returns **`success: true`** (the live product/offer write succeeded) with a **warning** string advising that storefront search may be stale until sync is fixed or re-run.

## Operational checklist

1. **Large feeds**: Use **`async: true`** on Vercel (or a dedicated worker) and poll `import_batches` for `status` + `stats.ingestion_phase`.
2. **Stuck `processing`**: Check `import_batch_logs` steps (`fetch`, `parse`, `raw_insert`, `normalize_match`, `family_inference`, `resolution`).
3. **High `rows_retried`**: Investigate DB errors during bulk insert (constraints, types, RLS); consider lowering **`chunk_size`**.
4. **Stale search after publish**: Filter **`error_telemetry`** by `sync_canonical_products_failure` or `publish_failure` with `underlying` message; re-run RPC manually if needed.

## Future improvements

- **True multi-statement chunk transactions** via a Postgres function accepting `jsonb` payloads (single `BEGIN … COMMIT` around the whole chunk including offers, if desired).
- **Queue-based workers** (Supabase `pgmq`, Cloud Tasks, etc.) instead of `waitUntil` for cross-platform background guarantees.
- **Batch-level `approved` / `published`** when product-level publish events are aggregated back to the parent `import_batch`.
