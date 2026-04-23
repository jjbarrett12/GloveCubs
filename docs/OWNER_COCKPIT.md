# Owner Cockpit — schema-aligned architecture

## Admin component tree (`public/js/admin-app.js`)

Maps to: **AdminApp** → **AdminLayout** (AdminSidebar nav items, AdminTopbar, AdminPageContainer) → page modules **OverviewPage**, **CompaniesPage**, **PricingPage**, **PaymentsPage**, **InventoryPage**, **SettingsPage**, **IntegrationsPage**. Loaders in `app.js` fetch APIs and call `AdminUI.*Page.compose(...)`.

---

# Owner Cockpit — schema-aligned architecture (legacy section)

## 1. Component tree (UI)

```
.cockpit
├── .cockpit-topbar (logo, search, theme, back)
├── .cockpit-body
│   ├── aside.cockpit-sidebar
│   │   ├── Command center: Overview | Companies | Orders | Products | Pricing | Admin & approvals | Stripe | Inventory
│   │   ├── Operations: Reports | Messages | RFQs | Bulk import | Automations
│   │   ├── Future modules (disabled): Vendors | PO | AR/AP | Audit log
│   │   └── System: Settings
│   └── main.cockpit-main
│       └── #adminTabContent
│           ├── Overview → loadAdminDashboard() → GET /api/admin/owner/overview
│           ├── Companies → loadOwnerCompaniesDirectory() → GET .../companies-directory + POST create + detail (PATCH name, margin, overrides)
│           ├── Orders → loadAdminOrders() → GET /api/admin/orders
│           ├── Products → loadAdminProducts() → GET /api/products (+ existing admin tools)
│           ├── Pricing → loadOwnerPricingWorkspace() → GET .../pricing
│           ├── Admin & approvals → loadAdminUsers() → GET .../admins-users + /api/admin/users
│           ├── Stripe → loadOwnerStripeSnapshot() → GET .../stripe
│           └── Inventory → loadOwnerInventoryPanel() → GET .../inventory-panel (read-only integrity)
```

## 2. File structure

| Path | Role |
|------|------|
| `services/ownerCockpitService.js` | Aggregates & directory DTOs (Supabase admin client only) |
| `services/companiesService.js` | `createCompany`, `updateCompany` (+ name) |
| `services/usersService.js` | `listAppAdminsForCockpit()` |
| `server.js` | `requireAdmin` on all `/api/admin/owner/*`, POST/PATCH `/api/admin/companies` |
| `public/js/app.js` | Cockpit shell, loaders, `ownerCreateCompany`, `ownerPatchCompanyName`, `ownerApproveUser` |
| `public/css/styles.css` | `.cockpit-nav-disabled`, `.cockpit-truth-banner`, `.cockpit-data-table`, etc. |

## 3. Server-side data mapping

| Endpoint | Service / source |
|----------|------------------|
| `GET /api/admin/owner/overview` | `ownerCockpitService.getOverviewSnapshot()` |
| `GET /api/admin/owner/companies-directory` | `getCompaniesDirectory()` |
| `GET /api/admin/owner/pricing` | `getPricingWorkspace()` |
| `GET /api/admin/owner/stripe` | `getStripeVisibility()` |
| `GET /api/admin/owner/inventory-panel` | `getInventoryIntegrityPanel(limit)` |
| `GET /api/admin/owner/admins-users` | `usersService.listAppAdminsForCockpit()` + `getAllUsers()` (sanitized) |
| `POST /api/admin/companies` | `companiesService.createCompany` |
| `PATCH /api/admin/companies/:id` | `companiesService.updateCompany` |

Existing routes unchanged: orders, users approve, company margin/overrides, products, etc.

## 4. Joins marked unsafe or deferred

| Relationship | Treatment |
|--------------|-----------|
| `inventory.product_id` ↔ `products.id` | **Type mismatch risk (bigint vs UUID in some deployments).** Optional `.in('id', sample)` enrich only when IDs resolve; otherwise raw `product_id` only. |
| `public.stripe_customers` / `payment_methods` | **Not in GloveCubs app migrations.** UI shows N/A; Stripe signal = `orders.stripe_payment_intent_id` only. |
| `company_pricing` (dedicated table) | **Not present.** Coverage = `default_gross_margin_percent` + `customer_manufacturer_pricing` rows. |
| `order_items` → line-level margin analytics | **Out of scope** for overview; no fake line analytics in cockpit. |
| Vendors / PO / AR / Audit | **Disabled nav** unless wired later; no fake metrics on overview. |

## 5. Security

- Every new route: `authenticateToken` + `requireAdmin` (owner email or `app_admins`).
- No client-side Supabase; all via Express + service layer.
