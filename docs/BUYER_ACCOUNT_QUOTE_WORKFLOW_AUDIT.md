# GLOVECUBS — Buyer Account & Quote Workflow Audit

**Audit Date:** 2026-03-02  
**Scope:** Buyer login/account access, quote workflow, product comparison, search/relevance, notifications and follow-up visibility.

---

## 1. Buyer Login and Account Access

### 1.1 Catalogos (storefront buyer: catalog, quotes, my-quotes)

| Flow | Finding |
|------|--------|
| **Signup** | Not implemented. No buyer registration in catalogos. |
| **Login** | Not implemented. My Quotes expects a `user_email` cookie to show quote history; **this cookie is never set anywhere in the codebase**. The "Sign In" button on My Quotes links to `/login`, but catalogos has no `/login` route. |
| **Logout** | N/A (no login). |
| **Protected route access** | My Quotes is not protected: the page renders for everyone. If `user_email` is missing, it shows "Sign In Required" and links to `/login` (broken). If present (e.g. set by some external flow), it shows quotes by email. |
| **Session persistence** | Session is implied by `user_email` cookie only. No Supabase (or other) auth for catalogos storefront buyers. |
| **Account dashboard access** | My Quotes serves as the "account" view for quotes. It is only useful when `user_email` is set; there is no way in-app to set it. |

**Conclusion:** Buyer login/signup for the catalogos flow (catalog + quotes + my-quotes) is **missing**. My Quotes and the quote-updates banner are effectively unusable for normal users because there is no way to "sign in" and set `user_email`.

### 1.2 Storefront app (/buyer/dashboard — Procurement Intelligence)

| Flow | Finding |
|------|--------|
| **Signup** | Not present in storefront app. |
| **Login** | No buyer login page in storefront. Only login is `storefront/src/app/supplier-portal/login/page.tsx` (suppliers). Buyer dashboard API uses **Supabase Auth** (`getUser()` + `user_profiles.buyer_id`). There is no dedicated buyer login UI or route in this app. |
| **Protected route access** | `/buyer/*` is **not** in the middleware matcher. Middleware only protects `/admin/*` and `/api/internal/*`. So `/buyer/dashboard` loads for everyone. Protection is only at API level: `GET /buyer/api/dashboard` returns **401 Unauthorized** when there is no Supabase user. |
| **Session persistence** | Supabase session (cookies) when available. |
| **Account dashboard access** | When unauthenticated, the dashboard page loads, calls the API, receives 401, and never sets `summary` (etc.). The UI renders with null data: loading spinner then mostly empty tabs ("No market intelligence data", etc.). **No redirect to login**; the user is left on an empty dashboard with no explanation or sign-in prompt. |

**Conclusion:** Buyer dashboard (storefront) assumes an existing Supabase session but does not provide a way to log in and does not redirect or show a clear "Sign in required" when the API returns 401.

---

## 2. Buyer Quote Workflow

### 2.1 Create quote request

- **Location:** Catalogos: `/quote` → `QuotePageClient` → `submitQuoteRequestAction` → `createQuoteRequest`.
- **Flow:** User adds items from catalog to quote basket, fills company/contact/email/phone, submits. Server creates `quote_requests` row and `quote_line_items`; returns `reference_number` (e.g. RFQ-xxxx).
- **Confirmation:** Redirect to `/quote/confirmation?ref=...` with reference number and "Track Quote Status" CTA.
- **Assessment:** Create flow is implemented and usable. No idempotency key (double submit creates two quotes; see load audit).

### 2.2 Quote appears in buyer account/dashboard

- **With session (catalogos):** My Quotes lists quotes via `getQuotesByEmail(userEmail)`. **But** `user_email` is never set, so in practice no one has "session" and the list is never shown.
- **Without session:** Buyer can only use "Check Quote Status" (`/quote/status`) and enter reference number manually. So **quote does appear** in the only working path: reference-based status page. It does **not** appear in "My Quotes" for typical users because they cannot sign in.

### 2.3 Quote status visible to buyer

- **By reference:** `/quote/status/[ref]` uses `getQuoteByReference(ref)`. Status is shown in header and in "Status Details" card with timeline. **Works.**
- **Status labels:** `QuoteStatusBadge` and `getStatusDescription` provide clear, human-readable labels and short descriptions:

| Status   | Label        | Description (summary) |
|----------|--------------|-------------------------|
| new      | Submitted    | Received, awaiting review |
| reviewing| Under Review | Team preparing quote |
| contacted| In Discussion| We've reached out |
| quoted   | Quote Sent   | Quote prepared and sent |
| won      | Accepted     | Order being processed |
| lost     | Declined     | Quote not accepted |
| expired  | Expired      | Submit new request if interested |
| closed   | Closed       | Request closed |

- **Assessment:** Status is visible and labels are understandable.

### 2.4 Won / lost / expired states display correctly

- **Won:** Badge "Accepted", green; timeline and "What's Next?" mention order processing.
- **Lost:** Badge "Declined", red; if `lost_reason` is set, it is shown in a red box; next action suggests "Request New Quote."
- **Expired:** Badge "Expired", orange; expiration date shown with "(expired)" when past; next action suggests new request.
- **Assessment:** Won/lost/expired are represented correctly in UI and copy.

