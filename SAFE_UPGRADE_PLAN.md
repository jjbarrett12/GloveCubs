# GloveCubs Safe Upgrade Plan

**Scope:** B2B organizations + roles, product variants, tiered pricing, UOM, inventory availability, admin-only protection.  
**Constraint:** Additive only. No renames, no destructive changes, no sweeping refactors. Feature flags where needed.

---

## Codebase clarification

**This workspace is currently Node.js (Express) + JSON file store (`database.json`), not Next.js + Supabase.** There are no Supabase tables, no RLS, and no App Router in this repo.

The following **Phase 0** describes the *actual* current state of this codebase. The **Phase 1** plan is the blueprint for a **Next.js (App Router) + Supabase** codebase—either an existing one in another repo, or the target after a future migration. When you have (or create) that stack, use this plan there. **No code is generated in this document;** implementation (Phase 2) would happen only after the plan is approved and applied in the correct repo.

---

# PHASE 0 — CURRENT STATE REPORT (this repo)

## 1) Project structure

| Layer | Location | Notes |
|-------|----------|--------|
| **Routes** | `server.js` (Express) | All API routes in one file; SPA served from `public/`. |
| **Key components** | `public/index.html` + `public/js/app.js` | Single HTML shell; all UI is JS-rendered (SPA). No React/Next components. |
| **Data access** | `server.js` `loadDB()` / `saveDB()` + `lib/product-store.js` | Read/write to `database.json`; product-store used for CSV import/export and product shape. |
| **Auth** | `server.js`: JWT in `Authorization: Bearer`, `authenticateToken`, `optionalAuth` | Login/register; `req.user` = `{ id, email, company, approved }`. No Supabase Auth. |
| **Checkout / payment** | `server.js` `POST /api/orders` | No payment gateway; order created from cart, net terms / invoice. |
| **Admin** | Same `server.js`; admin = any user with `is_approved` | No separate super_admin; admin routes check `user.is_approved`. |

**Routes list (concise):**

- **Static:** `GET *` → `public/*` (index.html for SPA).
- **Auth:** `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/forgot-password`, `GET /api/auth/reset-check`, `POST /api/auth/reset-password`.
- **Contact:** `POST /api/contact`.
- **Products:** `GET /api/products`, `GET /api/products/:id`, `GET /api/products/by-slug`, `GET /api/products/export.csv`, `POST /api/products/import-csv`, `POST /api/products/update-images-csv`, `POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id`, `POST /api/products/batch-delete`.
- **SEO:** `GET /api/seo/industries`, `GET /api/seo/industry/:slug`.
- **Categories/Brands:** `GET /api/categories`, `GET /api/brands`.
- **Fishbowl:** `GET /api/fishbowl/status`, `POST /api/fishbowl/sync-inventory`, `GET /api/fishbowl/export-customers`, `GET /api/fishbowl/export-customers.csv`, `GET /api/fishbowl/export-customers-file`.
- **Cart:** `GET /api/cart`, `POST /api/cart`, `PUT /api/cart/:id`, `DELETE /api/cart/:id`, `DELETE /api/cart`, `POST /api/cart/bulk`.
- **Orders:** `POST /api/orders`, `GET /api/orders`, `GET /api/orders/:id`, `POST /api/orders/:id/reorder`, `GET /api/orders/:id/invoice`.
- **Account:** `GET /api/account/tier-progress`, `GET /api/account/budget`, `PUT /api/account/budget`, `GET /api/account/rep`.
- **Ship-to:** `GET /api/ship-to`, `POST /api/ship-to`, `PUT /api/ship-to/:id`, `DELETE /api/ship-to/:id`.
- **Saved lists:** `GET /api/saved-lists`, `POST /api/saved-lists`, `PUT /api/saved-lists/:id`, `DELETE /api/saved-lists/:id`, `POST /api/saved-lists/:id/add-to-cart`.
- **Invoices:** `GET /api/invoices`, `POST /api/invoices`, `DELETE /api/invoices/:id`.
- **RFQs:** `POST /api/rfqs`, `GET /api/rfqs/mine`, `GET /api/rfqs`, `PUT /api/rfqs/:id`.
- **Admin:** `GET /api/admin/orders`, `PUT /api/admin/orders/:id`, `GET /api/admin/users`, `PUT /api/admin/users/:id`, `GET /api/admin/contact-messages`.
- **Templates:** `GET /products-template.csv`.

