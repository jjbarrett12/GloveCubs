# GLOVECUBS — P0 Launch-Hardening Verification Audit

**Verification Date:** 2026-03-02  
**Scope:** Re-test of 9 P0 load-hardening areas only.

---

## Verification Results Summary

| # | Area | Status | Evidence |
|---|------|--------|----------|
| 1 | Catalog price sort/filter performance | **FIXED** | Uses `product_best_offer_price` view; no full `supplier_offers` scan |
| 2 | Categories/brands query bounds | **FIXED** | `.limit(MAX_CATEGORIES_OR_BRANDS)` (500) on all categories/brands selects |
| 3 | Feed commit atomicity and rollback | **NOT FIXED** | Still loop of UPDATEs then INSERT; no single DB transaction |
| 4 | Quote idempotency and duplicate-submit safety | **NOT FIXED** | No idempotency key; double submit creates two quotes |
| 5 | Quote parent + line item transaction safety | **NOT FIXED** | Quote insert then line insert; no single transaction |
| 6 | Quote submission rate limiting | **NOT FIXED** | No rate limit on catalogos quote action |
| 7 | Oversized upload rejection before file read | **NOT FIXED** | Content read (`file.arrayBuffer()`/`file.text()`) then `validateFile()`; no `file.size` check before read |
| 8 | N+1 behavior in catalog filter path | **FIXED** | Batched `getAttributeDefinitionIdsByKeys` + `Promise.all` for filter queries |
| 9 | Safe concurrent user level | **Updated** | Catalog path safe at higher concurrency; quote/feed limits unchanged |

---

## 1. Catalog Price Sort/Filter Performance — FIXED

- **Before:** Full-table scan on `supplier_offers` for price_min/price_max and for price_asc/price_desc sort.
- **After:** Uses view `catalogos.product_best_offer_price` for all price filtering and price sort.
- **Evidence:**  
  - `catalogos/src/lib/catalog/query.ts`: Price filter uses `supabase.from("product_best_offer_price").select("product_id").gte("best_price", ...).lte("best_price", ...).limit(MAX_PRODUCT_IDS_FOR_PRICE)` (lines 103–110).  
  - Price sort uses `product_best_offer_price` with `.order("best_price", ...).range(from, from + limit - 1)` and optional `.in("product_id", idList)` when filtered (lines 124–167).  
  - File comment: "product_best_offer_price view for price (no full supplier_offers scan)".  
- **Migration:** `supabase/migrations/20260403000001_catalog_product_best_price_view.sql` defines the view.

---

## 2. Categories/Brands Query Bounds — FIXED

- **Before:** Unbounded `categories` and `brands` selects.
- **After:** All selects use `.limit(MAX_CATEGORIES_OR_BRANDS)` (500).
- **Evidence:**  
  - `MAX_CATEGORIES_OR_BRANDS = 500` (line 16).  
  - Lines 169–170 (price sort path), 212–213 (newest path): `supabase.from("categories").select(...).limit(MAX_CATEGORIES_OR_BRANDS)` and same for brands.

---

## 3. Feed Commit Atomicity and Rollback — NOT FIXED

- **Current behavior:** `executeCommitTransaction` still does per-row SELECTs, then a **loop of individual UPDATEs** (each Supabase call commits on its own), then one INSERT, then status/audit. There is no Postgres BEGIN/COMMIT/ROLLBACK or single RPC.
- **Evidence:**  
  - `storefront/src/lib/supplier-portal/feedUpload.ts` lines 1366–1396: for-loop over `updates` with `supabaseAdmin.from('supplier_offers').update(...).eq('id', update.id)`; then `insert(inserts)`; then `updateUploadStatus`.  
  - Catch block (1401–1419) logs "rollback_successful: true" but no rollback is performed; updates are already committed.
- **Conclusion:** Partial commit on failure is still possible; comment claiming "transaction" and "rollback" is misleading.

---

## 4. Quote Idempotency and Duplicate-Submit Safety — NOT FIXED

- **Current behavior:** No idempotency key; each submit creates a new quote. Reference is `RFQ-${Date.now().toString(36)...}`; no client token or unique constraint.
- **Evidence:**  
  - `catalogos/src/lib/quotes/service.ts` `createQuoteRequest`: no `idempotency_key` parameter; single insert.  
  - `catalogos/src/app/actions/quotes.ts` `submitQuoteRequestAction`: calls `createQuoteRequest(parsed.data)` with no idempotency check.

---

## 5. Quote Parent + Line Item Transaction Safety — NOT FIXED

- **Current behavior:** Quote row inserted, then line items inserted in a separate call. If line insert fails, quote row remains (orphan).
- **Evidence:**  
  - `catalogos/src/lib/quotes/service.ts` lines 15–46: `supabase.from("quote_requests").insert(...).single()` then `supabase.from("quote_line_items").insert(lineRows)`; no RPC or single transaction wrapping both.

---

## 6. Quote Submission Rate Limiting — NOT FIXED

- **Current behavior:** No rate limit on catalogos quote submission.
- **Evidence:** No `checkRateLimit` or rate-limit middleware in catalogos; `submitQuoteRequestAction` has no rate check.

---

## 7. Oversized Upload Rejection Before File Read — NOT FIXED

- **Current behavior:** File content is read (`file.arrayBuffer()` or `file.text()`) then passed to `validateFile()`, which enforces 10 MB. Oversized files are fully read into memory before rejection.
- **Evidence:**  
  - `storefront/src/app/supplier-portal/api/feed-upload/route.ts` lines 103–112: `content = await file.arrayBuffer()` or `file.text()`, then `validateFile(file.name, content, fileType)`.
