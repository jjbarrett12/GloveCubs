-- =============================================================================
-- Post-migration verification: final alignment (20260731120000 + app contract).
-- Expect: zero rows on "should be empty" checks; single row truth checks OK.
-- =============================================================================

-- 1) gc_commerce.orders uses placed_by_user_id (not created_by_user_id)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'gc_commerce' AND table_name = 'orders' AND column_name IN ('placed_by_user_id', 'created_by_user_id')
ORDER BY column_name;
-- Expect: only placed_by_user_id

-- 2) One default ship-to per company (partial unique index)
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'gc_commerce'
  AND tablename = 'ship_to_addresses'
  AND indexname = 'uq_gc_ship_to_one_default_per_company';

-- 3) No duplicate defaults (should return 0 rows)
SELECT company_id, COUNT(*) AS cnt
FROM gc_commerce.ship_to_addresses
WHERE is_default = true AND company_id IS NOT NULL
GROUP BY company_id
HAVING COUNT(*) > 1;

-- 4) catalogos.product_images is a VIEW (not a base table); single image source = catalog_v2
SELECT c.relkind AS kind, -- v = view, r = table
       n.nspname || '.' || c.relname AS name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'catalogos' AND c.relname = 'product_images';

-- 5) Physical image rows live only in catalog_v2 (count sanity — optional)
SELECT (SELECT COUNT(*) FROM catalog_v2.catalog_product_images) AS catalog_v2_image_rows;

-- 6) Admin is table-only (app layer: no OWNER_EMAIL bypass — verify in repo grep, not SQL)
SELECT COUNT(*) AS app_admin_rows FROM public.app_admins;
