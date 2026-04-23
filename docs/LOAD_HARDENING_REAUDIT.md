# GLOVECUBS — Load-Hardening Re-Audit

**Re-Audit Date:** 2026-03-02  
**Scope:** Re-test of previously identified launch blockers and high-risk load/performance issues only.

---

## 1. Catalog Price Sort/Filter Performance

**Status: NOT FIXED**

| Check | Result | Evidence |
|-------|--------|----------|
| Full-table scan on `supplier_offers` for price_min/price_max | Still present | `catalogos/src/lib/catalog/query.ts` lines 89–90: `supabase.from("supplier_offers").select("product_id, cost, sell_price").eq("is_active", true)` with no `.in("product_id", ...)` or `.limit()`. |
| Full-table scan for sort price_asc/price_desc | Still present | Lines 119–120: same unbounded select of all active offers to build `minPriceByProduct` in memory. |
| Unbounded categories/brands | Still present | Lines 154–155 (price sort path) and 213–214 (newest path): `supabase.from("categories").select("id, slug")` and `supabase.from("brands").select("id, name")` with no `.limit()`. |

**Conclusion:** Catalog list with price filter or price sort still loads all `supplier_offers` rows and is unsafe under 50+ concurrent users.

---

## 2. Quote Idempotency and Duplicate-Submit Safety

**Status: NOT FIXED**

| Check | Result | Evidence |
|-------|--------|----------|
| Idempotency key on quote submission | Not implemented | `catalogos/src/lib/quotes/service.ts`: `createQuoteRequest` has no idempotency_key parameter. Reference is `RFQ-${Date.now().toString(36).toUpperCase().slice(-8)}`; no client token or unique constraint. |
| Duplicate submit protection | None | `catalogos/src/app/actions/quotes.ts`: `submitQuoteRequestAction` calls `createQuoteRequest(parsed.data)` with no idempotency check. Double submit creates two quotes. |
| Quote + line items in single transaction | No | Quote insert then line insert; if line insert fails, quote row remains (orphan). |

**Conclusion:** Quote submission is still not idempotent and not transactional; duplicate and orphan quotes remain possible.

---

## 3. Feed Commit Atomicity and Rollback

**Status: NOT FIXED** (comment is misleading)

| Check | Result | Evidence |
|-------|--------|----------|
| Single DB transaction for commit | No | `storefront/src/lib/supplier-portal/feedUpload.ts`: `executeCommitTransaction` (lines 1288–1427) performs per-row SELECTs, then a **loop of individual UPDATEs** (each Supabase call commits independently), then one INSERT, then status update. There is no Postgres BEGIN/COMMIT/ROLLBACK. |
| Rollback on failure | No | On "Insert failed" (or update failure), the catch block logs `rollback_successful: true` but **no rollback occurs**; updates have already been committed. Partial commit remains possible. |
| Comment vs implementation | Misleading | Comment states "Execute the commit operation within a database transaction" and "All updates/inserts are atomic - either all succeed or all rollback." Implementation does not use a single transaction. |

**Conclusion:** Feed commit is still not atomic. Partial failure leaves some offers updated and upload status inconsistent.

---

## 4. Quote Submission Rate Limiting

**Status: NOT FIXED**

| Check | Result | Evidence |
|-------|--------|----------|
| Rate limit on catalogos quote submit | None | No `checkRateLimit` or rate-limit middleware in catalogos. `submitQuoteRequestAction` in `catalogos/src/app/actions/quotes.ts` has no rate check. |
| Legacy quote/RFQ | N/A | Legacy uses API rate limit (200/15min per IP); catalogos quote is separate. |

**Conclusion:** Catalogos quote submission remains vulnerable to spam and DoS; no rate limiting.

---

## 5. File Size Limits on Supplier Upload

**Status: FIXED** (with caveat)

| Check | Result | Evidence |
|-------|--------|----------|
| File size limit enforced | Yes | `storefront/src/lib/supplier-portal/feedUpload.ts`: `UPLOAD_CONFIG.max_file_size_bytes: 10 * 1024 * 1024` (10 MB). `validateFile()` (lines 170–184) checks size and adds error if exceeded. |
| Route uses validation | Yes | `storefront/src/app/supplier-portal/api/feed-upload/route.ts`: After reading file content, calls `validateFile(file.name, content, fileType)` and returns 400 with validation errors if invalid. |
| Caveat | File read before size check | Content is read (`file.arrayBuffer()` or `file.text()`) before `validateFile`. An oversized file (e.g. 50MB) would be read into memory then rejected. Consider checking `file.size` before reading to avoid memory spike. |

