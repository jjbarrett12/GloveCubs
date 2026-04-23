# Supplier large-batch import pipeline (GloveCubs / CatalogOS)

This document describes how **messy manufacturer files** flow through **AI-assisted mapping**, **staging**, **review**, and **publish**, including what was **already in the repo** and what was **added** in this iteration.

---

## 1. Tables (canonical model — no duplicate `supplier_import_*` staging)

| Table | Schema | Role |
|--------|--------|------|
| `import_batches` | `catalogos` | One run per upload/feed; `stats` JSONB holds progress (`rows_processed`, `chunks_total`, `ingestion_phase`, etc.); `source_kind`, `source_filename`, `preview_session_id` (see `20260630160000_supplier_file_import_batch_metadata.sql`). |
| `supplier_products_raw` | `catalogos` | Immutable parsed rows; `raw_payload` JSONB; `source_row_index` for ordering/retry UX; unique `(batch_id, supplier_id, external_id)`. |
| `supplier_products_normalized` | `catalogos` | **Staging / review**; `normalized_data` JSONB (includes `supplier_sku`, descriptions, `uom`, `pack_size`, `category_guess`, `image_url`, pricing, anomalies); `master_product_id`, `status` (`pending` / `approved` / `merged` / `rejected`). |
| `supplier_offers` | `catalogos` | Created when match confidence is high; links supplier + master product + cost + `raw_id` / `normalized_id`. |
| `import_preview_sessions` | `catalogos` | AI CSV preview: headers, sample rows, `inferred_mapping_json`. |
| `import_profiles` / `import_profile_fields` | `catalogos` | Saved column mappings by `source_fingerprint` (idempotent re-import of same layout). |
| `import_batch_logs` | `catalogos` | Step-level audit (`parse`, `normalize`, …). |
| `review_decisions` | `catalogos` | Approve/reject/merge audit. |
| `publish_events` | `catalogos` | Staging → live publish audit. |

**Idempotency**

- New batch = new `import_batch` id → new raw rows (same file re-upload does not overwrite prior batches).
- Same layout re-upload: `import_profiles` can reuse mapping (see `/api/csv-import/upload` with `infer_mapping`).
- `external_id` per row is derived from content + row index within the batch (`lib/ingestion/external-id.ts`).

---

## 2. API routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/csv-import/upload` | **Upload**: CSV **or** Excel (`spreadsheet_base64` + `mime_type` / `.xlsx` filename). Creates `import_preview_session`, optional AI infer + profile reuse. |
| POST | `/api/csv-import/preview/[id]/infer` | Re-run AI column mapping for a session. |
| POST | `/api/csv-import/preview/[id]/save-profile` | Persist mapping profile. |
| POST | `/api/csv-import/import` | Synchronous import (smaller files). |
| POST | `/api/supplier-import/async-import` | **Large files**: returns `202` + `batchId`; body supports `csv_text` **or** `spreadsheet_base64` (+ filename/mime). |
| GET | `/api/supplier-import/batches/[id]/status` | Poll `import_batches.stats`, recent logs. |
| POST | `/api/supplier-import/batches/[id]/retry-failed` | Re-normalize raw rows missing a normalized row. |
| **GET** | **`/api/supplier-import/batches/[id]/rows`** | **Paginated staging rows** for review UIs (`limit`≤500, `offset`, optional `status`). |
| **POST** | **`/api/supplier-import/batches/[id]/bulk-merge`** | **Bulk assign** shallow keys into `normalized_data` (brand, UOM, pack_size, category_guess, etc.). |
| GET | `/api/review/staging/[id]` | Single row detail + resolution candidates + publish readiness. |
| POST | `/api/publish` | Publish **approved/merged** staging IDs to live (canonical products + offers). |

Server actions in `app/actions/review.ts` handle per-row **approve / reject / create master / merge / publish** (used by dashboard).

---

## 3. Background job design

- **Trigger**: `POST /api/supplier-import/async-import` (non-blocking).
- **Execution**: `startAsyncCsvImportFromSession` (`lib/ingestion/csv-async-import.ts`) schedules work via `@vercel/functions` **`waitUntil`** when available; otherwise `void fn()` (fire-and-forget).
- **Pipeline**: Parse (CSV or xlsx) → `transformRows` (deterministic from AI mapping) → `runPipelineFromParsedBody` → chunked raw insert (`RAW_INSERT_BATCH_SIZE`) → chunked normalize + match + `supplier_products_normalized` insert (`INGESTION_CHUNK_SIZE_DEFAULT` = 200) → batch stats patches between chunks.
- **Limits**: `INGESTION_MAX_FEED_ROWS` = **20 000** (`lib/ingestion/ingestion-config.ts`).
- **Progress**: Poll `GET .../batches/[id]/status` → `stats.rows_processed`, `chunks_processed`, `chunks_total`, `ingestion_phase`.
- **Retry**: `POST .../retry-failed` for rows that failed to normalize.

**PDF**: not implemented in this pass; use manual CSV export or a dedicated doc-ingestion service later.

---

## 4. Review UI requirements (dashboard + API consumers)

