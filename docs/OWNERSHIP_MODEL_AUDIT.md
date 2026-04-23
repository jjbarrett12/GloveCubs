# Ownership Model Audit — GloveCubs B2B

**Date:** 2025-03-02  
**Scope:** Core business entities, schema, routes, and intended B2B product behavior.

---

## 1. Executive Summary

GloveCubs uses **user-scoped** tenant isolation for most customer-facing entities (orders, RFQs, carts, invoices, ship-to addresses, saved lists). The intended B2B product model implies **company-scoped** or **role-dependent** access for several of these entities. This audit identifies mismatches, schema risks, and whether the current model is acceptable for MVP.

**Verdict:** **REFACTORED 2025-03-02.** Orders, RFQs, ship-to, and invoices are now company-scoped. See `docs/OWNERSHIP_REFACTOR.md`.

---

## 2. Ownership Audit Table

| Entity | Current Schema | Current Scope | Intended Scope | Match? |
|--------|----------------|---------------|----------------|--------|
| **orders** | `user_id` NOT NULL | User-scoped | Company-scoped (or role-dependent) | ❌ Too restrictive |
| **order_items** | Via `order_id` only | Inherits from order | Same as orders | ❌ Via order |
| **carts** | `cart_key` (user_123 or session_abc) | User/session | User OK for checkout; shared carts optional | ⚠️ Acceptable |
| **RFQs** | `user_id` NULLABLE | User-scoped (mine) / admin (all) | Company-scoped for "my company's RFQs" | ❌ Too restrictive |
| **invoices** (uploaded) | `user_id` NOT NULL | User-scoped | Company-scoped or role-dependent | ❌ Too restrictive |
| **ship-to addresses** | `user_id` NOT NULL | User-scoped | Company-scoped (shared locations) | ❌ Too restrictive |
| **saved lists** | `user_id` NOT NULL | User-scoped | User OK (personal) or company (standard lists) | ⚠️ Acceptable |
| **pricing** | `company_id` in `customer_manufacturer_pricing` | Company-scoped | Company-scoped | ✅ Correct |
| **companies** | N/A (global) | Global (admin) | Global | ✅ Correct |
| **inventory** | No tenant cols | Global (admin) | Global | ✅ Correct |
| **purchase_orders** | No `user_id`/`company_id`; links `order_id` | Admin-only | Admin (internal) | ✅ Correct |

---

## 3. Entity-by-Entity Classification

### 3.1 orders
- **Intended:** Company-scoped (company owns commercial records) or role-dependent (buyer creates, manager sees).
- **Current:** `user_id` only; `getOrdersByUserId(userId)`, `getOrderById(id, userId)`.
- **B2B need:** Multiple employees (procurement, warehouse, finance) at the same company need shared access to orders.
- **Current model too restrictive?** Yes. User B at Company X cannot see orders placed by User A at Company X.

### 3.2 order_items
- **Intended:** Same as orders (inherits via order).
- **Current:** `order_id` only; no `user_id` or `company_id`.
- **Schema risk:** None for items; fix orders, items inherit.

### 3.3 carts
- **Intended:** User-scoped acceptable for MVP (one person checks out); optional shared/draft carts later.
- **Current:** `cart_key = user_${userId}` or `session_${sessionId}`; no company_id.
- **B2B need:** Single buyer per session is often fine; shared carts are a future enhancement.
- **Current model too restrictive?** No for MVP.

### 3.4 RFQs
- **Intended:** Company-scoped or role-dependent (RFQ submitted on behalf of company).
- **Current:** `user_id` nullable; `getRfqsByUserId(userId)` for "mine"; admin sees all.
- **B2B need:** Anyone at the company may need to view RFQ status (procurement, sales contact).
- **Current model too restrictive?** Yes. User B cannot see RFQs submitted by User A at same company.

### 3.5 invoices (uploaded_invoices)
- **Intended:** Company-scoped or role-dependent (procurement uploads; finance/approvers see).
- **Current:** `user_id` NOT NULL; `getUploadedInvoicesByUserId`, `deleteUploadedInvoice(id, userId)`.
- **B2B need:** Multiple people may need visibility for approval workflows.
- **Current model too restrictive?** Yes.

