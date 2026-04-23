# Import Test Plan

Practical steps to validate batch imports before running real supplier feeds.

## Prerequisites

- CatalogOS running with Supabase (catalogos schema).
- At least one supplier and (optional) one feed with a CSV/JSON URL.
- Admin access to `POST /api/ingest` and the dashboard.

## 1. 10-Row Validation Test

**Goal:** Confirm end-to-end flow and result shape with minimal data.

**Steps:**

1. Create a CSV with exactly 10 rows and headers, e.g.:
   - `sku`, `name`, `price` or `cost`, `material`, `color`, `size`, `thickness_mil` or `thickness`, `powder`, `grade`, `box_qty`, `case_qty`, `image_url`.
2. Host the file (e.g. S3, GCS, or a public URL) or use a feed that points to it.
3. Call `POST /api/ingest` with `{ "supplier_id": "<uuid>", "feed_url": "<url>" }` or `{ "feed_id": "<uuid>" }`.
4. Wait for 200 response; inspect body.

**Exact checks after run:**

- `summary.totalRowsProcessed === 10`
- `summary.rowsSucceeded` + `summary.rowsFailed` = 10
- `summary.supplierOffersCreated` ≤ 10 (depends on match to existing masters)
- `summary.canonicalProductsCreated === 0` (ingest does not create products; publish does)
- `errors` array: note any messages; fix feed or normalization if needed
- In dashboard: Batches → open batch → verify normalized rows and status

## 2. 100-Row Batch Test

**Goal:** Validate behavior at small batch size and confirm no regressions.

**Steps:**

1. Use a 100-row CSV (or trim a larger feed to 100 rows).
2. Run `POST /api/ingest` as above.
3. Inspect response and dashboard.

**Exact checks after run:**

- `summary.totalRowsProcessed === 100`
- `summary.rowsSucceeded` ≥ 90 (allow some failures for bad rows)
- `summary.rowsFailed` = 100 - rowsSucceeded
- `summary.warnings` may include anomaly/parse warnings; review
- Batch detail: row count by status (pending/matched) matches expectations
- No duplicate live products created (only matched to existing masters + offers created/updated)

## 3. 500-Row Stress Test

**Goal:** Ensure pipeline handles larger batches without timeouts or OOM.

**Steps:**

1. Use a 500-row CSV (or first 500 rows of a large feed).
2. Run `POST /api/ingest` (maxDuration 60s; if timeout, consider chunking or increasing limit).
3. Inspect response and logs.

**Exact checks after run:**

- `summary.totalRowsProcessed === 500`
- Response returns 200 (no 504/timeout)
- `summary.rowsSucceeded` and `summary.rowsFailed` sum to 500
- Server/logs: no unhandled exceptions; errors array or summary.warnings capture failures
- Optional: run a second 500-row import for same supplier; confirm offers upsert (same supplier + SKU => update)

## 4. Post-Import Checks (Any Run)

After any import:

- **Batches:** Batch status = completed or failed; stats (raw_count, normalized_count, matched_count, error_count) are consistent with summary.
- **Staging:** Normalized rows have `normalized_data`, `attributes`, and (when matched) `master_product_id`.
- **Offers:** For matched rows, `supplier_offers` has rows for (supplier_id, product_id, supplier_sku); re-run same feed → same rows updated, not duplicated.
- **Publish:** Import does not publish; after review/approve, run publish and then verify `products` and `product_attributes` and `sync_canonical_products` if used.

## 5. Failure Modes to Test (Optional)

- **Invalid feed URL:** Expect 4xx or 5xx and no batch or batch failed.
- **Empty CSV:** Expect 200, totalRowsProcessed 0, no errors.
- **Malformed row (e.g. bad price):** Expect row to fail normalization or insert; error in `errors`; other rows still succeed.
- **Duplicate SKU in same batch:** Expect anomaly flag `duplicate_supplier_sku_in_batch`; both rows still inserted and normalized.

## Reference: Summary Shape

```ts
summary: {
  totalRowsProcessed: number;
  rowsSucceeded: number;
  rowsFailed: number;
  duplicatesSkipped: number;  // 0 unless raw insert enforces unique and skips
  canonicalProductsCreated: number;  // 0 in ingest
  supplierOffersCreated: number;
  warnings: string[];
}
```

Use this to automate assertions in integration tests or a small script that calls `/api/ingest` and checks `summary`.