**Existing (`/dashboard/ingestion/[batchId]`, `/dashboard/review`)**

- Filter by status / confidence; bulk approve/reject/mark; publish selected / publish all approved.
- Per-row: link to canonical product, create master, merge, edit attributes (server actions).

**Gaps for 5k–20k rows**

- Dashboard pages currently cap list fetches (e.g. 500). For full grids, use **`GET /api/supplier-import/batches/[id]/rows?limit=&offset=`** (added) with virtualized tables.
- **Bulk field fixes**: use **`POST .../bulk-merge`** with `normalized_ids` or `all_pending: true` and `merge: { uom, pack_size, brand, category_guess, ... }`.
- Show **batch status** + **progress** from status endpoint during async ingest.

---

## 5. Where AI parsing fits

| Stage | AI? | Location |
|-------|-----|----------|
| Column mapping (headers + samples) | **Yes** | `inferMappingFromCsv` (`lib/csv-import/ai-mapping-service.ts`) — maps to `CANONICAL_CSV_FIELDS` including `uom`, `pack_size`, `category_guess`, `image_url`, costs, glove attrs. |
| Row transform | **No** | `transformRows` — deterministic apply of mapping. |
| Normalization / dictionary | **Rules** | `runNormalization` + synonym map (`lib/normalization/…`). |
| Match to master | **Rules + optional AI fallback** | `runMatchingWithAIFallback` (`lib/ingestion/ai-orchestration.ts`). |
| UOM / pack / category on staging JSON | **Hints from mapped columns** | `extractSupplierImportHints` merges into `normalized_data` in `ingestion-chunk-runner.ts`. |

**Optional next step (not built here):** batched LLM pass over **description-only** rows to infer `uom` / `pack_size` / `category_guess` when columns are missing — cost-sensitive; gate on row count and sample-only preview.

---

## 6. Field mapping to your target shape

After mapping + transform, canonical keys align with:

- **supplier_sku** → `supplier_sku` / `sku` / … (normalization engine → `supplier_sku` in staging)
- **description** → `product_name` / `description` / …
- **uom**, **pack_size**, **category_guess** → merged into `normalized_data` via hints + staging payload schema (`lib/normalization/staging-payload.ts`)
- **cost** → `supplier_cost` / pricing block
- **brand**, **image_url** → staging content

---

## 7. Implementation order (recommended)

1. **Migrations + Supabase** — ensure `catalogos` tables and `20260630160000` batch metadata exist.
2. **Upload + infer** — `/api/csv-import/upload` + infer + save profile (operators trust mapping once).
3. **Async import** — `async-import` + status polling (large files).
4. **Review data** — paginated **`/rows`** + **`bulk-merge`** (this iteration).
5. **Dashboard** — wire virtualized grid + bulk-merge bar to new APIs.
6. **Excel** — first-sheet xlsx/xls via `spreadsheet-extract` (this iteration).
7. **PDF / OCR** — later microservice or human-in-the-loop export to CSV.
8. **Optional row-level AI enrichment** — controlled batches + cost caps.

---

## 8. Files added or changed (this work)

| File | Change |
|------|--------|
| `catalogos/package.json` | `xlsx` dependency. |
| `catalogos/src/lib/csv-import/spreadsheet-extract.ts` | **New** — xlsx/xls → header row + objects. |
| `catalogos/src/app/api/csv-import/upload/route.ts` | Excel path + `format` in response. |
| `catalogos/src/app/api/supplier-import/async-import/route.ts` | Spreadsheet body support; `sourceKind` excel vs csv. |
| `catalogos/src/lib/ingestion/csv-async-import.ts` | Spreadsheet parsing branch; `sourceKind`. |
| `catalogos/src/lib/review/data.ts` | `offset` on `getStagingRows` (pagination). |
| `catalogos/src/lib/supplier-import/bulk-merge-normalized.ts` | **New** — batched JSONB shallow merge. |
| `catalogos/src/app/api/supplier-import/batches/[id]/rows/route.ts` | **New** — paginated GET. |
| `catalogos/src/app/api/supplier-import/batches/[id]/bulk-merge/route.ts` | **New** — POST bulk merge. |
| `catalogos/src/lib/review/bulk-publish-config.ts` | **New** — constants moved out of `use server` file. |
| `catalogos/src/app/actions/review.ts` | Import bulk publish constants from lib. |
| `catalogos/src/app/actions/review-bulk.test.ts` | Import constants from lib. |
| Misc. dashboard fixes | Unrelated TypeScript fixes encountered during `next build` (Badge/Label/typo/FilterSidebar). |

---

## 9. Assumptions

- CatalogOS Next app runs with **service role** (or equivalent) for these API routes in production; protect with auth middleware / admin gate as you do for other dashboard APIs.
- **`xlsx` (SheetJS)** has known security advisories for untrusted workbooks — only parse files from **authenticated suppliers**; consider sandboxed worker or stricter limits later.
- Full-repo **`next build`** may still fail until remaining pre-existing TypeScript issues are fixed; new supplier-import modules typecheck locally under the same `tsconfig`.
