# Auth and Authorization Hardening Audit

**Date:** 2025-03-02  
**Status:** Production-safe after fixes

---

## 1. Auth/Permission Audit Summary

### Authentication
- **JWT** via `Authorization: Bearer <token>`
- **authenticateToken** middleware: 401 if no token, 401/403 if invalid/expired
- **optionalAuth** middleware: sets `req.user` if valid token, else continues without
- **Login** (`POST /api/auth/login`): Returns JWT with `{ id, email, company, approved }`
- **Register** (`POST /api/auth/register`): Creates user with `is_approved: 0`; no auto-admin

### Admin Authorization
- **usersService.isAdmin(userIdOrEmail)**: Checks `app_admins` table (user_id or email)
- **requireAdmin** middleware: Requires `isAdmin(req.user.id) || isAdmin(req.user.email)` — **fixed**: no longer allows `is_approved` users
- **Explicit isAdmin checks** on routes that don't use requireAdmin: product CRUD, import, export, fishbowl, admin orders/users/contact-messages

### Previous Vulnerability (FIXED)
- **requireAdmin** previously allowed access if `user.is_approved` OR `isAllowlisted`. Any approved B2B customer could access admin routes.
- **Product routes** (import, export, CRUD, fishbowl sync) used `is_approved` instead of `isAdmin`. Any approved customer could modify products.

---

## 2. Route Access Matrix

| Route | Access | Enforcement |
|-------|--------|-------------|
| `POST /api/auth/register` | Public | authContactLimiter |
| `POST /api/auth/login` | Public | authContactLimiter |
| `GET /api/auth/me` | Authenticated | authenticateToken |
| `POST /api/contact` | Public | authContactLimiter |
| `POST /api/auth/forgot-password` | Public | authContactLimiter |
| `GET /api/auth/reset-check` | Public | token in query |
| `POST /api/auth/reset-password` | Public | authContactLimiter |
| `GET /api/config` | Public | — |
| `GET /api/products` | Public (optionalAuth) | — |
| `GET /api/products/:id` | Public (optionalAuth) | — |
| `GET /api/products/by-slug` | Public (optionalAuth) | — |
| `GET /api/seo/*` | Public | — |
| `GET /api/categories`, `GET /api/brands` | Public | — |
| `GET /api/cart`, `POST /api/cart`, etc. | Public (optionalAuth) | cart key = user_id or session_id |
| `POST /api/rfqs` | Public | apiLimiter (lead form) |
| `GET /api/admin/supabase/health` | Public | Minimal payload in production |
| `POST /api/products/import-csv` | Admin | isAdmin |
| `POST /api/products/update-images-csv` | Admin | isAdmin |
| `GET /api/products/export.csv` | Admin | isAdmin |
| `POST /api/products`, PUT, DELETE, batch-delete | Admin | isAdmin |
| `POST /api/fishbowl/sync-inventory` | Admin | isAdmin |
| `GET /api/fishbowl/export-customers*` | Admin | isAdmin |
| `GET /api/fishbowl/export-customers-file` | Admin or secret | isAdmin or ?secret=FISHBOWL_EXPORT_SECRET |
| `POST /api/orders`, `POST /api/orders/create-payment-intent` | Authenticated | authenticateToken |
| `GET /api/orders`, `GET /api/orders/:id`, etc. | Authenticated | authenticateToken + user_id filter |
| `GET /api/account/*`, ship-to, saved-lists, invoices | Authenticated | authenticateToken + user_id |
| `GET /api/rfqs/mine` | Authenticated | authenticateToken |
| `GET /api/rfqs`, `PUT /api/rfqs/:id` | Admin | isAdmin |
| `GET/POST/PUT /api/admin/*` | Admin | requireAdmin or explicit isAdmin |
| `POST /api/webhooks/stripe` | Webhook | Stripe signature |
| `POST /api/internal/import/run` | Internal | INTERNAL_CRON_SECRET |

### Missing or Weak Enforcement
- **None** after fixes. All admin routes use `isAdmin`; all user-scoped routes filter by `req.user.id`.

---

## 3. Vulnerabilities Found and Fixed

| # | Vulnerability | Severity | Fix |
|---|---------------|----------|-----|
| 1 | requireAdmin allowed any `is_approved` user (not in app_admins) | **Critical** | requireAdmin now requires `isAdmin` only |
| 2 | Product import/export/CRUD used `is_approved` instead of `isAdmin` | **Critical** | All use `usersService.isAdmin(req.user.id)` |
| 3 | Fishbowl sync used `is_approved` | **Critical** | Now uses `isAdmin` |
| 4 | JWT_SECRET default in production | **High** | Server throws if NODE_ENV=production and JWT_SECRET unset or default |
| 5 | Health endpoint leaked env path in production | **Low** | Returns minimal payload when NODE_ENV=production |

---

## 4. Tenant Isolation

- **Orders**: `getOrderById(orderId, userId)` and `getOrdersByUserId(userId)` filter by `user_id`. User A cannot read User B's orders.
- **Ship-to addresses**: All CRUD filters by `user_id`.
- **Saved lists**: All CRUD filters by `user_id`.
- **Uploaded invoices**: All CRUD filters by `user_id`.
- **RFQs (mine)**: `getRfqsByUserId(req.user.id)`.
- **Carts**: `cart_key` = `user_${req.user.id}` or `session_${sessionId}`. User-scoped.
- **Pricing**: Uses `companyId` from `getCompanyIdForUser(user)`; company-level overrides. No cross-company data exposure in order flow (orders are user-scoped).

---

## 5. Secrets and Session Config

- **JWT_SECRET**: Required in production; rejects default. Crashes at startup if unsafe.
- **SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY**: Required; crash if missing.
- **INTERNAL_CRON_SECRET**: Required for `POST /api/internal/import/run`; returns 503 if not set.
- **FISHBOWL_EXPORT_SECRET**: Optional; allows ?secret= for file download without JWT.
- **Health endpoint**: In production, returns `{ ok, error? }` only; no env paths or config hints.

---

## 6. Files Changed

| File | Change |
|------|--------|
| `server.js` | requireAdmin: isAdmin only; product/fishbowl routes: isAdmin; JWT_SECRET production guard; health endpoint minimal in prod |
| `tests/auth.test.js` | New: JWT guard, isAdmin vs is_approved, tenant isolation |
| `docs/AUTH_HARDENING_AUDIT.md` | New: this document |

---

## 7. Tests Added

- `tests/auth.test.js`:
  - JWT_SECRET production guard logic
  - isAdmin vs is_approved (approved non-admin must not be admin)
  - Tenant isolation: dataService uses user_id for orders, ship-to, saved-lists, invoices

Run: `npm run test:auth` or `npm run test`

---

## 8. Verdict

**Production-safe** after the applied fixes. Admin access is explicitly granted via `app_admins` only. No approved-user fallback. Tenant isolation enforced server-side. JWT_SECRET must be set in production.
