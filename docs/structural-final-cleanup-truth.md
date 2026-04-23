# Structural final cleanup: source of truth (catalog_v2 + gc_commerce + inventory)

This document matches `supabase/migrations/20260730100000_structural_final_cleanup.sql` and the Node services that sit on top of it.

## Product catalog

| Concern | Location |
|--------|-----------|
| **Canonical read model (list/detail/search)** | `catalog_v2.v_products_legacy_shape` — used by `services/productsService.js` via `productsRead()` (all reads). |
| **Legacy-shaped compatibility** | `public.products_legacy_from_catalog_v2` selects the same rows for tools that need the `public` schema. |
| **Writes (SKU, pricing, copy, flags)** | `public.products` — `insert` / `update` / `delete` in `productsService.js`. |
| **Sync after write** | `public.catalog_v2_refresh_from_legacy_product(p_legacy_id)` RPC after updates; `public.catalog_v2_backfill_legacy_public_products()` after inserts (plus image sync to `catalog_v2.catalog_product_images`). |

So: **reads = catalog_v2 view**, **writes = public.products + explicit RPC refresh** until `public.products` is fully retired.

## Carts

| Concern | Location |
|--------|-----------|
| **Persisted cart JSON** | `gc_commerce.carts` (`cart_key`, `items`, `user_id`, `company_id`) — `services/dataService.js` `getCart` / `setCart`. |

`public.carts` is removed by the structural migration; do not reference it in new code.

## Inventory and stock history

| Concern | Location |
|--------|-----------|
| **Stock rows** | `public.inventory` and `public.stock_history` keyed by **`canonical_product_id` → `catalog_v2.catalog_products.id`**. |
| **Legacy product id for APIs** | Join `catalog_products.legacy_public_product_id` or use `dataService.getInventory()` which attaches **`product_id`** (legacy bigint) for admin/storefront maps. |
| **Bridging view** | `public.inventory_resolved` — optional `catalogos.products.id` via `live_product_id`; prefer **`canonical_product_id`** for joins. |

The migration **blocks** if any `inventory` / `stock_history` row still has `product_id` (bigint) with no matching `catalog_v2.catalog_products.legacy_public_product_id`, so rows are not silently deleted.

## Tenancy

| Concern | Location |
|--------|-----------|
| **Which company a user belongs to** | `gc_commerce.company_members` (and helpers in `companiesService`). |
| **Removed** | `public.users.company_id` — dropped by the structural migration after backfill into `company_members`. |

API responses may still expose **`company_id`** on user objects; that value is **resolved from `company_members`**, not a column on `public.users` (`usersService.rowToUser`).

## Operational checks

1. **Before first apply** on a DB that still has `inventory.product_id`: `scripts/preflight-structural-final-cleanup.sql`
2. **After apply**: `scripts/verification-structural-final-cleanup.sql`

## Deprecated artifacts

- **`APPLY_MIGRATIONS.sql`** — historical only; not aligned with `gc_commerce` carts or UUID inventory. Use `supabase/migrations/`.

## If `20260730100000_structural_final_cleanup.sql` was edited after apply

Supabase tracks migration checksums. If this file changed **after** a database already recorded it as applied, use your workflow’s repair/reconcile step (e.g. `supabase migration repair`) or treat the new **preflight `DO` block** as a one-time manual guard you run on older clones before re-running destructive steps.
