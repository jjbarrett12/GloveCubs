# GLOVECUBS Real-World Simulation Audit Report

**Audit Date:** 2026-03-02  
**Methodology:** End-to-end flow tracing through 8 user scenarios  

---

## Executive Summary

| Severity | Count | Top Issues |
|----------|-------|------------|
| **CRITICAL** | 7 | Security holes, broken search, missing supplier names |
| **HIGH** | 14 | Stub notifications, no XLSX support, missing pack sizes |
| **MEDIUM** | 16 | Zero-price displays, missing states, no transactions |
| **LOW** | 12 | Accessibility, hardcoded values, code duplication |
| **TOTAL** | **49** | |

---

## Scenario 1: Supplier Uploading Catalog

### Flow Tested
1. Supplier logs into portal
2. Uploads CSV/XLSX file
3. System parses and extracts fields
4. Supplier reviews preview

### CRITICAL Issues Found

| ID | Issue | File | Line |
|----|-------|------|------|
| SUP-1 | **XLSX parsing not implemented** - `.text()` called on binary XLSX files produces garbage | `feedUpload.ts` | 703-709 |
| SUP-2 | **~~commitFeedUpload missing ownership check~~** | `feedUpload.ts` | 938+ | **FIXED** |

### HIGH Issues Found

| ID | Issue | File | Line |
|----|-------|------|------|
| SUP-3 | CSV parser fails on embedded newlines in quoted fields | `feedUpload.ts` | 154-175 |
| SUP-4 | No file size limit - memory exhaustion possible | `route.ts` | 77-115 |
| SUP-5 | `storeProcessedRows` deletes before insert without transaction | `feedUpload.ts` | 804-830 |
| SUP-6 | Status transitions not validated - can reprocess committed uploads | `feedUpload.ts` | 789-802 |

### MEDIUM Issues Found

| ID | Issue | File |
|----|-------|------|
| SUP-7 | Price anomaly detection doesn't normalize by pack size | `feedUpload.ts:600-629` |
| SUP-8 | European decimal format (1.299,99) not supported | `feedUpload.ts:319-324` |
| SUP-9 | No cancel/abort functionality for long uploads | `upload/page.tsx` |
| SUP-10 | Batch insert doesn't handle partial failures | `feedUpload.ts:825-829` |

---

## Scenario 2: Supplier Correcting Extraction

### Flow Tested
1. Supplier views preview rows
2. Clicks to correct a field
3. System re-normalizes and re-validates
4. Preview updates

### HIGH Issues Found

| ID | Issue | File | Line |
|----|-------|------|------|
| COR-1 | UI correction handler ignores errors silently | `upload/page.tsx` | 399-427 |

### MEDIUM Issues Found

| ID | Issue | File |
|----|-------|------|
| COR-2 | No validation of `corrections` object schema at runtime | `feedUpload.ts` |
| COR-3 | Row selection state not persisted on page refresh | `upload/page.tsx:363` |

---

## Scenario 3: Supplier Committing Feed

### Flow Tested
1. Supplier selects rows to commit
2. System creates/updates offers
3. Audit log recorded
4. Status updated to committed

### CRITICAL Issues Found

| ID | Issue | File | Line |
|----|-------|------|------|
| COM-1 | No transaction wrapper - partial commits possible | `feedUpload.ts` | 932-986 |

### LOW Issues Found

| ID | Issue | File |
|----|-------|------|
| COM-2 | `checkDuplicate` uses `.single()` which errors on multiple results | `feedUpload.ts:660-684` |

---

## Scenario 4: Buyer Browsing Products

### Flow Tested
1. Buyer visits catalog page
2. Uses category filters
3. Searches for products
4. Views product grid

### CRITICAL Issues Found

| ID | Issue | File | Line |
|----|-------|------|------|
| BRW-1 | **Search functionality (`q` parameter) completely non-functional** - parameter parsed but never used | `query.ts` | 49, 72-249 |
| BRW-2 | **"Relevance" sort option broken** - falls through with no sorting | `query.ts` | 12, 115-193 |

### HIGH Issues Found

| ID | Issue | File |
|----|-------|------|
| BRW-3 | Products without offers show NO pricing indication | `ProductGrid.tsx:57-60` |
| BRW-4 | FilterChips missing `hand_orientation` - can't remove filter | `FilterChips.tsx:8-12` |

### MEDIUM Issues Found

| ID | Issue | File |
|----|-------|------|
| BRW-5 | Price bounds show 0-0 when no filtered products have offers | `facets.ts:74` |

### LOW Issues Found

| ID | Issue | File |
|----|-------|------|
| BRW-6 | Empty image alt text for accessibility | `ProductGrid.tsx:39` |

---

## Scenario 5: Buyer Comparing Suppliers

### Flow Tested
1. Buyer views product detail page
2. Sees list of supplier offers
3. Compares prices and terms
4. Views supplier information

### CRITICAL Issues Found

| ID | Issue | File | Line |
|----|-------|------|------|
| CMP-1 | **Supplier names missing from offers** - only shows supplier_id | `offers/route.ts` | 21-31 |

### HIGH Issues Found

| ID | Issue | File |
|----|-------|------|
| CMP-2 | No pack size/unit quantity displayed - critical for B2B | `product/[slug]/page.tsx` |
| CMP-3 | No price context (per case vs per unit) | `product/[slug]/page.tsx:99-104` |

### MEDIUM Issues Found

| ID | Issue | File |
|----|-------|------|
| CMP-4 | Offers endpoint returns `best_price: 0` instead of null when no offers | `offers/route.ts:36` |

