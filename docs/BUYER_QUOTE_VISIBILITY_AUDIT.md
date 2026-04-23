# GLOVECUBS — Buyer-Facing Quote Visibility Flow (Production Audit)

**Audit Date:** 2026-03-02  
**Scope:** Quote status visibility, buyer notifications visibility, refresh/update reliability, invalid reference handling.

---

## 1. Buyer Quote Status Visibility

### 1.1 My Quotes loads correctly

| Check | Result | Notes |
|-------|--------|--------|
| **Load when `user_email` present** | ✅ | `QuoteListContent` calls `getQuotesByEmail(email)` and `getBuyerNotifications(email)` in parallel; renders Active Quotes and Past Quotes with badges and links to `/quote/status/[ref]`. |
| **Load when `user_email` absent** | ✅ | Page shows "Sign In Required" and links to `/quote/status` (lookup) and `/login`; no server error. |
| **Error handling** | ✅ | Single try/catch around both `getQuotesByEmail` and `getBuyerNotifications`; on throw, shows "Unable to Load Quotes" with message. |
| **Empty state** | ✅ | When quotes.length === 0, shows "No Quote Requests Yet" and CTA to request a quote. |

**Caveat:** My Quotes only shows data when the `user_email` cookie is set. There is still no in-app flow that sets this cookie (separate buyer-account audit). For this audit we assume that when the cookie is set, the page should behave correctly — and it does.

### 1.2 Quote detail by reference loads correctly

