# GLOVECUBS — Final Buyer Login / Onboarding / Account Audit Report

**Audit Date:** 2026-03-02  
**Scope:** Buyer-facing flows only. Assumption: account system is broken until proven otherwise.

**Personas simulated:** Hospital procurement, school district purchaser, food processor ops, returning enterprise buyer, repeat-order buyer, multi-location purchaser (where supported).

---

## Executive Summary

The platform has **three disconnected buyer-facing surfaces**:

1. **Legacy (Express + public JS, port 3004):** Full account lifecycle (register, login, logout, forgot/reset password), company info at signup, dashboard, favorites, orders, RFQs, ship-to, saved lists, reorder. **This is the only surface where a company can create an account and log in.**
2. **Catalogos (Next.js):** Catalog, quote request, My Quotes, quote status by reference. **No account creation or login.** My Quotes depends on a `user_email` cookie that is **never set** anywhere; "Sign In" links to `/login` which does not exist in catalogos.
3. **Storefront Next (/buyer/dashboard):** Procurement Intelligence dashboard (Supabase Auth + `user_profiles.buyer_id`). **No buyer login page**; unauthenticated users see an empty dashboard with no redirect or sign-in prompt.

A single "buyer" cannot today: create one account → browse catalogos → save favorites there → see My Quotes → and use Procurement Intelligence under one identity. Legacy and catalogos/storefront are not unified.

---

## PHASE 1 — Account Creation

### Legacy (server.js + public/js/app.js)

