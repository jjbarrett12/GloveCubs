# GLOVECUBS — Admin Ingestion Console Verification Audit

**Audit type:** Focused verification of the Admin Ingestion Console  
**Date:** 2026-03-02  
**Scope:** Batch console usability, bulk review actions, publish path correctness, URL import, batch scale, missing tests.

---

## 1. Batch console usability

### Can admins find recent batches?

**Yes.**  
- **Ingestion Console** (`/dashboard/ingestion`): Uses `getIngestionBatchSummaries(30)`; lists recent batches with Batch ID, Source, Supplier, Status, Total/Accepted/Review/Rejected/Published counts, Started time, and View / Review links.  
- **Batches list** (`/dashboard/batches`): Uses `getBatchesList(50)`; same batches with View / Review.  
- **Batch detail** (`/dashboard/ingestion/[batchId]`, `/dashboard/batches/[id]`): Single batch with staging rows and filters (needs review, approved, rejected, conf ≥ 0.85).  
- **Navigation:** Layout links to "Batches"; ingestion console links to Feeds, Review, Publish.

**Files:** `catalogos/src/app/(dashboard)/dashboard/ingestion/page.tsx`, `batches/page.tsx`, `lib/review/data.ts` (getIngestionBatchSummaries, getBatchesList).

### Do counts/statuses reflect real data?

**Yes for ingestion console and batches/review.**  
- **Ingestion Console:** Counts come from `supplier_products_normalized` (status: pending, approved, rejected, merged) and `publish_events` (published_rows). total_rows, accepted_rows, review_required_rows, rejected_rows, published_rows, duplicate_warning_rows are computed in `getIngestionBatchSummaries`.  
- **Batch list:** status and stats (raw_count, normalized_count, matched_count) from `import_batches`.  
- **Dashboard home** (`/dashboard/page.tsx`): Uses **getSupabase()** (no catalogos profile) and tables **catalogos_import_batches**, **catalogos_staging_products**. Review/ingestion use **getSupabaseCatalogos()** and **catalogos.import_batches**, **catalogos.supplier_products_normalized**. If public schema tables are not views over catalogos, dashboard home counts can be wrong or empty.

**Risk:** Dashboard home may be reading a different schema (public vs catalogos). Verify that `catalogos_import_batches` / `catalogos_staging_products` are either views of catalogos tables or that dashboard home uses getSupabaseCatalogos() and catalogos table names.

**Files:** `catalogos/src/lib/review/data.ts`, `catalogos/src/app/(dashboard)/dashboard/page.tsx`, `lib/db/client.ts`.

### Are failed/review/publish-ready batches clearly visible?

**Yes on Ingestion Console.**  
- **Failed:** Card "Failed" with count; table column Status (badge destructive for failed).  
- **Needs review:** Card "Needs review" (batches with review_required_rows > 0); table column "Review" with count.  
- **Ready to publish:** Card "Ready to publish" (batches where accepted_rows > 0 and accepted_rows > published_rows); table columns Accepted and Published.  
- **Duplicate warnings:** Card "Duplicate warnings" and duplicate_warning_rows.  
- Batch detail page: cards for Needs review, Approved, Rejected, Duplicate / low conf.

**Files:** `catalogos/src/app/(dashboard)/dashboard/ingestion/page.tsx`, `ingestion/[batchId]/page.tsx`.

---

## 2. Bulk review actions

### Bulk approve / bulk reject / bulk publish — do they work?

**Implementation:** Yes, in code.  
- `bulkApproveStaged(normalizedIds, masterProductId, options)` — approves up to 200 IDs with same master, optional publishToLive.  
- `bulkRejectStaged(normalizedIds, notes)` — rejects up to 200 IDs.  
- `bulkPublishStaged(normalizedIds, options)` — calls `publishStagedToLive` for each (up to 100); returns published count and publishErrors.  
- `approveAllAboveConfidence(batchId, confidenceMin = 0.85)` — approves pending rows in batch with match_confidence ≥ threshold and master_product_id not null (up to 500).  
- `publishAllApprovedInBatch(batchId, options)` — gets approved + merged rows (limit 500), then bulkPublishStaged.

**Critical gap:** **None of these are wired in the UI.**  
- `ReviewPageClient` only renders `ReviewFilters`, `StagingTable`, `StagedProductDetail`. No checkboxes, "Select all", or "Bulk approve" / "Bulk reject" / "Approve all ≥0.85" / "Publish all approved" buttons.  
- `StagingTable` has no row selection.  
- `IngestionBatchDetailClient` has filters and "Open in Review" but no bulk action buttons.  
- So bulk actions **cannot be used** from the admin console today.

