# GLOVECUBS Launch Re-Audit Report

**Re-Audit Date:** 2026-03-02  
**Focus Areas:** 5 critical user flows  
**Prior Fixes Applied:** Security hardening, RLS policies, ownership verification

---

## Executive Summary

| Flow | Status | Blockers |
|------|--------|----------|
| 1. Buyer Search | **BROKEN** | No search UI, no backend |
| 2. Buyer Comparison | **BROKEN** | No supplier names, no trust scores |
| 3. Quote Flow | **PARTIAL** | Works but no customer visibility |
| 4. Supplier Upload | **WORKING** | XLSX, preview, correction, commit all functional |
| 5. Admin Ingestion | **WORKING** | Full review UI with warnings visible |

**Verdict: CONDITIONAL GO**

---

## Flow 1: Buyer Search

### Test Results

| Feature | Status | Evidence |
|---------|--------|----------|
| Search input in header | **NO** | `layout.tsx:16-33` - no search component |
| Search query processing | **NO** | `query.ts` - `params.q` parsed but never used |
| Relevance sort | **NO** | Not in UI dropdown, no backend implementation |
| Product page navigation | YES | Links work correctly |

### Remaining Blockers

| ID | Issue | File | Line |
|----|-------|------|------|
| **BLK-1** | No search input component exists | `catalogos/src/app/(storefront)/layout.tsx` | 16-33 |
| **BLK-2** | `q` parameter parsed but never queried | `catalogos/src/lib/catalog/query.ts` | entire file |

### High-Risk Issues

| ID | Issue | File | Line |
|----|-------|------|------|
| HR-1 | "relevance" in backend SORT_OPTIONS but not implemented | `catalogos/src/lib/catalog/query.ts` | 12, 195 |

---

## Flow 2: Buyer Comparison

### Test Results

| Feature | Status | Evidence |
|---------|--------|----------|
| Supplier names in offers API | **NO** | Only `supplier_id` returned |
| Trust scores visible | **NO** | Field doesn't exist in schema |
| Trust-adjusted best price | **NO** | Uses simple `Math.min()` |

### Remaining Blockers

| ID | Issue | File | Line |
|----|-------|------|------|
| **BLK-3** | Offers API doesn't join supplier names | `catalogos/src/app/api/catalog/product/[slug]/offers/route.ts` | 21-31 |
| **BLK-4** | No trust_score field in supplier_offers table | Schema gap | - |

### High-Risk Issues

| ID | Issue | File | Line |
|----|-------|------|------|
| HR-2 | UI shows "Supplier SKU" column but no supplier name | `catalogos/src/app/(storefront)/product/[slug]/page.tsx` | 156-159 |
| HR-3 | No trust-weighted best price calculation | `catalogos/src/lib/catalog/query.ts` | 274-276 |

---

## Flow 3: Quote Flow

### Test Results

| Feature | Status | Evidence |
|---------|--------|----------|
| Create quote (basket submission) | **YES** | Full implementation via `createQuoteRequestAction` |
| Quote status visibility | **NO** | No customer lookup page exists |
| Quote state transitions | **PARTIAL** | Missing `won`, `lost`, `expired` states |
| Customer dashboard | **NO** | Only internal `/dashboard/quotes` for staff |

### Available Quote States

```typescript
["new", "reviewing", "contacted", "quoted", "closed"]
```

### Missing States

- `won` - cannot track conversions
- `lost` - cannot track lost opportunities  
- `expired` - no auto-expiration workflow

### Medium-Risk Issues

| ID | Issue | File | Line |
|----|-------|------|------|
| MR-1 | Missing `won/lost/expired` states | `catalogos/src/lib/quotes/types.ts` | 5 |
| MR-2 | No customer quote tracking page | No file exists | - |
| MR-3 | Confirmation page shows reference only | `confirmation/page.tsx` | 26-30 |

---

## Flow 4: Supplier Upload

### Test Results

| Feature | Status | Evidence |
|---------|--------|----------|
| XLSX upload | **YES** | `import * as XLSX from 'xlsx'` + full `parseXLSXWithValidation()` |
| Preview | **YES** | Rows stored, UI with filters |
| Correction | **YES** | `correctRow()` with ownership verification |
| Commit | **YES** | `commitFeedUpload()` with ownership verification |

### Verification