| Check | Result | Notes |
|-------|--------|--------|
| **Fetch by ref** | ✅ | `getQuoteByReference(ref)` validates format first, then queries `quote_requests` by `reference_number`, then loads `quote_line_items`. |
| **Not found** | ✅ | When quote is null (valid format but no row), "Quote Not Found" card with Try Again / New Quote Request. |
| **Error** | ✅ | On throw, "Something went wrong" with error message and retry links. |
| **Success** | ✅ | Header (ref + badge), Status Details (timeline, lost reason, What's Next), Request Details, Line Items, Help card. |

### 1.3 All statuses display correctly

| Status | Badge label | Description / timeline | Verified |
|--------|-------------|-------------------------|----------|
| new | Submitted | "Your quote request has been received..." | ✅ |
| reviewing | Under Review | "Our team is reviewing your request..." | ✅ |
| contacted | In Discussion | "We've reached out..." | ✅ |
| quoted | Quote Sent | "A quote has been prepared and sent..." | ✅ |
| won | Accepted | "Quote accepted! Your order is being processed." | ✅ |
| lost | Declined | "This quote was not accepted." + lost_reason box if set | ✅ |
| expired | Expired | "This quote has expired. Please submit a new request..." | ✅ |
| closed | Closed | "This quote request has been closed." | ✅ |

`QuoteStatusBadge` and `getStatusDescription` cover all 8 statuses from `QUOTE_STATUS`; unknown status falls back to `new` config. Timeline uses `QuoteTimeline` with history and timestamps (submitted_at, quoted_at, won_at, lost_at, expired_at, expires_at).

### 1.4 Expiration date rendering

| Check | Result | Location |
|-------|--------|----------|
| **Field shown** | ✅ | Request Details: "Expiration date" row when `quote.expires_at` is set. |
| **Format** | ✅ | `formatDate(quote.expires_at)` → e.g. "March 15, 2026" (month long, day, year). |
| **Past date** | ✅ | When `new Date(quote.expires_at) < new Date()`, appends <span class="text-orange-600">(expired)</span>. |
| **Next action** | ✅ | `getNextAction(quote.status, quote.expires_at)` for "quoted" checks expired and returns "Request New Quote" CTA when past. |

No confusion between `expires_at` (expiration date) and `expired_at` (timestamp when marked expired); both are used correctly (timeline and next-action use the right one).

### 1.5 Next-action CTA logic

| Status | Expected behavior | Result |
|--------|-------------------|--------|
| new, reviewing, contacted | Message only, no CTA | ✅ |
| quoted (not expired) | Message only | ✅ |
| quoted (expired) | "Request New Quote" → /quote | ✅ |
| won | Message only | ✅ |
| lost | "Request New Quote" → /quote | ✅ |
| expired | "Request New Quote" → /quote | ✅ |
| closed | "Start New Request" → /quote | ✅ |
| default | Message only | ✅ |

`nextAction.ts` implements this; status page renders `nextAction.action` with Link + Button when present.

---

## 2. Buyer Notifications Visibility

### 2.1 getBuyerNotifications under real RLS constraints

| Check | Result | Notes |
|-------|--------|--------|
| **Client used** | ✅ | `getSupabaseCatalogos(true)` → service role when `SUPABASE_SERVICE_ROLE_KEY` is set. Service role bypasses RLS, so the query is not blocked by RLS. |
| **Filtering** | ✅ | Query: `.eq("recipient", normalizedEmail).eq("status", "pending")`; join `quote_requests!inner`; then in JS: `.filter(n => n.recipient === normalizedEmail && n.quote_requests?.email?.toLowerCase?.() === normalizedEmail)`. Double check ensures only notifications for that email. |
| **If anon key used** | N/A today | If catalogos ever used anon key for this call, RLS `buyer_select_own_notifications` (TO authenticated, USING recipient = auth.jwt() ->> 'email') would apply. Catalogos My Quotes does not use Supabase Auth JWT; it uses cookie `user_email`. So with anon key and no JWT, the policy would return no rows (coalesce('') = ''), not leak. |

**Conclusion:** Under current server-side service-role usage, RLS does not block the query. Application-level filtering by recipient and quote_requests.email prevents cross-buyer leakage. If the table or query failed (e.g. missing table), the function returns `[]` and logs; no throw unless Supabase client throws.

### 2.2 Pending notifications appear in My Quotes

| Check | Result | Notes |
|-------|--------|--------|
| **Banner** | ✅ | When `notifications.length > 0`, a card shows "You have quote updates" with up to 5 links to `/quote/status/[ref]`. |
| **Link target** | ✅ | Uses `n.referenceNumber || n.quoteId`; reference_number is from join, so links are correct. |
| **Placement** | ✅ | Banner appears above Active Quotes / Past Quotes. |

Pending notifications are only shown when My Quotes loads with a valid `user_email`; see caveat in 1.1.

### 2.3 No cross-buyer leakage

| Vector | Mitigation | Result |
|--------|------------|--------|
| **Email source** | Email comes from server-only cookie `user_email` in My Quotes; not from client input. | ✅ |
| **Query** | `.eq("recipient", normalizedEmail)` and filter by `quote_requests.email === normalizedEmail`. | ✅ |
| **Comment** | buyerService documents: "Never pass client-supplied email." | ✅ |

No route passes client-supplied email into `getBuyerNotifications`; My Quotes reads cookie server-side.

### 2.4 Failure mode when notifications query is blocked

| Scenario | Behavior | Assessment |
|----------|----------|------------|
| **Table missing** | Supabase error → getBuyerNotifications catches, logs, returns `[]`. | ✅ Safe |
| **RLS blocks (e.g. anon, no JWT)** | Would return empty; with service role not used. | ✅ Safe |
| **Throw in getBuyerNotifications** | Promise.all rejects → single catch in QuoteListContent sets loadError → **entire My Quotes shows "Unable to Load Quotes"**. Quotes list is not shown. | ⚠️ Coupled failure |

So: if the notifications query throws (e.g. schema change, permission), the whole My Quotes content is replaced by the error state and the user does not see their quote list. Failure is safe (no leak) but not graceful (quotes could still be shown with notifications omitted).

---

## 3. Refresh / Update Reliability

### 3.1 Can buyers reliably see changed quote status without email?

| Mechanism | Result | Notes |
|-----------|--------|--------|
| **Reference-based status page** | ✅ | Buyer can open `/quote/status/[ref]` anytime. Each load is server-rendered and fetches current quote and history from DB. No dependency on email. |
| **My Quotes list** | ✅ | When `user_email` is set, list is loaded server-side on each request; re-visiting My Quotes or refreshing the page shows latest quotes and statuses. |
| **In-portal banner** | ✅ | Pending notifications are loaded with the same My Quotes request; after status change and notification insert, next load of My Quotes shows the banner. |

So buyers can rely on the portal as the source of truth: re-open or refresh the status page, or re-open My Quotes, to see updates. No email required.

### 3.2 Is manual refresh sufficient for launch?

| Check | Result |
|-------|--------|
| **Status page** | Each full page load (navigate or browser refresh) re-runs server component and fetches fresh data. Manual refresh is sufficient. |
| **Refresh button** | See 3.3 — currently the header refresh control is a **dead button** (no onClick). Replacing it with the existing `QuoteDetailRefreshButton` (which calls `router.refresh()`) would make in-page refresh sufficient without full browser reload. |

So: **manual full-page refresh is sufficient for launch.** Fixing the refresh button improves UX but is not a launch blocker for visibility correctness.

### 3.3 Dead refresh button / stale data

| Location | Finding |
|----------|--------|
| **Quote status page header** | The header contains `<Button variant="ghost" size="icon" title="Refresh"><RefreshCw className="w-4 h-4" /></Button>` with **no onClick handler**. `QuoteDetailRefreshButton` is imported but **not used**. So the refresh control is a dead button; it does nothing on click. |
| **QuoteDetailRefreshButton** | Implemented correctly: client component, `router.refresh()` on click, loading state. It is simply not rendered on the status page. |
| **Stale data** | Data is not stale by design: every request is server-rendered and hits the DB. Staleness only occurs if the user keeps the tab open and never refreshes; the dead button does not help. |

**Exact fix:** In `catalogos/src/app/(storefront)/quote/status/[ref]/page.tsx`, replace the plain Button that wraps RefreshCw with `<QuoteDetailRefreshButton />`.

---

## 4. Invalid Reference Handling

### 4.1 Malformed refs handled before expensive fetch

| Layer | Behavior | Result |
|-------|----------|--------|
| **Status page (layout)** | Default export receives `ref` from params, normalizes to `refNumber`, then **checks `isValidQuoteReference(refNumber)` before rendering QuoteStatusContent**. If invalid, it renders `InvalidReferenceCard` and does **not** call `getQuoteByReference`. | ✅ No DB fetch for malformed refs. |
| **getQuoteByReference** | If called with invalid ref, returns null immediately without querying. | ✅ Defense in depth. |

Validation rule: `RFQ-` prefix, total length ≥ 8, body after prefix ≥ 4 chars, body alphanumeric + hyphen only.

### 4.2 User-facing message for invalid ref

| Check | Result |
|-------|--------|
| **Card** | `InvalidReferenceCard` shows "Invalid reference format", the ref value, and "Reference numbers look like RFQ-A1B2C3D4". |
| **CTAs** | "Check another quote" → `/quote/status`; "New quote request" → `/quote`. |

No expensive fetch; clear, safe messaging.

### 4.3 Lookup page (/quote/status) validation

| Check | Result | Note |
|-------|--------|-------|
| **Client check** | Only checks `ref.startsWith("RFQ-")` and `ref.length < 4` (so length ≥ 4 is allowed). Does **not** use `isValidQuoteReference`. | ⚠️ Weaker than status page. |
| **Effect** | User can submit e.g. "RFQ-1" (length 5); navigates to `/quote/status/RFQ-1`; status page then runs full validation and shows InvalidReferenceCard. So no DB fetch, but user sees one extra navigation. | Acceptable; optional hardening: use `isValidQuoteReference` on lookup submit. |

**Exact route/component for invalid-ref handling:** Already correct on **status page** `catalogos/src/app/(storefront)/quote/status/[ref]/page.tsx` (early `isValidQuoteReference` + `InvalidReferenceCard`). Optional improvement: **lookup page** `catalogos/src/app/(storefront)/quote/status/page.tsx` — validate with `isValidQuoteReference(ref)` before `router.push` and show inline error if invalid to avoid unnecessary navigation.

---

## Summary

### Launch blockers

| ID | Issue | Fix |
|----|--------|-----|
| **LB-1** | My Quotes + notifications coupled: if `getBuyerNotifications` throws, the entire page shows "Unable to Load Quotes" and the quote list is hidden. | Make notifications load non-fatal: try/catch only around `getBuyerNotifications`, or await quotes first and then load notifications; on notifications failure, set notifications = [] and still render quotes. |

### High-risk issues

| ID | Issue | Fix |
|----|--------|-----|
| **HR-1** | Quote status page header has a **dead refresh button** (no onClick). Users may think they can refresh in place but nothing happens. | Replace `<Button>…<RefreshCw /></Button>` with `<QuoteDetailRefreshButton />` in `catalogos/src/app/(storefront)/quote/status/[ref]/page.tsx`. |

### Medium issues

| ID | Issue | Fix |
|----|--------|-----|
| **MR-1** | Lookup page (/quote/status) validates ref only with "startsWith RFQ-" and length ≥ 4; does not use `isValidQuoteReference`. Users can submit "RFQ-1" and be sent to status page, which then shows invalid format. | Optionally validate with `isValidQuoteReference(ref)` before `router.push` and show inline error. |
| **MR-2** | Placeholder "1-800-XXX-XXXX" on quote status help card; should be config or real number for production. | Replace with config-driven or real contact number. |

### Exact files/components to change

| File | Change |
|------|--------|
| **catalogos/src/app/(storefront)/quote/status/[ref]/page.tsx** | In the header, replace the plain Refresh Button with `<QuoteDetailRefreshButton />` so the refresh control works. |
| **catalogos/src/app/(storefront)/my-quotes/page.tsx** | Decouple notifications failure from quotes: e.g. load quotes first; then in a separate try/catch (or .catch on getBuyerNotifications) load notifications; on notifications error set notifications = [] and still render quotes so the list is always shown when quotes load. |

---

## Final Verdict

# CONDITIONAL GO

**Reason:**

- **Quote status visibility:** My Quotes (when session exists), quote-by-reference, all statuses, expiration date, and next-action CTA logic are implemented correctly.
- **Notifications:** getBuyerNotifications is safe under current RLS/service-role usage; pending notifications appear in My Quotes; no cross-buyer leakage; failure mode is safe but currently couples notifications failure to entire page error (fixable).
- **Refresh:** Buyers can rely on the portal (re-open or full page refresh) to see updated status without email. Manual refresh is sufficient for launch. The only functional gap is the **dead refresh button** on the status page (high-risk UX, not data correctness).
- **Invalid reference:** Malformed refs are rejected before any DB fetch; status page shows InvalidReferenceCard; no expensive or leaking behavior.

**Conditions:**

1. **Fix dead refresh button** (use `QuoteDetailRefreshButton` on the status page).
2. **Make notifications load non-fatal** on My Quotes so a failing notifications query does not hide the quote list.

With these two changes, the buyer-facing quote visibility flow is **ready for production** from a correctness and reliability perspective. Optional: tighten lookup-page validation and replace placeholder phone number.
