# GLOVECUBS — LOGIN / ONBOARDING / BUYER ACCOUNT AUDIT

**Audit Date:** 2026-03-02  
**Scope:** Buyer adoption and revenue-path; account system assumed broken until proven otherwise.

---

## Executive Summary

| Area | Verdict | Critical Finding |
|------|---------|------------------|
| **Login / Registration** | BROKEN (buyer) | No buyer login in catalogos; My Quotes relies on a cookie that is never set |
| **Company Setup** | MISSING | No buyer company onboarding in catalogos or storefront |
| **Buyer Dashboard** | FRAGMENTED | Dashboard exists in storefront but no way for buyers to log in |
| **Heavy Purchaser Workflow** | NOT SUPPORTED | No favorites, reorder, or saved context in buyer flow |
| **Quote / Order / Invoice** | PARTIAL | Quote submit works; My Quotes broken; no order/invoice visibility |
| **Data Isolation** | WEAK | Quote lookup by reference is unauthenticated |
| **Buyer Trust / Adoption** | HIDDEN | Intelligence exists in storefront dashboard only; unreachable |

**Final Recommendation: NOT READY**

---

## Architecture Finding: Three Disconnected Systems

The platform has **three separate auth/UX surfaces** that are not unified:

| System | Location | Auth | Buyer-Relevant Features |
|--------|----------|------|-------------------------|
| **Legacy** | server.js + public/ | JWT, users table, register/login, forgot/reset | Register, login, company_name at signup; product_favorites (user_id) |
| **Catalogos** | catalogos/ (Next.js) | None for buyers; cookie `user_email` (never set) | Catalog, quote submit, quote status by ref, My Quotes (broken) |
| **Storefront** | storefront/ (Next.js) | Supabase Auth + user_profiles.buyer_id | Buyer dashboard (savings, trust, supplier comparison); **no buyer login/signup UI** |

A company cannot complete a single path: “create account → log in → set up profile → save favorites → request quotes → see my quotes → become repeat buyer” in one coherent flow.

---

## PHASE 1 — LOGIN / REGISTRATION FLOW AUDIT

### What Exists

| Flow | Where | Status |
|------|--------|--------|
| Company signup | server.js `POST /api/auth/register` | Implemented (company_name, email, password, contact, address) |
| Individual user signup | Same; one user per registration | Implemented |
| Login | server.js `POST /api/auth/login` | Implemented (JWT, 7d expiry) |
| Logout | Legacy app (token discard) | Client-side only |
| Forgot password | server.js `POST /api/auth/forgot-password` | Implemented |
| Password reset | server.js `POST /api/auth/reset-password` | Implemented |
| Session persistence | JWT in response; client must store | Implemented |
| **Buyer login in Catalogos** | **None** | **Missing** |
| **Buyer login in Storefront** | **None** | **Missing** |
| **Setting `user_email` for My Quotes** | **Nowhere** | **Never set** |

### Critical Gaps

1. **Catalogos has no login page.**  
   `catalogos/src/app/(storefront)/my-quotes/page.tsx` links to `/login` (line 278). There is no `login/page.tsx` under catalogos app. Result: 404 or wrong app.

2. **`user_email` cookie is never set.**  
   My Quotes (catalogos) uses `cookieStore.get("user_email")` (line 251). No code in catalogos or storefront sets this cookie. Quote submission (`submitQuoteRequestAction`) does not set any session or cookie. **My Quotes is therefore broken for every user.**

3. **Storefront buyer dashboard requires Supabase Auth** (`storefront/src/app/buyer/api/dashboard/route.ts`: `supabase.auth.getUser()`). There is no buyer sign-in or sign-up UI in storefront (only supplier-portal login). So the buyer dashboard is unreachable for normal buyers.

4. **Duplicate account prevention** exists only in legacy (`Email already registered` in server.js). Catalogos and storefront do not implement buyer registration, so no duplicate prevention there.

### Launch Blockers (Phase 1)

| ID | Issue | File / Location |
|----|--------|------------------|
| **LB-A1** | No buyer login page in catalogos | Missing: `catalogos/src/app/(storefront)/login/page.tsx` |
| **LB-A2** | My Quotes depends on `user_email` cookie that is never set | `catalogos/src/app/(storefront)/my-quotes/page.tsx:251`; no setter anywhere |
| **LB-A3** | No buyer sign-up/sign-in in storefront; dashboard unreachable | Missing buyer auth routes in storefront |

### High-Risk (Phase 1)

