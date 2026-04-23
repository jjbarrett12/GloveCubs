# Ownership Model Refactor

**Date:** 2025-03-02  
**Status:** Implemented

---

## 1. Summary

Commercial records (orders, RFQs, ship-to addresses, uploaded invoices) have been moved from **user-scoped** to **company-scoped** ownership. Ownership is determined by `company_id`; `created_by_user_id` preserves attribution.

---

## 2. Schema Changes

| Table | New Columns | Purpose |
|-------|-------------|---------|
| `orders` | `company_id`, `created_by_user_id` | Company owns order; creator tracked |
| `rfqs` | `company_id`, `created_by_user_id` | Company owns RFQ; submitter tracked |
| `ship_to_addresses` | `company_id`, `created_by_user_id` | Company shares addresses |
| `uploaded_invoices` | `company_id`, `created_by_user_id` | Company shares invoices |

Migration: `supabase/migrations/20260330000004_company_ownership.sql`

---

## 3. Access Control

**Rule:** User can access a record if:
- `record.company_id` is in user's companies (from `company_members` or `user.company_id`/`company_name`), OR
- `record.company_id` is null AND `record.created_by_user_id` = user (legacy), OR
- `record.user_id` = user (backward compat)

**Company resolution:** `companiesService.getCompanyIdsForUser(user)` — uses `company_members` first, then `user.company_id` or `company_name` match.

---

## 4. Create Flows

All create endpoints derive `company_id` server-side via `getCompanyIdForUser(user)`. **Never trust client-supplied `company_id`.**

| Endpoint | Derivation |
|----------|------------|
| `POST /api/orders` | `companiesService.getCompanyIdForUser(user)` |
| `POST /api/orders/create-payment-intent` | Same |
| `POST /api/ship-to` | Same |
| `POST /api/invoices` | Same |
| `POST /api/rfqs` | Same (when authenticated) |

---

## 5. Role Behavior (company_members)

**Current:** Any user whose company matches the record's `company_id` can access. `company_members` is used to resolve user → companies.

**Future:** Use `company_members.role` (e.g. `admin`, `buyer`, `viewer`) for:
- **buyer/admin/owner:** View and create company records
- **viewer:** View-only
- **Non-members:** No access

---

## 6. MVP Exceptions (Intentional User-Scoped)

| Entity | Scope | Reason |
|--------|-------|--------|
| **carts** | User (cart_key = user_123) | Single buyer per session; shared carts are future enhancement |
| **saved_lists** | User | Personal favorites; shared lists optional later |

---

## 7. Files Changed

- `supabase/migrations/20260330000004_company_ownership.sql` — schema + backfill
- `services/companiesService.js` — `getCompanyIdsForUser`
- `services/dataService.js` — company-scoped queries, create/update/delete with company
- `server.js` — routes use `getCompanyIdsForAuthenticatedUser`, company-scoped dataService calls
- `docs/OWNERSHIP_REFACTOR.md` — this doc
- `tests/auth.test.js` — updated for company-scoped access

---

## 8. Deliverables Summary

| Item | Status |
|------|--------|
| **Migrations** | `20260330000004_company_ownership.sql` — adds company_id, created_by_user_id; backfills from users |
| **Entities moved to company-scoped** | orders, order_items (via order), rfqs, ship_to_addresses, uploaded_invoices |
| **Intentionally user-scoped (MVP)** | carts, saved_lists |
| **Tests added/updated** | company-scoped functions exist; user A cannot access user B order; no client company_id |
| **Multi-user company support** | **Yes** — users in the same company (via company_id or company_members) share access to orders, RFQs, ship-to, invoices |
