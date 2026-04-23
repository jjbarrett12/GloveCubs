# CatalogOS Phase 1 — Vertical Slice (End-to-End)

All steps use the **exact** `catalogos` schema. No alternate tables. Strongly typed services and real DB calls.

## Flow

1. **Supplier creation** → `catalogos.suppliers`
2. **Supplier feed creation** → `catalogos.supplier_feeds` (feed_type, config.url)
3. **Manual import trigger** → POST `/api/ingest` with `feed_id` → creates `import_batches`, runs pipeline
4. **Raw row ingestion** → `catalogos.supplier_products_raw`
5. **Normalized staging** → attribute extraction (disposable gloves) → `catalogos.supplier_products_normalized`
6. **Proposed match** → rules (+ optional AI) → `master_product_id`, `match_confidence`
7. **Supplier offer suggestion** → `catalogos.supplier_offers` when matched above threshold
8. **Review queue listing** → list from `supplier_products_normalized` with filters
9. **Staged product detail** → single normalized row + raw payload + master product + supplier
10. **Approve / Create new master / Reject** → update `supplier_products_normalized.status`, insert `review_decisions`

---

## File Paths

### Data layer (schema-aligned)

| Path | Purpose |
|------|--------|
| `src/lib/catalogos/suppliers.ts` | listSuppliers, getSupplierById, createSupplier → catalogos.suppliers |
| `src/lib/catalogos/feeds.ts` | listFeeds, listFeedsBySupplier, getFeedById, getFeedUrl, createFeed → catalogos.supplier_feeds |
| `src/lib/review/data.ts` | getBatchesList, getBatchById, getStagingRows, getStagingById, getPublishReady, getSuppliersForFilter, getCategoriesForFilter → import_batches, supplier_products_normalized, suppliers, products, categories |
| `src/lib/ingestion/batch-service.ts` | createImportBatch, updateBatchCompletion, logBatchStep → import_batches, import_batch_logs |
| `src/lib/ingestion/raw-service.ts` | insertRawRows → supplier_products_raw |
| `src/lib/ingestion/attribute-extraction.ts` | extractGloveAttributes (rules-based) |
| `src/lib/ingestion/normalize-service.ts` | buildNormalizedFromRaw |
| `src/lib/ingestion/match-service.ts` | matchToMaster → products (master) |
| `src/lib/ingestion/offer-service.ts` | createSuggestedOffer → supplier_offers |
| `src/lib/ingestion/run-pipeline.ts` | runPipeline — full pipeline orchestration |
| `src/lib/ingestion/ai-orchestration.ts` | runExtractionWithAIFallback, runMatchingWithAIFallback (optional AI) |

### API routes

| Path | Purpose |
|------|--------|
| `src/app/api/suppliers/route.ts` | GET list, POST create → catalogos.suppliers |
| `src/app/api/feeds/route.ts` | GET list (optional ?supplier_id=), POST create → catalogos.supplier_feeds |
| `src/app/api/ingest/route.ts` | POST trigger import (body: feed_id or supplier_id + feed_url) → runPipeline, revalidate batches/review |
| `src/app/api/review/staging/[id]/route.ts` | GET staged product by id (normalized + raw + master + supplier) |

### Server actions

| Path | Purpose |
|------|--------|
| `src/app/actions/suppliers.ts` | createSupplier (FormData) |
| `src/app/actions/feeds.ts` | createFeedAction (FormData) |
| `src/app/actions/review.ts` | approveMatch, rejectStaged, createNewMasterProduct, mergeWithStaged, updateNormalizedAttributes, overridePricing, assignCategory, markForReprocessing → supplier_products_normalized, products, review_decisions |

### Pages and components

| Path | Purpose |
|------|--------|
| `src/app/(dashboard)/dashboard/suppliers/page.tsx` | List suppliers (catalogos), create form |
| `src/app/(dashboard)/dashboard/suppliers/SupplierCreateForm.tsx` | Client form → createSupplier action |
| `src/app/(dashboard)/dashboard/feeds/page.tsx` | List feeds (optional supplier_id filter), create form, Run import per feed |
| `src/app/(dashboard)/dashboard/feeds/FeedCreateForm.tsx` | Client form → createFeedAction |
| `src/app/(dashboard)/dashboard/feeds/FeedRunImportButton.tsx` | POST /api/ingest with feed_id, redirect to batch detail |
| `src/app/(dashboard)/dashboard/batches/page.tsx` | List import_batches, summary cards, links to batch detail and review |
| `src/app/(dashboard)/dashboard/batches/[id]/page.tsx` | Batch detail, staged rows, link to review queue filtered by batch |
| `src/app/(dashboard)/dashboard/review/page.tsx` | Review queue: filters, getStagingRows, ReviewPageClient |
| `src/app/(dashboard)/dashboard/review/[id]/page.tsx` | Redirect to /dashboard/review?id=<id> (deep link to detail sheet) |
| `src/app/(dashboard)/dashboard/review/...` (components) | ReviewFilters, StagingTable, StagedProductDetail, ReviewActionModal, MasterMatchPreview |
| `src/app/(dashboard)/dashboard/publish/page.tsx` | Publish-ready list (status = approved) |

---

## Schema tables used

- `catalogos.suppliers`
- `catalogos.supplier_feeds`
- `catalogos.import_batches`
- `catalogos.import_batch_logs`
- `catalogos.supplier_products_raw`
- `catalogos.supplier_products_normalized`
- `catalogos.products` (master)
- `catalogos.supplier_offers`
- `catalogos.review_decisions`
- `catalogos.categories` (for ingest categoryId and review filters)

All IDs are UUIDs (strings). Client: `getSupabaseCatalogos(true)` with `Accept-Profile: catalogos`, `Content-Profile: catalogos`.