All supplier upload security fixes are confirmed:
- ✅ `verifyUploadOwnership()` called in `correctRow()`
- ✅ `verifyUploadOwnership()` called in `commitFeedUpload()`
- ✅ `verifyUploadOwnership()` called in `getUploadRows()`
- ✅ `verifyUploadOwnership()` called in `getUploadStatus()`

**Status: FULLY FUNCTIONAL**

---

## Flow 5: Admin Ingestion

### Test Results

| Feature | Status | Evidence |
|---------|--------|----------|
| Review uploaded rows | **YES** | Full UI at `/dashboard/review` |
| Inspect warnings/errors | **YES** | Anomaly flags with severity coloring |
| Auditability | **PARTIAL** | Major decisions logged; quick edits NOT audited |

### Admin Features Available

- Filter by: supplier, batch, category, status, unmatched, anomalies, missing attributes, confidence
- Actions: Approve, Reject, Create new master, Merge
- Anomaly display with severity (error=red, warning=amber)

### Medium-Risk Issues

| ID | Issue | File | Line |
|----|-------|------|------|
| MR-4 | Quick actions not audited | `catalogos/src/app/actions/review.ts` | 197-263 |
| MR-5 | `decided_by` hardcoded to "admin" | `catalogos/src/app/actions/review.ts` | 44, 72, 111, 145 |

---

## Summary by Severity

### Launch Blockers (4)

| ID | Issue | Impact |
|----|-------|--------|
| BLK-1 | No search UI exists | Users cannot search for products |
| BLK-2 | Search query not implemented | Even if UI added, backend won't work |
| BLK-3 | No supplier names in offers | Users can't identify suppliers |
| BLK-4 | No trust scores in schema | Cannot show supplier reliability |

### High-Risk Issues (3)

| ID | Issue | Impact |
|----|-------|--------|
| HR-1 | Relevance sort broken | Sort dropdown misleading |
| HR-2 | Supplier name column missing | Table shows SKU only |
| HR-3 | No trust-weighted pricing | Best price may be from unreliable supplier |

### Medium-Risk Issues (5)

| ID | Issue | Impact |
|----|-------|--------|
| MR-1 | Missing quote states | Cannot track win/loss rates |
| MR-2 | No customer quote tracking | Customers can't check status |
| MR-3 | Confirmation shows reference only | Poor UX |
| MR-4 | Quick edits not audited | Compliance gap |
| MR-5 | Hardcoded decided_by | Can't track who made decisions |

---

## Files Requiring Fixes

### Blockers (Must Fix)

| File | Required Change |
|------|-----------------|
| `catalogos/src/app/(storefront)/layout.tsx` | Add search input component |
| `catalogos/src/lib/catalog/query.ts` | Implement text search with `ilike` or `to_tsvector` |
| `catalogos/src/app/api/catalog/product/[slug]/offers/route.ts` | Join suppliers table for name |
| `catalogos/src/lib/db/types.ts` | Add trust_score to supplier schema |

### High Priority

| File | Required Change |
|------|-----------------|
| `catalogos/src/app/(storefront)/product/[slug]/page.tsx` | Add Supplier Name column |
| `catalogos/src/lib/catalog/query.ts` | Implement trust-adjusted best price |

### Medium Priority

| File | Required Change |
|------|-----------------|
| `catalogos/src/lib/quotes/types.ts` | Add `won`, `lost`, `expired` states |
| `catalogos/src/app/actions/review.ts` | Add audit logging for quick actions |

---

## Final Recommendation

# CONDITIONAL GO

**Conditions for Launch:**

1. **MUST** add supplier names to offers API (BLK-3) - ~30 min fix
2. **MUST** add search UI + backend (BLK-1, BLK-2) - ~2-4 hours
3. **SHOULD** hide "relevance" sort from UI until implemented

**Can Launch Without:**

- Trust scores (can add post-launch as enhancement)
- Quote state expansion (analytics, not user-facing)
- Customer quote tracking (can use email/phone for now)
- Quick edit auditing (compliance, not functional)

---

## Quick Fix Estimates

| Issue | Complexity | Time |
|-------|------------|------|
| Add supplier name to offers API | Low | 30 min |
| Add search UI component | Medium | 1-2 hours |
| Implement search query | Medium | 1-2 hours |
| Remove relevance from UI dropdown | Trivial | 5 min |
| **Total for launch readiness** | | **~3-4 hours** |
