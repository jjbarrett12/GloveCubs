# Supplier catalog import — large batch & AI-assisted pipeline (GloveCubs / CatalogOS)

This document describes how **messy manufacturer files** flow through **parse → stage → review → approve → publish**, with emphasis on **5k–20k rows**, **background processing**, and **where AI fits**. It aligns with the **implemented** schema and API routes in this repo.

---

## 1. Tables (canonical model — no duplicate `supplier_import_*`)

Staging is intentionally **not** split into parallel `supplier_import_batches` / `supplier_import_rows` tables. The existing CatalogOS model already provides the same roles:

| Concept | Table | Purpose |
|--------|--------|--------|
| Batch / job | `catalogos.import_batches` | One run per upload or feed; `status`, `stats` JSONB (progress, phases, counts). |
| Immutable source row | `catalogos.supplier_products_raw` | `raw_payload` JSONB, `external_id`, `batch_id`, optional `source_row_index`. |
| Editable staging row | `catalogos.supplier_products_normalized` | `normalized_data` JSONB, `attributes`, `master_product_id`, `status` (`pending` / `approved` / …). |
| Column mapping memory | `catalogos.import_profiles` + `import_profile_fields` | Reuse mapping by `source_fingerprint`. |
| AI preview | `catalogos.import_preview_sessions` | Headers, samples, inferred mapping, validation summary. |
| Match candidates | `catalogos.product_resolution_candidates` | Link to canonical product or “new” in review. |
| Commercial line | `catalogos.supplier_offers` | Created when match confidence is high; tied to `normalized_id` / `raw_id`. |
| Audit | `catalogos.import_batch_logs` | Step-level events. |

**Migration `20260630160000_supplier_file_import_batch_metadata.sql`** adds:

- `import_batches.source_kind` (`feed` | `csv_upload` | `excel` | `pdf` | `other`)
- `import_batches.preview_session_id` → `import_preview_sessions`
- `import_batches.source_filename`
- `supplier_products_raw.source_row_index` (ordering / progress / retry UX)

---

## 2. API routes

| Method | Path | Role |
|--------|------|------|
| POST | `/api/csv-import/upload` | Parse CSV/TSV sample, create **preview session**; optional `infer_mapping` (AI or saved profile). |
| POST | `/api/csv-import/preview/[id]/infer` | Run **AI column mapping** for a session. |
| POST | `/api/csv-import/preview/[id]/save-profile` | Persist mapping for reuse. |
| POST | `/api/csv-import/import` | **Synchronous** full import (blocking); up to `INGESTION_MAX_FEED_ROWS` (20k). |
| POST | `/api/supplier-import/async-import` | **Default async**: returns `202` + `batchId`; parse/transform/ingest in **background** (`waitUntil` on Vercel). Body: `session_id`, `supplier_id`, `csv_text`, optional `filename`; `sync: true` for blocking behavior. |
| GET | `/api/supplier-import/batches/[id]/status` | Poll `import_batches` + recent `import_batch_logs`. |
| POST | `/api/supplier-import/batches/[id]/retry-failed` | Re-run normalize/match for **raw rows with no normalized sibling** (idempotent). |
| POST | `/api/ingest` | Feed **URL** ingestion (CSV/JSON), optional `async: true`. |

**Assumptions:** callers use **service role** or trusted server context where applicable; lock these behind **admin auth** at the edge in production.

---

## 3. Background job design

1. **Async CSV (recommended for large files)**  
   - Handler validates preview session → creates `import_batches` row → returns `batchId`.  
   - Background work: `parseCsv` → `transformRows` (deterministic from AI mapping) → `insertRawRows` (batched) → `runIngestionChunks` (normalize, match, bulk insert normalized, offers).  
   - **Progress:** `import_batches.stats` updated per chunk (`rows_processed`, `chunks_processed`, `chunks_total`, `ingestion_phase`).

2. **Feed URL**  
   - Same chunk runner after fetch/parse; `startAsyncIngest` in `/api/ingest`.

3. **Retries**  
   - `retry-failed` recomputes “raw without normalized” and runs **only** those rows through `runIngestionChunks` again (no duplicate raw inserts).

