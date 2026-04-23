# GLOVECUBS — LOAD / STRESS / CONCURRENCY AUDIT REPORT

**Audit Date:** 2026-03-02  
**Scope:** Production load and concurrency readiness; system assumed to fail under load until proven otherwise.

---

## Executive Summary

| Area | Verdict | Critical Finding |
|------|---------|------------------|
| **Auth/Session Load** | RISK | Legacy rate limits (20/15min auth, 200/15min API); catalogos/storefront buyer auth not exercised by load tests |
| **Buyer Interaction Load** | CRITICAL | Product list does full-table scan on supplier_offers; N+1 filter queries |
| **Commercial Flow Load** | RISK | Quote submit has no idempotency; feed “transaction” is not atomic |
| **Supplier/Admin Load** | RISK | Feed commit partial-failure leaves DB inconsistent; 50MB body limit DoS risk |
| **Background Job Concurrency** | GOOD | Job claim uses FOR UPDATE SKIP LOCKED; cron uses DB lock |
| **Database/Query Performance** | CRITICAL | Unbounded supplier_offers reads; missing composite indexes on hot paths |
| **Failure Mode / Recovery** | RISK | No retry idempotency; transaction helper cannot span Supabase calls |
| **Load Test Harness** | GOOD | k6 scenarios exist for 50–500 VUs; catalogos routes not fully covered |

**Verdict: NOT READY** for sustained production load at 100+ concurrent users until critical query and atomicity issues are fixed.

---

## PHASE 1 — AUTH / SESSION LOAD AUDIT

### What Exists

| Component | Implementation | Notes |
|-----------|----------------|-------|
| Legacy (server.js) | express-rate-limit | API 200/15min per IP; auth/contact 20/15min per IP; AI 30/15min per IP/user |
| Storefront supplier auth | rateLimiter.ts + DB/in-memory | checkRateLimit by IP and email; failed login recorded |
| Catalogos buyer auth | None | No buyer login in catalogos; no rate limit on quote submit |
| Session persistence | Legacy JWT 7d; supplier cookie | No cross-app session |

### Findings

- **Concurrent logins:** Legacy auth 20 req/15min per IP will throttle under 50+ VUs from same IP (load tests use unique emails per VU to avoid this).
- **Session checks:** No evidence of session store bottlenecks; JWT is stateless.
- **Rate limiting misfires:** Auth limit (20) is low for legitimate burst (e.g. team login); may cause false lockouts.
- **Catalogos quote submission:** No rate limit on `submitQuoteRequestAction`; vulnerable to quote spam and DoS.

### Launch Blockers (Phase 1)

| ID | Issue | Location |
|----|--------|----------|
| **LB-1** | No rate limiting on catalogos quote submission | catalogos quote action / API |

### High-Risk (Phase 1)

| ID | Issue | Location |
|----|--------|----------|
| HR-1 | Legacy auth 20/15min may be too strict for burst logins | server.js:326 |
| HR-2 | Storefront rate limit uses in-memory store; lost on restart; not shared across instances | rateLimiter.ts:43 |

---

## PHASE 2 — BUYER INTERACTION LOAD AUDIT

### Product List / Search (Catalogos)

**Critical:** `listLiveProducts` in `catalogos/src/lib/catalog/query.ts`:

1. **Full-table scan on supplier_offers (lines 90, 120)**  
   When `price_min`/`price_max` or sort by `price_asc`/`price_desc` is used, the code does:
   ```ts
   await supabase.from("supplier_offers").select("product_id, cost, sell_price").eq("is_active", true)
   ```
   No `.in("product_id", ...)` and no `.limit()`. Every product list with price filter or price sort loads **all** active offers. Under 100+ concurrent users this will exhaust memory and DB.

2. **N+1-style filter queries (lines 61–68)**  
   `getFilteredProductIds` loops over each filter key (material, size, color, brand, etc.) and runs a separate `productIdsForFilter` query per key. Many concurrent requests with multiple filters = many round-trips and load.

3. **Categories/brands (lines 214–216)**  
   `supabase.from("categories").select("id, slug")` and `supabase.from("brands").select("id, name")` are unbounded (no `.limit()`). Small tables today but still unbounded.

### Search

- Search (`q` parameter) is not implemented (see Launch Re-Audit). No search load to stress.

### Dashboard / Favorites

- Buyer dashboard (storefront) requires auth; favorites in catalogos are not implemented. No load path for favorites in catalogos.

### Launch Blockers (Phase 2)