| Flow | Status | Notes |
|------|--------|--------|
| **Company signup** | ✅ Implemented | `POST /api/auth/register`: company_name, email, password, contact_name, phone, address, city, state, zip, cases_or_pallets, allow_free_upgrades. Creates user; "Pending approval for B2B pricing." |
| **User signup** | ✅ Same as above | One user per registration; no separate "invite user to company" in this flow. |
| **Login** | ✅ Implemented | `POST /api/auth/login` → JWT (7d), user object. Demo bypass (demo@company.com / demo123). |
| **Logout** | ✅ Client-only | `logout()` clears localStorage token/user, navigates home. No server-side logout (JWT remains valid until expiry). |
| **Forgot password** | ✅ Implemented | `POST /api/auth/forgot-password` → token, email with reset link (1h). |
| **Password reset** | ✅ Implemented | `GET /api/auth/reset-check`, `POST /api/auth/reset-password`; min 6 chars. |
| **Duplicate account prevention** | ✅ By email | Register checks `getUserByEmail`; returns 400 "Email already registered". |
| **Duplicate company prevention** | ❌ Not enforced | No check that company_name is unique; multiple users can register same company name. |
| **Redirects** | ✅ | Login success → token stored, UI updates; register success → message "Account created! Pending approval." |
| **Protected routes** | ✅ | `authenticateToken` on /api/orders, /api/favorites, /api/account/*, /api/ship-to, /api/rfqs/mine, etc. 401 when no/invalid token. |
| **Session on refresh** | ✅ | Token in localStorage; api.get() sends Authorization; /api/auth/me restores user. |
| **Weak validation** | ⚠️ | Register accepts any string lengths; no email format enforcement in server (client may validate). |

### Catalogos (Next.js)

| Flow | Status | Notes |
|------|--------|--------|
| **Signup / Login** | ❌ Missing | No routes or UI. My Quotes expects `user_email` cookie; **never set**. "Sign In" → `/login` (404 in catalogos). |
| **Logout** | N/A | |
| **Forgot / reset password** | ❌ N/A | |
| **Duplicate prevention** | N/A | |

### Storefront Next (/buyer/dashboard)

| Flow | Status | Notes |
|------|--------|--------|
| **Signup / Login** | ❌ Missing | No buyer login page. Dashboard API uses Supabase Auth; no UI to sign in. |
| **Logout** | N/A | |
| **Protected access** | ⚠️ API only | /buyer/dashboard page loads for all; API returns 401; **no redirect to login**, empty dashboard shown. |

**Phase 1 findings:** Account creation and login **only work in the legacy app**. Catalogos and storefront buyer dashboard have **no way to create or log into a buyer account**. Redirect loops and session loss not observed in legacy; silent failure exists when unauthenticated users hit storefront /buyer/dashboard (empty shell, no message).

---

## PHASE 2 — Company Setup

### Legacy

| Capability | Status | Notes |
|------------|--------|--------|
| **Company name** | ✅ At signup | Stored in `users.company_name`. **No post-signup edit** (no PUT/PATCH for profile). |
| **Purchasing contact** | ✅ At signup | contact_name, email, phone. Not editable after signup in API. |
| **Billing address** | ⚠️ Partial | address, city, state, zip at signup. No dedicated "billing address" entity; no edit endpoint. |
| **Shipping address** | ✅ | Ship-to addresses: GET/POST/PUT/DELETE `/api/ship-to`; company-scoped via `getCompanyIdsForUser`. |
| **Tax/resale** | ❌ Not found | No tax_id or resale certificate fields in register or account. |
| **Preferred payment** | ⚠️ | payment_terms set to 'credit_card' at create; no update endpoint for payment method. |
| **Facility/location** | ✅ | Ship-to addresses act as locations; multiple addresses per company. |

**New account → ready to buy:** Partially. User can register and log in; can add ship-to addresses. Cannot edit company name or contact/address after signup; no dedicated "company profile" or "account settings" update flow. Budget can be updated (PUT /api/account/budget).

### Catalogos / Storefront

No company setup flows; no account.

**Phase 2 findings:** Company setup is **incomplete**: initial data at signup only, no post-signup company/profile edit in legacy. Ship-to and multi-location are supported.

---

## PHASE 3 — Buyer Dashboard

### Legacy (portal)

| Check | Status | Notes |
|-------|--------|--------|
| **Dashboard loads** | ✅ | renderDashboardPage: /api/auth/me, /api/orders, /api/account/summary, tier-progress, budget, rep, saved-lists, rfqs/mine, ship-to, favorites. |
| **Quote history** | ✅ | RFQs: /api/rfqs/mine (company-scoped). Rendered in portal. **Note:** Legacy RFQs are **not** catalogos quote_requests; they are a separate table (public.rfqs). |
| **Favorites persist** | ✅ | product_favorites by user_id; GET/POST/DELETE /api/favorites. |
| **Account settings editable** | ⚠️ | Only budget (PUT /api/account/budget). No edit for company name, contact, or address. |
| **Saved products** | ✅ | Favorites list; "saved lists" (named lists) also available. |
| **Navigation** | ✅ | Sidebar: Dashboard, Orders, Favorites, Quote requests, Ship-to, Saved lists, etc. |

**Empty shells / stale data:** Dashboard is populated from API; no evidence of empty shells when authenticated. Stale data risk: client-side state only; refresh reloads from server.

### Catalogos (My Quotes)

| Check | Status | Notes |
|-------|--------|--------|
| **Dashboard / quote history** | ⚠️ | My Quotes shows quote list **only when `user_email` cookie is set** — which never happens. So for normal users, "dashboard" (My Quotes) is effectively unavailable. |
| **Favorites** | ❌ | No favorites in catalogos. |
| **Navigation** | ✅ | Links to /quote, /quote/status, /catalog. |

### Storefront (/buyer/dashboard)

| Check | Status | Notes |
|-------|--------|--------|
| **Dashboard loads** | ⚠️ | When authenticated (Supabase), loads summary, savings, market intel, risks, spend, opportunities. When not authenticated, **empty tabs** (no redirect, no sign-in CTA). |
| **Quote history** | ❌ | This dashboard is Procurement Intelligence (savings, suppliers, risks), not quote list. Quote history lives in legacy (rfqs/mine) or catalogos (My Quotes). |
| **Favorites** | ❌ | Not part of this app. |
| **Navigation** | ✅ | Tabs: Savings, Market Intelligence, Supplier Trust, Procurement Risk, Spend Analytics, Opportunities. |

**Phase 3 findings:** Legacy dashboard is **functional** for logged-in users. Catalogos "dashboard" (My Quotes) is **unusable** without login. Storefront buyer dashboard is **powerful but unreachable** (no login) or shows **empty state** when unauthenticated.

---

## PHASE 4 — Heavy Purchaser Workflow

### Legacy

| Check | Status | Notes |
|-------|--------|--------|
| **Favorites** | ✅ | Add/remove; persist by user_id; reorder from favorites (add to cart). |
| **Saved SKUs / lists** | ✅ | Saved lists: create, add items, add list to cart. |
| **Quote requests** | ✅ | Legacy RFQs: /api/rfqs/mine. Submit path exists in legacy (contact/RFQ flow). **Not the same as catalogos quote_requests.** |
| **Quotes visible in dashboard** | ✅ | Legacy RFQs shown in portal. |
| **Reorder** | ✅ | `POST /api/orders/:id/reorder` (authenticateToken). |
| **Repeated requests** | ✅ | User can place orders, request quotes (legacy), use favorites repeatedly. |

**Friction:** No single sign-on across catalogos and legacy. If the main catalog is catalogos, a buyer browsing there **cannot** save favorites there or see "My Quotes" without a catalogos login (which doesn't exist). So **heavy purchaser workflow is split**: legacy has full repeat flow; catalogos has quote submit + reference-only tracking, no account-based list or favorites.

### Catalogos

| Check | Status | Notes |
|-------|--------|--------|
| **Favorites** | ❌ | Not implemented. |
| **Saved SKUs** | ❌ | Quote basket is in-memory (context); not persisted as "saved" across sessions. |
| **Quote requests** | ✅ | Submit quote; track by reference. |
| **Quotes in dashboard** | ❌ | My Quotes requires login (unavailable). |
| **Reorder** | ❌ | No reorder from quote or order in catalogos. |
| **Repeat flow** | ⚠️ | Can repeatedly submit quotes and track by ref; cannot build a persistent "account" view. |

**Phase 4 findings:** **Heavy purchaser workflow is only complete in legacy.** Catalogos supports repeated quote submissions and reference-based tracking but **no account, no favorites, no saved lists, no reorder**.

---

## PHASE 5 — Quote / Order / Invoice History

### Legacy

| Check | Status | Notes |
|-------|--------|--------|
| **Quotes (RFQs)** | ✅ | /api/rfqs/mine (company-scoped). Shown in portal. |
| **Quote status** | ✅ | Legacy RFQ status from API. |
| **Orders** | ✅ | GET /api/orders, GET /api/orders/:id (company-scoped). Reorder, invoice, tracking. |
| **Invoices** | ✅ | GET /api/orders/:id/invoice, GET /api/invoices. |
| **Isolation** | ✅ | getOrdersByCompanyId, getOrderByIdForCompany; getRfqsByCompanyId. |

### Catalogos

| Check | Status | Notes |
|-------|--------|--------|
| **Quotes after submission** | ✅ | By reference: /quote/status/[ref]. |
| **Quote status updates** | ✅ | Status page shows current status and timeline. |
| **Quote timeline** | ✅ | QuoteTimeline component; history from quote_status_history. |
| **Order history** | ❌ | No orders in catalogos; orders are in legacy. |
| **Invoice** | ❌ | Not in catalogos. |
| **My Quotes list** | ❌ | Requires user_email (never set). |

**Phase 5 findings:** **Legacy** provides quote (RFQ) and order/invoice history with company isolation. **Catalogos** provides quote-by-reference and timeline only; no order/invoice and no account-scoped quote list.

---

## PHASE 6 — Customer Data Security

| Check | Status | Notes |
|-------|--------|--------|
| **Company A vs B (orders)** | ✅ | dataService.getOrdersByCompanyId(companyIds, req.user.id); getOrderByIdForCompany. Tests: auth.test.js "company A user cannot access company B order". |
| **Users scoped to company** | ✅ | getCompanyIdsForUser(user) from company_members + user.company_id; orders, RFQs, ship-to, uploaded_invoices use company_id. |
| **Favorites isolated** | ✅ | product_favorites by user_id; no company_id. So per-user, not per-company (same user cannot see another user's favorites). |
| **Quotes isolated (legacy)** | ✅ | getRfqsByCompanyId(companyIds). |
| **Quotes isolated (catalogos)** | ✅ | By reference only (no account); getQuoteByReference(ref). getQuotesByEmail(email) and getBuyerNotifications(email) use server-side email (cookie); no client-supplied email. |
| **Invoices/orders isolated** | ✅ | Company-scoped in legacy. |

**Phase 6 findings:** **Legacy** enforces company-scoped access for orders, RFQs, ship-to, invoices. **Catalogos** quote access is by reference or by server-derived email (no cross-buyer leakage when email is from cookie). **Storefront** buyer dashboard uses buyer_id from Supabase user/profile (isolation by identity).

---

## PHASE 7 — Buyer Value Visibility

| Surface | Trusted best price | Supplier identity | Savings opportunity | Recommendation reasoning | Trust signals |
|---------|--------------------|-------------------|----------------------|---------------------------|--------------|
| **Legacy portal** | ⚠️ Product pricing | ⚠️ Limited | ⚠️ Tier/summary | ❌ | ❌ |
| **Catalogos product page** | ⚠️ "From $X" only | ❌ No supplier names | ❌ | ❌ | ❌ |
| **Storefront /buyer/dashboard** | ✅ | ✅ | ✅ | ✅ AI explanation | ✅ Trust bands, rank |

**Phase 7 findings:** **Procurement Intelligence** (storefront /buyer/dashboard) delivers full value visibility (trusted best price, supplier names, savings, reasoning, trust) but is **not reachable** without a Supabase buyer login (which doesn't exist in-app). **Catalogos** product page does not show supplier names or trust context (per prior audit). **Legacy** does not emphasize these value signals.

---

## PHASE 8 — Test Coverage

| Area | Present | Missing |
|------|---------|--------|
| **Login/signup** | auth.test.js: JWT guard, requireAdmin, company-scoped dataService, tenant isolation (order A vs B), pricing/order company_id not from client | No tests for register flow, login flow, forgot/reset password, duplicate email, session persistence |
| **Company setup** | — | No tests for ship-to CRUD, company resolution, multi-member company |
| **Favorites** | load-tests (favorites scenario, toggleFavorite) | No unit/integration tests for favorites persistence, isolation |
| **Quote lifecycle visibility** | catalogos buyer.test, nextAction tests | No e2e for "submit quote → see in My Quotes" (My Quotes broken anyway) |
| **Dashboard access** | load-tests dashboard-load | No tests for 401 on /buyer/dashboard, no tests for legacy dashboard when unauthenticated |
| **Cross-company isolation** | auth.test.js company A vs B order | No tests for RFQ/ship-to/invoice isolation between companies |

---

## 1. Launch Blockers

| ID | Issue | Location / fix |
|----|--------|----------------|
| **LB-1** | No buyer account creation or login in catalogos; My Quotes and quote-updates banner are unusable. | Catalogos: implement buyer auth (e.g. magic link, password, or redirect to legacy login) and set session/cookie so My Quotes works; or add `/login` that sets `user_email` or delegates to legacy. |
| **LB-2** | My Quotes "Sign In" links to `/login` which does not exist in catalogos. | Add catalogos login route or change link to the app that hosts buyer login (e.g. legacy). |
| **LB-3** | No buyer login for storefront Procurement Intelligence; unauthenticated users see empty dashboard with no sign-in prompt or redirect. | Storefront: add buyer login (e.g. Supabase Auth UI or redirect to legacy) and handle 401 on /buyer/dashboard (redirect or "Sign in required" CTA). |
| **LB-4** | No single buyer identity across legacy, catalogos, and storefront; cannot "create account once" and browse catalogos, save favorites there, see My Quotes, and use Procurement Intelligence. | Product decision: unify identity (e.g. legacy JWT + catalogos/storefront accept same session, or single sign-on) or clearly document which app is "the" buyer experience. |
| **LB-5** | No post-signup company profile edit in legacy (company name, contact, billing address). | Legacy: add PUT /api/account/profile or similar; client "Account settings" form to update company_name, contact_name, phone, address, city, state, zip. |

---

## 2. High-Risk Issues

| ID | Issue | Location |
|----|--------|----------|
| **HR-1** | Duplicate company not prevented; multiple users can register with same company name. | server.js register; consider unique constraint or check on company_name (or allow and rely on company_members for multi-user companies). |
| **HR-2** | Legacy logout is client-only; JWT remains valid until expiry (e.g. 7d). Token theft cannot be revoked. | server.js has no logout blacklist; consider short-lived tokens + refresh or server-side revocation for launch. |
| **HR-3** | Catalogos has no favorites; repeat buyers cannot save products in the catalog they use. | catalogos: add favorites (and account) or document that "favorites" live only in legacy. |
| **HR-4** | Storefront buyer dashboard requires `user_profiles.buyer_id`; how buyer_id is populated for real users is unclear. No onboarding flow. | storefront/src/app/buyer/api/dashboard/route.ts; document or implement buyer onboarding that sets user_profiles.buyer_id. |
| **HR-5** | Legacy RFQs and catalogos quote_requests are separate systems; quotes submitted in catalogos do not appear in legacy portal. | Product/architecture: unify or document two quote systems and which one is "source of truth" for buyer. |

---

## 3. Medium Issues

| ID | Issue | Location |
|----|--------|----------|
| **MR-1** | Register validation (email format, password strength) may be client-only; server accepts any string. | server.js POST /api/auth/register; add server-side validation. |
| **MR-2** | No tax/resale or preferred payment method in company setup. | Legacy signup and account; add if required for B2B. |
| **MR-3** | Catalogos product page does not show supplier names or trusted best price / recommendation (per prior audit). | catalogos product/[slug] and getOffersSummaryByProductId. |
| **MR-4** | Placeholder phone "1-800-XXX-XXXX" on quote status help card. | catalogos quote/status/[ref] page. |
| **MR-5** | Load tests target legacy (3004) for buyer login/dashboard/favorites; catalogos and storefront buyer flows not covered. | load-tests config and scenarios. |

---

## 4. Low Issues

| ID | Issue |
|----|--------|
| **LR-1** | Demo bypass (demo@company.com / demo123) in login; ensure disabled or locked down in production. |
| **LR-2** | Reset password link uses baseUrl (DOMAIN/BASE_URL); ensure correct in production for email links. |
| **LR-3** | Industry landing "Create account" links to /login (storefront); may 404 if storefront has no /login. |

---

## 5. Broken Links / Dead Buttons

| Item | Location | Fix |
|------|----------|-----|
| **Sign In** (My Quotes) | catalogos (storefront)/my-quotes/page.tsx → `/login` | Point to working login (legacy or new catalogos login). |
| **Create account** (industry) | storefront IndustryLandingTemplate.tsx → `/login` | Ensure /login exists in storefront or link to legacy. |
| **Refresh button** (quote status) | Fixed in prior audit (QuoteDetailRefreshButton). | — |
| **/buyer/dashboard** when unauthenticated | No button "dead" but page is empty with no CTA | Add "Sign in required" and link to login. |