4. **Limits**  
   - `INGESTION_MAX_FEED_ROWS = 20000` (`ingestion-config.ts`).  
   - `RAW_INSERT_BATCH_SIZE = 250` for fewer round-trips on raw inserts.  
   - Serverless **CPU/time** still caps practical file size; for **very** large files, next step is **object storage + worker** (see below).

---

## 4. Review UI requirements (existing + gaps)

**Already supported (CatalogOS dashboard):**

- Batch list and links from URL import jobs to batches.
- Staging review: `supplier_products_normalized` with `pending` status, resolution candidates, flags.

**Recommended UI work for this workflow:**

| Requirement | Suggested implementation |
|---------------|---------------------------|
| Edit fields | Form bound to `normalized_data` + `attributes`; PATCH via existing review/staging APIs or server actions. |
| Link to canonical | Use `product_resolution_candidates` + approve action setting `master_product_id`. |
| Create canonical | “New product” path in review → create `catalogos.products` then attach. |
| Bulk assign category / brand / UOM | Multi-select rows → server action batch-updating `normalized_data` / `attributes` (and optional `import_hints`: `uom`, `pack_size`, `category_guess`). |
| Progress | Poll `GET .../batches/[id]/status`; show `stats.ingestion_phase`, `rows_processed`, `chunks_total`. |
| Retry | Button calling `POST .../retry-failed` when phase `completed` but counts show gaps. |

---

## 5. Where AI parsing fits

| Stage | AI? | Notes |
|-------|-----|--------|
| **Column mapping** | **Yes** | `inferMappingFromCsv` — headers + sample rows → JSON mapping to canonical fields (`ai-mapping-service.ts`). |
| **Row transform** | No | Deterministic `transformRows` from mapping. |
| **UOM / pack / category text** | **Optional / hybrid** | Mapped columns flow into `normalized_data` as `uom`, `pack_size`, `category_guess` via `extractSupplierImportHints` (`import-hints.ts`). Future: small model pass per **chunk** for messy free-text cells. |
| **Normalization & attributes** | Rules-first | `runNormalization` + synonym dictionary; AI fallback already exists for **matching** (`runMatchingWithAIFallback`). |
| **Category guess** | Heuristic + optional AI | `category_guess` stored for reviewers; rules engine still assigns `category_slug` for publish-safe paths. |

**Excel / PDF:** not in `package.json` yet — plan: **convert to row iterator** (e.g. `xlsx` / extraction service) → same preview session + pipeline as CSV.

---

## 6. Idempotency & re-runs

- **New upload** → new `import_batches` id → new raw rows; no overwrite of prior batches.  
- **Within a batch:** `(batch_id, supplier_id, external_id)` unique on `supplier_products_raw`; `deriveExternalIdForParsedRow` prefers `supplier_sku`.  
- **Re-import same file:** new batch (auditable history). To **upsert** offers against live catalog, use existing publish/offer upsert logic on **approve**, not on raw re-insert.  
- **Retry:** only fills **missing** normalized rows; safe to call multiple times.

---

## 7. Implementation order (what to build first)

1. **Done in this change set:** batch metadata migration, 20k row cap, batched raw insert, async CSV entrypoint, status + retry APIs, import hints in `normalized_data`, canonical field list + AI prompt for UOM/pack/category columns.  
2. **Next:** Admin auth on all import routes; optional **Supabase Storage** upload + worker reading chunks (removes huge JSON body limit).  
3. **Then:** Excel parser + optional PDF table extraction service.  
4. **UI:** Bulk edit + bulk assign + progress bar wired to status API.  
5. **Optional:** Per-row AI enrichment job (queued) for rows flagged `AI_SUGGESTED_NEEDS_REVIEW`.

---

## 8. Structured fields → storage

| Field | Primary storage |
|-------|------------------|
| `supplier_sku` | `normalized_data.supplier_sku` / matching keys |
| `description` | `normalized_data` long/short description |
| `uom` | `normalized_data.uom` (hint) |
| `pack_size` | `normalized_data.pack_size` (hint) |
| `cost` | `normalized_data.supplier_cost` / pricing |
| `brand` | `normalized_data.brand` |
| `category_guess` | `normalized_data.category_guess` |
| `image_url` | `normalized_data.images[]` |

Publish/approve flows continue to use existing **review actions** and **publish service** to create/update `catalogos.products`, `supplier_offers`, and readiness for search/publish.