| ID | Issue | File |
|----|--------|------|
| HR-A1 | Redirect after login not verified for legacy; catalogos has no login | server.js; catalogos |
| HR-A2 | Expired session handling unknown for legacy JWT | Legacy client |
| HR-A3 | Protected routes: catalogos middleware only protects admin/dashboard APIs, not buyer | `catalogos/src/middleware.ts` |

---

## PHASE 2 — COMPANY ACCOUNT SETUP AUDIT

### What Exists

- **Legacy:** Company name and contact captured at registration (server.js). No separate “company profile” or multi-step onboarding.
- **Catalogos:** No company concept. Quote form collects company_name, contact_name, email, phone per submission (not tied to an account).
- **Storefront:** No company setup flow for buyers.
- **DB:** `public.companies` and `public.company_members` exist (migrations). Not used by catalogos or storefront buyer flows. `public.orders` has `company_id` (company_ownership migration).

### Gaps

- No “set up your company profile” after first login.
- No billing/shipping, procurement contact, facility/location, tax/resale, payment method, or purchasing preferences in buyer flows.
- No link from “new account” to “ready to buy” in a single product.

### Launch Blockers (Phase 2)

| ID | Issue | Location |
|----|--------|----------|
| **LB-B1** | No company onboarding or profile setup for buyers in catalogos or storefront | Entire buyer flow |

---

## PHASE 3 — BUYER DASHBOARD / ACCOUNT USABILITY AUDIT

### What Exists

| Feature | Catalogos | Storefront |
|---------|-----------|------------|
| Dashboard load | My Quotes only (broken: no auth) | `/buyer/dashboard` (full UI; requires Supabase auth) |
| Order/quote history | My Quotes = quote history by email (unreachable) | Dashboard has spend/orders concept; no dedicated “My Orders” page found |
| Favorites | None | None in buyer flow |
| Account settings | None | None |
| Billing/shipping editable | No | No |
| Invoices view | No | Not found |
| Company-specific isolation | N/A (no company scoping) | Via buyer_id / Supabase |

### Gaps

- **My Quotes:** Renders “Sign In Required” for everyone because `user_email` is never set; “Look Up by Reference” and “Sign In” buttons; Sign In goes to non-existent `/login`.
- **Storefront buyer dashboard:** Rich (savings, market intel, supplier trust, risks, opportunities) but no way to log in as a buyer.
- No favorites, saved products, or reorder list in buyer-facing catalogos or storefront.

### Launch Blockers (Phase 3)

| ID | Issue | File / Location |
|----|--------|------------------|
| **LB-C1** | My Quotes always shows “Sign In Required” | `catalogos/src/app/(storefront)/my-quotes/page.tsx` |
| **LB-C2** | Buyer dashboard unreachable (no auth) | `storefront/src/app/buyer/dashboard/page.tsx` |

---

## PHASE 4 — HEAVY PURCHASER WORKFLOW AUDIT

### Can a company realistically become a repeat heavy purchaser?

**No.** Evidence:

1. **Favorites:** `public.product_favorites` exists (user_id BIGINT → legacy users). No UI or API in catalogos or storefront buyer flow to add/view favorites. No “save for later” or “reorder list” in quote or catalog flows.
2. **Repeat context:** Quote basket is localStorage only (catalogos). No server-side basket or account-bound “last ordered” / “frequently ordered.”
3. **Order history:** `public.orders` and company_id exist. No buyer-facing “My Orders” or order history in catalogos or storefront.
4. **Reorder:** No “reorder” or “buy again” from a previous quote/order.
5. **Multi-quote:** Submitting multiple quotes works (guest), but user cannot see “all my quotes” because My Quotes is broken.
6. **Friction:** To “buy again” a user must re-browse, re-add to basket, re-enter company/contact every time. No saved preferences or account.

### Launch Blockers (Phase 4)

| ID | Issue | Location |
|----|--------|----------|
| **LB-D1** | No favorites or reorder flow for buyers | Catalogos and storefront buyer |
| **LB-D2** | No order history visible to customer | No “My Orders” page |
| **LB-D3** | No saved purchasing context (addresses, contacts, preferences) | Entire buyer flow |

---

## PHASE 5 — INVOICE / ORDER / QUOTE AUDIT

### Quotes

| Item | Status | Notes |
|------|--------|------|
| Quote submit | Works | `submitQuoteRequestAction` → catalogos quote_requests |
| Quote confirmation | Works | Shows reference number; link to status |
| Quote status by ref | Works | `/quote/status/[ref]`; no auth required |
| Quote status visibility | Good | Status, timeline, next action, line items |
| **My Quotes (list)** | **Broken** | Requires `user_email` cookie; never set |
| Duplicate submit protection | None | User can submit again with same data |
| State transitions | Implemented | won, lost, expired, closed in types and UI |

