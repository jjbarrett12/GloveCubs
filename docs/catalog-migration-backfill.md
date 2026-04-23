# Catalog migration: `public.products` → `catalog_v2` (backfill & compatibility)

This guide covers **moving data** from the legacy `public.products` table into the additive `catalog_v2` model, **reading** through a compatibility view, and **deprecating** columns over time—without dropping `public.products` yet.

Related: [catalog-schema-v2.md](./catalog-schema-v2.md) (table roles and data flow).

---

## 1. What was delivered

| Artifact | Purpose |
|----------|---------|
| `supabase/migrations/20260331100002_catalog_v2_legacy_migration_prereqs.sql` | Unique index on `legacy_public_product_id`, seed `legacy_glove` product type, synthetic supplier `glovecubs-legacy-catalog`, attribute definitions. |
| `supabase/migrations/20260331100003_catalog_v2_backfill_public_products.sql` | `catalog_v2.backfill_legacy_public_products()` — idempotent PL/pgSQL backfill. |
| `supabase/migrations/20260331100004_catalog_v2_legacy_compat_views.sql` | `catalog_v2.v_products_legacy_shape` + `public.products_legacy_from_catalog_v2` (legacy row shape). |
| `supabase/scripts/run_catalog_v2_legacy_backfill.sql` | One-liner to run the backfill in SQL Editor / `psql`. |
| `services/productsService.js` | **Reads** use `catalog_v2.v_products_legacy_shape` always; **writes** stay on `public.products` with RPC sync (`catalog_v2_refresh_from_legacy_product` / backfill). (`PRODUCTS_READ_SOURCE` env toggle is legacy; do not rely on it for new work.) |

---

## 2. Backfill steps (order)

1. Apply base catalog v2 schema: `20260331100001_catalog_v2_additive_schema.sql` (if not already).
2. Apply prereqs: `20260331100002_catalog_v2_legacy_migration_prereqs.sql`.
3. Apply backfill **function** migration: `20260331100003_catalog_v2_backfill_public_products.sql` (defines function only; does **not** auto-run).
4. **Run backfill** (any time, repeatable):
   ```sql
   SELECT catalog_v2.backfill_legacy_public_products();
   ```
   Or: `supabase/scripts/run_catalog_v2_legacy_backfill.sql`
5. Apply compat views: `20260331100004_catalog_v2_legacy_compat_views.sql`.
6. **Supabase**: expose `public.products_legacy_from_catalog_v2` to the API (same as other views/tables used by the service role).
7. **Optional read cutover**: set `PRODUCTS_READ_SOURCE=catalog_v2_compat` on the Node server and restart.

**Idempotency**

- Any `public.products` row that already has `catalog_v2.catalog_products.legacy_public_product_id = products.id` is **skipped**.
- Re-running only picks up **new** legacy rows (or a DB that was partially migrated).
- `supplier_products` inserts use `NOT EXISTS` on `(supplier_id, external_id)`.
- `supplier_offers` for migration uses `NOT EXISTS` on `metadata->>'migration_source' = 'legacy_public_products'`.
- `catalog_variant_attribute_values` uses `ON CONFLICT DO NOTHING`.
- `variant_inventory` uses `ON CONFLICT DO UPDATE` (re-run refreshes quantities from `public.inventory` for the first variant).

---

## 3. Data assumptions

| Topic | Assumption |
|-------|------------|
| **Parent / variant** | One `catalog_products` row per `public.products` row. Variants come from splitting `products.sizes` on commas. If `sizes` is null/blank, a **single** variant is created (no size suffix on SKU). |
| **SKUs** | Base SKU = `products.sku` or `P-{id}`. Variant SKU = `{base}-{normalized_size}`; collisions get `-L{id}` suffix. |
| **Slug** | `products.slug` or `legacy-{id}`; if slug collides with another v2 product, `-{id}` is appended. |
| **Cost / retail** | `supplier_offers.unit_cost` = `products.cost` when cost &gt; 0. Retail and bulk are stored in offer `metadata` and in `catalog_products.metadata` (`legacy_retail_price`, `legacy_bulk_price`) for the compat view. |
| **Company / B2B pricing** | `customer_manufacturer_pricing` (and similar) is **unchanged**. It keys off `company_id` + `manufacturer_id`; `catalog_products.manufacturer_id` is copied from legacy for continuity. |
| **Inventory** | `public.inventory.quantity_on_hand` is **product-level**. The backfill assigns **100% of QOH to the first variant only** (`sort_order = 1`); other variants get `0`. This avoids double-counting. **Manual split** may be required for accurate per-size stock. |
| **Images** | `image_url` + `images[]` → `catalog_product_images` (not duplicated per variant). |
| **Glove attributes** | Columns like `material`, `color`, `thickness`, … are copied into `catalog_variant_attribute_values` for **each** variant (filter parity with old flat row). Full JSON snapshot remains in `catalog_products.metadata` → `legacy_attributes_snapshot`. |
| **Synthetic supplier** | All legacy offers use `catalogos.suppliers` slug `glovecubs-legacy-catalog` (UUID fixed in prereqs migration). |
| **catalogos prerequisites** | FKs require `catalogos.suppliers`, `catalogos.brands` (optional null), `catalogos.import_batches` (optional null on supplier_products). |