---

## 2) “Schema” (current data model — JSON, not Supabase)

Stored in **`database.json`** as a single JSON object. No RLS (file-based).

| Top-level key | Purpose |
|---------------|---------|
| `users` | B2B users: id, company_name, email, password (bcrypt), contact_name, phone, address, city, state, zip, is_approved, discount_tier, created_at, budget_*, rep_*. |
| `products` | Catalog: id, sku, name, brand, category, subcategory, description, material, sizes (string), color, pack_qty, case_qty, price, bulk_price, image_url, in_stock, featured, powder, thickness, grade, useCase, certifications, texture, cuffStyle, sterility, industry (optional). |
| `orders` | Order header + items[]: user_id, order_number, status, subtotal, discount, shipping, tax, total, shipping_address, ship_to_id, notes, items[], tracking_*, created_at. |
| `carts` | Keyed by `user_<id>` or `session_<x-session-id>`. Value = array of `{ id, product_id, size, quantity }`. |
| `rfqs` | RFQ submissions. |
| `saved_lists` | User saved lists. |
| `ship_to_addresses` | User ship-to addresses. |
| `contact_messages` | Contact form submissions. |
| `password_reset_tokens` | For reset flow. |
| `uploaded_invoices` | User uploads. |

**Relationships (logical):**

- Cart item → product by `product_id` (product.id).
- Order → user by `user_id`; order.items[].product_id → products.
- Ship-to, saved lists, invoices → user_id.

**Product assumptions in code:**

- One row per product; one `sku` per product.
- `sizes` is a string (e.g. `"S M L XL"`); size selection is stored on cart line (`item.size`); variant SKU is computed as `product.sku + "-" + size`.
- Price: `product.price` (retail), `product.bulk_price` (B2B); tier discount applied at order time (bronze/silver/gold/platinum % off).

---

## 3) Where product, price, inventory, cart, order live and how they’re used

| Data | Where it lives | Read | Write |
|------|----------------|------|--------|
| **Products** | `db.products` | `GET /api/products`, `GET /api/products/:id`, `GET /api/products/by-slug`; cart/order enrichment from `db.products.find(p => p.id === item.product_id)`. | `POST/PUT/DELETE /api/products*`, CSV import, Fishbowl sync (in_stock, quantity_on_hand). |
| **Price** | `product.price`, `product.bulk_price` | Product list/detail; cart enrichment; order creation uses `product.price` or `product.bulk_price` + tier % off. | Set on product create/update/import. |
| **Inventory** | `product.in_stock` (0/1), optional `quantity_on_hand` | Display; Fishbowl sync writes these. | Fishbowl sync, product update/import. |
| **Cart** | `db.carts[cartKey]` | `GET /api/cart` (enriched with product name, price, sku, variant_sku). | `POST /api/cart`, `PUT /api/cart/:id`, `DELETE /api/cart/*`, `POST /api/cart/bulk`. |
| **Orders** | `db.orders` | `GET /api/orders`, `GET /api/orders/:id`, admin `GET /api/admin/orders`. | `POST /api/orders` (from cart; computes prices with tier). |

---

## 4) UI assumptions (risks if we add variants/orgs/tiers in a new stack)

- **Product has a single SKU:** Detail page and cart use `product.sku`; variant SKU is derived as `sku + "-" + size`. Adding real variant rows would require a “default” variant per product and fallback so existing product-by-id/slug still works.
- **Price is on the product:** UI expects `product.price` and `product.bulk_price`. Any move to tier/org-specific pricing must keep these as fallback or the UI breaks.
- **No org concept:** Checkout and account are user-scoped. Adding B2B orgs must not break user-only checkout (e.g. optional org_id, resolve price with user then org).
- **Cart line = product_id + size + quantity:** No variant_id or UOM. Adding variant_id/UOM should be additive (optional fields) so existing cart still valid.
- **Admin = any approved user:** There is no super_admin; tightening to “admin-only” areas in a new stack should be a separate role (e.g. super_admin) and guarded server-side.
- **No UOM in cart/order:** Quantities are numeric; pack/case implied by product (pack_qty, case_qty) but not selected at add-to-cart. Adding UOM is additive (e.g. uom column defaulting to “each” or “pack”).
- **Inventory:** Only `in_stock` (and optionally quantity_on_hand). No allocated/backorderable; adding those is additive with a “when missing treat as orderable” rule.

