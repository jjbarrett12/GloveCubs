# Tenant Isolation Audit

**Date:** 2025-03-02  
**Verdict:** **PASS** (after fix)

---

## 1. Endpoints Audit

### Orders
| Endpoint | Access | Isolation |
|----------|--------|-----------|
| `GET /api/orders` | Authenticated | `getOrdersByUserId(req.user.id)` — user-scoped |
| `GET /api/orders/:id` | Authenticated | `getOrderById(id, req.user.id)` — `.eq('user_id', userId)` |
| `POST /api/orders/:id/reorder` | Authenticated | `getOrderById(id, req.user.id)` first |
| `GET /api/orders/:id/invoice` | Authenticated | `getOrderById(id, req.user.id)` |
| `POST /api/orders` | Authenticated | Creates with `user_id: req.user.id` |
| `GET /api/admin/orders` | Admin | `getAllOrdersAdmin()` — bypass intentional |
| `PUT /api/admin/orders/:id` | Admin | `getOrderByIdAdmin()` — bypass intentional |

### RFQs
| Endpoint | Access | Isolation |
|----------|--------|-----------|
| `GET /api/rfqs/mine` | Authenticated | `getRfqsByUserId(req.user.id)` |
| `GET /api/rfqs` | Admin | All RFQs — bypass intentional |
| `PUT /api/rfqs/:id` | Admin | Updates any — bypass intentional |

### Carts
| Endpoint | Access | Isolation |
|----------|--------|-----------|
| `GET /api/cart` | OptionalAuth | `cartKey = user_${req.user.id}` or `session_${sessionId}` |
| `POST /api/cart` | OptionalAuth | Same cartKey derivation |
| `PUT /api/cart/:id` | OptionalAuth | `:id` = cart line item id; cartKey user-scoped |
| `DELETE /api/cart/:id` | OptionalAuth | Same |
| `DELETE /api/cart` | OptionalAuth | Same |
| `POST /api/cart/bulk` | Authenticated | `cartKey = user_${req.user.id}` |

### Invoices (uploaded)
| Endpoint | Access | Isolation |
|----------|--------|-----------|
| `GET /api/invoices` | Authenticated | `getUploadedInvoicesByUserId(req.user.id)` |
| `POST /api/invoices` | Authenticated | `createUploadedInvoice(req.user.id, ...)` |
| `DELETE /api/invoices/:id` | Authenticated | `deleteUploadedInvoice(id, req.user.id)` — `.eq('user_id', userId)` |

### Ship-to addresses
| Endpoint | Access | Isolation |
|----------|--------|-----------|
| `GET /api/ship-to` | Authenticated | `getShipToByUserId(req.user.id)` |
| `POST /api/ship-to` | Authenticated | `createShipTo(req.user.id, ...)` |
| `PUT /api/ship-to/:id` | Authenticated | `updateShipTo(id, req.user.id, ...)` — `.eq('user_id', userId)` |
| `DELETE /api/ship-to/:id` | Authenticated | `deleteShipTo(id, req.user.id)` |

### Saved lists
| Endpoint | Access | Isolation |
|----------|--------|-----------|
| `GET /api/saved-lists` | Authenticated | `getSavedListsByUserId(req.user.id)` |
| `POST /api/saved-lists` | Authenticated | `createSavedList(req.user.id, ...)` |
| `PUT /api/saved-lists/:id` | Authenticated | `updateSavedList(id, req.user.id, ...)` |
| `DELETE /api/saved-lists/:id` | Authenticated | `deleteSavedList(id, req.user.id)` |
| `POST /api/saved-lists/:id/add-to-cart` | Authenticated | `getSavedListById(id, req.user.id)` first |

### Companies
| Endpoint | Access | Isolation |
|----------|--------|-----------|
| `GET /api/admin/companies` | Admin | All companies — bypass intentional |
| `GET /api/admin/companies/:id` | Admin | Any company — bypass intentional |
| `PUT /api/admin/companies/:id/default-margin` | Admin | — |
| `POST /api/admin/companies/:id/overrides` | Admin | — |
| `DELETE /api/admin/companies/:id/overrides/:overrideId` | Admin | — |