---

## 6. Missing Tests

| Area | Missing |
|------|--------|
| **Login/signup** | Register success/fail, login success/fail, duplicate email, forgot/reset password, session persistence |
| **Company setup** | Ship-to CRUD, getCompanyIdsForUser, company-scoped order/RFQ access |
| **Favorites** | Persistence, isolation (user A vs B), add/remove |
| **Quote lifecycle** | E2E: submit quote (catalogos) → see in list (requires login fix first) |
| **Dashboard** | Legacy dashboard 401 when no token; /buyer/dashboard 401 handling |
| **Cross-company** | RFQ, ship-to, invoice isolation between companies |

---

## 7. Buyer Adoption Risks

| Risk | Impact |
|------|--------|
| **Fragmented experience** | Buyers on catalogos cannot create account or see My Quotes; buyers on legacy cannot use catalogos catalog or storefront Procurement Intelligence under same identity. Adoption of "one platform" is limited. |
| **Heavy purchaser friction** | Repeat buyers who want to use catalogos have no favorites, no saved lists, and no account-based quote list; they must rely on reference numbers only. |
| **Multi-location** | Legacy supports multiple ship-to addresses (company-scoped); catalogos and storefront do not offer a unified multi-location view. |
| **Value visibility** | Trusted best price, supplier identity, and recommendations are only visible in storefront /buyer/dashboard, which buyers cannot log into. |
| **Onboarding clarity** | No single "NEW ACCOUNT → READY TO BUY" path across apps; legacy has closest path but no post-signup profile edit. |