| ID | Issue | File:Line |
|----|--------|-----------|
| **LB-2** | Full-table scan on supplier_offers for price filter and price sort | catalogos/src/lib/catalog/query.ts:90, 120 |
| **LB-3** | Unbounded categories/brands select | catalogos/src/lib/catalog/query.ts:214–216 |

### High-Risk (Phase 2)

| ID | Issue | File |
|----|--------|------|
| HR-3 | N+1 filter queries (one per filter dimension) | query.ts:61–68 |
| HR-4 | Product list limit capped at 50 but total count and sort work on full result set in memory | query.ts:75, 127–140 |

---

## PHASE 3 — COMMERCIAL FLOW LOAD AUDIT

### Quote Submission (Catalogos)

- **Idempotency:** None. Each POST creates a new quote. Double submit or retry = duplicate quotes.
- **Reference number:** `RFQ-${Date.now().toString(36)...}` — same millisecond could theoretically collide; not used as idempotency key.
- **Transaction:** Insert quote then insert line items; no DB transaction. If line insert fails, quote row remains (orphan quote).

### Feed Commit (Storefront)

- **executeCommitTransaction** (feedUpload.ts:1289–1427): Does **not** run inside a single DB transaction. It:
  1. Loops rows, checks existing offer per row (many SELECTs).
  2. Builds lists of updates and inserts.
  3. Applies updates in a loop (many UPDATEs).
  4. Applies one batch INSERT.
  5. Updates upload status and audit.
  If step 4 or 5 fails, steps 1–3 are already committed → **partial commit**: some offers updated, others not; upload may stay in “committed” or “failed” inconsistently.

### Order / Invoice

- Order submission and invoice flows not audited in depth; no atomic transaction or idempotency evidence found for orders.

### Launch Blockers (Phase 3)

| ID | Issue | File:Line |
|----|--------|-----------|
| **LB-4** | Feed commit is not atomic; partial failure leaves inconsistent state | storefront/src/lib/supplier-portal/feedUpload.ts:1289–1427 |
| **LB-5** | Quote submission has no idempotency; duplicate submissions create duplicate quotes | catalogos/src/lib/quotes/service.ts:11–64 |

### High-Risk (Phase 3)

| ID | Issue | Location |
|----|--------|----------|
| HR-5 | Quote + line items not in same transaction; orphan quote on line insert failure | catalogos createQuoteRequest |
| HR-6 | No duplicate-submit protection (e.g. client token or idempotency key) on quote | Quote form / action |

---

## PHASE 4 — SUPPLIER / ADMIN LOAD AUDIT

### Supplier Feed Upload

- **File parsing:** XLSX/CSV parsed in memory; max 5000 rows (UPLOAD_CONFIG.max_rows). Large files (e.g. 5k rows × many columns) can spike memory under concurrent uploads.
- **Preview generation:** Per-row extract + normalize + validate; many DB calls per row. No batching of validations; under load, DB and CPU can spike.
- **Commit:** See Phase 3; not atomic; partial commit possible.
- **Storefront upload API:** No file size limit found in route; server.js has 50MB body limit (see Phase 7).

### Admin Review

- Review queue reads use filters; no single unbounded full scan observed. Concurrency not deeply audited; assume moderate load.

### Launch Blockers (Phase 4)

| ID | Issue | Location |
|----|--------|----------|
| **LB-6** | No file size limit on storefront feed upload route | storefront feed-upload API |
| **LB-7** | Feed commit partial failure leaves supplier_offers and upload status inconsistent | feedUpload.ts executeCommitTransaction |

### High-Risk (Phase 4)

| ID | Issue | Location |
|----|--------|----------|
| HR-7 | Memory spike with many concurrent large CSV/XLSX uploads (in-memory parse) | feedUpload processFeedUpload |
| HR-8 | Long-running preview under load can hit timeouts (Vercel/Next default 10–60s) | storefront POST feed-upload |

---

## PHASE 5 — BACKGROUND JOB CONCURRENCY AUDIT

### Job Queue

- **claim_next_job:** Uses `FOR UPDATE SKIP LOCKED` in Postgres; single job claimed per call; no double-claim.
- **Indexes:** idx_job_queue_status_priority_run_after, idx_job_queue_claimable, idx_job_queue_dedupe_key. Dedupe key prevents duplicate job enqueue.
- **Stale jobs:** releaseStaleJobs() exists; should be called periodically (e.g. by cron or worker).

### Cron

- **acquire_cron_lock / release_cron_lock:** Implemented in DB (cron_locks table); only one holder per lock_key until locked_until. Nightly/daily/weekly use different lock keys; no overlap.
- **Lock release on failure:** Nightly route has try/finally and releases lock in catch; good.

### Recommendation Outcomes