**Conclusion:** 10 MB file size limit is in place; recommend adding early `file.size` check in the route to reject oversized files before reading.

---

## 6. Auth Rate Limiting Sanity

**Status: UNCHANGED** (no fix applied; sanity check)

| Check | Result | Evidence |
|-------|--------|----------|
| Legacy auth limit | 20 req / 15 min per IP | `server.js` lines 326–331: `authContactLimiter` with `max: 20`, `windowMs: 15 * 60 * 1000`. |
| Impact | Can throttle legitimate burst | Team login or load test from single IP can hit limit. No change since prior audit. |

**Conclusion:** Auth rate limit remains strict; acceptable for security but may cause false lockouts under burst. Document or consider slightly higher limit for production.

---

## 7. N+1 Query Behavior in Catalog/Product List

**Status: NOT FIXED**

| Check | Result | Evidence |
|-------|--------|----------|
| getFilteredProductIds | Still one query per filter dimension | `catalogos/src/lib/catalog/query.ts` lines 50–68: loop over `filterKeys`, for each key with values calls `getAttributeDefinitionIdsByKey(key)` then `productIdsForFilter(defIds, values, ...)`. Sequential awaits in loop = N+1 style. |
| productIdsForFilter | One DB round-trip per call | Each call hits `product_attributes`; multiple filters = multiple round-trips. |

**Conclusion:** N+1 pattern remains; concurrent requests with multiple filters increase DB load.

---

## 8. Concurrency on Recommendation Outcomes and Feed Commit

| Area | Result | Evidence |
|------|--------|----------|
| **Recommendation outcomes** | Safe | `storefront/src/lib/procurement/outcomes.ts`: `recordAcceptance` and `recordRejection` use `withAdvisoryLock('recommendation_outcome', recommendation_id, async () => { ... })`. Concurrent writes for same recommendation_id are serialized; idempotent handling for already-accepted. |
| **Feed commit** | Lock contention risk; not atomic | Multiple suppliers can commit in parallel. Same supplier committing two uploads concurrently can contend on `supplier_offers` rows. Commit itself is still not atomic (see §3). |

**Conclusion:** Recommendation outcome concurrency is handled correctly. Feed commit concurrency is limited by non-atomic implementation and possible row contention.

---

## 9. Safe Concurrent User Level After Fixes

**Fixes applied since prior audit:** File size limit on supplier upload (10 MB). No other previously identified launch blockers or high-risk items have been fixed in code.

**Safe concurrency estimate:** Unchanged from prior audit.

- **Catalog with price sort/filter:** Still unsafe at scale; full-table scan remains. **&lt; 10** concurrent users if used.
- **Catalog without price sort/filter:** **&lt; 30–50** concurrent users (newest sort only).
- **Quote submit:** No idempotency; duplicate/orphan risk at any level.
- **Feed upload:** 10 MB limit reduces DoS; commit still non-atomic. **&lt; 5** concurrent commits recommended.
- **Recommendation outcomes:** Safe under concurrency (advisory lock).

**Overall safe concurrent user level:** **&lt; 30–50** for mixed traffic **without** catalog price filter/sort; not ready for 50+ with price sort/filter or heavy quote/feed writes until catalog, quote, and feed commit are fixed.

---

## Remaining Launch Blockers

| ID | Issue | Location |
|----|--------|----------|
| **LB-1** | Full-table scan on `supplier_offers` for catalog price filter and price sort | `catalogos/src/lib/catalog/query.ts` lines ~89, ~119 |
| **LB-2** | Unbounded categories/brands selects | `catalogos/src/lib/catalog/query.ts` lines ~154–155, ~213–214 |
| **LB-3** | Feed commit not atomic; partial failure leaves inconsistent state | `storefront/src/lib/supplier-portal/feedUpload.ts` `executeCommitTransaction` |
| **LB-4** | Quote submission has no idempotency; duplicate submissions create duplicate quotes | `catalogos/src/lib/quotes/service.ts` `createQuoteRequest`; `catalogos/src/app/actions/quotes.ts` |
| **LB-5** | No rate limiting on catalogos quote submission | Catalogos quote action / API |

