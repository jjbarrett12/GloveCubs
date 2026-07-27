# Phase 1 Server-Route Authorization Notes

Defense-in-depth: RLS + route gates. Service-role clients must remain server-only.

## High-risk patterns reviewed

| Route / area | Auth before service-role? | Tenant scope | Notes |
|--------------|---------------------------|--------------|-------|
| `/api/account/shipping-addresses/*/set-default` | Yes — `resolveBuyerShippingAddressesGate` | `companyId` from session | Good |
| `/api/customer/procurement/actions` | Yes — `resolveCustomerProcurementGate` | Active company | Good |
| Admin `/admin/api/*` | Phase 0 `getAdminUser` / `admin_users` | Operator | Preserve |
| CatalogOS routes | Phase 0 fail-closed secret | Internal | Preserve |
| Express `/api/auth/forgot-password`, `reset-password` | Rate-limited; token hashed | N/A | Phase 1 hash + consume |
| `/api/invoice/intake` | Session resolved inside `runInvoiceIntake` | Company when authenticated | Residual: anonymous intake allowed by design — rows without company stay customer-inaccessible under RLS |
| Admin procurement by `company_id` query | Admin gate required | Operator chooses company | Must not be exposed to customer JWT |

## Residual risks

- Distinct 404 vs 403 may leak existence on some admin paths — acceptable for operators; avoid for customer IDOR.
- Full JWT matrix against live DB is **UNVERIFIED** until staging fixtures run (`scripts/sql/tenant-isolation-policy-tests.sql`).