---

## 8. Exact Files / Components Needing Fixes

| Priority | File / component | Required change |
|----------|------------------|------------------|
| **P0** | catalogos: buyer auth | Add login/signup or redirect to legacy; set session/cookie so My Quotes and notifications work. |
| **P0** | catalogos (storefront)/my-quotes/page.tsx | Fix "Sign In" href to working login route. |
| **P0** | storefront /buyer/dashboard | Add buyer login or redirect; on 401 from API show "Sign in required" and link to login. |
| **P0** | storefront/src/app/buyer/dashboard/page.tsx | On API 401, redirect to login or render sign-in CTA instead of empty tabs. |
| **P1** | server.js (legacy) | Add PUT /api/account/profile (or similar) to update company_name, contact_name, phone, address, city, state, zip. |
| **P1** | public/js/app.js (legacy) | Add "Account settings" or "Company profile" form that calls profile update API. |
| **P1** | server.js register | Consider duplicate company check or document intent. |
| **P2** | catalogos product page | Add supplier names and trusted/recommendation context (per prior audit). |
| **P2** | tests | Add auth flow tests, company-scoped isolation tests, favorites tests. |
| **P2** | storefront industry "Create account" | Ensure /login exists or link to legacy login URL. |

---

## Is the BUYER ACCOUNT SYSTEM Ready for Launch?

