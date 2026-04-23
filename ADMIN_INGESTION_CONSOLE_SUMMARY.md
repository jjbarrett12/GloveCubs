# Admin Ingestion Console — Implementation Summary

## 1. Implementation Summary

The existing ingestion architecture is now exposed through an **operational Ingestion Console** in CatalogOS, with publish path consistency fixed, bulk review actions, and URL/feed pipeline safety limits.

### Phase 1 — Ingestion Console Home
- **Route:** CatalogOS `/dashboard/ingestion`
- **Content:** Batch summary table (recent batches with source type, total/accepted/review-required/rejected/published rows, status, started_at). Action queue cards: batches needing review, ready to publish, failed, duplicate warnings. Quick actions: Upload file (→ Feeds), Review pending (→ Review), Publish approved (→ Publish).
- **Data:** `getIngestionBatchSummaries(30)` extends `getBatchesList` with per-batch staging counts and published count from `publish_events`. Source type inferred: `feed` when `feed_id` set, else `manual`.

### Phase 2 — Batch Detail View
- **Route:** CatalogOS `/dashboard/ingestion/[batchId]`
- **Content:** Batch metadata, supplier, row counts (total, needs review, approved, rejected, duplicate/low-conf). Rows table with columns: SKU, title, confidence, status, match, warnings, Review link. Filters: All, Needs review, Approved, Rejected, Conf ≥ 0.85. Link to Open in Review queue.
- **Data:** `getBatchById`, `getStagingRows` with `batch_id` and optional `status` (single or `["approved","merged"]`) and `confidence_min`.

### Phase 3 — Bulk Review Actions
- **Location:** `catalogos/src/app/actions/review.ts`
- **Actions:**
  - **bulkApproveStaged(normalizedIds, masterProductId)** — Approve selected rows with same master (merge). Cap 200.
  - **bulkRejectStaged(normalizedIds, notes)** — Reject selected. Cap 200.
  - **bulkMarkForReview(normalizedIds)** — Set status to pending. Cap 200.
  - **approveAllAboveConfidence(batchId, confidenceMin = 0.85)** — Approve pending rows in batch that have `match_confidence >= threshold` and non-null `master_product_id`. Cap 500.
  - **bulkPublishStaged(normalizedIds, publishedBy)** — Publish selected approved/merged rows via `publishStagedToLive` (runPublish). Cap 100.
  - **publishAllApprovedInBatch(batchId, publishedBy)** — Fetches approved + merged rows for batch, then calls bulkPublishStaged.
- **Revalidation:** `/dashboard/ingestion` added to REVIEW_PATHS so console refreshes after bulk actions.

### Phase 4 — Publish Path Consistency
- **Problem:** `POST /api/publish` used `publishStagingCatalogos`, which does **not** sync `product_attributes`; the buyer catalog is attribute-backed.
- **Fix:** `catalogos/src/app/api/publish/route.ts` now uses **canonical path**: for each `staging_id`, `getStagingById` → `buildPublishInputFromStaged` → `runPublish`. `runPublish` calls `syncProductAttributesFromStaged` and writes to catalogos only (no public.products).
- **Canonical publish path:** `buildPublishInputFromStaged` + `runPublish` (in `@/lib/publish/publish-service`). All admin publish flows (review actions and API) use this path. `publishStagingCatalogos` is **not** used by the API anymore; it remains in codebase for reference but is deprecated for new use.

### Phase 5 — URL Import to Catalogos Staging
- **Status:** Implemented in CatalogOS (`/dashboard/url-import`, bridge to `import_batches`). Storefront URL import is retired (redirect + 410 API). See [docs/URL_IMPORT_SYSTEM.md](./docs/URL_IMPORT_SYSTEM.md).

### Phase 6 — URL/Feed Pipeline Row Limit
- **Location:** `catalogos/src/lib/ingestion/run-pipeline.ts`
- **Change:** After `parseFeed`, if `parsed.rows.length > 2000`, rows are truncated to first 2000, `parsed.rowCount` updated, and an error message pushed: `Row limit exceeded: feed has N rows; only first 2000 will be processed.`
- **Constant:** `MAX_FEED_ROWS = 2000` (inline). No separate env; can be made configurable later.

### Phase 7 — Batch Publish Experience
- **Publish single row:** Existing Review queue → approve → Publish to live (uses runPublish).
- **Publish selected / all approved:** New server actions `bulkPublishStaged(normalizedIds)` and `publishAllApprovedInBatch(batchId)`. Both go through `publishStagedToLive` → `runPublish`, so result is products + product_attributes + supplier_offers. Result shape: `{ processed, succeeded, failed, errors, published, publishErrors }`. UI for “Publish selected” / “Publish all approved” can call these actions from the batch detail or review page (buttons to be wired in a follow-up if not already present).