---

## 5) Risks summary (what would break if we add variants/orgs/tiers without care)

- **Single-SKU assumption:** Product detail and cart assume one SKU per product. Adding variant rows without a default variant and fallback would break product page and cart resolution.
- **Price on product:** Moving price to a separate table without keeping product.price (or equivalent) as fallback would break listing, cart, and checkout.
- **Cart shape:** Changing cart to require variant_id or UOM without defaulting would break existing carts and checkout.
- **Admin definition:** If “admin” is tightened to a new role (e.g. super_admin), existing approved users would lose admin access unless migrated.
- **Auth/database change:** This repo uses file-based auth and JSON; any move to Supabase will require a separate migration of users/products/orders and new auth (e.g. Supabase Auth). Not in scope of “additive only” within this repo.

---

# PHASE 1 — GAP ANALYSIS + PLAN (for Next.js + Supabase codebase)

Apply this when working in (or after migrating to) a **Next.js (App Router) + Supabase** codebase.

---

## A) Minimal safe additions (tables/columns/functions/pages)

**New tables only (no renames, no drops):**

- **Organizations:** e.g. `organizations` (id, name, slug, created_at, …). Optional; link users via `profiles.org_id` (nullable).
- **Org roles:** e.g. `org_members` or `organization_members` (org_id, user_id, role: member/admin). Enables B2B roles per org.
- **Product variants:** e.g. `product_variants` (id, product_id, sku, size, color, thickness, grade, price_override nullable, is_default boolean). One default variant per product for backward compatibility.
- **Tiered pricing:** e.g. `price_tiers` (id, name, discount_percent or list of tier levels). Optional: `variant_prices` or `product_prices` (variant_id or product_id, tier_id, price) for explicit tier prices.
- **Org overrides:** e.g. `org_product_prices` (org_id, variant_id or product_id, price, optional effective_from/to). For org-specific overrides.
- **UOM:** e.g. `uom` (id, code, label — e.g. each, pack, case, pallet). Optional: `product_uom` or variant-level (e.g. variant has pack_qty, case_qty) or a `product_uom` table linking product/variant to uom and conversion.
- **Inventory:** e.g. `inventory` (variant_id or product_id, quantity_available, quantity_allocated, backorderable boolean). If no row, treat as “unknown but orderable” (configurable).

**New columns (additive on existing tables):**

- **Products:** `default_variant_id` (nullable FK to product_variants). Backfill: create one variant per product, set as default, set this column.
- **Profiles (or users):** `org_id` (nullable), optionally `role` or rely on org_members. Keep existing auth and “user-only” checkout working.
- **Cart line item:** `variant_id` (nullable), `uom_id` (nullable). Keep product_id + quantity; when variant_id null, resolve from product default variant.
- **Order line item:** same optional variant_id, uom_id for new orders; existing orders unchanged.

**New server-side only:**

- **Pricing resolver:** `getUnitPrice({ userId, orgId?, variantId, productId?, uomId?, qty })` — precedence: org override → tier list → retail/variant price → legacy product.price. Used at cart/checkout; do not remove product.price until all call sites use resolver.
- **Admin guard:** Server-side check for super_admin (e.g. JWT claim or `profiles.role = 'super_admin'` or service role). New admin-only routes/pages use this; do not tighten existing “approved user” behavior without a flag and migration.

**New pages (additive):**

- Admin area routes (e.g. `/admin/*`) protected by server-side admin guard. Existing admin behavior (if any) can stay behind a feature flag or coexist until cutover.

---

## B) Compatibility strategy

- **Single-SKU → variants:**  
  - Add `product_variants` with one default variant per product; set `products.default_variant_id`.  
  - Existing product detail page: keep loading by product id/slug; display and add-to-cart use default variant when `variant_id` not in URL.  
  - Existing queries that return “product” keep returning the same shape; optionally extend with `default_variant` when flag on.  
  - Cart: keep accepting product_id + size; server resolves size to variant_id when present; otherwise uses default variant.

