-- =============================================================================
-- Full migration validation: gc_commerce vs legacy public + referential health
--
-- Prerequisites (migrations applied):
--   - gc_commerce canonical schema + legacy_order_map + integrity views
--   - 20260626151000_gc_commerce_migration_validation_views.sql
--
-- Run (Supabase SQL Editor, or psql):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/gc-commerce/migration_validation_full.sql
--
-- Output: multiple result sets — review each section.
-- =============================================================================

\echo '=== 1) INTEGRITY SUMMARY (all zeros = clean for those checks) ==='
SELECT * FROM gc_commerce.v_integrity_summary;

\echo '=== 2) HEADER TOTAL MISMATCHES (legacy vs gc, >1 cent) ==='
SELECT * FROM gc_commerce.v_integrity_order_header_mismatches;

\echo '=== 3) GC HEADER EQUATION FAILURES ==='
SELECT * FROM gc_commerce.v_integrity_gc_header_equation_failures;

\echo '=== 4) LINE SUM VS LEGACY ITEMS ==='
SELECT * FROM gc_commerce.v_integrity_line_sum_vs_legacy_items;

\echo '=== 5) GC LINES VS HEADER SUBTOTAL ==='
SELECT * FROM gc_commerce.v_integrity_gc_lines_vs_header_subtotal;

\echo '=== 6) LINE INTERNAL MISMATCHES ==='
SELECT * FROM gc_commerce.v_integrity_line_internal_mismatches;

\echo '=== 7) PRODUCT MAPPING MISMATCHES ==='
SELECT * FROM gc_commerce.v_integrity_product_mapping_mismatches;

\echo '=== 8) MISSING LINES (COUNT MISMATCH) ==='
SELECT * FROM gc_commerce.v_integrity_missing_lines;

\echo '=== 9) LEGACY LINES NOT IN GC ==='
SELECT * FROM gc_commerce.v_integrity_legacy_lines_not_in_gc;

-- ---------------------------------------------------------------------------
-- 10) Orphan / FK drift (should be empty if FKs enforced and data clean)
-- ---------------------------------------------------------------------------
\echo '=== 10a) order_lines -> sellable_products (orphan sellable_product_id) ==='
SELECT ol.id AS gc_order_line_id, ol.order_id, ol.sellable_product_id
FROM gc_commerce.order_lines ol
LEFT JOIN gc_commerce.sellable_products sp ON sp.id = ol.sellable_product_id
WHERE sp.id IS NULL;

\echo '=== 10b) order_lines -> orders (orphan order_id) ==='
SELECT ol.id AS gc_order_line_id, ol.order_id
FROM gc_commerce.order_lines ol
LEFT JOIN gc_commerce.orders o ON o.id = ol.order_id
WHERE o.id IS NULL;

\echo '=== 10c) orders -> companies (orphan company_id) ==='
SELECT o.id, o.order_number, o.company_id
FROM gc_commerce.orders o
LEFT JOIN gc_commerce.companies c ON c.id = o.company_id
WHERE c.id IS NULL;

\echo '=== 10d) orders.placed_by_user_id not in auth.users (when set) ==='
SELECT o.id, o.order_number, o.placed_by_user_id
FROM gc_commerce.orders o
LEFT JOIN auth.users au ON au.id = o.placed_by_user_id
WHERE o.placed_by_user_id IS NOT NULL
  AND au.id IS NULL;

\echo '=== 10e) company_members -> auth.users / companies ==='
SELECT cm.id, cm.company_id, cm.user_id, 'missing company' AS issue
FROM gc_commerce.company_members cm
LEFT JOIN gc_commerce.companies c ON c.id = cm.company_id
WHERE c.id IS NULL
UNION ALL
SELECT cm.id, cm.company_id, cm.user_id, 'missing auth user' AS issue
FROM gc_commerce.company_members cm
LEFT JOIN auth.users au ON au.id = cm.user_id
WHERE au.id IS NULL;

\echo '=== 10f) ship_to: more than one default per company (should be empty) ==='
SELECT company_id, COUNT(*) AS default_count
FROM gc_commerce.ship_to_addresses
WHERE is_default = true AND company_id IS NOT NULL
GROUP BY company_id
HAVING COUNT(*) > 1;

\echo '=== DONE (legacy public.orders / user_profiles checks removed; use gc_commerce + auth only) ==='