### Summary

- **Legacy:** Account creation, login, logout, password reset, dashboard, favorites, orders, RFQs, ship-to, reorder, and company-scoped isolation **work**. Gaps: no post-signup profile edit, no server-side logout, no duplicate company prevention.
- **Catalogos:** No account; no login; My Quotes and quote-updates banner **unusable**; quote-by-reference and status page work.
- **Storefront buyer dashboard:** No buyer login; empty dashboard when unauthenticated; no way for a typical buyer to reach Procurement Intelligence.

A company **can** successfully create an account, log in, configure shipping (ship-to), browse products (legacy catalog), save favorites, request quotes (legacy RFQs), track orders and invoices, and reorder **only within the legacy app**. They **cannot** do so in catalogos under one identity, and they **cannot** use the Procurement Intelligence dashboard at all without a Supabase session that has no in-app login.

---

# NOT READY

**Reason:** The buyer account system is **fragmented and incomplete**. Catalogos (the likely primary catalog and quote flow) has **no account creation or login**, so My Quotes and the quote-updates banner are unusable. The storefront Procurement Intelligence dashboard has **no buyer login** and shows an empty shell to unauthenticated users. There is **no single path** from "create account" to "ready to buy" across the platform, and **no post-signup company profile edit** in the only app that has accounts (legacy).

**Minimum to reach CONDITIONAL GO:**

1. **Unified or clear buyer entry:** Either (a) add buyer login/signup to catalogos and set session so My Quotes works, and fix "Sign In" link, or (b) route catalogos "Sign In" and storefront "Create account" to legacy login and ensure legacy session is accepted where needed (e.g. catalogos reads legacy JWT or shared cookie).
2. **Storefront /buyer/dashboard:** Add buyer login (or redirect to legacy) and handle 401 (redirect or "Sign in required").
3. **Post-signup company profile edit** in legacy (company name, contact, address).
4. **Document** which app(s) are "the" buyer experience and which quote system (legacy RFQs vs catalogos quote_requests) is the source of truth.

After these, the verdict can be re-evaluated to **CONDITIONAL GO** with the understanding that heavy purchaser and multi-app flows may still require further unification.
