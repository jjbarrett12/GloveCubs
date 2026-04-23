# Database migration complete — verification

## Summary

All application routes that previously used `loadDB()`, `saveDB()`, or `db.*` have been migrated to Supabase. The JSON database layer has been fully removed from runtime code.

---

## Verification (server.js)

- **loadDB() / saveDB()**: Removed. No remaining call sites; stub definitions deleted.
- **db.***: None. No references to `db.products`, `db.users`, `db.orders`, etc.
- **fs.readFile / fs.writeFile for app data**: Only used for Fishbowl CSV export file and static `index.html`; no app DB persistence.
- **Product flows**: All product reads/writes go through `productsService` or `dataService` (inventory) and Supabase.

---

## Routes migrated in this pass

### Launch-critical
- GET/POST/PUT/DELETE `/api/cart`, DELETE `/api/cart/:id`
- POST `/api/orders`, POST `/api/orders/create-payment-intent`
- GET `/api/orders`, GET `/api/orders/:id`, POST `/api/orders/:id/reorder`, GET `/api/orders/:id/invoice`
- GET/POST/PUT/DELETE `/api/ship-to`, GET/POST/PUT/DELETE `/api/saved-lists`, POST `/api/saved-lists/:id/add-to-cart`
- GET/POST/DELETE `/api/invoices`, POST `/api/cart/bulk`
- GET/PUT `/api/account/budget`, GET `/api/account/tier-progress`, GET `/api/account/summary`, GET `/api/account/rep`

### Support / account
- POST `/api/contact`
- POST `/api/auth/forgot-password`, GET `/api/auth/reset-check`, POST `/api/auth/reset-password`

### RFQ
- POST/GET `/api/rfqs`, GET `/api/rfqs/mine`, PUT `/api/rfqs/:id`

### Admin
- GET/PUT `/api/admin/orders`, GET/POST/PUT `/api/admin/users`
- GET `/api/admin/contact-messages`
- GET `/api/admin/companies`, GET/PATCH `/api/admin/manufacturers`
- GET/PUT/POST `/api/admin/inventory`, GET `/api/admin/inventory/reorder-suggestions`, GET `/api/admin/inventory/ai-reorder-summary`, POST `/api/admin/inventory/cycle`
- GET/GET/:id/POST/PUT/POST `:id/send` `/api/admin/purchase-orders`, POST `/api/admin/orders/:id/create-po`
- GET/POST/PUT/DELETE `/api/admin/companies/:id`, default-margin, overrides

### Product / Fishbowl
- GET `/api/seo/sitemap-urls` (products from Supabase)
- POST `/api/products/update-images-csv`, GET `/api/products/export.csv`
- POST `/api/fishbowl/sync-inventory`
- GET `/api/fishbowl/export-customers`, GET `/api/fishbowl/export-customers.csv`, GET `/api/fishbowl/export-customers-file`
- `writeFishbowlCustomersExport()` (async, uses `dataService.getCustomersForFishbowlExport()`)

### Pricing
- GET `/api/pricing/effective-margin` (uses `getPricingContext()` + `getEffectiveMargin(ctx, …)`)

---

## Files modified

- **server.js**: All legacy route handlers updated to use services; `loadDB`/`saveDB` stubs removed.
- **services/dataService.js**: Added getAllOrdersAdmin, getShipToByUserId, createShipTo, updateShipTo, deleteShipTo, getSavedListsByUserId, getSavedListById, createSavedList, updateSavedList, deleteSavedList, getUploadedInvoicesByUserId, createUploadedInvoice, deleteUploadedInvoice, getRfqs, getRfqsByUserId, createRfq, updateRfq, listContactMessages, updateManufacturer, getCustomersForFishbowlExport, nextPoNumber, getOverridesByCompanyId, upsertCustomerManufacturerPricing, deleteCustomerManufacturerPricingOverride; extended upsertInventory (bin_location, last_count_at), createPasswordResetToken(userId).
- **services/usersService.js**: Added getAllUsers.
- **services/companiesService.js**: Added updateCompany.
- **supabase/migrations/20260330000003_glovecubs_legacy_columns.sql**: New migration (manufacturers vendor_email/po_email; purchase_orders po_number/sent_at; inventory bin_location/last_count_at; password_reset_tokens user_id; ship_to_addresses is_default, updated_at; uploaded_invoices user_id).

---

## Migrations to apply

Run Supabase migrations so the new columns exist:

- `20260330000003_glovecubs_legacy_columns.sql`

---

## loadDB / saveDB

**Can now be fully deleted:** Yes. They have been removed from `server.js`. No route or helper in the Express app calls them.

---

## CLI / tooling (migrated)

- **import-products.js**: Uses `importCsvToSupabase()`; no JSON. Run: `node import-products.js <file.csv> [--replace]`.
- **seed.js**: Writes directly to Supabase; no JSON. Run: `node seed.js` (NODE_ENV=development or SEED_ALLOW=1).
- **scripts/diagnose-products.mjs**: Queries Supabase; no JSON. Run: `node scripts/diagnose-products.mjs`.
- **lib/product-store.js**: `upsertProductsFromCsv` removed; `productsToCsv` kept (pure transformation).

See `docs/DATABASE_MIGRATION_FINAL.md` for commands and confirmation.

## Intentionally deferred

- **Scheduled Fishbowl export**: `setInterval(writeFishbowlCustomersExport, …)` calls the async function without awaiting; acceptable for fire-and-forget. Optional: wrap in `.catch()` for logging.

---

## How to confirm

1. Start server: `node server.js` (or `npm run dev`). It should start without reference to `loadDB`/`saveDB`/`db`.
2. Search codebase: `grep -r "loadDB\|saveDB\|db\.products\|db\.users" server.js` (excluding comments) → no matches.
3. Apply migration `20260330000003_glovecubs_legacy_columns.sql` in Supabase before using new columns (manufacturers emails, PO number/sent_at, inventory bin/count, etc.).
