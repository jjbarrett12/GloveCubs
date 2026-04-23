# GLOVECUBS — Load / Stress / Concurrency Audit Report

**Audit Date:** 2026-03-02  
**Scope:** Production load readiness; system assumed to fail under load until proven otherwise.  
**Target load:** 50, 100, 250, 500 concurrent users across login, product discovery, commercial flows, supplier uploads, admin, and recommendation writes.

---

## 1. Launch Blockers

| ID | Issue | Location / Fix |
|----|--------|----------------|
| **LB-1** | Full-table scan on `supplier_offers` when catalog uses price filter or price sort; under 100+ concurrent users this will exhaust DB and app memory. | `catalogos/src/lib/catalog/query.ts` (lines ~90, ~120). Restrict by product IDs or use aggregated/min-price view; never load all active offers. |
| **LB-2** | Unbounded `categories` and `brands` selects (no `.limit()`); small today but unsafe under scale. | `catalogos/src/lib/catalog/query.ts` (~214–216). Add limit or document and cap. |
| **LB-3** | Feed commit is not atomic; partial failure leaves `supplier_offers` and upload status inconsistent. | `storefront/src/lib/supplier-portal/feedUpload.ts` (`executeCommitTransaction`). Use single DB transaction or stored procedure for all updates/inserts/status. |
| **LB-4** | Quote submission has no idempotency; double submit or retry creates duplicate quotes. | Catalogos quote action + `catalogos/src/lib/quotes/service.ts` (`createQuoteRequest`). Add idempotency key (client token); reject or return existing when key repeated. |
| **LB-5** | No rate limiting on catalogos quote submission; vulnerable to quote spam and DoS. | Catalogos quote action / API. Add rate limit (per IP or per email). |
| **LB-6** | No file size limit on storefront feed upload route; 50MB body limit in server is a DoS vector. | Storefront feed-upload API. Add explicit file size limit (e.g. 10MB). |

---

## 2. High-Risk Performance Issues

| ID | Issue | Location |
|----|--------|----------|
| **HR-1** | Legacy auth rate limit 20 req/15 min per IP; can cause false lockouts under burst (e.g. team login) or throttle load tests from same IP. | `server.js` (auth limiter). |
| **HR-2** | Storefront supplier rate limit uses in-memory store; lost on restart and not shared across instances. | `storefront/src/lib/hardening/rateLimiter.ts`. |
| **HR-3** | N+1 filter queries: `getFilteredProductIds` runs one query per filter dimension (material, size, color, brand, etc.); many round-trips under concurrent load. | `catalogos/src/lib/catalog/query.ts` (getFilteredProductIds). |
| **HR-4** | Product list with price sort builds full result set in memory (all product IDs + min price map) then slices for pagination; does not scale. | `catalogos/src/lib/catalog/query.ts` (listLiveProducts, price_asc/price_desc path). |
| **HR-5** | Quote + line items not in single transaction; if line insert fails, orphan quote row remains. | Catalogos `createQuoteRequest` (quote insert then line inserts). |
| **HR-6** | No duplicate-submit protection on quote form (e.g. disable button, idempotency key). | Quote form / action. |
| **HR-7** | Memory spike with many concurrent large CSV/XLSX uploads (in-memory parse; max 5000 rows per config). | `storefront/src/lib/supplier-portal/feedUpload.ts` (processFeedUpload). |
| **HR-8** | Long-running feed preview can hit Vercel/Next default timeouts (e.g. 10–60s). | Storefront POST feed-upload (preview generation). |

---

## 3. Concurrency Risks

| ID | Issue | Location |
|----|--------|----------|
| **CR-1** | `withTransaction` (begin_transaction RPC → callback → commit_transaction RPC) does **not** provide atomicity across Supabase client calls; each Supabase call uses a new connection. Code that assumes multi-statement transactions is incorrect. | `storefront/src/lib/hardening/transactions.ts`. |
| **CR-2** | Stale job release must run periodically (e.g. via cron or worker); otherwise jobs left in "running" by crashed workers are never reclaimed until timeout. | Job queue + `releaseStaleJobs`. |
| **CR-3** | Feed commit does many per-row SELECTs then many UPDATEs then one INSERT; concurrent commits for same supplier can cause lock contention on `supplier_offers`. | `feedUpload.ts` executeCommitTransaction. |

**Positive:** Job claim uses `FOR UPDATE SKIP LOCKED`; cron uses DB lock (`acquire_cron_lock` / `release_cron_lock`); recommendation outcome writes use advisory lock per recommendation_id. No duplicate job execution or cron overlap observed.

---

## 4. Database Hotspots