### Orders

- `public.orders` exists with company_id. No buyer-facing “orders” or “order history” page in catalogos or storefront buyer flow. **Order visibility for customer: NOT IMPLEMENTED.**

### Invoices

- Not found as a customer-facing feature. **Invoices: NOT IMPLEMENTED for buyers.**

### Launch Blockers (Phase 5)

| ID | Issue | Location |
|----|--------|----------|
| **LB-E1** | Customer cannot see “my quotes” (My Quotes broken) | My Quotes page |
| **LB-E2** | Orders not visible to customer after placement | No My Orders page |
| **LB-E3** | Invoices not implemented for buyers | N/A |

---

## PHASE 6 — CUSTOMER DATA ISOLATION / SECURITY AUDIT

| Check | Status | Notes |
|-------|--------|------|
| Company A vs B data | Legacy: by user/company in server; catalogos: no company scoping for quotes | Quote data keyed by email in DB; no auth to prove email |
| Users scoped to company | Legacy: one user per registration (company_name); catalogos: no user/company | company_members exists but not used in buyer flows |
| Quote/order/favorites isolation | Quote by ref: anyone with ref can view. getQuotesByEmail(email): no auth | Possible information disclosure if ref is guessed |
| Auth/session abuse | Catalogos: no buyer session. Legacy: JWT. Storefront buyer: Supabase | No cross-company access in catalogos (no auth at all) |

**High risk:** Quote status by reference is unauthenticated. Anyone with the reference can see full quote details (company, contact, email, line items). Acceptable for “guest lookup” but not for “my account” semantics.

---

## PHASE 7 — BUYER TRUST / ADOPTION AUDIT

| Signal | Where | Visible to buyer? |
|--------|--------|--------------------|
| Savings opportunities | Storefront buyer dashboard | No (dashboard unreachable) |
| Trusted best price | Storefront buyer dashboard; catalogos product page | Catalogos: no supplier names/trust (from prior audit) |
| Supplier recommendation | Storefront buyer dashboard | No |
| Supplier identity | Catalogos offers API | No (supplier names missing – prior audit) |
| Trust/reliability | Storefront buyer dashboard | No |
| Reorder convenience | — | No (no reorder/favorites) |
| Account-level value | My Quotes (intended) | No (broken) |

**Conclusion:** The only place that surfaces procurement intelligence and trust is the storefront buyer dashboard, which buyers cannot reach. Catalogos (where they browse and quote) does not show supplier names or trust, and My Quotes does not work.

---

## PHASE 8 — TEST COVERAGE AUDIT (LOGIN / ACCOUNT)

| Area | Tests Found | Missing |
|------|-------------|--------|
| Signup/login/logout | Legacy: scripts/test-payment-flow.js, e2e-test.js use /api/auth/register | No catalogos or storefront buyer auth tests |
| Forgot/reset password | — | No automated tests found |
| Company setup save/update | — | None |
| Favorites persistence | — | None (no favorites in buyer flow) |
| Buyer dashboard access | — | None |
| Quote/order/invoice visibility | catalogos/src/lib/quotes/buyer.test.ts (buyer service) | No test that “My Quotes” requires auth or shows data |
| Duplicate company/user prevention | — | None for buyer |
| Cross-company isolation | — | None |
| Repeat purchase flows | — | None |

---

## SUMMARY: ISSUES BY SEVERITY

### Launch Blockers

| ID | Issue |
|----|--------|
| LB-A1 | No buyer login page in catalogos |
| LB-A2 | `user_email` cookie never set; My Quotes broken for everyone |
| LB-A3 | No buyer sign-up/sign-in in storefront; buyer dashboard unreachable |
| LB-B1 | No company onboarding or profile setup for buyers |
| LB-C1 | My Quotes always shows “Sign In Required” |
| LB-C2 | Buyer dashboard unreachable |
| LB-D1 | No favorites or reorder flow |
| LB-D2 | No order history visible to customer |
| LB-D3 | No saved purchasing context |
| LB-E1 | Customer cannot see “my quotes” |
| LB-E2 | Orders not visible to customer |
| LB-E3 | Invoices not implemented for buyers |

### High-Risk Issues

| ID | Issue |
|----|--------|
| HR-A1 | Redirect after login (legacy) and catalogos login missing |
| HR-A2 | Expired session handling (legacy) |
| HR-A3 | Catalogos middleware does not protect buyer routes (no buyer auth) |
| HR-Q1 | Quote by reference is unauthenticated (anyone with ref can view) |

### Medium-Risk Issues