**Files:** `catalogos/src/app/actions/review.ts` (bulk implementations), `catalogos/src/components/review/ReviewPageClient.tsx`, `StagingTable.tsx`, `ingestion/[batchId]/IngestionBatchDetailClient.tsx`.

### Confidence-threshold approve — does it avoid invalid rows?

**Yes.**  
`approveAllAboveConfidence` selects only rows that are:  
- `status = 'pending'`  
- `match_confidence >= confidenceMin` (default 0.85)  
- `master_product_id IS NOT NULL`  

So rows without a match (no master_product_id) or with low confidence are **not** approved. Rows with missing required attributes can still be approved (status set); **runPublish** will block them when publish is attempted (publishSafe checks required attributes). So they become "approved" but cannot be published until attributes are fixed.

**File:** `catalogos/src/app/actions/review.ts` (lines 388–414).

### Are bulk actions auditable? Do they silently fail?

**Auditable:** Yes. Each approve/reject/merge goes through `approveMatch` / `rejectStaged` / `mergeWithStaged`, which insert into `review_decisions` (normalized_id, decision, master_product_id, decided_by, notes). So every bulk item is audited per row.

**Silent failure:** No. Bulk functions return `BulkResult`: `{ success, processed, succeeded, failed, errors }`; errors array lists per-id failures (e.g. `${id}: ${r.error}`). Because no UI calls these, the caller would see the result only if a future UI invokes the action and displays it.

**Files:** `catalogos/src/app/actions/review.ts` (review_decisions inserts, BulkResult returns).

---

## 3. Publish path correctness

### Do all publish actions use the canonical path?

**Yes.**  
- **POST /api/publish:** For each staging_id, loads row with `getStagingById`, checks status approved/merged and master_product_id, builds input with `buildPublishInputFromStaged`, then calls **runPublish(input)**. No use of publishStagingCatalogos.  
- **publishStagedToLive** (single row): Uses `buildPublishInputFromStaged` + **runPublish**.  
- **bulkPublishStaged:** Calls `publishStagedToLive` per id, which uses runPublish.  
- **publishAllApprovedInBatch:** Calls bulkPublishStaged → publishStagedToLive → runPublish.  
- **Review flow (approve with publishToLive):** approveMatch/mergeWithStaged/createNewMasterProduct call runPublish when options.publishToLive is true.

**Canonical path:** runPublish → syncProductAttributesFromStaged → product_attributes populated; then supplier_offers upsert and publish_events insert.

**Files:** `catalogos/src/app/api/publish/route.ts`, `catalogos/src/app/actions/review.ts`, `catalogos/src/lib/publish/publish-service.ts`.

### Do published products have synced product_attributes?

**Yes.**  
`runPublish` calls `syncProductAttributesFromStaged(productId, categoryId, input.stagedFilterAttributes)` before upserting the offer and writing publish_events. So every publish that goes through runPublish has product_attributes synced.

**File:** `catalogos/src/lib/publish/publish-service.ts` (lines 176–182).

### Are published products searchable/filterable in the buyer catalog?

**Yes.**  
Catalog list and facets use `product_attributes` and `product_best_offer_price`. Products published via runPublish have product_attributes populated, so they appear in filtered list and facet counts.

**Files:** `catalogos/src/lib/catalog/query.ts`, `facets.ts`, `publish/product-attribute-sync.ts`.

---

## 4. URL import correctness

### Does URL import land in catalogos staging flow?

**Yes (current design).** CatalogOS URL import crawls supplier URLs, stores rows in `url_import_products`, lets admins select rows, then **bridges** into `import_batches` / `supplier_products_raw` → the same normalize / match / staging pipeline as CSV → **supplier_products_normalized** and the CatalogOS review queue. See [URL_IMPORT_SYSTEM.md](./URL_IMPORT_SYSTEM.md).

The legacy **Storefront** admin URL import that wrote `product_import_candidates` / merged into storefront `canonical_products` is **retired**: `/admin/product-import` redirects to CatalogOS (when configured), and `GET|POST /admin/api/product-import` returns **410 Gone** and performs no writes.

### Dictionary normalization and duplicate/review logic