| Hotspot | Cause | Impact |
|---------|--------|--------|
| **Catalogos product list (price filter/sort)** | Full table scan on `supplier_offers` (all active offers) to compute min price per product. | Under 50–100+ concurrent catalog requests with price sort/filter: high DB load and memory; timeouts and errors. |
| **getFilteredProductIds** | One query per filter dimension; sequential round-trips. | Slower response and higher DB load as filters increase. |
| **Feed commit** | Many SELECTs (existing offer per row), then many UPDATEs, then one INSERT; all on `supplier_offers`. | Long-running request; lock contention; partial commit on failure. |
| **Quote creation** | Two inserts (quote_requests, quote_line_items) without transaction. | Orphan quote on line insert failure; no idempotency. |
| **Dashboard / account (legacy)** | `getOrdersByCompanyId`, favorites by user_id, RFQs by company; indexes exist. | Lower risk if company/order volume is moderate. |

---

## 5. Missing Indexes

| Table | Recommended Index | Purpose |
|-------|-------------------|--------|
| **catalogos.supplier_offers** | `(is_active, product_id)` WHERE `is_active = true` (or composite supporting "min cost per product" per category/product set) | Avoid full scan when resolving best price for product list. |
| **catalogos.products** | `(is_active, category_id, published_at DESC)` | Efficient category list + newest sort. |
| **catalogos.quote_requests** | Existing status/created_at indexes; consider `(email, created_at DESC)` for My Quotes by email. | Already present for status; email list if used at scale. |

Existing indexes (job_queue, quote_requests status/lifecycle, supplier_offers supplier_id/product_id/is_active) are in place; the critical gap is avoiding **loading all supplier_offers** for price filter/sort in application code rather than in DB (e.g. server-side aggregation or materialized min price per product).

---

## 6. Missing Load Tests

| Gap | Description |
|-----|-------------|
| **Catalogos catalog list** | No k6 scenario targeting catalogos base URL for category list with `sort=price_asc` or `price_min`/`price_max`. Current product-search/product-view may hit legacy (BASE_URL 3004) not catalogos. |
| **Catalogos quote submit** | Quote submit scenario may target legacy; catalogos quote is via Next.js server action. Need scenario that hits the app creating `catalogos.quote_requests`. |
| **Quote idempotency** | No test that submits same idempotency key twice and asserts single quote (idempotency not implemented yet). |
| **Feed commit failure** | No test that simulates DB failure mid-commit and asserts no partial commit (e.g. rollback or consistent failed state). |
| **Supplier auth under load** | No dedicated scenario for 50+ concurrent supplier logins to measure rate limit impact (20/15min auth on legacy; storefront supplier has its own limiter). |
| **Playwright / browser smoke** | No browser-based critical-path smoke under load (e.g. login → add to cart → checkout or quote submit). |
| **DB profiling** | No automated EXPLAIN or pg_stat_statements capture as part of load test runs for hotspot verification. |

---

## 7. Recommended Load Scripts

### 7.1 k6 — Catalogos catalog list (price sort)

**Purpose:** Expose full-table scan and validate fix.

- **Endpoint:** GET catalogos catalog page or API, e.g.  
  `GET /catalog/disposable_gloves?sort=price_asc&page=1` (or equivalent catalogos base URL).
- **Scenarios:** 50, 100, 250, 500 VUs; 3–5 min each.
- **Thresholds:** p95 < 2000 ms; http_req_failed_rate < 1%.
- **Run:**  
  `CATALOGOS_URL=<catalogos_base> k6 run --env PROFILE=stress load-tests/scenarios/catalogos-catalog-list.js`  
  (create scenario that uses CATALOGOS_URL and sort=price_asc).

### 7.2 k6 — Quote submission (catalogos)

**Purpose:** Measure quote submit latency and error rate; later assert idempotency when implemented.

- **Endpoint:** POST to catalogos quote submission (server action or API that creates `quote_requests`).
- **Scenarios:** 25, 50 VUs (lower to limit duplicate test data); 2–3 min.
- **Thresholds:** p95 < 3000 ms; errors < 2%.
- **Data:** Unique company_name/email per VU/iteration (e.g. `loadtest+${__VU}-${__ITER}@example.com`).

### 7.3 k6 — Mixed workload (existing, with correct URLs)

- **Run:**  
  `k6 run --env PROFILE=stress_250 run-all.js`  
  `k6 run --env PROFILE=stress_500 run-all.js`
- **Ensure:** BASE_URL and STOREFRONT_URL (and if applicable CATALOGOS_URL) point to the apps that serve production traffic (legacy vs catalogos vs storefront).
- **Collect:** p95/p99 and error rate per scenario; identify first bottleneck (expected: catalog list or search if hitting catalogos with price sort).

### 7.4 k6 — Concurrent recommendation outcome writes

**Purpose:** Confirm advisory lock prevents duplicate terminal outcomes.

- **Endpoint:** Record outcome for same recommendation_id from multiple VUs.
- **Threshold:** All requests succeed or return "already recorded"; no duplicate terminal outcomes.
- **Existing:** outcome-write scenario; add variant that targets same recommendation_id from N VUs.

### 7.5 Failure-mode tests (manual or dedicated script)

