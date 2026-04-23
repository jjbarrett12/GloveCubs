# Import Readiness Audit

Audit and hardening of the GloveCubs product import pipeline for safe bulk supplier imports (100–1000 rows).

## 1. Current Import Flow

### Where imports enter

| Entry point | Purpose |
|-------------|---------|
| **POST /api/ingest** | Main path: body `{ feed_id }` or `{ supplier_id, feed_url }`. Resolves category, calls `runPipeline`. |
| **POST /api/openclaw/run** | Scrape/extract from URLs; returns rows for staging. Does **not** write to DB; output is for manual or separate import. |
| **Dashboard Feeds** | "Run import" uses `/api/ingest` with feed_id. |
| **Onboarding** | Trigger ingestion after onboarding can call the same pipeline (e.g. via runPipeline). |

### Flow (raw → live)

1. **Fetch** – `fetchFeed(feedUrl)` → body + content-type (CSV/JSON).
2. **Parse** – `parseFeed(fetched)` → `ParsedRow[]` (CSV or JSON/JSONL).
3. **Batch** – `createImportBatch({ feedId, supplierId })` → `import_batches` row, status `running`.
4. **Raw insert** – `insertRawRows({ batchId, supplierId, rows })` → `supplier_products_raw` (one row per parsed row).
5. **Per row:**
   - **Normalize** – `runNormalization(row)` (normalization-engine: content + category + dictionary attributes + case-cost). Uses `extractContentFromRaw`, `normalizeToCaseCost`, `extractDisposableGloveAttributes` / work gloves.
   - **Match** – `runMatchingWithAIFallback(normalized, …)` → master product id + confidence (or create new master in some flows; in Phase 1 ingest we only match to existing).
   - **Price** – `computeSellPrice(cost, …)`.
   - **Anomalies** – `flagAnomalies(rawRow, normalized, …)` (missing image, duplicate SKU in batch, conflicting case qty, etc.).
   - **Staging insert** – `supplier_products_normalized` (normalized_data, attributes, match_confidence, master_product_id, status `pending`).
   - **Offer** – If matched and confidence ≥ threshold, `createSuggestedOffer(supplierId, masterProductId, supplierSku, cost, …)` → upsert `supplier_offers`.
6. **Batch completion** – `updateBatchCompletion(batchId, "completed", stats)`.
7. **Publish (separate)** – Not part of ingest. Review/approve in dashboard → publish action → `runPublish` → create/update `products`, `product_attributes`, `supplier_offers`, `publish_events`; optionally `sync_canonical_products`.

### Tables used

- **import_batches** – one per run; stats (raw_count, normalized_count, matched_count, anomaly_row_count, error_count).
- **import_batch_logs** – step logs (fetch, parse, raw_insert, normalize_match).
- **supplier_products_raw** – immutable raw payload per row.
- **supplier_products_normalized** – normalized + attributes + match + status.
- **supplier_offers** – one per (supplier_id, product_id, supplier_sku); upsert on conflict.
- **products** / **product_attributes** – only created/updated on **publish**, not in ingest.

### Duplicates

- **Same supplier + same SKU in one batch:** Both rows are inserted (raw + normalized). Anomaly flag `duplicate_supplier_sku_in_batch` is set; no automatic skip.
- **Same supplier + same SKU across batches:** When matched to same master, `createSuggestedOffer` upserts on `(supplier_id, product_id, supplier_sku)` so one offer row is updated, not duplicated.
- **Same product across suppliers:** Each supplier gets its own offer row (different supplier_id); no duplicate products.

---

## 2. Current Weaknesses (Before Hardening)

- **Batch result visibility:** API returned counts and errors but no single structured summary (total/succeeded/failed/offers/warnings) for automated or manual checks.
- **Thickness parsing:** No clamp; invalid or negative values could slip through.
- **Box/gloves quantity:** Fewer raw keys supported (e.g. `gloves_per_box` not used everywhere).
- **Powder/grade:** Explicit "yes"/"no" or "food" not normalized to dictionary values in all paths.
- **Image URLs:** Non-http URLs or empty strings could be stored.
- **Dedupe behavior** was implicit (upsert in offer-service); not documented for operators.