- **recordAcceptance / recordRejection:** Use `withAdvisoryLock('recommendation_outcome', recommendation_id, ...)`. Prevents concurrent outcome writes for same recommendation; good.

### Transaction Helper (withTransaction)

- **Broken for multi-statement atomicity:** `withTransaction` calls `begin_transaction` RPC, then runs callback, then `commit_transaction` RPC. Supabase client uses a new HTTP request per call; each request uses a new DB connection. So the callback’s Supabase calls do **not** run in the same transaction as begin/commit. The helper does not provide atomicity across multiple operations. Any code relying on it for atomicity is incorrect.

### Concurrency Risks (Phase 5)

| ID | Issue | Location |
|----|--------|----------|
| CR-1 | withTransaction cannot enforce a single transaction across Supabase calls | storefront/src/lib/hardening/transactions.ts |
| CR-2 | If releaseStaleJobs is not run, long-running or crashed workers leave jobs in “running” and they won’t be claimed again until stale timeout | job_queue |

---

## PHASE 6 — DATABASE / QUERY PERFORMANCE AUDIT

### Hot Paths and Indexes

| Query / Path | Issue | Index / Fix |
|--------------|--------|-------------|
| catalogos listLiveProducts with price filter/sort | Loads all supplier_offers (no product_id filter) | Add server-side aggregation or restrict by product_id set; avoid full scan |
| catalogos listLiveProducts price sort | Same full supplier_offers fetch | Use indexed min(cost) per product (e.g. materialized view or aggregated table) |
| getFilteredProductIds | One query per filter dimension | Consider composite filter or single query with AND conditions |
| product_attributes (filter) | product_id, attribute_definition_id, value_text | idx_product_attributes_def_value_product exists (catalogos); verify catalogos schema |
| supplier_offers (catalogos) | product_id, is_active | idx_supplier_offers_product, idx_supplier_offers_is_active exist |
| quote_requests | status, created_at | idx_quote_requests_status_lifecycle, idx_quote_requests_created |
| job_queue claim | status, priority, created_at, run_after | idx_job_queue_claimable |

### Missing or Weak Indexes

| Table | Suggested Index | Purpose |
|-------|------------------|--------|
| catalogos.supplier_offers | (is_active, product_id) WHERE is_active = true | Price-by-product and “best price” without full scan |
| catalogos.products | (is_active, category_id, published_at) | List by category + newest |
| catalogos.quote_line_items | (quote_request_id) | Already have quote_request_id in FK; verify index |

### Unbounded Queries

| File | Query | Fix |
|------|--------|-----|
| query.ts:90 | supplier_offers select all | Restrict by product IDs or use aggregation |
| query.ts:120 | supplier_offers select all | Same |
| query.ts:214–216 | categories select *; brands select * | Add .limit() or ensure tables stay small and document |

### Database Hotspots (Summary)

1. **catalogos listLiveProducts** when price filter or price sort is used: full scan of supplier_offers.
2. **getFilteredProductIds**: many sequential queries per request.
3. **Feed commit**: many per-row SELECTs then many UPDATEs then one INSERT; lock contention on supplier_offers for same supplier.

---

## PHASE 7 — FAILURE MODE / RECOVERY AUDIT

| Scenario | Current Behavior | Risk |
|----------|------------------|------|
| Failed quote submission (e.g. line insert fails) | Quote row may exist without lines | Orphan quote; inconsistent state |
| Duplicate quote submit (double-click / retry) | Two quotes created | Duplicate RFQs; no idempotency |
| Partial supplier upload commit | Some offers updated, then insert fails; status may be “failed” or “committed” | Inconsistent offers and upload status |
| Timeout during feed commit | Partial updates committed; client sees error | Same as above |
| API retry storm | Quote and other endpoints have no idempotency keys | Duplicate creates on retry |
| Temporary DB failure | Supabase client returns error; no application-level retry with backoff | Transient errors surface to user |
| Background job overlap | claim_next_job FOR UPDATE SKIP LOCKED prevents double claim | OK |
| Cron overlap | DB lock prevents second cron run | OK |

### Findings

- **Clear error handling:** Errors are thrown and returned; no silent swallow.
- **Retry-safe behavior:** Quote and feed commit are **not** idempotent; retries can create duplicates or partial state.
- **Duplicate writes:** Possible for quotes and for feed commit (partial).
- **Corrupted state:** Possible when feed commit fails mid-way.
- **Graceful degradation:** No evidence of circuit breaker or fallback for catalog/search under load.

---

## PHASE 8 — TEST HARNESS / SCRIPT AUDIT

### What Exists