- **Failed quote submit:** Simulate 500 or disconnect after quote insert, before line insert; verify no orphan quote or clear error and retry-safe message.
- **Duplicate quote submit:** Submit same payload (or same idempotency key when added) twice; document current behavior (two quotes) and desired (one quote).
- **Feed commit timeout:** Abort or disconnect mid-commit; verify no partial commit (currently will see partial commit until LB-3 fixed).
- **DB retry:** Temporarily fail DB; verify API returns 5xx and no corrupted state after recovery.

### 7.6 Database profiling

- **Pre/post load:** Run `EXPLAIN (ANALYZE, BUFFERS)` on hot queries (product list with price sort, getFilteredProductIds, quote by ref, favorites by user).
- **During load:** Use pg_stat_statements (or equivalent) to identify top time-consuming queries and full scans.

---

## Phase Summary (1–8)

| Phase | Finding |
|-------|--------|
| **1. Auth load** | Legacy rate limits (20/15min auth) can throttle burst; catalogos quote has no rate limit. Session validation is stateless (JWT). No session corruption observed; rate limit store is in-memory (HR-2). |
| **2. Product discovery** | Critical: full-table scan and N+1 in catalogos (LB-1, LB-2, HR-3, HR-4). Search (`q`) not implemented. Supplier comparison (storefront) exists; catalogos product page does not expose supplier names. |
| **3. Commercial flow** | Quote: no idempotency (LB-4), no transaction (HR-5). Feed commit not atomic (LB-3). Order/invoice (legacy) use company-scoped queries; no duplicate submit or race conditions audited there. |
| **4. Supplier upload** | Memory and timeout risk (HR-7, HR-8); partial commit (LB-3); no file size limit (LB-6). |
| **5. Background jobs** | Job claim and cron locks are sound; withTransaction is misleading (CR-1); stale job release must run (CR-2). |
| **6. Database** | Hotspots and missing indexes as in sections 4 and 5. |
| **7. Failure modes** | Retries and duplicate submit are not safe for quotes or feed commit; no rollback for partial commit. |
| **8. Load test harness** | k6 scenarios exist for 50–500 VUs; catalogos catalog and quote targets need verification; add catalogos-catalog-list scenario and failure-mode tests. |

---

## Can GLOVECUBS Handle Realistic Launch Traffic?

**No.** With current code:

- **Catalog:** Product list with price filter or price sort does a full-table scan on `supplier_offers`. At 50–100+ concurrent users this will drive high DB and app load and likely timeouts or errors.
- **Quotes:** No idempotency and no transaction for quote + lines; duplicate and orphan data under retries or double-submit.
- **Feed commit:** Non-atomic; partial failure leaves inconsistent data.

So the system is **not** ready for sustained realistic launch traffic (50–500 users) as-is.

---

## Verdict

# NOT READY

**Reason:** Launch blockers (full-table scan on catalog, non-atomic feed commit, no quote idempotency, no quote rate limit, no upload file limit) and high-risk performance and concurrency issues make the platform unsafe for 50+ concurrent users when catalog price sort/filter or quote/feed flows are used. Load test harness is good but does not yet target catalogos catalog with price sort or validate idempotency/failure recovery.

---

## Safe Concurrent User Level (Estimate)

| Scenario | Safe concurrent users (estimate) | Condition |
|----------|-----------------------------------|-----------|
| **Catalog browsing (no price sort/filter)** | **&lt; 30–50** | Catalogos list without price_min/max or sort=price_asc/desc. |
| **Catalog with price sort/filter** | **&lt; 10** | Will hit full-table scan; not recommended until fixed. |
| **Quote submission** | **No hard limit** | Functional risk is duplicate/orphan quotes, not raw throughput. |
| **Legacy dashboard / favorites / orders** | **~50–100** | Depends on DB and legacy server; auth rate limit can throttle from single IP. |
| **Supplier feed upload** | **&lt; 5 concurrent** | Memory and timeout risk; partial commit risk. |
| **Background jobs + cron** | **1 worker / 1 cron** | Design supports single instance; no duplicate execution. |

**Overall safe concurrent user level today:** **&lt; 30–50** for mixed traffic if catalog is used **without** price filter or price sort, and quote/feed write volume is low. For any scenario that stresses catalog price sort, feed commit, or quote retries, the system is **not** safe at scale until the launch blockers are fixed.

---

## Minimum to Reach CONDITIONAL GO

1. **Fix catalogos product list** so it never does a full-table scan on `supplier_offers` (restrict by product set or use server-side aggregation/materialized min price); bound categories/brands selects.
2. **Make feed commit atomic** (single transaction or stored procedure).
3. **Add quote idempotency** (client key + unique constraint or upsert) and, ideally, transactional quote + line inserts.
4. **Add rate limiting** for catalogos quote submit and **file size limit** for feed upload.
5. **Run load tests** (50–100 VUs) targeting catalogos catalog (with price sort) and quote flows; confirm p95 and error rate within thresholds.

After these, re-evaluate for **CONDITIONAL GO** at a defined concurrency (e.g. 50–100 users) with monitoring.
