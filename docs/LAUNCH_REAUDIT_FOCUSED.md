# GLOVECUBS Focused Launch Re-Audit

**Date:** Post latest fixes (buyer flows, quote lifecycle, relevance sort, supplier upload)  
**Scope:** Five flows only — buyer search, buyer comparison, quote, supplier upload, admin ingestion.

---

## 1. Buyer Search Flow

| Check | Status | Notes |
|-------|--------|--------|
| Search from header | ✅ Pass | Main site: `searchInput` in `public/js/app.js` (debounced input, updates `state.filters.search`, navigates to products). |
| Search results | ✅ Pass | `loadProducts()` builds URL with `search=${encodeURIComponent(state.filters.search)}`; `GET /api/products` filters and returns products. |
| Relevance sort | ✅ Pass | `server.js`: when `search` is present and `sort` is empty or `relevance`, `sortByRelevance(products, searchQuery)` is used. Main site does not send `sort`, so search results are relevance-ordered. |
| Product page navigation | ✅ Pass | Product cards link via `getProductUrl(product)`; product detail loads by slug or id. |

**Weak spots:**
- **Route:** Main site products list is hash/SPA (`#products` or path `/gloves/...`). No explicit "Sort by: Relevance" label; relevance is implicit when searching.
- **File:** `public/js/app.js` — no sort dropdown; other sort options (`price_low`, `price_high`, `name_az`, etc.) exist in backend but are not exposed in UI.

**Verdict:** Flow works. Relevance is applied when user searches. No blocker.

---

## 2. Buyer Comparison Flow

| Check | Status | Notes |
|-------|--------|--------|
| Supplier names visible | ✅ Pass | **Storefront:** `GET /api/products/[id]/offers` returns `supplier_name` per offer. `OfferComparisonTable` and `OfferComparisonCard` show supplier via `SupplierCell` / `SupplierAvatar`. **Main site:** Product detail and cards show `product.brand` (and API now returns `supplier_name` alias from `productsService.js`). |
| Trust/reliability visible | ✅ Pass | Storefront offers API returns `trust_score`, `trust_band`, `supplier_reliability_score`, `supplier_reliability_band`. Table shows Trust Score, Reliability, Freshness columns; cards show same. |
| Trusted best price visible | ✅ Pass | Offers API returns `market_summary.trusted_best_price` and `trusted_best_supplier`. `ProductOffersClient` passes them to `MarketSummaryHeader` ("Best Trusted" with price and "from {supplier}"). |
| Long supplier names | ✅ Pass | `OfferComparisonTable.tsx`: `truncateSupplierName(name, 30)` (20 when compact); `title={isLongName ? name : undefined}` for tooltip. |

**Weak spots:**
- **Main site** has no comparison table — single product view with brand only. Full comparison (supplier, trust, reliability, trusted best) exists only on **storefront** buyer product page: `storefront/src/app/buyer/products/[id]/page.tsx` (uses `canonical_products` + `supplier_offers`). If primary entry is main site, buyers do not see comparison unless they use the Next.js buyer flow.
- **Cart/order line items:** `services/dataService.js` enriches order items with `product_name`, `sku` from products table; it does **not** attach `brand` or `supplier_name` to line items. So in order history/cart, supplier/brand on line items is not explicitly shown (product name only).
- **Routes:** Main site product: Express `GET /api/products/:id`, `GET /api/products/by-slug`. Buyer comparison: Storefront `storefront/src/app/buyer/products/[id]` + `GET /api/products/[id]/offers`.

**Verdict:** Storefront buyer comparison flow is complete. Main site is brand-only; cart/order line items lack supplier/brand in response. Medium gap for "quote/cart line items where applicable."

---

## 3. Quote Flow

| Check | Status | Notes |
|-------|--------|--------|
| Create quote | ✅ Pass | Catalogos: `QuotePageClient` → `submitQuoteRequestAction` → `createQuoteRequest` (service). Creates `quote_requests` + line items; notifications stubbed. |
| Quote status visibility | ✅ Pass | **Customer:** `my-quotes` page lists quotes; `QuoteStatusBadge` supports all statuses (new, reviewing, contacted, quoted, won, lost, expired, closed). **Admin:** `QuoteStatusUpdate` on quote detail shows workflow + outcome (Won/Lost with reason). **Detail:** `catalogos/src/app/(dashboard)/dashboard/quotes/[id]/page.tsx` and rfq `[id]` show status. |
| Quote state transitions | ✅ Pass | `updateQuoteStatusAction` allows new statuses; `markQuoteWonAction`, `markQuoteLostAction`; service writes timestamps and `quote_status_history`, queues `quote_notifications`. |
| Customer dashboard visibility | ✅ Pass | Catalogos "My Quotes" at `(storefront)/my-quotes/page.tsx` uses `getQuotesByEmail`; shows list with status badge and link to status page. |

