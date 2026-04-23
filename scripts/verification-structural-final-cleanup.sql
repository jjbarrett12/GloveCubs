-- Post-migration checks for structural final cleanup (run in SQL editor or psql after applying migrations).
-- Requires: 20260730100000_structural_final_cleanup.sql (and prerequisites).
-- Preflight (before migrate): scripts/preflight-structural-final-cleanup.sql

-- 1) No legacy public.orders table (optional: public.orders_gc_read view exists instead)
SELECT to_regclass('public.orders') AS public_orders_table_should_be_null;

-- 2) Carts live in gc_commerce only
SELECT to_regclass('public.carts') AS public_carts_should_be_null;
SELECT COUNT(*) AS gc_commerce_carts_rows FROM gc_commerce.carts;

-- 3) Inventory / stock_history: canonical_product_id only (no product_id column)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'product_id';
-- expect 0 rows

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'stock_history' AND column_name = 'product_id';
-- expect 0 rows

SELECT COUNT(*) AS inventory_rows_missing_canonical
FROM public.inventory
WHERE canonical_product_id IS NULL;
-- expect 0

SELECT COUNT(*) AS stock_history_rows_missing_canonical
FROM public.stock_history
WHERE canonical_product_id IS NULL;
-- expect 0

-- Inventory rows that have no legacy_public_product_id (cannot join to legacy product id for ops UIs)
SELECT COUNT(*) AS inventory_rows_without_legacy_bridge
FROM public.inventory inv
INNER JOIN catalog_v2.catalog_products cp ON cp.id = inv.canonical_product_id
WHERE cp.legacy_public_product_id IS NULL;

-- 3b) Resolved view present and consistent (optional)
SELECT to_regclass('public.inventory_resolved') AS inventory_resolved_view;

-- 4) Users: no duplicate tenancy column on public.users
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'company_id';
-- expect 0 rows

-- 5) Product surface: public.products has no image_url / images (images in catalog_v2 only)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'products'
  AND column_name IN ('image_url', 'images');
-- expect 0 rows