- **k6** scenarios in `load-tests/`: buyer-login, product-search, product-view, quote-submit, dashboard-load, admin-review, supplier-upload, outcome-write, mixed-workload.
- **Config:** BASE_URL (legacy 3004), STOREFRONT_URL (3005); profiles smoke (10 VU), normal (50 VU), stress (100 VU), stress_250, stress_500, spike, soak, breakpoint.
- **Thresholds:** p95/p99 duration, error rate, duplicate_write_max_count.
- **helpers.js:** login, searchProducts, getProduct, submitQuote, etc.; some target legacy server.js (BASE_URL), not catalogos Next.js.

### Gaps

- **Catalogos catalog:** Product list and search are served by **catalogos** (Next.js), not necessarily server.js. Load tests that hit BASE_URL for “product search” may be hitting legacy routes; confirm which app serves catalog and ensure load tests target the correct base URL for catalogos.
- **Quote submit:** helpers.js submitQuote may POST to legacy; catalogos quote is submitted via Next.js server action. Ensure quote load test hits the app that creates catalogos.quote_requests.
- **No Playwright** or browser-based smoke under load mentioned.
- **No SQL/query profiling** (e.g. pg_stat_statements, EXPLAIN) run as part of audit; recommended for go-live.

### Recommended Stress Test Scripts (Summary)

1. **Catalogos product list under load (k6)**  
   - **Endpoint:** GET catalogos catalog list (e.g. `/catalog/disposable_gloves` or equivalent API with category, page, sort=price_asc).  
   - **Scenarios:** 50, 100, 250, 500 VUs; duration 3–5 min.  
   - **Thresholds:** p95 < 2000 ms; error rate < 1%.  
   - **Goal:** Expose full-table scan and N+1; validate after adding indexes/query fixes.

2. **Quote submission idempotency (k6 or Playwright)**  
   - **Action:** Submit same idempotency key (e.g. client-generated UUID) twice; expect single quote.  
   - **Current:** No key; document “duplicate quotes possible” until idempotency is added.

3. **Feed commit failure injection**  
   - **Action:** After half of offer updates, simulate DB failure (e.g. disconnect); verify rollback or consistent “failed” state and no partial commits.  
   - **Current:** Partial commit possible; test will fail until transaction is fixed.

4. **Concurrent outcome writes (k6)**  
   - **Endpoint:** Record outcome for same recommendation_id from multiple VUs.  
   - **Threshold:** No duplicate terminal outcomes; all requests succeed or get “already recorded” after first.  
   - **Current:** Advisory lock in place; test to confirm.

5. **Mixed workload (existing run-all.js)**  
   - **Run:** PROFILE=stress_250 and stress_500; collect p95/p99 and error rate per scenario.  
   - **Target:** Identify first bottleneck (likely catalog list or search).

---

## SUMMARY: ISSUES BY SEVERITY

### Launch Blockers (7)

| ID | Issue |
|----|--------|
| LB-1 | No rate limiting on catalogos quote submission |
| LB-2 | Full-table scan on supplier_offers for price filter/sort (catalogos query.ts) |
| LB-3 | Unbounded categories/brands select in catalogos |
| LB-4 | Feed commit not atomic; partial failure leaves inconsistent state |
| LB-5 | Quote submission has no idempotency; duplicate submissions |
| LB-6 | No file size limit on storefront feed upload route |
| LB-7 | Same as LB-4 (feed commit partial state) |

### High-Risk Performance Issues (8)

| ID | Issue |
|----|--------|
| HR-1 | Legacy auth rate limit 20/15min may be too strict |
| HR-2 | Rate limit store in-memory; not shared across instances |
| HR-3 | N+1 filter queries in getFilteredProductIds |
| HR-4 | Product list builds full result set in memory for price sort |
| HR-5 | Quote + line items not in same transaction |
| HR-6 | No duplicate-submit protection on quote form |
| HR-7 | Memory spike with many concurrent large uploads |
| HR-8 | Long-running feed preview can hit server timeouts |

### Concurrency Risks (2)

| ID | Issue |
|----|--------|
| CR-1 | withTransaction does not provide atomicity across Supabase calls |
| CR-2 | Stale job release must run periodically or jobs stay “running” |

### Database Hotspots (3)

| Hotspot | Cause |
|---------|--------|
| catalogos listLiveProducts (price filter/sort) | Full scan supplier_offers |
| getFilteredProductIds | Multiple queries per request |
| Feed commit | Many per-row SELECTs/UPDATEs on supplier_offers |

### Missing Indexes (Recommended)