### 3.6 ship-to addresses
- **Intended:** Company-scoped (company locations: warehouses, branches, stores).
- **Current:** `user_id` NOT NULL; all CRUD filters by `user_id`.
- **B2B need:** All employees at a company should see and use the same ship-to locations.
- **Current model too restrictive?** Yes. User B cannot use addresses created by User A.

### 3.7 saved lists
- **Intended:** User (personal favorites) or company (standard reorder lists).
- **Current:** `user_id` NOT NULL.
- **B2B need:** Personal lists are common; shared "standard order" lists are a nice-to-have.
- **Current model too restrictive?** No for MVP.

### 3.8 pricing
- **Intended:** Company-scoped (customer_manufacturer_pricing per company).
- **Current:** `company_id` in schema; `getCompanyIdForUser(user)` server-side; no client input.
- **B2B need:** Correct. Company gets its margins; users at company inherit pricing.

### 3.9 companies
- **Intended:** Global entity; admin manages.
- **Current:** No tenant scope; admin routes only.
- **B2B need:** Correct.

### 3.10 inventory
- **Intended:** Global (GloveCubs warehouse stock); admin-only.
- **Current:** No `user_id`/`company_id`; admin routes only.
- **B2B need:** Correct.

### 3.11 purchase_orders
- **Intended:** Admin-only (internal PO to manufacturers); links to `order_id`.
- **Current:** No tenant columns; admin-only.
- **B2B need:** Correct.

---

## 4. Mismatches: Intended vs Current

| Entity | Mismatch | Impact |
|--------|----------|--------|
| **orders** | User-only access | Colleague at same company cannot see orders placed by another user |
| **order_items** | Inherits order scope | Same as orders |
| **RFQs** | User-only "mine" | Colleague cannot view company RFQ status |
| **invoices** | User-only | Colleague cannot see uploaded invoices |
| **ship-to addresses** | User-only | Colleague cannot use or manage company ship-to locations |
| **carts** | User-only | Acceptable; shared carts not required for MVP |
| **saved lists** | User-only | Acceptable; shared lists are enhancement |

---

## 5. Schema Risks & Recommended Changes

### 5.1 Records that should carry `company_id`

