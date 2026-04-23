# Focused Buyer Account & Quote Workflow Audit Report

**Generated:** 2026-03-02  
**Scope:** Buyer login, quote workflow, product comparison, search, notifications

---

## Executive Summary

The GLOVECUBS buyer experience is split between two disconnected storefronts:

| Feature | Catalogos (Next.js) | Express Portal |
|---------|---------------------|----------------|
| Login/Signup | **NONE** | ✓ Full auth |
| Account Dashboard | **NONE** | ✓ Dashboard, orders, quotes |
| Quote Submission | ✓ Works | ✓ Works |
| Quote Tracking | **NONE** | ✓ My Quotes page |
| Search | **NONE** | ✓ Working |
| Supplier Names | **NONE** | Partial |

**Critical Gap:** Buyers who submit quotes via Catalogos have NO way to track their quote status.

---

## Launch Blockers (3)

### LB-1: No Quote Tracking in Catalogos Storefront
**Severity:** CRITICAL  
**Impact:** Buyers cannot see their quote status after submission

- Confirmation page shows reference number but provides no way to use it
- No `/account`, `/my-quotes`, or `/quote/lookup` routes exist
- Buyer must log into separate Express portal (if they even know it exists)
- Complete break in buyer journey

**Files:**
- Missing: `catalogos/src/app/(storefront)/account/*`
- Missing: `catalogos/src/app/(storefront)/quote/status/page.tsx`

### LB-2: No Search Functionality in Catalogos
**Severity:** CRITICAL  
**Impact:** Buyers cannot find products by name/SKU

- No search input in header (`catalogos/src/app/(storefront)/layout.tsx`)
- `q` parameter parsed but never used in `listLiveProducts()`
- Buyers can only browse by category/facets

**Files:**
- `catalogos/src/app/(storefront)/layout.tsx` - no search UI
- `catalogos/src/lib/catalog/query.ts` - `q` parameter ignored

### LB-3: Notifications Not Implemented
**Severity:** CRITICAL  
**Impact:** Buyers receive no confirmation or status updates

All notification functions are empty stubs:
```typescript
// catalogos/src/lib/quotes/notifications.ts
export async function sendBuyerConfirmation(_payload) {
  // TODO: Send confirmation email to buyer
}
```

- No confirmation email after quote submission
- No notification when quote status changes to `quoted`, `won`, `lost`, `expired`
- Notifications queue to database but no worker processes them

---

## High-Risk Issues (4)

### HR-1: Supplier Names Not Visible to Buyers
**Severity:** HIGH  
**Impact:** Buyers cannot see who they're buying from

The offers API returns `supplier_id` but NOT supplier names:
```typescript
// catalogos/src/app/api/catalog/product/[slug]/offers/route.ts
const offers = rows.map(r => ({
  supplier_id: r.supplier_id,  // UUID shown
  supplier_sku: r.supplier_sku,
  cost: r.cost,
  // supplier_name: MISSING
}));
```

Product page shows "Supplier SKU" column but no supplier identity.

**Fix:** Join `suppliers` table and return `supplier_name` in offers response.

### HR-2: No Trust/Recommendation Context for Buyers
**Severity:** HIGH  
**Impact:** Buyers see no reason to trust recommendations

- No trust badges or reliability scores shown
- No "Best Price" or "Recommended" indicators
- No supplier verification status
- All procurement intelligence hidden from buyers

### HR-3: Relevance Sort Not Functional
**Severity:** HIGH  
**Impact:** "Relevance" sort option produces incorrect results

- `relevance` defined in `SORT_OPTIONS` constant but NOT implemented
- Falls through to `newest` ordering
- UI deliberately excludes it: `["newest", "price_asc", "price_desc"]`

**File:** `catalogos/src/lib/catalog/query.ts` lines 12, 115-195

### HR-4: Catalogos Has No Login/Account System
**Severity:** HIGH  
**Impact:** No buyer accounts in primary storefront

- No signup/login forms
- No session management
- No protected routes
- All buyer account features only exist in Express portal

---

## Medium Issues (5)

### MED-1: Quote Status Labels Use Raw Values
**Status labels shown to buyers:** `new`, `reviewing`, `contacted`, `quoted`, `won`, `lost`, `expired`, `closed`