### 2.5 Active vs terminal quotes

- **My Quotes:** Active = `["new", "reviewing", "contacted", "quoted"]`, Completed = `["won", "lost", "expired", "closed"]`. Sections "Active Quotes" and "Past Quotes" with badges. **Clear.**
- **Status page:** Single quote; badge and timeline make state obvious.
- **Assessment:** Active vs terminal is distinguishable.

---

## 3. Buyer Product Comparison

### 3.1 Catalogos product page (`/product/[slug]`)

- **Supplier names:** **Not visible.** `getOffersSummaryByProductId` returns `supplier_id`, `supplier_sku`, `cost`, `sell_price`, `lead_time_days`. The product page table shows **Supplier SKU**, **Price**, **Lead time** only. No join to suppliers table to show supplier name; no "trusted" or "best price" labeling.
- **Best price:** Shown as "From $X.XX" and "N supplier offer(s) available" — single best price only, no "trusted" qualifier.
- **Recommendation/trust context:** None. No trust band, no recommendation badge.
- **Assessment:** Catalogos product page does **not** meet "supplier names visible" or "trusted best price / recommendation context visible."

### 3.2 Storefront Procurement Intelligence (`/buyer/dashboard`)

- **Supplier names:** Visible in Market Intelligence (price distribution, trusted best supplier name) and in Supplier Comparison table.
- **Trusted best price:** Shown (e.g. "Trusted Best" with price and supplier name).
- **Recommendation/trust context:** Trust bands (e.g. high_trust, medium_trust), recommendation rank, "Compare Suppliers" and "AI Recommendation Explanation" with reasoning.
- **Assessment:** This dashboard **does** meet comparison and trust visibility, but it is a separate app and requires Supabase auth; there is no buyer login in storefront and no redirect on 401.

---

## 4. Search and Relevance

### 4.1 Catalog (catalogos)

- **Search parameter:** `q` is accepted in `parseCatalogSearchParams` and passed to `listLiveProducts` as `params.q`.
- **Query behavior:** In `listLiveProducts` (catalogos `query.ts`), **`params.q` is never used**. No text filter on name, description, or SKU. So a URL like `?q=nitrile` does **not** restrict results; listing is effectively by category/filters only.
- **Assessment:** **Search does not return results** by keyword. Users who use a search box or URL with `q=` will not see keyword-based results (potential dead or confusing search state).

### 4.2 Sort options

- **Catalog page:** Only `["newest", "price_asc", "price_desc"]` are passed as `sortOptions`. No "relevance" in the UI.
- **Back-end:** `listLiveProducts` supports `relevance` in `SORT_OPTIONS` but there is no implementation that uses `q` for relevance (no text search). So even if "relevance" were exposed, it could not change ordering by query text.
- **Assessment:** **Relevance sort is not implemented** and is not exposed. Newest and price sort work for the current listing.

### 4.3 Dead search states

- If any UI or link sends `?q=...` without other filters, the user sees the same category list as without `q` (no error, but no visible effect). That is a **weak/dead search state**: no error, but search appears to do nothing.

---

## 5. Notifications and Follow-up Visibility

### 5.1 Quote notifications in portal

- **Mechanism:** `getBuyerNotifications(email)` reads from `quote_notifications` (status = pending, recipient = email) and joins to `quote_requests` for reference number.
- **My Quotes:** When `user_email` is set, a banner shows "You have quote updates" with up to 5 links to `/quote/status/[ref]`. So **if** the buyer has a session (user_email), they have a **reliable in-portal way** to see quote updates even when email is not delivered.
- **Problem:** Because **no login sets `user_email`**, almost no one will see this banner. The only reliable path today is **reference-based**: user saves reference from confirmation and uses "Check Quote Status" or visits `/quote/status/[ref]` directly.

### 5.2 Customer confusion from missing delivery

- **If email delivery fails or is not implemented:** Buyers who did not save their reference number have **no way** to see quote updates in the portal, because My Quotes is inaccessible without `user_email` and there is no way to sign in to set it.
- **Confirmation page** does not set `user_email` after submit. So even right after submitting, the user is not "logged in" for My Quotes.
- **Confusion:** "Sign In" on My Quotes leads to `/login`, which does not exist in catalogos; users may think the product is broken. No in-app path to "see all my quotes" or "see my updates" without a working login that sets `user_email`.

---

## Summary: Launch Blockers