---

## High-Risk Issues

| ID | Issue | Location |
|----|--------|----------|
| **HR-1** | N+1 filter queries in `getFilteredProductIds` (one query per filter dimension) | `catalogos/src/lib/catalog/query.ts` lines 50–68 |
| **HR-2** | Product list with price sort builds full result set in memory (all product IDs + min price map) | `catalogos/src/lib/catalog/query.ts` listLiveProducts price_asc/price_desc path |
| **HR-3** | Quote + line items not in single transaction; orphan quote on line insert failure | `catalogos/src/lib/quotes/service.ts` createQuoteRequest |
| **HR-4** | Feed commit catch logs "rollback_successful: true" but no rollback is performed; misleading | `storefront/src/lib/supplier-portal/feedUpload.ts` catch block ~1401–1407 |

---

## Medium Issues

| ID | Issue | Location |
|----|--------|----------|
| **MR-1** | File is read into memory before size validation; oversized upload can cause memory spike before 400 | `storefront/src/app/supplier-portal/api/feed-upload/route.ts`: call `file.size` and reject before `arrayBuffer()`/`text()` |
| **MR-2** | Legacy auth rate limit 20/15min may be too strict for burst; document or tune | `server.js` authContactLimiter |
| **MR-3** | Categories/brands tables small but unbounded; add limit or document | `catalogos/src/lib/catalog/query.ts` |

---

## Exact Files / Routes / Queries Still Weak

| Priority | File / route / query | Required change |
|----------|----------------------|------------------|
| **P0** | `catalogos/src/lib/catalog/query.ts` | Remove full-table scan of `supplier_offers` for price filter and price sort (restrict by product set or use server-side aggregation); add `.limit()` or document on categories/brands. |
| **P0** | `storefront/src/lib/supplier-portal/feedUpload.ts` | Make feed commit atomic: single DB transaction or stored procedure that performs all updates/inserts/status in one transaction with rollback on failure. Remove or correct "rollback_successful" log. |
| **P0** | `catalogos/src/lib/quotes/service.ts` + quote action | Add idempotency key (e.g. client token) to quote submission; reject or return existing quote when key repeated. Wrap quote insert + line inserts in single transaction (e.g. Postgres function or RPC). |
| **P1** | Catalogos quote submission (action or route) | Add rate limiting (per IP or per email). |
| **P1** | `storefront/src/app/supplier-portal/api/feed-upload/route.ts` | Check `file.size` before reading content; return 413 or 400 if above 10 MB to avoid memory spike. |
| **P2** | `catalogos/src/lib/catalog/query.ts` getFilteredProductIds | Reduce round-trips: single batched query or batched attribute filter. |

---

## Updated Verdict

# NOT READY

**Reason:** The only change verified in this re-audit is the **10 MB file size limit** on supplier upload. All other previously identified launch blockers and high-risk items remain:

- Catalog price sort/filter still does a **full-table scan** on `supplier_offers`.
- Quote submission still has **no idempotency** and **no transaction** for quote + lines.
- Feed commit is still **not atomic**; comment claims transaction and rollback but implementation does not use a single transaction, and partial commit is still possible.
- **No rate limiting** on catalogos quote submission.
- **N+1** behavior in `getFilteredProductIds` is unchanged.

Until catalog query, quote idempotency/transaction, and feed commit atomicity are fixed, the platform is not ready for initial load at 50+ concurrent users when catalog price sort/filter or quote/feed flows are used.

---

## Updated Safe Concurrency Estimate

| Scenario | Safe concurrent users |
|----------|------------------------|
| **Catalog browsing (no price sort/filter)** | **&lt; 30–50** |
| **Catalog with price sort/filter** | **&lt; 10** (avoid until fixed) |
| **Quote submission** | Throughput OK; duplicate/orphan risk at any level |
| **Supplier feed upload** | **&lt; 5** concurrent; 10 MB limit in place; commit still non-atomic |
| **Recommendation outcome writes** | Safe under concurrency (advisory lock) |

**Overall:** **&lt; 30–50** concurrent users for mixed traffic **without** catalog price filter/sort. No change from prior audit; only file size limit was added.
