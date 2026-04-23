# Order, cart, quote, and inventory ID alignment

This document is the **authoritative ID strategy** for GloveCubs after the launch-blocking alignment between legacy `public.products` (BIGINT) and the live CatalogOS / storefront catalog (UUID).

## Problem statement

- `public.order_items.product_id` and `public.inventory.product_id` were modeled as **BIGINT**, historically aligned with `public.products.id`.
- The live B2B catalog and search surface use **UUID** master product ids:
  - `catalogos.products.id` (source of truth in CatalogOS)
  - `public.canonical_products.id` (same UUID, synced for storefront / PostgREST)
- Joining orders or inventory to `canonical_products` or `catalogos.products` on `product_id` alone is **unsafe** (type mismatch and semantic drift).

Quotes (`catalogos.quote_line_items`) already reference `catalogos.products(id)` as UUID and are **out of scope** for this BIGINT mismatch.

## Canonical sellable identity (decision)

| Layer | Canonical ID | Notes |
|-------|----------------|--------|
| **Master product (GloveCubs today)** | `catalogos.products.id` UUID | Same value as `public.canonical_products.id` after `catalogos.sync_canonical_products()`. This is the **default sellable identity** for orders, inventory, and storefront. |
| **Variant / SKU (future / catalog_v2)** | `catalog_v2.catalog_variants.id` UUID | Use when inventory and pricing are **variant-scoped** (see `catalog_v2.variant_inventory`). Not required for the current public `order_items` / `inventory` migration. |

**Rule:** New commerce rows should store the **catalog master UUID** on `canonical_product_id`. When you introduce true multi-variant selling in the storefront, add an optional `catalog_variant_id` column (FK to `catalog_v2.catalog_variants`) **in addition to** the master UUID—do not replace the master id until all readers are variant-aware.

## What we implemented (database)

Migration: `supabase/migrations/20260626100000_order_inventory_catalog_product_uuid.sql`

### `public.order_items`

| Column | Type | Purpose |
|--------|------|---------|
| `product_id` | BIGINT (retained) | **Legacy** reference to `public.products.id`. Never dropped; historical rows keep original values. |
| `canonical_product_id` | UUID (new, nullable) | **Catalog master** id = `catalogos.products.id` = `canonical_products.id`. |

- **Backfill:** `UPDATE` from `catalogos.products` where `live_product_id = order_items.product_id`.
- **FK:** `canonical_product_id` → `catalogos.products(id)` `ON DELETE RESTRICT`, `DEFERRABLE INITIALLY DEFERRED` (safe for bulk loads).
- **Index:** partial index on `canonical_product_id` where not null.

Rows that cannot be mapped (orphan legacy `product_id`) keep `canonical_product_id` NULL; use the compatibility view for analytics.

### `public.inventory`

| Column | Type | Purpose |
|--------|------|---------|
| `product_id` | BIGINT (retained) | Legacy FK to `public.products(id)`. |
| `canonical_product_id` | UUID (new, nullable) | Same semantics as order lines. |

- **Backfill:** same `live_product_id` join as order_items.
- **FK:** to `catalogos.products(id)` `ON DELETE RESTRICT`, deferrable.
- **Unique:** partial unique index on `canonical_product_id` (one inventory row per catalog product when UUID is set).

### Compatibility views (public)

- **`public.order_items_resolved`** — exposes `catalog_product_id` = `COALESCE(canonical_product_id, scalar_subquery(live_product_id))` plus legacy columns.
- **`public.inventory_resolved`** — same pattern for inventory.

Use these in SQL / BI when you need a single column to join to `canonical_products` without duplicating join logic.

### Carts (`public.carts`)

- **No DDL change** in v1 (items remain JSONB).
- **Application contract:** each cart line object SHOULD include `canonical_product_id` (UUID string) when known, alongside any legacy `product_id` (BIGINT) for backward compatibility.

### Quotes / RFQ

- **`catalogos.quote_line_items.product_id`** is already UUID → `catalogos.products(id)`.
- No migration required for quote lines.

## Application changes (reference)

- `storefront/src/lib/commerce/resolve-catalog-product-id.ts` — resolves catalog UUID from `canonical_product_id` or `live_product_id` map.
- `storefront/src/lib/jobs/handlers/dailyPriceGuard.ts` — order metrics keyed by catalog UUID (uses `canonical_product_id` + catalogos bridge).
- `storefront/src/lib/buyer-intelligence/dashboard.ts` — spend rollups use resolved UUID + `canonical_products` name lookup.

**New writes:** order creation and inventory mutation code paths should set **`canonical_product_id`** at write time (from checkout / PDP context) so analytics do not depend on the bridge map forever.

## Operational checklist

1. Apply migrations in order (includes `20260626100000_order_inventory_catalog_product_uuid.sql`).
2. Run `SELECT catalogos.sync_canonical_products();` after large publishes so `canonical_products` matches `catalogos.products`.
3. Reconcile **unmapped** rows:  
   `SELECT * FROM public.order_items WHERE canonical_product_id IS NULL;`  
   Fix data (link `catalogos.products.live_product_id`) or accept NULL for obsolete SKUs.
4. Re-run backfill only if mapping changes (the migration’s `UPDATE` is idempotent for NULL→value; already-set UUIDs are left alone).

## Historical orders (non-breaking guarantee)

- **No DELETE** of legacy columns.
- **No rewrite** of `product_id` BIGINT values.
- **Additive** UUID + views + optional application use of resolved id.
- Reporting may use `catalog_product_id` from `order_items_resolved` so old and new rows participate where mapping exists.

## Quick reference: which ID where?

| Surface | ID stored / used |
|---------|-------------------|
| **Catalog source of truth** | `catalogos.products.id` (UUID) |
| **Storefront search / public API** | `public.canonical_products.id` (same UUID) |
| **Variants (future, catalog_v2)** | `catalog_v2.catalog_variants.id` (UUID) |
| **order_items (new field)** | `canonical_product_id` → `catalogos.products.id` |
| **order_items (legacy field)** | `product_id` BIGINT → `public.products.id` |
| **inventory (new field)** | `canonical_product_id` → `catalogos.products.id` |
| **inventory (legacy field)** | `product_id` BIGINT → `public.products.id` |
| **Quote lines** | `catalogos.quote_line_items.product_id` UUID → `catalogos.products.id` |
| **Cart JSON lines** | Prefer `canonical_product_id` (UUID string) + optional legacy `product_id` |

## PostgREST / Supabase embeds

Foreign keys from `order_items.canonical_product_id` target **`catalogos.products`**, not `public.canonical_products`. Nested selects like `order_items(..., canonical_products(...))` may **not** auto-embed until a relationship exists in the API schema. Prefer:

- explicit `canonical_products` fetch by UUID list (see buyer-intelligence dashboard), or  
- SQL against `order_items_resolved` + join `canonical_products` in the database.

## Related documents

- `docs/production-hardening-checklist.md` — tests and safeguards.
- `docs/go-live-readiness.md` — launch verification.

---

*Last updated: order/inventory UUID alignment migration and service updates.*