**Weak spots:**
- **DB migration:** New statuses (won, lost, expired) and tables (`quote_status_history`, `quote_notifications`) require `supabase/migrations/20260401000001_quote_lifecycle_states.sql` to be applied. If not applied, transitions to won/lost/expired will fail at DB constraint or insert.
- **Main site RFQs:** Express `public.rfqs` (payload JSONB) supports status in payload; `dataService.js` and `updateRfq` handle won/lost/expired timestamps. Customer sees RFQs at main site "My RFQs"; that UI may not show won/lost/expired labels if it was built for old status set. Worth confirming main site RFQ list/detail show new statuses.
- **Files:** `catalogos/src/lib/quotes/types.ts` (status union), `catalogos/src/app/actions/quotes.ts` (actions), `catalogos/src/app/(dashboard)/dashboard/quotes/[id]/QuoteStatusUpdate.tsx` (admin UI).

**Verdict:** Quote flow is implemented end-to-end in catalogos. Dependency: migration applied; main site RFQ UI status labels may need a quick check.

---

## 4. Supplier Upload Flow

| Check | Status | Notes |
|-------|--------|--------|
| XLSX upload | ✅ Pass | `detectFileType` accepts `.xlsx`/`.xls` or PK signature; `validateFile` supports `file_type: 'xlsx'`; `processFeedUpload` uses `parseFileContent(..., 'xlsx')` (SheetJS). API accepts multipart file and detects CSV vs XLSX. |
| Preview | ✅ Pass | Upload response includes `rows`; upload page shows table with extracted/normalized data, confidence, validation status. |
| Correction | ✅ Pass | `correct` action with `upload_id`, `row_number`, `corrections`; `correctRow` updates row and recalculates; UI has correction flow. |
| Commit | ✅ Pass | `commit` action with `upload_id`, `row_numbers`; `commitFeedUpload` in transaction; audit event `commit_feed_upload` logged. |

**Weak spots:**
- **File:** `storefront/src/app/supplier-portal/upload/page.tsx` — ensure drag-and-drop accepts `.xlsx` and that "CSV or XLSX" is stated in UI.
- **Schema:** Feed upload tables live in `catalogos` (per migration `storefront/supabase/migrations/20260311000012_feed_upload.sql`). If storefront and catalogos use different Supabase projects/schemas, ensure storefront points at the DB where these tables exist.

**Verdict:** XLSX, preview, correction, and commit are implemented. No blocker identified.

---

## 5. Admin Ingestion Support

| Check | Status | Notes |
|-------|--------|--------|
| Review uploaded rows | ⚠️ Partial | **Supplier uploads:** Suppliers see their own upload history and drill-down in dashboard (`upload-history`). There is no admin-only view to "review all supplier uploads" or "review uploaded rows" across suppliers. **Product import (URL):** Admin uses **CatalogOS** URL import (`/dashboard/url-import` → bridge → batches/review); Storefront `/admin/product-import` only redirects. **Bulk CSV (main site):** Admin can import CSV and review drafts in main site admin. |
| Inspect warnings/errors | ✅ Pass | Supplier upload: per-row `validation.warnings` and `validation.errors`; preview table shows status (valid/warning/error). CatalogOS URL import: crawl warnings, per-row confidence, and batch/review anomalies after bridge. |
| Verify auditability | ✅ Pass | **Supplier:** `supplier_audit_log` logs actions; `logAuditEvent` used for create_feed_upload, commit_feed_upload, etc. **Feed upload:** `supplier_feed_uploads` + `supplier_feed_upload_rows` persist upload and row-level data. **Quote:** `quote_status_history` and `quote_notifications` (after migration). No centralized "admin audit trail" view; data is in DB for audit. |

**Weak spots:**
- **Routes/files:** No admin route that lists "all supplier feed uploads" or "all upload rows for review." Admin ingestion today = CatalogOS URL import + CatalogOS CSV/batches + main site bulk CSV; supplier upload review is per-supplier in supplier dashboard.
- **Gap:** No equivalent for "supplier feed upload review" as a single cross-supplier admin surface.