- **Conclusion:** 10 MB limit is enforced in validation, but a malicious large upload can cause memory spike before 400. No `file.size` check before read.

---

## 8. N+1 Behavior in Catalog Filter Path — FIXED

- **Before:** Sequential loop: for each filter key, `getAttributeDefinitionIdsByKey(key)` then `productIdsForFilter(...)` (one round-trip per dimension).
- **After:** Single batched def-id lookup, then parallel filter queries.
- **Evidence:**  
  - `getFilteredProductIds`: builds `keysWithValues`, then `getAttributeDefinitionIdsByKeys(keysWithValues.map(k => k.key))` (one call), then `Promise.all(keysWithValues.map(... productIdsForFilter(...)))` (parallel).  
  - `productIdsForFilter` uses `.limit(MAX_PRODUCT_IDS_FOR_PRICE)`.  
  - `catalogos/src/lib/publish/product-attribute-sync.ts` exports `getAttributeDefinitionIdsByKeys` (batched lookup).

---

## 9. Updated Safe Concurrent User Level

- **Catalog (browsing, price filter, price sort):** No longer limited by full-table scan. Safe to run at **50–100+** concurrent users for catalog list, assuming `product_best_offer_price` and DB hold up (indexed view/underlying indexes).
- **Quote submission:** Unchanged; duplicate/orphan risk at any level; no rate limit (spam/DoS risk).
- **Feed upload/commit:** Unchanged; non-atomic commit; 10 MB limit in place. **&lt; 5** concurrent commits recommended.
- **Overall:** For **catalog-heavy** traffic (browse, search, product view), **50–100** concurrent users is a reasonable initial load. For **quote-heavy** or **feed-heavy** traffic, limits and risks from prior audit still apply.

---

## Remaining Launch Blockers

| ID | Issue | Location |
|----|--------|----------|
| **LB-1** | Feed commit not atomic; partial failure leaves inconsistent state | `storefront/src/lib/supplier-portal/feedUpload.ts` `executeCommitTransaction` |
| **LB-2** | Quote submission has no idempotency; duplicate submissions create duplicate quotes | `catalogos/src/lib/quotes/service.ts` `createQuoteRequest`; `catalogos/src/app/actions/quotes.ts` |
| **LB-3** | Quote + line items not in single transaction; orphan quote on line insert failure | `catalogos/src/lib/quotes/service.ts` `createQuoteRequest` |
| **LB-4** | No rate limiting on catalogos quote submission | Catalogos quote action |

---

## High-Risk Issues

| ID | Issue | Location |
|----|--------|----------|
| **HR-1** | Feed commit catch logs "rollback_successful: true" but no rollback is performed | `storefront/src/lib/supplier-portal/feedUpload.ts` catch block ~1401–1407 |
| **HR-2** | Oversized file read into memory before validation; no early rejection by `file.size` | `storefront/src/app/supplier-portal/api/feed-upload/route.ts` POST handler |

---

## Medium Issues

| ID | Issue | Location |
|----|--------|----------|
| **MR-1** | Relying on `product_best_offer_price` view; ensure view and underlying indexes exist in all environments | Migration 20260403000001; deployment checklist |

---

## Exact Files / Routes / Queries Still Weak

| Priority | File / route | Required change |
|----------|--------------|------------------|
| **P0** | `storefront/src/lib/supplier-portal/feedUpload.ts` | Make feed commit atomic (single DB transaction or RPC that does all updates/inserts/status in one transaction). Remove or correct "rollback_successful" log. |
| **P0** | `catalogos/src/lib/quotes/service.ts` | Add idempotency key support; wrap quote insert + line inserts in single transaction (e.g. Postgres function or Supabase RPC). |
| **P0** | `catalogos/src/app/actions/quotes.ts` | Accept idempotency key; pass to service; add rate limiting (per IP or per email). |
| **P1** | `storefront/src/app/supplier-portal/api/feed-upload/route.ts` | Before reading content, check `file.size`; if &gt; 10 MB (or UPLOAD_CONFIG.max_file_size_bytes), return 413/400 immediately. |

---

## Updated Verdict

# CONDITIONAL GO

**Reason:** Major P0 catalog and filter issues are **fixed**: catalog uses `product_best_offer_price` (no full-table scan), categories/brands are bounded, and the filter path uses batched + parallel queries (no N+1). The platform can sustain **catalog-heavy** initial load (50–100 users) for browse/product discovery.

**Conditions:**

1. **Catalog-only or catalog-heavy launch:** Acceptable for initial load with the understanding that quote and feed flows remain non-hardened (no idempotency, no transaction, no quote rate limit, non-atomic feed commit, oversized upload read before reject).
2. **Quote/feed hardening still required** before promoting quote or supplier upload as primary flows at scale: implement quote idempotency + transaction, quote rate limiting, feed commit atomicity, and file-size check before read.
3. **Deploy and run** migration `20260403000001_catalog_product_best_price_view.sql` (and any dependencies) in all environments so catalog fixes are active.

---

## Updated Safe Concurrency Estimate

| Scenario | Safe concurrent users |
|----------|------------------------|
| **Catalog (browse, price filter, price sort)** | **50–100+** (view-based; no full scan) |
| **Mixed traffic (catalog-heavy)** | **50–100** for initial load |
| **Quote submission** | No change; duplicate/orphan and rate-limit risk; keep volume moderate until hardened |
| **Supplier feed upload/commit** | **&lt; 5** concurrent; 10 MB limit; commit still non-atomic |
| **Overall for initial launch (catalog-first)** | **50–100** concurrent users |

**Summary:** Catalog path is ready for initial load. Quote and feed paths remain **not ready** for scaled use until the remaining launch blockers and high-risk items above are addressed.