| Table | Current | Recommended | Priority |
|-------|---------|-------------|----------|
| `orders` | `user_id` only | Add `company_id` (nullable, from user's company) | High |
| `rfqs` | `user_id` only | Add `company_id` (nullable) | High |
| `ship_to_addresses` | `user_id` only | Add `company_id` (nullable); keep `user_id` for creator | High |
| `uploaded_invoices` | `user_id` only | Add `company_id` (nullable) | Medium |
| `saved_lists` | `user_id` only | Add `company_id` (nullable) for shared lists later | Low |
| `carts` | `cart_key` only | Consider `company_id` if shared carts added | Low |

### 5.2 Migration strategy

1. **Phase 1 (pre-MVP or post-MVP):** Add `company_id` to `orders`, `rfqs`, `ship_to_addresses`, `uploaded_invoices` where applicable. Backfill from `users.company_id` or `getCompanyIdForUser`.
2. **Phase 2:** Use `company_id` for access control: allow access if user's company matches record's `company_id` (optionally with role checks via `company_members.role`).
3. **Phase 3:** Use `company_members` for multi-company users and role-dependent visibility.

### 5.3 company_members usage

- **Current:** `company_members` exists but is **not used** by the server. `getCompanyIdForUser` uses `user.company_id` or `company_name` match only.
- **Recommendation:** When moving to company-scoped access, query `company_members` to resolve user → company (and role). Support multi-company membership if needed.

---

## 6. Route/Query Changes Recommended

### 6.1 Access control changes (when moving to company scope)

| Route | Current | Recommended |
|-------|---------|-------------|
| `GET /api/orders` | `getOrdersByUserId(req.user.id)` | `getOrdersByCompanyId(companyId)` or union with user's company |
| `GET /api/orders/:id` | `getOrderById(id, req.user.id)` | `getOrderById(id, companyId)` — allow if order.company_id = user's company |
| `POST /api/orders` | `user_id: req.user.id` | Add `company_id` from `getCompanyIdForUser(user)` |
| `GET /api/rfqs/mine` | `getRfqsByUserId(req.user.id)` | `getRfqsByCompanyId(companyId)` |
| `POST /api/rfqs` | `user_id: payload.user_id` | Add `company_id` from user |
| `GET /api/ship-to` | `getShipToByUserId(req.user.id)` | `getShipToByCompanyId(companyId)` |
| `POST /api/ship-to` | `user_id: req.user.id` | Add `company_id`; keep `created_by_user_id` optional |
| `GET /api/invoices` | `getUploadedInvoicesByUserId(req.user.id)` | `getUploadedInvoicesByCompanyId(companyId)` |
| `POST /api/invoices` | `user_id: req.user.id` | Add `company_id` |

### 6.2 New service functions (when implementing)

- `getOrdersByCompanyId(companyId)` — replace or supplement `getOrdersByUserId`
- `getOrderByIdForCompany(orderId, companyId)` — allow if order.company_id = companyId
- `getRfqsByCompanyId(companyId)`
- `getShipToByCompanyId(companyId)` — shared company addresses
- `getUploadedInvoicesByCompanyId(companyId)`

### 6.3 Role-dependent behavior (future)

- Use `company_members.role` (e.g. `admin`, `buyer`, `viewer`) to gate create/edit/delete vs view-only.
- Example: Only `buyer` or `admin` can create orders; `viewer` can read.

---

## 7. Target Ownership Model (Long-term)

| Principle | Implementation |
|-----------|----------------|
| **Company owns commercial records** | Orders, RFQs, ship-to, invoices are tied to `company_id` |
| **Users create/modify records** | Keep `user_id` or `created_by_user_id` for audit trail |
| **Role controls visibility/actions** | `company_members.role` (admin, buyer, viewer) |
| **Pricing stays company-scoped** | No change; already correct |
| **Carts remain user-scoped for MVP** | Optional shared carts later |
| **Saved lists** | User for personal; optional `company_id` for shared |

---

## 8. MVP Verdict

| Question | Answer |
|----------|--------|
| **Is current model acceptable for MVP?** | **Yes**, if the product targets single-buyer companies (one person per company doing all ordering). |
| **Must it change before launch?** | **Depends.** If multi-employee companies are a target segment, fix orders, ship-to, RFQs, and invoices before launch. |
| **Minimum changes for multi-employee support** | Add `company_id` to orders, ship_to_addresses, rfqs, uploaded_invoices; switch access control from user to company. |

---

## 9. Summary Table

| Entity | Current Scope | Target Scope | MVP OK? | Pre-Launch Change? |
|--------|---------------|--------------|---------|--------------------|
| orders | User | Company | If single-buyer only | Yes if multi-employee |
| order_items | Via order | Via order | Same as orders | Same as orders |
| carts | User | User | Yes | No |
| RFQs | User | Company | If single-buyer only | Yes if multi-employee |
| invoices | User | Company | If single-buyer only | Yes if multi-employee |
| ship-to | User | Company | If single-buyer only | Yes if multi-employee |
| saved lists | User | User | Yes | No |
| pricing | Company | Company | Yes | No |
| companies | Global | Global | Yes | No |
| inventory | Global | Global | Yes | No |
| purchase_orders | Admin | Admin | Yes | No |

---

## 10. Files Referenced

- `services/dataService.js` — order, cart, ship-to, saved list, RFQ, invoice CRUD
- `services/companiesService.js` — `getCompanyIdForUser`, company/pricing
- `server.js` — route handlers, cart key derivation, pricing flow
- `supabase/migrations/20260330000002_glovecubs_orders_carts_inventory.sql` — orders, carts, RFQs, ship_to, saved_lists
- `supabase/migrations/20260302000004_customer_manufacturer_pricing.sql` — pricing (company_id)
- `supabase/migrations/20260302000001_companies_and_members.sql` — companies, company_members
- `docs/TENANT_ISOLATION_AUDIT.md` — tenant isolation (user_id enforcement)