**Verdict:** Auditability is in place in DB. "Review uploaded rows" for **supplier** uploads is limited to supplier self-service; admin can review product import and bulk CSV drafts. Medium gap if requirement is "admin can review any supplier’s uploaded rows."

---

## Summary: Remaining Blockers

| # | Blocker | Flow |
|---|---------|------|
| 1 | **Quote lifecycle migration not applied** — Transitions to won/lost/expired and notification/history inserts will fail until `20260401000001_quote_lifecycle_states.sql` is run. | Quote |

**Action:** Run `supabase/migrations/20260401000001_quote_lifecycle_states.sql` (and ensure catalogos schema is the target) before launch.

---

## High-Risk Issues

| # | Issue | Location | Mitigation |
|---|--------|----------|------------|
| 1 | **Two product systems** — Main site uses Express + `public.products`; storefront buyer comparison uses `canonical_products` + `supplier_offers`. If main site is primary, buyers never see comparison table or trusted best price unless they are directed to storefront buyer pages. | Architecture | Clarify primary buyer path; or add comparison/offers to main site product page (e.g. proxy to storefront API or duplicate logic). |
| 2 | **Storefront buyer product page** depends on `canonical_products` and `supplier_offers` being populated. Empty or stale data → "No offers" and no comparison. | `storefront/src/app/buyer/products/[id]/page.tsx`, offers API | Ensure catalog sync or ingestion populates these tables for key products. |

---

## Medium Issues

| # | Issue | Location | Suggestion |
|---|--------|----------|------------|
| 1 | **Cart/order line items** do not include `brand` or `supplier_name` in enriched response. | `services/dataService.js` (`_enrichOrderWithItems`, order item mapping) | Add `product.brand` (and optionally `supplier_name`) when mapping order items from products table. |
| 2 | **Main site product list** has no sort dropdown; backend supports sort=relevance|price_low|price_high|name_az|name_za|newest but frontend does not send it (relevance is default when search is set). | `public/js/app.js` (products view) | Optional: add "Sort by" dropdown and pass `sort` in `loadProducts()` URL. |
| 3 | **Main site RFQ list/detail** may not display won/lost/expired status labels. | Main site customer RFQ views (e.g. "My RFQs") | Confirm status string or badge shows new lifecycle states; extend UI if still showing only old statuses. |
| 4 | **Admin cannot list or review supplier feed uploads** across suppliers; only suppliers see their upload history. | Storefront admin (no route for "supplier uploads") | If required for launch, add admin view that queries `supplier_feed_uploads` (with appropriate RLS or service role) and allows drill-down to rows and warnings. |

---

## Exact Routes/Files Still Weak

| Flow | Route / File | Weakness |
|------|----------------|----------|
| Buyer comparison (main site) | Main site product detail template in `public/js/app.js` | No comparison table; brand only. |
| Buyer comparison (cart/orders) | `services/dataService.js` (order item enrichment) | Line items lack `brand` / `supplier_name`. |
| Buyer search | `public/js/app.js` (products view) | No sort dropdown; relevance is implicit. |
| Quote | DB | Migration `20260401000001_quote_lifecycle_states.sql` must be applied. |
| Quote (main site) | Main site "My RFQs" / RFQ detail UI | Confirm won/lost/expired displayed. |
| Admin ingestion | `storefront/src/app/admin/` | No admin page for "supplier feed upload review." |
| Supplier upload | `storefront/src/app/supplier-portal/upload/page.tsx` | Confirm XLSX in accept attribute and copy. |

---

## Final Recommendation

| Condition | Recommendation |
|-----------|-----------------|
| **Migration `20260401000001_quote_lifecycle_states.sql` not applied** | **NOT READY** — Quote lifecycle (won/lost/expired) and notification/history will fail. |
| **Migration applied**; main site is primary storefront and buyer comparison is not required at launch | **CONDITIONAL GO** — Launch with main site as primary; document that full comparison (supplier, trust, trusted best) is on storefront buyer flow. Fix cart/order line item supplier/brand (medium) when convenient. |
| **Migration applied**; storefront buyer flow is primary or both are used; `canonical_products`/`supplier_offers` populated for key products | **READY** — All five flows function. Remaining items are medium (line items, sort dropdown, main site RFQ labels, admin supplier-upload view) and can be iterated post-launch. |

**One-line verdict:** Apply the quote lifecycle migration; then **CONDITIONAL GO** if main site is primary (with documented limitation on comparison), **READY** if storefront buyer flow and catalog data are part of launch and migration is applied.