These should be mapped to buyer-friendly text:
- `reviewing` → "We're reviewing your request"
- `quoted` → "Quote ready for review"
- `won` → "Order confirmed"

**File:** `public/js/app.js` line 5534

### MED-2: Missing CSS for Quote Statuses
Portal only styles order statuses (pending, processing, shipped, delivered).
Quote statuses (`won`, `lost`, `expired`, `quoted`) render unstyled.

**File:** `public/css/styles.css`

### MED-3: No Active vs Terminal Quote Distinction
Admin dashboard defines terminal states:
```typescript
const isTerminal = ["won", "lost", "expired", "closed"].includes(currentStatus);
```

But buyer-facing views don't replicate this visual distinction.

### MED-4: Dead-End Reference Number
Confirmation page says "Save this reference for your records" but provides no mechanism to use it for status lookup.

### MED-5: Quote Confirmation Has No Next Steps
Confirmation page only offers "Continue browsing" or "Start new quote" - no "Check quote status" option because it doesn't exist.

---

## Exact Routes/Components Needing Fixes

### Missing Routes (Must Create)
| Route | Purpose |
|-------|---------|
| `/account` | Buyer account landing |
| `/account/quotes` | Quote history list |
| `/quote/lookup` | Anonymous lookup by ref# + email |
| `/account/login` | Login form for catalogos |

### Components Needing Modification
| File | Issue |
|------|-------|
| `catalogos/src/app/(storefront)/layout.tsx` | Add search input and login link |
| `catalogos/src/app/api/catalog/product/[slug]/offers/route.ts` | Return supplier names |
| `catalogos/src/lib/catalog/query.ts` | Implement `q` parameter search |
| `catalogos/src/lib/quotes/notifications.ts` | Implement email delivery |
| `public/css/styles.css` | Add quote status CSS classes |
| `public/js/app.js` | Add buyer-friendly status labels |

### Database Queries Needing Updates
```sql
-- offers/route.ts should join suppliers
SELECT so.*, s.name AS supplier_name
FROM catalogos.supplier_offers so
JOIN catalogos.suppliers s ON s.id = so.supplier_id
WHERE so.product_id = $1;
```

---

## Notification Delivery Gap Analysis

### Current State
1. Quote submitted → Reference number shown
2. Status changes → Queued to `quote_notifications` table
3. **No worker processes the queue**
4. Buyer receives nothing

### Buyer Fallback Without Email
**Current:** NONE

Buyers who submit via Catalogos must:
1. Remember reference number
2. Somehow discover the Express portal exists
3. Create separate account in Express portal
4. Check "My Quotes" there

This is not a viable workflow.

### Recommended Fallback (Pre-Email)
1. Add `/quote/status?ref=XXX&email=YYY` lookup page
2. Validate email matches quote
3. Show current status to buyer
4. Link from confirmation page

---

## Final Verdict

### A. Can GLOVECUBS Handle Buyer Quote Workflow?

**NOT READY**

The Catalogos storefront breaks the buyer journey immediately after quote submission. Buyers have no way to:
- Track their quote
- See supplier identity
- Search for products
- Receive any communication

### B. What Must Be Fixed?

**Before Launch:**
1. Add quote lookup/status page to Catalogos (or redirect to portal)
2. Add search input with working `q` parameter
3. Return supplier names in offers API
4. Implement at least buyer confirmation email OR status lookup

**For Production Quality:**
1. Unify auth between storefronts
2. Implement full notification system
3. Add trust/recommendation badges
4. Map status labels to buyer-friendly text

---

## Verdict: **NOT READY**

The buyer quote workflow is fundamentally broken. Buyers who submit quotes via the primary storefront have no visibility into their quote status and no path to check it.

**Minimum viable fix:** Add a `/quote/status` lookup page that accepts reference number + email and shows current status. This can be implemented without full auth.

---

## Quick Fix Checklist

- [ ] Create `catalogos/src/app/(storefront)/quote/status/page.tsx`
- [ ] Add API endpoint to lookup quote by ref + email
- [ ] Update confirmation page to link to status lookup
- [ ] Add search input to storefront header
- [ ] Implement `q` parameter in `listLiveProducts()`
- [ ] Add `supplier_name` to offers API response
- [ ] Add quote status CSS classes to portal
