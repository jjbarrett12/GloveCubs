# Database Refactor: Supabase as Single Source of Truth

## Summary

GloveCubs is being migrated from `database.json` (file-based) to **Supabase** as the only persistent data store. This document describes what was done and what remains.

## Completed

### 1. Startup validation
- Server **requires** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. If either is missing, the server throws at startup with a clear error.

### 2. Schema (Supabase migrations)
- **`20260330000001_glovecubs_public_users_and_products.sql`**
  - `public.products`: added `slug`, `price`, `bulk_price`, `in_stock`, `featured`, `use_case`, `certifications`, `texture`, `cuff_style`, `sterility`, `video_url`, `industry_tags`.
  - `public.users`: new table (email, password_hash, company_name, company_id, contact_name, phone, address, city, state, zip, is_approved, discount_tier, budget_*, rep_*, cases_or_pallets, allow_free_upgrades, payment_terms).
  - `public.app_admins`: new table (user_id, email).
  - Seed: demo user `demo@company.com` / `demo123` if not present.
- **`20260330000002_glovecubs_orders_carts_inventory.sql`**
  - `public.orders`, `public.order_items`, `public.carts`, `public.inventory`, `public.purchase_orders`, `public.rfqs`, `public.saved_lists`, `public.ship_to_addresses`, `public.contact_messages`, `public.password_reset_tokens`, `public.uploaded_invoices`.

### 3. Service layer
- **`services/productsService.js`**: `getProducts`, `getProductById`, `getProductBySlug`, `getProductsForIndustry`, `createProduct`, `updateProduct`, `deleteProduct`, `deleteProductsByIds`, `getCategories`, `getBrands`. All use Supabase.
- **`services/usersService.js`**: `getUserByEmail`, `getUserById`, `createUser`, `updateUser`, `isAdmin`. All use Supabase.
- **`services/companiesService.js`**: `getCompanies`, `getCompanyById`, `getCompanyIdForUser`, `getCustomerManufacturerPricing`. All use Supabase.
- **`services/dataService.js`**: orders, carts, inventory, manufacturers, purchase orders, contact messages, password reset tokens. All use Supabase.

### 4. Product routes (read and write)
- **GET /api/products** – uses `productsService.getProducts()` with filters and pagination; inventory and pricing from Supabase.
- **GET /api/products/:id** – uses `productsService.getProductById()`.
- **GET /api/products/by-slug** – uses `productsService.getProductBySlug()`.
- **GET /api/seo/industry/:slug** – uses `productsService.getProductsForIndustry()`.
- **GET /api/seo/sitemap-urls** – uses `productsService.getProducts()`.
- **POST /api/products** – uses `productsService.createProduct()`.
- **PUT /api/products/:id** – uses `productsService.updateProduct()`.
- **DELETE /api/products/:id** – uses `productsService.deleteProduct()`.
- **POST /api/products/batch-delete** – uses `productsService.deleteProductsByIds()`.
- **GET /api/categories**, **GET /api/brands** – use `productsService.getCategories()` and `getBrands()`.
- **POST /api/products/import-csv** – uses `importCsvToSupabase()` and `usersService.getUserById()` (no JSON).

### 5. Auth and admin
- **POST /api/auth/register** – uses `usersService.createUser()`.
- **POST /api/auth/login** – uses `usersService.getUserByEmail()`, `usersService.updateUser()` for demo hash fix.
- **GET /api/auth/me** – uses `usersService.getUserById()`.
- **requireAdmin** – uses `usersService.getUserById()` and `usersService.isAdmin()`.

### 6. Removed
- **`loadDB()`** and **`saveDB()`** – fully removed from server.js and CLI. No stubs.
- **`database.json`** – deleted. No code reads or writes it. Listed in .gitignore.

### 7. CLI / tooling migrated to Supabase
- **import-products.js** – uses `importCsvToSupabase()`; no JSON.
- **seed.js** – writes to Supabase; no JSON.
- **scripts/diagnose-products.mjs** – queries Supabase; no JSON.
- **lib/product-store.js** – `upsertProductsFromCsv` removed; `productsToCsv` kept.

See `docs/DATABASE_MIGRATION_FINAL.md` for import/seed/diagnostic commands.

## Migrations to run

1. Apply Supabase migrations in order:
   - `20260330000001_glovecubs_public_users_and_products.sql`
   - `20260330000002_glovecubs_orders_carts_inventory.sql`
2. Ensure existing tables (`products`, `companies`, `company_members`, `manufacturers`, `customer_manufacturer_pricing`) are present from earlier migrations.
3. (Optional) Backfill `public.products` from current catalog (e.g. from CatalogOS or existing seed). Seed demo user is inserted by the first migration if missing.

## Verification

1. **Product import → storefront**: Run a product import (CSV or admin save), then call GET /api/products or hit the storefront; products should appear from Supabase.
2. **Admin product edit**: Edit a product in admin; GET /api/products/:id should return updated data.
3. **Product by slug**: GET /api/products/by-slug?slug=... should return the correct item.
4. **Product list**: GET /api/products with pagination and filters should return Supabase-backed data.
5. **Login**: POST /api/auth/login with demo@company.com / demo123 (and any user in `public.users`) should succeed; GET /api/auth/me should return the user from Supabase.

## Confirmation

- **JSON database layer**: Fully removed. No loadDB, saveDB, or database.json anywhere. All data in Supabase.
- **Supabase as single source of truth**: All reads and writes go through the service layer to Supabase. CLI (import, seed, diagnose) uses Supabase. No JSON persistence anywhere.