---

## 3. What Was Hardened

### Batch import validation

- **BatchResultSummary** added to pipeline result and API response:
  - `totalRowsProcessed`, `rowsSucceeded`, `rowsFailed`, `duplicatesSkipped`, `canonicalProductsCreated`, `supplierOffersCreated`, `warnings`.
- Ingest does not create canonical products; `canonicalProductsCreated` is 0. `supplierOffersCreated` is the count of offers created/updated for matched rows.

### Parsing

- **Thickness:** `parseThicknessFromRaw` now clamps to 1–30 mil; invalid/negative → `undefined`.
- **Box/gloves quantity:** `extractContentFromRaw` and `parsePackaging` (case-cost) now accept `gloves_per_box`, `pack_size` where appropriate.
- **Powder:** Explicit "yes"/"y"/"1" → powder_free, "no"/"n"/"0" → powdered before dictionary lookup.
- **Grade:** "food" (and food service/food safe/NSF in text) → food_service_grade.
- **Image URLs:** Only strings starting with `http://` or `https://` are pushed into `images`; trim applied.

### Dedupe

- **Offer-service** comment clarified: same supplier + same product_id + same supplier_sku => upsert (update/merge). Same product across suppliers => separate offer rows. No duplicate live products created in ingest; matching attaches to existing masters only.

---

## 4. Remaining Risks

- **No hard cap on duplicate SKU in batch:** Both rows are still inserted and normalized; operator must resolve. Optional future: skip or merge duplicate SKU within same batch.
- **Large batches:** 2000-row cap in run-pipeline; 500+ rows may approach timeout (e.g. 60s) depending on normalization and DB latency. Chunking or background job recommended for 1000+.
- **Publish path:** New product creation happens at publish (when no master_product_id). Dedupe there is by slug/sku/attributes; no cross-supplier product merge.
- **OpenClaw:** Returns rows only; no direct DB write. Integrating into ingest would require a separate path (e.g. POST body with rows or staging insert from OpenClaw output).

---

## 5. Readiness for Real Supplier Imports

- **100–500 rows:** Ready with the current and hardened behavior. Use the batch summary and dashboard to verify after each run.
- **1000 rows:** Feasible but watch timeouts and consider chunking or async job.
- **Manual cleanup:** Expect some anomaly flags (duplicate SKU, missing image, conflicting case qty); review queue and publish flow handle these. No change to requirement for human review before publish.

**Verdict:** The system is ready for real supplier imports with the understanding that (1) ingest only stages and matches to existing masters, (2) publish is a separate step, and (3) batch summary and parsing hardening reduce risk and improve visibility.

---

## 6. Exact Manual Testing Steps

1. **Prepare:** Create a supplier (if needed) and a feed with a CSV URL (or use feed_id). Ensure category `disposable_gloves` exists.
2. **Run ingest:** `POST /api/ingest` with `{ "supplier_id": "<uuid>", "feed_url": "<url>" }` or `{ "feed_id": "<uuid>" }`. Use a 10-row CSV first.
3. **Check response:** Status 200; body includes `batchId`, `summary` with `totalRowsProcessed`, `rowsSucceeded`, `rowsFailed`, `supplierOffersCreated`, `warnings`. `errors` array may be non-empty for per-row failures.
4. **Check dashboard:** Batches → open the batch → confirm raw count and normalized count; open a normalized row and verify attributes and match (if any).
5. **Check offers:** In DB or admin UI, confirm `supplier_offers` has rows for matched products (same supplier_id, product_id, supplier_sku).
6. **Re-run same feed:** Run ingest again with same feed; confirm offers are updated (same count or updated), not duplicated.
7. **Publish (optional):** In review, approve a staged row and publish; confirm `products` and storefront update; run `sync_canonical_products` if applicable.

For 100- and 500-row tests, use the same steps and assert on `summary` as in `docs/IMPORT_TEST_PLAN.md`.