---

## 4. Compatibility layer

### SQL

- **`catalog_v2.v_products_legacy_shape`** — core view (one row per migrated legacy `id`).
- **`public.products_legacy_from_catalog_v2`** — thin wrapper for PostgREST / Supabase client access.

Column names align with what `services/productsService.js` expects from `select('*')` on `products` (including `attributes`, `images`, `use_case`, etc.).

### Service layer

- **Reads** go through **`catalog_v2.v_products_legacy_shape`** in code (`productsRead()` in `services/productsService.js`).
- **Writes** (`insert` / `update` / `delete` / batch delete) target **`public.products`**, then call **`catalog_v2_backfill_legacy_public_products`** / **`catalog_v2_refresh_from_legacy_product`** so the read view stays aligned.

**Important:** If sync RPCs fail, catalog reads can drift from `public.products` until the failure is fixed and refresh/backfill is re-run.

See also: [structural-final-cleanup-truth.md](./structural-final-cleanup-truth.md) for carts, inventory UUIDs, and tenancy.

---

## 5. Fields to treat as deprecated on `public.products` (long term)

These columns become **derived** or **owned** elsewhere once the app reads from `catalog_v2` end-to-end. Do **not** drop columns until all readers/writers are cut over.

| Legacy column | Replacement / owner (target state) |
|---------------|-------------------------------------|
| `sizes` | `catalog_variants` + `size` attribute values |
| `material`, `color`, `thickness`, `powder`, `grade`, `category`, `subcategory` | `catalog_variant_attribute_values` (+ definitions); marketing copy may stay on `catalog_products` |
| `cost` | `supplier_offers.unit_cost` (per supplier product / variant path) |
| `price`, `bulk_price` | List/strike prices on publish layer or offer metadata; B2B still uses margins on `customer_manufacturer_pricing` where applicable |
| `image_url`, `images` | `catalog_product_images` / `catalog_variant_images` |
| `in_stock` | `catalog_publish_state` + `variant_inventory` (conceptually split) |
| `attributes` JSONB | Normalized attributes + residual `metadata` on product/variant |
| `pack_qty`, `case_qty` | Attributes or variant metadata |

**Keep longer:** `id` (FK from `orders`, `order_items`, `inventory`, etc.), `sku` (until order lines store variant UUIDs), `slug`, `name`, `manufacturer_id` during transition.

---

## 6. Manual cleanup after backfill

- **Per-size inventory**: Redistribute `variant_inventory.quantity_on_hand` if the business needs accurate size-level stock.
- **Duplicate slugs / SKUs**: Rare; backfill adjusts slug and variant SKU; verify admin catalog for odd `-L{id}` suffixes.
- **Products without `cost`**: No `supplier_offers` row is created; compat view still shows `price` from metadata if present.
- **`legacy_glove` type conflict**: If a row with `code = 'legacy_glove'` already existed with a **different** UUID, attribute-definition inserts may fail. Resolve by aligning type IDs or removing the conflicting row before prereqs (only in empty/dev DBs).

---

## 7. Risk areas

| Risk | Mitigation |
|------|------------|
| **Stale compat reads** | Compat view only includes rows with `legacy_public_product_id` set. New API-created products need backfill or a sync pipeline. |
| **Inventory on one variant** | Documented above; fix in SQL or admin UI. |
| **Double maintenance** | Writes still update `products`; v2 is a copy until triggers or jobs sync both ways (future work). |
| **Performance** | Compat view uses correlated subqueries; fine for moderate catalogs—add materialized view or API cache if needed. |
| **Supabase RLS** | If RLS is enabled on `public.products`, grant appropriate `SELECT` on `products_legacy_from_catalog_v2` for roles that used to read `products`. |
| **Fishbowl / GLV- SKUs** | External jobs keyed on legacy SKU should keep using `public.products` or map via `catalog_variants.variant_sku` / metadata until integrations are updated. |

---

## 8. Quick verification queries

```sql
-- Counts should match migrated parents (not variants)
SELECT count(*) FROM public.products;
SELECT count(*) FROM catalog_v2.catalog_products WHERE legacy_public_product_id IS NOT NULL;

-- Sample compat row
SELECT id, sku, sizes, price, cost FROM public.products_legacy_from_catalog_v2 LIMIT 5;
```

---

## 9. Rollback (operational)

- Unset `PRODUCTS_READ_SOURCE` (or remove `catalog_v2_compat`) and restart the API → reads revert to `public.products`.
- Do not drop `catalog_v2` or legacy `products` unless you have a restore plan; backfill is additive.