| ID | Issue | Location / fix |
|----|--------|------------------|
| **LB-1** | No buyer login/signup for catalogos; `user_email` is never set, so My Quotes and quote-updates banner are unusable. | Catalogos: add buyer auth (e.g. magic link or password) and set `user_email` (or equivalent) on login; or replace with Supabase Auth and query quotes by authenticated user. |
| **LB-2** | My Quotes "Sign In" links to `/login` which does not exist in catalogos. | Add catalogos `/login` (or equivalent) or change link to the app that actually hosts buyer login. |
| **LB-3** | Catalogos product page does not show supplier names or trusted best price / recommendation context. | catalogos `product/[slug]/page.tsx` and `getOffersSummaryByProductId` (or API): join suppliers table for name; add "trusted best" and/or recommendation/trust where available. |
| **LB-4** | Keyword search (`q`) is accepted but never applied; search does not return results by query. | catalogos `listLiveProducts`: filter by `q` (e.g. name/description/SKU ilike or full-text) or clearly remove/deprecate `q` and document. |
| **LB-5** | Storefront buyer dashboard has no login and no redirect on 401; unauthenticated users see an empty dashboard. | Storefront: add buyer login (or reuse Supabase Auth UI) and protect `/buyer` (middleware or page-level redirect to login on 401). |

---

## High-Risk Issues

| ID | Issue | Location |
|----|--------|----------|
| **HR-1** | After submitting a quote, user is not "logged in" to My Quotes; confirmation does not set session/cookie. | Quote confirmation flow; optional: set session or cookie after submit so My Quotes works for that email until they leave. |
| **HR-2** | Buyer dashboard (storefront) does not handle 401: no "Sign in required" message or redirect. | `storefront/src/app/buyer/dashboard/page.tsx`: check for 401 on API responses and redirect to login or show sign-in CTA. |
| **HR-3** | Relevance sort is not implemented and not exposed; catalog only has newest and price sort. | catalogos: either implement relevance (e.g. when `q` is present) and add to sort options, or document that search is filter-only. |
| **HR-4** | Reference lookup validates format but status page accepts any ref and shows "Quote Not Found" for invalid refs; no rate limiting on status lookup (information disclosure / enumeration). | Optional: rate limit or cap lookups; keep messaging generic. |

---

## Medium Issues

| ID | Issue | Location |
|----|--------|----------|
| **MR-1** | Quote status page refresh button is present but has no `onClick` (refresh is only by browser reload). | `catalogos/src/app/(storefront)/quote/status/[ref]/page.tsx`: wire RefreshCw to revalidate or refetch. |
| **MR-2** | Help card on quote status page shows placeholder "1-800-XXX-XXXX"; not updated for production. | Replace with real contact or config-driven value. |
| **MR-3** | Catalog sort options in UI are "newest", "price_asc", "price_desc" only; no "relevance" even if backend supported it. | CatalogPageClient / page.tsx: add relevance when text search exists. |
| **MR-4** | Storefront buyer dashboard requires `user_profiles.buyer_id`; if missing, falls back to `user.id`. Unclear how buyer_id is populated for real users. | Document or implement onboarding so buyer_id is set. |

---

## Exact Customer Routes / Components Still Weak

| Route / component | Weakness |
|--------------------|----------|
| **Catalogos** `/login` | Missing; linked from My Quotes. |
| **Catalogos** `(storefront)/my-quotes/page.tsx` | Depends on `user_email` cookie never set; "Sign In" → broken link. |
| **Catalogos** `(storefront)/product/[slug]/page.tsx` | Supplier offers table shows only Supplier SKU, Price, Lead time; no supplier name, no trusted/recommendation context. |
| **Catalogos** `lib/catalog/query.ts` — `listLiveProducts` | Ignores `params.q`; no keyword search. |
| **Catalogos** `(storefront)/catalog/[category]/page.tsx` | Sort options omit "relevance"; no search input that uses `q`. |
| **Storefront** `/buyer/dashboard` | No auth redirect; 401 from API leaves empty dashboard. |
| **Storefront** `/buyer/api/dashboard/route.ts` | Returns 401 when no user; no corresponding login route for buyers. |
| **Catalogos** `/quote/confirmation` | Does not set session or `user_email` after submit. |

---

## Final Verdict

# NOT READY

**Reason:**

1. **Buyer account access is broken or missing:** No way to sign in for catalogos (My Quotes and quote-updates banner depend on `user_email`, which is never set). Storefront buyer dashboard requires auth but has no login and no redirect on 401.
2. **Product comparison in catalogos is incomplete:** Supplier names and trusted/recommendation context are not shown on the catalogos product page.
3. **Search does not work:** Keyword parameter `q` is accepted but not used; no keyword-based results and no relevance sort.
4. **Notifications in portal** are only visible when `user_email` is set, which cannot be set in-app today; reference-based status works, but users who lose the reference have no in-portal path to see updates.

**Minimum to reach CONDITIONAL GO:**

- Implement buyer login for catalogos (or unified auth) and set session/cookie so My Quotes and the updates banner work, and fix or remove the "Sign In" link.
- Show supplier names (and where applicable trusted best price / recommendation) on catalogos product page.
- Either implement keyword search (`q`) in catalog listing or remove/deprecate `q` and avoid implying search-by-query in UI.
- For storefront buyer dashboard: add buyer login or redirect and 401 handling so unauthenticated users are sent to sign-in or see a clear "Sign in required" instead of an empty dashboard.

After these, the buyer quote workflow (create → confirm → track by reference, status labels, won/lost/expired, active vs terminal) is in good shape; the main gaps are account access, product comparison in catalogos, and search/relevance.