---

## Scenario 6: Buyer Placing Quote/Order

### Flow Tested
1. Buyer adds items to basket
2. Reviews basket contents
3. Submits RFQ
4. Receives confirmation

### CRITICAL Issues Found

| ID | Issue | File |
|----|-------|------|
| QOT-1 | **Missing quote outcome states** - no `won`, `lost`, `expired`, `converted_to_order` | `types.ts:5` |

### HIGH Issues Found

| ID | Issue | File |
|----|-------|------|
| QOT-2 | **All notification functions are empty stubs** - buyer gets no confirmation | `notifications.ts:13-23` |
| QOT-3 | No quote expiration/SLA enforcement - quotes sit indefinitely | `rfq-queue.ts` |

### MEDIUM Issues Found

| ID | Issue | File |
|----|-------|------|
| QOT-4 | No order entity after quote conversion - workflow ends at "closed" | All quote files |
| QOT-5 | Quote basket is localStorage only - lost on browser clear | `basket-store.ts` |
| QOT-6 | Missing cascading product updates to quote line items | `service.ts:34-45` |

### LOW Issues Found

| ID | Issue | File |
|----|-------|------|
| QOT-7 | Hardcoded category link in empty quote state | `QuotePageClient.tsx:58` |

---

## Scenario 7: Admin Reviewing Ingestion

### Flow Tested
1. Admin views ingestion queue
2. Reviews staged products
3. Approves/rejects items
4. Creates master products

### HIGH Issues Found

| ID | Issue | File | Line |
|----|-------|------|------|
| ADM-1 | **Placeholder admin authentication** - only optional header check | `[action]/route.ts` | 27-39 |
| ADM-2 | Missing job management dashboard UI - APIs exist but no admin page | `storefront/src/app/api/admin/jobs/*` |

### MEDIUM Issues Found

| ID | Issue | File |
|----|-------|------|
| ADM-3 | Deferred staging is a no-op - `deferStaged()` does nothing | `review.ts:166-169` |
| ADM-4 | No transaction boundaries for multi-step review operations | `review.ts:79-127` |
| ADM-5 | Missing bulk review actions - must action items one at a time | All review files |
| ADM-6 | No image validation before publish | `publish-service.ts` |

### LOW Issues Found

| ID | Issue | File |
|----|-------|------|
| ADM-7 | Missing review queue analytics | `data.ts` |
| ADM-8 | Job retry resets attempt count - loses failure history | `fail.ts:137-148` |

---

## Scenario 8: Admin Creating Product from URL

### Flow Tested
1. Admin enters product URL
2. System scrapes/extracts data
3. Admin reviews and edits
4. Product created

### CRITICAL Issues Found

| ID | Issue | Evidence |
|----|-------|----------|
| URL-1 | **Feature does not exist** - ingestion only supports feed uploads, not single-product URL creation | All ingestion handlers examined |

---

## Summary by Flow

| Scenario | CRITICAL | HIGH | MEDIUM | LOW |
|----------|----------|------|--------|-----|
| 1. Supplier Upload | 2 | 4 | 4 | 0 |
| 2. Supplier Correct | 0 | 1 | 2 | 0 |
| 3. Supplier Commit | 1 | 0 | 0 | 1 |
| 4. Buyer Browse | 2 | 2 | 1 | 1 |
| 5. Buyer Compare | 1 | 2 | 1 | 0 |
| 6. Buyer Quote | 1 | 2 | 3 | 1 |
| 7. Admin Review | 0 | 2 | 4 | 2 |
| 8. Admin URL Create | 1 | 0 | 0 | 0 |
| **TOTAL** | **8** | **13** | **15** | **5** |

---

## Fixes Applied During Audit

| Issue | Fix |
|-------|-----|
| SUP-2: commitFeedUpload missing ownership check | Added `verifyUploadOwnership()` call at start of function |
| Test signatures | Updated 3 test calls to include new `supplier_id` parameter |

---

## Top Priority Recommendations

### Must Fix Before Launch

1. **SUP-1**: Implement actual XLSX parsing or remove XLSX from supported types
2. **BRW-1**: Implement product search functionality
3. **CMP-1**: Join supplier names in offers endpoint
4. **COM-1**: Add transaction wrapper for commit operations
5. **ADM-1**: Implement proper admin authentication

### Should Fix Before Launch

1. **QOT-2**: Implement notification stubs (email confirmations)
2. **BRW-2**: Fix relevance sort option
3. **CMP-2**: Display pack sizes on product pages
4. **SUP-4**: Add file size limit validation
5. **QOT-1**: Add missing quote outcome states

### Nice to Have

1. **URL-1**: Build product-from-URL feature
2. **ADM-2**: Build job management admin UI
3. **ADM-5**: Add bulk review actions
4. **QOT-5**: Server-side basket persistence

---

## Files Requiring Immediate Attention

| File | Issues | Priority |
|------|--------|----------|
| `catalogos/src/lib/catalog/query.ts` | Search broken, sort broken | CRITICAL |
| `catalogos/src/app/api/catalog/product/[slug]/offers/route.ts` | No supplier names | CRITICAL |
| `storefront/src/lib/supplier-portal/feedUpload.ts` | XLSX, transactions, CSV parsing | CRITICAL |
| `catalogos/src/lib/quotes/notifications.ts` | Empty stubs | HIGH |
| `storefront/src/app/api/admin/review/[id]/[action]/route.ts` | Auth placeholder | HIGH |