| Table | Index |
|-------|--------|
| catalogos.supplier_offers | (is_active, product_id) WHERE is_active = true (or equivalent for “min price per product”) |
| catalogos.products | (is_active, category_id, published_at DESC) for list + sort |

### Missing Load Tests

- Catalogos catalog list and search (correct base URL and params).
- Quote idempotency (after implementing key).
- Feed commit with failure injection.
- Storefront supplier auth under 50+ concurrent logins (rate limit impact).

---

## FILES / ROUTES / QUERIES NEEDING FIXES

| Priority | File / Route | Required Change |
|----------|--------------|------------------|
| P0 | catalogos/src/lib/catalog/query.ts | Remove full-table scan of supplier_offers; restrict by product IDs or use aggregated/min view; add limit on categories/brands or document |
| P0 | storefront/src/lib/supplier-portal/feedUpload.ts | Make feed commit atomic (single DB transaction or stored procedure that does all updates/inserts/status in one transaction) |
| P0 | catalogos quote submission | Add idempotency key (e.g. client token); reject or return existing quote when key repeated |
| P1 | catalogos/src/app/actions/quotes.ts or quote route | Add rate limiting (per IP or per email) |
| P1 | storefront feed upload route | Add file size limit (e.g. 10MB) |
| P1 | catalogos createQuoteRequest | Wrap quote insert + line insert in single transaction (e.g. Postgres function or Supabase RPC) |
| P2 | storefront/src/lib/hardening/transactions.ts | Document that withTransaction does not span Supabase client calls; or replace with server-side transaction (RPC that runs all steps) |
| P2 | getFilteredProductIds | Consider single query or batched attribute filter to reduce round-trips |

---

## FINAL ANSWERS

### A. Can GLOVECUBS handle realistic launch traffic?

**Not reliably at 100+ concurrent users** with current catalog and quote behavior:

- Product list with price filter or price sort will do full-table scans on supplier_offers and can exhaust DB and app memory under concurrent load.
- Quote submission has no idempotency; retries and double-clicks create duplicate quotes.
- Feed commit can leave data in an inconsistent state on partial failure.

With low concurrency (e.g. &lt; 20 concurrent catalog users) and no heavy use of price filter/sort, the system may appear to work, but it is fragile.

### B. What traffic/concurrency level appears safe today?

- **Rough estimate:** **&lt; 30–50 concurrent users** for catalog browsing if most requests do not use price sort or price filter. Higher concurrency or widespread use of price sort/filter will hit the full-table scan and N+1.
- **Quote submit:** No hard limit from concurrency alone, but duplicate submissions and lack of idempotency are functional problems at any scale.
- **Feed upload:** A few concurrent uploads (e.g. &lt; 5) with moderate row counts are more likely to complete; partial commit and memory use remain risks.
- **Background jobs and cron:** Design is sound (FOR UPDATE SKIP LOCKED, cron lock); safe for single-worker and single-cron deployment.

### C. What must be fixed before broader scale?

1. **Catalogos product list:** Eliminate full-table scan on supplier_offers (restrict by product set or use pre-aggregated/min price per product); add safe limits on categories/brands.
2. **Feed commit:** Make commit atomic (single transaction or stored procedure).
3. **Quote submission:** Add idempotency (client key + unique constraint or “upsert” by key) and, if possible, wrap quote + lines in one transaction.
4. **Rate limiting:** Add rate limit for quote submit (catalogos); consider raising or refining legacy auth limit.
5. **Feed upload:** Enforce file size limit and consider streaming or chunked parse for very large files.
6. **Load test targeting:** Ensure k6 (and any Playwright) runs hit the actual catalogos and storefront endpoints used in production, and add a catalog list scenario with price sort/filter.

---

## VERDICT

# NOT READY

**Reason:** Critical query and data-safety issues: full-table scan on supplier_offers under load, non-atomic feed commit, and no quote idempotency. These can cause outages, inconsistent data, and duplicate quotes at realistic launch traffic (50–100+ users). Rate limiting and test coverage gaps add risk.

**Minimum to reach CONDITIONAL GO:**

1. Fix catalogos product list so it never does a full-table scan on supplier_offers (and bound categories/brands).
2. Make feed commit atomic (single transaction or equivalent).
3. Add quote submission idempotency and, ideally, transactional quote + lines.
4. Add rate limiting for quote submit and a file size limit for feed upload.
5. Run load tests (50–100 VUs) targeting catalogos catalog and quote flows; confirm p95 and error rate within thresholds.

After these, the platform can be re-evaluated for **CONDITIONAL GO** at defined concurrency (e.g. 50–100 users) with monitoring and further tuning.