- **CatalogOS URL import:** After bridge, rows follow the **same** dictionary normalization, matching, anomaly flags, and review/publish flow as other `import_batches` sources.  
- **Storefront URL import:** Removed from the active path (see above).

### Row limit for URL import

- CatalogOS jobs are capped by `max_pages` (crawl) and bridge `product_ids` slice (see API). Many products per job are supported; selection is row-level in the preview UI.

**Conclusion:** URL import for the operational catalog is **part of** the CatalogOS ingestion console and review queue after bridge.

---

## 5. Batch scale practicality

### How many rows/products can be realistically processed in one admin session?

- **Without bulk UI:** Only single-row actions (click row → open detail → Approve/Reject/Merge, Publish). For 100 rows that is 100+ clicks and detail opens. Realistic: **~20–40** products per session before fatigue.  
- **With bulk actions implemented in UI:** approveAllAboveConfidence could approve e.g. 50–200 high-confidence rows in one click; publishAllApprovedInBatch could publish up to 500 approved in a batch (bulkPublishStaged caps at 100 per call, but publishAllApprovedInBatch passes up to 500 ids and bulkPublishStaged slices to 100 — so only first 100 would be published per call). So even with UI: **bulk publish is effectively capped at 100 per invocation** (slice(0, 100) in bulkPublishStaged).

**Caps in code:**  
- bulkApproveStaged / bulkRejectStaged / bulkMarkForReview: first 200 IDs.  
- bulkPublishStaged: first 100 IDs.  
- approveAllAboveConfidence: up to 500 rows per batch.  
- publishAllApprovedInBatch: fetches up to 500 approved + 500 merged, then bulkPublishStaged (100 published per call).

**Estimate:**  
- **Current (no bulk UI):** **20–40** products per session.  
- **If bulk UI is added:** **100–250** products per session is plausible (approve all ≥0.85, then publish in chunks of 100, handle remainder manually or with multiple "Publish all" runs).

### What friction still makes 100–250 product imports painful?

1. **No bulk actions in UI** — largest friction; admins cannot trigger bulk approve/reject/publish.  
2. **Bulk publish cap of 100** per call — batches with 250 approved would need 3 runs or a higher cap.  
3. **Review queue limit 100** — `getStagingRows` default limit 100; batch detail uses limit 500. So review page shows at most 100 rows; filtering by batch_id is required to see full batch.  
4. **No "Approve all in batch" or "Publish all" buttons** on batch detail or review page.  
5. **Dashboard home** possibly using different schema (public vs catalogos) — can cause confusion if counts don’t match ingestion console.

---

## 6. Missing tests / gaps

### Critical ingestion console behaviors untested

- **Bulk actions:** No tests for bulkApproveStaged, bulkRejectStaged, approveAllAboveConfidence, bulkPublishStaged, publishAllApprovedInBatch (success, partial failure, error aggregation, audit rows in review_decisions).  
- **Ingestion console data:** No tests for getIngestionBatchSummaries (counts vs actual supplier_products_normalized and publish_events).  
- **Publish path:** POST /api/publish is tested (canonical path, non-approved rejected). No test that runPublish is called with stagedFilterAttributes and that syncProductAttributesFromStaged runs (would require integration or mock of product_attributes).  
- **Batch detail:** No test that batch detail page shows correct pending/accepted/rejected counts for a given batch.  
- **URL import:** CatalogOS crawl → bridge → batch pipeline; add integration tests for bridge + normalized rows if missing.

**Files to add tests:**  
- `catalogos/src/app/actions/review.test.ts` (or similar) for bulk actions.  
- `catalogos/src/lib/review/data.test.ts` for getIngestionBatchSummaries.  
- Optional: e2e or integration test for "approve → publish → product appears in catalog with filters".

---

## Summary: Launch blockers, high-risk, medium, files, verdict, throughput

### Launch blockers

| ID | Issue | Location |
|----|--------|----------|
| **LB-1** | Bulk review actions (bulk approve, bulk reject, approve-all-by-confidence, bulk publish) are **not wired in the UI**; admins cannot use them from the ingestion console or review queue. | `ReviewPageClient.tsx`, `StagingTable.tsx`, `IngestionBatchDetailClient.tsx` — no row selection or bulk action buttons; actions exist only in `review.ts`. |

### High-risk issues

