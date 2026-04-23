-- Full migration validation (Supabase SQL Editor — no psql meta-commands).
-- Run the whole script; each query returns a result grid.

-- === 1) INTEGRITY SUMMARY ===
SELECT * FROM gc_commerce.v_integrity_summary;

-- === 2) HEADER TOTAL MISMATCHES ===
SELECT * FROM gc_commerce.v_integrity_order_header_mismatches;

-- === 3) GC HEADER EQUATION FAILURES ===
SELECT * FROM gc_commerce.v_integrity_gc_header_equation_failures;

-- === 4) LINE SUM VS LEGACY ITEMS ===
SELECT * FROM gc_commerce.v_integrity_line_sum_vs_legacy_items;

-- === 5) GC LINES VS HEADER SUBTOTAL ===
SELECT * FROM gc_commerce.v_integrity_gc_lines_vs_header_subtotal;

-- === 6) LINE INTERNAL MISMATCHES ===
SELECT * FROM gc_commerce.v_integrity_line_internal_mismatches;

-- === 7) PRODUCT MAPPING MISMATCHES ===
SELECT * FROM gc_commerce.v_integrity_product_mapping_mismatches;

-- === 8) MISSING LINES ===
SELECT * FROM gc_commerce.v_integrity_missing_lines;

-- === 9) LEGACY LINES NOT IN GC ===
SELECT * FROM gc_commerce.v_integrity_legacy_lines_not_in_gc;

-- === 10) ORPHANS & BROKEN MAPPINGS (all should be 0 rows) ===
SELECT '10a orphan sellable_product' AS check_id, ol.id AS gc_order_line_id, ol.order_id, ol.sellable_product_id
FROM gc_commerce.order_lines ol
LEFT JOIN gc_commerce.sellable_products sp ON sp.id = ol.sellable_product_id
WHERE sp.id IS NULL;

SELECT '10b orphan order_id on line' AS check_id, ol.id, ol.order_id
FROM gc_commerce.order_lines ol
LEFT JOIN gc_commerce.orders o ON o.id = ol.order_id
WHERE o.id IS NULL;

SELECT '10c orphan company on order' AS check_id, o.id, o.order_number, o.company_id
FROM gc_commerce.orders o
LEFT JOIN gc_commerce.companies c ON c.id = o.company_id
WHERE c.id IS NULL;

SELECT '10d placed_by not in auth' AS check_id, o.id, o.order_number, o.placed_by_user_id
FROM gc_commerce.orders o
LEFT JOIN auth.users au ON au.id = o.placed_by_user_id
WHERE o.placed_by_user_id IS NOT NULL AND au.id IS NULL;

SELECT '10e company_members orphan' AS check_id, x.id::text, x.company_id::text, x.user_id::text, x.issue
FROM (
  SELECT cm.id, cm.company_id, cm.user_id, 'missing company'::text AS issue
  FROM gc_commerce.company_members cm
  LEFT JOIN gc_commerce.companies c ON c.id = cm.company_id
  WHERE c.id IS NULL
  UNION ALL
  SELECT cm.id, cm.company_id, cm.user_id, 'missing auth user'::text
  FROM gc_commerce.company_members cm
  LEFT JOIN auth.users au ON au.id = cm.user_id
  WHERE au.id IS NULL
) x;

SELECT '10f multiple default ship-to per company' AS check_id, s.company_id::text, s.cnt::text, NULL::text, NULL::text
FROM (
  SELECT company_id, COUNT(*)::bigint AS cnt
  FROM gc_commerce.ship_to_addresses
  WHERE is_default = true AND company_id IS NOT NULL
  GROUP BY company_id
  HAVING COUNT(*) > 1
) s;