- **Price on product → tiered pricing:**  
  - Keep `product.price` (and variant.price_override if present) as fallback.  
  - Resolver order: org override → tier price for user’s tier → variant/product retail → product.price.  
  - All existing flows keep working by using product.price when no tier/org override exists.

- **No org → B2B orgs:**  
  - `org_id` nullable on user/profile.  
  - Checkout and pricing: if user has org_id and B2B_ORGS_ENABLED, pass org_id into pricing resolver and org overrides apply; otherwise same as today (user-only).  
  - No change to anonymous or non-org users.

- **Cart/order lines:**  
  - Add optional variant_id, uom_id. Existing lines without them: resolve variant from product default; treat uom as “each” or single default UOM.  
  - No migration that deletes or renames existing columns.

---

## C) Migration strategy

- **Additive SQL only:** New migrations (timestamped) that only `CREATE TABLE`, `ADD COLUMN`, `CREATE INDEX`, `CREATE POLICY` (on new tables). No `DROP`, no `RENAME` of existing tables/columns.
- **Rollback:** Each migration has a corresponding down migration that drops only what that migration added (new policies, new columns, new tables). Do not alter existing RLS on existing tables in the same migration as new features; if tightening is required, do it in a separate, optional migration with clear impact notes.
- **Data backfill:** When adding default variants, run a one-off that creates one variant per product and sets `default_variant_id`. No deletion of existing product rows or columns.
- **Feature flags:** All new behavior gated by flags (see D). Default flags OFF so current behavior is unchanged until enabled.

---

## D) Feature flags

| Flag | Default | What it gates |
|------|--------|----------------|
| **VARIANTS_ENABLED** | OFF | When ON: product detail can show variant selector; cart/order can store variant_id; API can return variant-level data. When OFF: everything uses product + default variant only (or single-SKU behavior). |
| **B2B_ORGS_ENABLED** | OFF | When ON: org_id used in pricing and checkout; org overrides and org_members apply. When OFF: no org_id in pricing; user-only. |
| **TIER_PRICING_ENABLED** | OFF | When ON: pricing resolver uses tier tables and org overrides. When OFF: resolver uses only product/variant price (current behavior). |
| **INVENTORY_ENABLED** | OFF | When ON: inventory table used; display available/allocated/backorderable when present. When OFF: no inventory checks; treat as “unknown but orderable” or use existing in_stock only if already in schema. |

If the target Next.js + Supabase app already has variants or orgs or tier pricing, set the corresponding flag to ON only after the compatibility layer (default variant, resolver fallback) is in place and tested.

---

# PHASE 2 — IMPLEMENTATION (only after plan is approved)

To be executed in the **Next.js + Supabase** codebase, in small steps:

1. **Migrations:** Add new tables/columns via timestamped Supabase migration files; extend existing tables only (no renames/drops). Include rollback (down) steps.
2. **RLS:** Add policies only on new tables initially. Do not tighten existing table policies unless necessary; then do it in a separate change with ADMIN_ONLY or flag and document impact.
3. **Pricing resolver:** Implement server-side `getUnitPrice({ userId, orgId?, variantId, productId?, uomId?, qty })` with precedence: org override → tier → retail/variant → product.price. Use in cart/checkout; keep product.price as fallback.
4. **Variants:** Add `product_variants` and `default_variant_id`; backfill one default variant per product. Ensure product detail page still works with default variant when VARIANTS_ENABLED is OFF.
5. **Inventory:** Add inventory availability with “no row = orderable” (configurable). Use only when INVENTORY_ENABLED is ON.
6. **Admin guard:** Add server-side check for super_admin (or service role) for admin-only routes; do not rely on client-only checks.

**Smoke test checklist (before/after each step):**

- [ ] Can browse products (list + detail).
- [ ] Can add to cart.
- [ ] Can checkout (logged-in user).
- [ ] Existing users can log in.
- [ ] Admin-only areas return 403 for non-admin when guard is applied.

After each step, list exactly which files changed. If any step risks breaking checkout or auth, stop and propose an alternative (e.g. behind a feature flag or optional path).

---

**END OF PLAN — NO CODE GENERATED. Implementation (Phase 2) only after this plan is applied in the correct Next.js + Supabase codebase.**