### Phase 8 — Operator UX
- Dense tables on ingestion home and batch detail; filters (All, Needs review, Approved, Rejected, Conf ≥ 0.85); confidence and duplicate warnings visible in batch detail table. No marketing UI; production-oriented.

### Phase 9 — Tests
- **Publish API canonical path:** `catalogos/src/app/api/publish/route.test.ts` — (1) POST with valid staging_ids uses getStagingById, buildPublishInputFromStaged, runPublish and returns `{ published: 1, errors: [] }`; (2) non-approved row returns errors and runPublish is not called.

---

## 2. Files Created

| File | Purpose |
|------|--------|
| `catalogos/src/app/(dashboard)/dashboard/ingestion/page.tsx` | Ingestion console home (batch summary, action queue, quick actions). |
| `catalogos/src/app/(dashboard)/dashboard/ingestion/[batchId]/page.tsx` | Batch detail (metadata, counts, filters, link to client table). |
| `catalogos/src/app/(dashboard)/dashboard/ingestion/[batchId]/IngestionBatchDetailClient.tsx` | Client: filters and rows table for batch. |
| `storefront/src/app/admin/ingestion/page.tsx` | Admin entry: link to CatalogOS ingestion console (when `NEXT_PUBLIC_CATALOGOS_URL` set). |
| `catalogos/src/app/api/publish/route.test.ts` | Tests that publish API uses runPublish (canonical path). |

---

## 3. Files Modified

| File | Change |
|------|--------|
| `catalogos/src/app/api/publish/route.ts` | Replaced `publishStagingCatalogos` with getStagingById + buildPublishInputFromStaged + runPublish per staging_id. |
| `catalogos/src/lib/review/data.ts` | Added `IngestionBatchSummary`, `getIngestionBatchSummaries`, `source_type` on batch list; extended `StagingFilters.status` to `string \| string[]`; filter by `in("status", [...])` when array. |
| `catalogos/src/app/actions/review.ts` | Added bulk actions: bulkApproveStaged, bulkRejectStaged, bulkMarkForReview, approveAllAboveConfidence, bulkPublishStaged, publishAllApprovedInBatch; added `/dashboard/ingestion` to REVIEW_PATHS. |
| `catalogos/src/lib/ingestion/run-pipeline.ts` | Row limit: if `parsed.rows.length > 2000`, truncate to 2000 and push “Row limit exceeded” error. |
| `catalogos/src/app/(dashboard)/layout.tsx` | Nav link “Ingestion” to `/dashboard/ingestion`. |

---

## 4. Migrations Added

**None.** All changes use existing schema (`import_batches`, `supplier_products_normalized`, `publish_events`, etc.).

---

## 5. Tests Added

| Test | File | Coverage |
|------|------|----------|
| Publish API uses getStagingById + runPublish | `catalogos/src/app/api/publish/route.test.ts` | Canonical publish path; non-approved row returns errors and does not call runPublish. |

---

## 6. Known Ingestion Gaps Still Remaining

1. **URL import → catalogos staging:** Storefront URL import still writes only to `product_import_candidates` and approves into products via its own path. It does not create catalogos `import_batch` + `supplier_products_raw` + `supplier_products_normalized`. To close: add a path (e.g. “Send to CatalogOS” or a catalogos API) that creates a batch and staged rows from URL-extracted data using the same dictionary/ontology and then uses the same review/publish flow.
2. **Bulk action UI wiring:** Bulk approve/reject/publish and “approve all above confidence” are implemented as server actions; the batch detail and review UIs may need explicit buttons/forms that call these actions (and show result summaries).
3. **Source type for URL batches:** When URL-based ingestion is implemented, `import_batches` could get a `source_type` column (e.g. `feed` | `url` | `manual`) and be set on batch creation; currently source_type is inferred from `feed_id` only.

---

## 7. Estimate: Products per Session

- **Batch workflow:** Operator can open Ingestion Console → see batches needing review / ready to publish → open batch detail → filter (e.g. Conf ≥ 0.85) → use Review queue for match/approve or (when wired) bulk “Approve all above confidence” → then “Publish all approved in batch.” Each batch can contain hundreds of rows; bulk publish is capped at 100 per call (500 for approve-all-above-confidence).
- **Realistic range:** With bulk approve (above confidence) and bulk publish, an admin can process on the order of **100–250 products in one session** (e.g. 2–5 batches of 50–100 rows, approve in bulk where confidence ≥ 0.85, then publish all approved). Manual row-by-row review remains available for low-confidence or duplicate-warning rows. The console and limits are set up to support launch catalog buildout at this scale.

---

*Summary generated after Admin Ingestion Console implementation.*