| ID | Issue |
|----|--------|
| MR-1 | No duplicate submit protection on quote form |
| MR-2 | Quote confirmation does not set session/cookie for My Quotes |
| MR-3 | Legacy and catalogos/storefront are separate deployments; single path unclear |
| MR-4 | No “Look Up by Reference” input on My Quotes when unauthenticated (only link to /quote/status) |

### Low-Risk Issues

| ID | Issue |
|----|--------|
| LR-1 | Hardcoded contact phone in quote status page |
| LR-2 | /contact link present; contact page existence not verified |

### Broken Links / Dead Buttons

| Location | Issue |
|----------|--------|
| `catalogos/src/app/(storefront)/my-quotes/page.tsx` | “Sign In” → `/login` (no login page in catalogos) |
| `catalogos/src/app/(storefront)/my-quotes/page.tsx` | “Look Up by Reference” → `/quote/status` (no input for ref on that page; user must know URL) |
| Storefront `/buyer/dashboard` | Page exists but 401 without Supabase auth; no sign-in entry point |

### Missing Tests

- Buyer login/signup (catalogos or storefront)
- Forgot/reset password
- Company setup
- Favorites (when implemented)
- Buyer dashboard access and data isolation
- Quote visibility (My Quotes) with auth
- Order/invoice visibility
- Duplicate company/user prevention
- Repeat purchase flows

### Buyer Adoption Gaps

1. No single path: create account → login → set profile → save favorites → request quote → see my quotes → reorder.
2. My Quotes (only “account” view in catalogos) is broken; no alternative.
3. Best procurement intelligence (storefront buyer dashboard) is unreachable.
4. No reorder, favorites, or order history → high friction for repeat purchasing.
5. Company and user setup not part of any buyer flow.

---

## FILES / ROUTES THAT NEED FIXES

| Priority | File / Route | Required Change |
|----------|--------------|-----------------|
| P0 | Catalogos: buyer login | Add `catalogos/src/app/(storefront)/login/page.tsx` (or equivalent) and set `user_email` (or equivalent) on successful login |
| P0 | My Quotes session | Set `user_email` (or use real auth) after quote submit or after login; ensure same identity for getQuotesByEmail |
| P0 | Storefront buyer auth | Add buyer sign-up/sign-in (e.g. Supabase Auth UI) and ensure redirect to /buyer/dashboard |
| P0 | Catalogos login link | Point “Sign In” to a working login (catalogos or shared) |
| P1 | Company onboarding | Add company/profile setup after first login (catalogos or storefront) |
| P1 | My Orders | Add buyer-facing order history (catalogos or storefront) |
| P1 | Favorites / reorder | Implement favorites and “reorder” from quote/order |
| P2 | Quote confirmation | Optionally set session/cookie so “My Quotes” works without separate login |
| P2 | Duplicate submit | Idempotency or “you already submitted” for quote |
| P2 | Tests | Add tests for login, My Quotes, dashboard access, isolation |

---

## FINAL ANSWERS

### A. Is the buyer login/account side ready for launch?

**No.**

- There is no working buyer login in the catalogos app (where quotes and catalog live).
- My Quotes depends on a cookie that is never set, so it never shows quote history.
- The storefront buyer dashboard exists but has no sign-in/sign-up, so it is unreachable.
- Company setup, favorites, order history, and invoices are missing or not customer-facing.

### B. Can a company realistically become a repeat heavy purchaser through the platform?

**No.**

- They cannot see “my quotes” (My Quotes broken).
- They cannot see order history (no My Orders).
- They cannot save favorites or reorder; every purchase repeats full friction.
- The only intelligence that would support repeat purchasing (buyer dashboard) is unreachable.
- No single account path from signup → profile → quotes → orders → repeat.

---

## VERDICT

# NOT READY

**Reason:** Buyer login and account flows are broken or missing. My Quotes is broken for all users. No company onboarding, no order visibility, no favorites or reorder. The only buyer dashboard is unreachable. The platform cannot support a company creating an account, logging in, managing profile, seeing quotes/orders, or becoming a repeat purchaser in a coherent way.

**Minimum to reach CONDITIONAL GO:**

1. Implement a working buyer login (catalogos or storefront) and set session/cookie so My Quotes can show quotes for the logged-in email.
2. Or: after quote submit, set `user_email` (or equivalent) so My Quotes works without a separate login, and document the security trade-off.
3. Add a way for buyers to reach the storefront buyer dashboard (sign-up/sign-in with Supabase or equivalent).
4. Document and test one end-to-end path: register/login → (optional company setup) → submit quote → see My Quotes → (future: orders, reorder).

Until then, the buyer login/account side is **NOT READY** for launch.