### Pricing
| Endpoint | Access | Isolation |
|----------|--------|-----------|
| `GET /api/pricing/effective-margin` | Authenticated | **FIXED**: companyId derived from `getCompanyIdForUser(user)` — no client input |
| `GET /api/pricing/sell-price` | Public | Pure math (cost, margin → sell) — no tenant data |

---

## 2. Query Enforcement

**Data model:** GloveCubs uses **user-scoped** isolation, not company-scoped. Each entity (orders, ship-to, saved-lists, invoices, RFQs) is tied to `user_id`. Carts use `cart_key = user_${userId}`.

**Enforcement:**
- `getOrderById(orderId, userId)` — `WHERE id = ? AND user_id = ?`
- `getShipToByUserId`, `updateShipTo`, `deleteShipTo` — `user_id` in WHERE
- `getSavedListById`, `updateSavedList`, `deleteSavedList` — `user_id` in WHERE
- `getUploadedInvoicesByUserId`, `deleteUploadedInvoice` — `user_id` in WHERE
- `getRfqsByUserId` — `user_id` in WHERE

**Company-level:** Users have `company_id` or `company_name`. Pricing uses `getCompanyIdForUser(user)` — never `req.query.companyId` or `req.body.company_id` from the client for non-admin pricing.

---

## 3. ID Parameter Routes

| Route | ID means | Ownership check |
|-------|----------|-----------------|
| `GET /api/orders/:id` | Order id | `getOrderById(id, req.user.id)` — returns null if not owner |
| `PUT /api/ship-to/:id` | Ship-to id | `updateShipTo(id, req.user.id)` — `.eq('user_id', userId)` |
| `DELETE /api/ship-to/:id` | Ship-to id | Same |
| `PUT /api/saved-lists/:id` | Saved list id | `updateSavedList(id, req.user.id)` |
| `DELETE /api/saved-lists/:id` | Saved list id | Same |
| `DELETE /api/invoices/:id` | Invoice id | `deleteUploadedInvoice(id, req.user.id)` |
| `PUT /api/cart/:id` | Cart **line item** id | Cart key = user; item id is within that cart |

---

## 4. User-Controlled company_id

**Before fix:** `GET /api/pricing/effective-margin` accepted `req.query.companyId` — user could query any company's margin.

**After fix:** companyId is derived server-side from `getCompanyIdForUser(user)`. No route accepts client-supplied `company_id` for tenant-scoped operations.

Admin routes (`/api/admin/companies/:id`) use URL path `:id` — admin-only, intentional bypass.

---

## 5. Admin Bypass

Admin routes use `requireAdmin` or explicit `isAdmin` check. They intentionally bypass tenant filtering:
- `getAllOrdersAdmin`, `getOrderByIdAdmin`
- `getRfqs()`, `updateRfq(id, updates)` (no user filter)
- `getCompanies()`, `getCompanyById()`, company overrides

---

## 6. Vulnerable Endpoints (Found and Fixed)

| Endpoint | Issue | Fix |
|----------|-------|-----|
| `GET /api/pricing/effective-margin` | Accepted `req.query.companyId`; any user could query Company B's margin | Now derives companyId from authenticated user via `getCompanyIdForUser(user)` |

---

## 7. Files Modified

| File | Change |
|------|--------|
| `server.js` | `GET /api/pricing/effective-margin`: use server-derived companyId, reject `req.query.companyId` |
| `tests/auth.test.js` | Added: company A cannot access company B order; pricing uses server-derived company |
| `docs/TENANT_ISOLATION_AUDIT.md` | New |

---

## 8. Tests Added

- `company A user cannot access company B order` — integration test: `getOrderById(orderB.id, userA)` returns null
- `pricing effective-margin uses server-derived company_id not user-controlled` — asserts route uses `getCompanyIdForUser` and does not use `req.query.companyId`

---

## 9. Final Verdict

**PASS** — Tenant isolation is enforced. All user-scoped entities filter by `req.user.id`. Pricing uses server-derived companyId. No client-controlled company_id for tenant data. Admin routes intentionally bypass with explicit admin check.