| ID | Issue | Location |
|----|--------|----------|
| **HR-1** | ~~URL import did not land in catalogos~~ **Superseded:** URL import is unified in CatalogOS (bridge into `import_batches`). Storefront `/admin/api/product-import` is 410-only. | `catalogos` URL import + bridge; `storefront/src/app/admin/api/product-import/route.ts` (deprecated). |
| **HR-2** | Dashboard home may use a different data source (getSupabase + catalogos_import_batches, catalogos_staging_products in public) than ingestion/review (getSupabaseCatalogos + catalogos schema). If public tables are not views, counts can be wrong or empty. | `catalogos/src/app/(dashboard)/dashboard/page.tsx`, `lib/db/client.ts`. |
| **HR-3** | bulkPublishStaged only processes the first **100** IDs; batches with >100 approved need multiple invocations. No UI to invoke it yet. | `catalogos/src/app/actions/review.ts` (bulkPublishStaged slice(0, 100)). |

### Medium issues

| ID | Issue | Location |
|----|--------|----------|
| **MR-1** | approveAllAboveConfidence can approve rows that later fail runPublish (e.g. missing required attributes). They become "approved" but cannot be published until fixed. | By design; runPublish blocks; consider warning in UI when bulk-approving. |
| **MR-2** | Review queue default limit 100; large batches require filter by batch_id to see all rows. | `getStagingRows` default limit 100 in `lib/review/data.ts`. |
| **MR-3** | No automated tests for bulk actions or ingestion console summary data. | Missing: review.test.ts (bulk), data.test.ts (getIngestionBatchSummaries). |

### Exact files / routes still weak

| Priority | File / route | Required change |
|----------|--------------|------------------|
| **P0** | `catalogos/src/components/review/ReviewPageClient.tsx`, `StagingTable.tsx` | Add row selection (checkboxes), "Bulk approve" (with master product selection or batch-level "Approve all ≥0.85"), "Bulk reject", "Bulk publish", and display BulkResult (succeeded, failed, errors). |
| **P0** | `catalogos/src/app/(dashboard)/dashboard/ingestion/[batchId]/IngestionBatchDetailClient.tsx` (or page) | Add "Approve all in batch (conf ≥ 0.85)" and "Publish all approved in batch" buttons; call approveAllAboveConfidence and publishAllApprovedInBatch; show result/errors. |
| **P1** | `catalogos/src/app/(dashboard)/dashboard/page.tsx` | Use getSupabaseCatalogos() and catalogos.import_batches / supplier_products_normalized (or ensure public views exist and match catalogos) so dashboard home counts match ingestion console. |
| **P1** | `catalogos/src/app/actions/review.ts` | Consider raising bulkPublishStaged cap from 100 to 250 or 500, or chunk and return total published. |
| **P2** | ~~Storefront URL import~~ | **Done:** URL import is CatalogOS-only; Storefront API is 410. Optional: remove dead `storefront/src/lib/admin/productImport.ts` when no longer needed for reference. |
| **P2** | Tests | Add tests for bulk actions and getIngestionBatchSummaries. |

---

## Updated verdict

# NOT READY (for efficient 100–250 product catalog buildout)

**Reason:**  
- **Publish path is correct:** All publish flows use runPublish; product_attributes are synced; products are searchable/filterable.  
- **Batch console is usable:** Admins can find batches; counts/statuses reflect real data (with caveat for dashboard home); failed/review/publish-ready are visible.  
- **Bulk actions exist but are not usable:** No UI to trigger bulk approve, bulk reject, or bulk publish. So the console is **not ready** for efficient 100–250 product imports.  
- **URL import is part of catalogos** after bridge (same staging and dictionary normalization as CSV).

**Conditional GO** would apply if:  
- Bulk actions are wired in the UI (review page and/or batch detail), and  
- Dashboard home data source is verified or fixed.

Then: **CONDITIONAL GO — READY FOR CATALOG BUILDOUT** (URL import no longer a separate storefront catalog path).

---

## Realistic product-ingestion throughput estimate

| Scenario | Throughput (products per admin session) | Notes |
|----------|------------------------------------------|--------|
| **Current (no bulk UI)** | **20–40** | Single-row review and publish only. |
| **With bulk UI (approve all ≥0.85 + publish all approved)** | **100–150** | One bulk approve per batch; bulk publish capped at 100 per call (e.g. 2 runs for 200 approved). |
| **With bulk UI + higher publish cap (e.g. 500)** | **200–250** | Single "publish all approved" for large batches. |

**Recommendation:** Wire bulk actions in the UI (review page and batch detail), then re-audit. After that, **100–250** products per session is a realistic target for the admin ingestion console.
