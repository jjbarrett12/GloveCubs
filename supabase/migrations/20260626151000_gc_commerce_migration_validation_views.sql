-- =============================================================================
-- Post-migration integrity checks: legacy public.* vs gc_commerce.*
-- Run: SELECT * FROM gc_commerce.v_integrity_summary;
-- Detail views list only rows that fail checks (empty = OK for that check).
-- Tolerance: 1 minor unit (cent) for float/NUMERIC rounding vs BIGINT migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Header totals: legacy public.orders vs gc_commerce.orders (mapped orders)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_integrity_order_header_mismatches AS
SELECT
  m.legacy_order_id,
  go.id AS gc_order_id,
  go.order_number,
  ROUND(COALESCE(po.subtotal, 0) * 100)::BIGINT AS legacy_subtotal_minor,
  go.subtotal_minor AS gc_subtotal_minor,
  (go.subtotal_minor - ROUND(COALESCE(po.subtotal, 0) * 100)::BIGINT) AS delta_subtotal_minor,
  ROUND(COALESCE(po.discount, 0) * 100)::BIGINT AS legacy_discount_minor,
  go.discount_minor AS gc_discount_minor,
  (go.discount_minor - ROUND(COALESCE(po.discount, 0) * 100)::BIGINT) AS delta_discount_minor,
  ROUND(COALESCE(po.shipping, 0) * 100)::BIGINT AS legacy_shipping_minor,
  go.shipping_minor AS gc_shipping_minor,
  (go.shipping_minor - ROUND(COALESCE(po.shipping, 0) * 100)::BIGINT) AS delta_shipping_minor,
  ROUND(COALESCE(po.tax, 0) * 100)::BIGINT AS legacy_tax_minor,
  go.tax_minor AS gc_tax_minor,
  (go.tax_minor - ROUND(COALESCE(po.tax, 0) * 100)::BIGINT) AS delta_tax_minor,
  ROUND(COALESCE(po.total, 0) * 100)::BIGINT AS legacy_total_minor,
  go.total_minor AS gc_total_minor,
  (go.total_minor - ROUND(COALESCE(po.total, 0) * 100)::BIGINT) AS delta_total_minor,
  'legacy header vs gc header (minor units)' AS check_name
FROM gc_commerce.legacy_order_map m
INNER JOIN public.orders po ON po.id = m.legacy_order_id
INNER JOIN gc_commerce.orders go ON go.id = m.gc_order_id
WHERE
  ABS(go.subtotal_minor - ROUND(COALESCE(po.subtotal, 0) * 100)::BIGINT) > 1
  OR ABS(go.discount_minor - ROUND(COALESCE(po.discount, 0) * 100)::BIGINT) > 1
  OR ABS(go.shipping_minor - ROUND(COALESCE(po.shipping, 0) * 100)::BIGINT) > 1
  OR ABS(go.tax_minor - ROUND(COALESCE(po.tax, 0) * 100)::BIGINT) > 1
  OR ABS(go.total_minor - ROUND(COALESCE(po.total, 0) * 100)::BIGINT) > 1;

COMMENT ON VIEW gc_commerce.v_integrity_order_header_mismatches IS
  'Mapped orders where any migrated money field differs from legacy by more than 1 cent.';

-- -----------------------------------------------------------------------------
-- 2) GC header equation: total = subtotal - discount + shipping + tax
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_integrity_gc_header_equation_failures AS
SELECT
  go.id AS gc_order_id,
  go.order_number,
  go.subtotal_minor,
  go.discount_minor,
  go.shipping_minor,
  go.tax_minor,
  go.total_minor,
  (go.subtotal_minor - go.discount_minor + go.shipping_minor + go.tax_minor) AS expected_total_minor,
  (go.total_minor - (go.subtotal_minor - go.discount_minor + go.shipping_minor + go.tax_minor)) AS delta_minor,
  'gc total_minor <> subtotal - discount + shipping + tax' AS check_name
FROM gc_commerce.orders go
INNER JOIN gc_commerce.legacy_order_map m ON m.gc_order_id = go.id
WHERE go.total_minor
  <> (go.subtotal_minor - go.discount_minor + go.shipping_minor + go.tax_minor);

COMMENT ON VIEW gc_commerce.v_integrity_gc_header_equation_failures IS
  'Migrated orders where header components do not sum to total_minor (legacy rounding or capture issue).';

-- -----------------------------------------------------------------------------
-- 3) Sum of line extended (minor) vs legacy public.order_items (mapped orders only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_integrity_line_sum_vs_legacy_items AS
WITH legacy_ext AS (
  SELECT
    oi.order_id,
    COUNT(*)::BIGINT AS line_count,
    SUM(ROUND((COALESCE(oi.unit_price, 0) * oi.quantity::NUMERIC) * 100)::BIGINT) AS sum_extended_minor
  FROM public.order_items oi
  GROUP BY oi.order_id
),
gc_ext AS (
  SELECT
    ol.order_id,
    COUNT(*)::BIGINT AS line_count,
    SUM(ol.line_subtotal_minor) AS sum_line_subtotal_minor,
    SUM(ol.total_minor) AS sum_line_total_minor
  FROM gc_commerce.order_lines ol
  GROUP BY ol.order_id
)
SELECT
  m.legacy_order_id,
  m.gc_order_id,
  go.order_number,
  le.line_count AS legacy_line_count,
  ge.line_count AS gc_line_count,
  le.sum_extended_minor AS legacy_sum_extended_minor,
  ge.sum_line_subtotal_minor AS gc_sum_line_subtotal_minor,
  (ge.sum_line_subtotal_minor - le.sum_extended_minor) AS delta_line_subtotal_vs_legacy_minor,
  'sum(gc line_subtotal) vs sum(legacy unit_price*qty)' AS check_name
FROM gc_commerce.legacy_order_map m
INNER JOIN gc_commerce.orders go ON go.id = m.gc_order_id
INNER JOIN legacy_ext le ON le.order_id = m.legacy_order_id
LEFT JOIN gc_ext ge ON ge.order_id = m.gc_order_id
WHERE
  le.line_count IS DISTINCT FROM COALESCE(ge.line_count, 0)
  OR ABS(COALESCE(ge.sum_line_subtotal_minor, 0) - le.sum_extended_minor) > 1;

COMMENT ON VIEW gc_commerce.v_integrity_line_sum_vs_legacy_items IS
  'Line count or extended subtotal mismatch between legacy order_items and gc order_lines.';

-- -----------------------------------------------------------------------------
-- 4) GC lines sum vs GC header subtotal (post-migration internal consistency)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_integrity_gc_lines_vs_header_subtotal AS
WITH sums AS (
  SELECT
    ol.order_id,
    SUM(ol.line_subtotal_minor) AS sum_lines_subtotal,
    SUM(ol.total_minor) AS sum_lines_total
  FROM gc_commerce.order_lines ol
  GROUP BY ol.order_id
)
SELECT
  go.id AS gc_order_id,
  go.order_number,
  m.legacy_order_id,
  go.subtotal_minor AS header_subtotal_minor,
  s.sum_lines_subtotal,
  (go.subtotal_minor - COALESCE(s.sum_lines_subtotal, 0)) AS delta_subtotal_minor,
  'gc header subtotal vs sum(line_subtotal_minor)' AS check_name
FROM gc_commerce.orders go
INNER JOIN gc_commerce.legacy_order_map m ON m.gc_order_id = go.id
LEFT JOIN sums s ON s.order_id = go.id
WHERE ABS(go.subtotal_minor - COALESCE(s.sum_lines_subtotal, 0)) > 1;

COMMENT ON VIEW gc_commerce.v_integrity_gc_lines_vs_header_subtotal IS
  'Migrated orders where gc order subtotal does not match sum of line subtotals (often legacy header/line drift).';

-- -----------------------------------------------------------------------------
-- 5) Per-line: unit * qty vs line_subtotal_minor; line internal total
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_integrity_line_internal_mismatches AS
SELECT
  ol.id AS gc_order_line_id,
  ol.order_id AS gc_order_id,
  ol.line_number,
  ol.quantity,
  ol.unit_price_minor,
  ol.line_subtotal_minor,
  ol.total_minor,
  (ol.unit_price_minor * ol.quantity::BIGINT) AS expected_line_subtotal_minor,
  (ol.line_subtotal_minor - (ol.unit_price_minor * ol.quantity::BIGINT)) AS delta_subtotal_minor,
  (ol.total_minor - (ol.line_subtotal_minor - ol.discount_minor + ol.tax_minor)) AS delta_total_vs_components,
  'line unit_price_minor*qty vs line_subtotal; or total vs components' AS check_name
FROM gc_commerce.order_lines ol
WHERE
  ABS(ol.line_subtotal_minor - (ol.unit_price_minor * ol.quantity::BIGINT)) > 1
  OR ol.total_minor
    <> (ol.line_subtotal_minor - ol.discount_minor + ol.tax_minor);

COMMENT ON VIEW gc_commerce.v_integrity_line_internal_mismatches IS
  'GC lines where extended subtotal does not match unit_price_minor * qty, or total_minor inconsistent.';

-- -----------------------------------------------------------------------------
-- 6) Product mapping: sellable_products.catalog_product_id vs snapshot + legacy order_items
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_integrity_product_mapping_mismatches AS
SELECT
  ol.id AS gc_order_line_id,
  ol.order_id AS gc_order_id,
  ol.sellable_product_id,
  sp.catalog_product_id AS sellable_catalog_product_id,
  (NULLIF(ol.product_snapshot->>'catalog_product_id', ''))::UUID AS snapshot_catalog_product_id,
  oi.id AS legacy_order_item_id,
  oi.canonical_product_id AS legacy_canonical_product_id,
  CASE
    WHEN sp.catalog_product_id IS DISTINCT FROM (NULLIF(ol.product_snapshot->>'catalog_product_id', ''))::UUID
      THEN 'sellable.catalog_product_id <> snapshot.catalog_product_id'
    WHEN oi.id IS NULL THEN 'legacy order_item not resolved from snapshot.legacy_order_item_id'
    WHEN sp.catalog_product_id IS DISTINCT FROM oi.canonical_product_id
      THEN 'sellable.catalog_product_id <> order_items.canonical_product_id'
    ELSE 'unknown'
  END AS mismatch_reason
FROM gc_commerce.order_lines ol
INNER JOIN gc_commerce.sellable_products sp ON sp.id = ol.sellable_product_id
LEFT JOIN public.order_items oi ON oi.id = (NULLIF(ol.product_snapshot->>'legacy_order_item_id', ''))::BIGINT
WHERE
  sp.catalog_product_id
    IS DISTINCT FROM (NULLIF(ol.product_snapshot->>'catalog_product_id', ''))::UUID
  OR oi.id IS NULL
  OR sp.catalog_product_id IS DISTINCT FROM oi.canonical_product_id;

COMMENT ON VIEW gc_commerce.v_integrity_product_mapping_mismatches IS
  'Lines where sellable UUID, snapshot, or legacy order_items.canonical_product_id disagree.';

-- -----------------------------------------------------------------------------
-- 7) Missing data: mapped order with no GC lines; legacy line not represented
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_integrity_missing_lines AS
SELECT
  m.legacy_order_id,
  m.gc_order_id,
  go.order_number,
  (SELECT COUNT(*) FROM public.order_items oi WHERE oi.order_id = m.legacy_order_id)::BIGINT AS legacy_item_count,
  (SELECT COUNT(*) FROM gc_commerce.order_lines ol WHERE ol.order_id = m.gc_order_id)::BIGINT AS gc_line_count,
  'mapped order: legacy item count <> gc line count' AS check_name
FROM gc_commerce.legacy_order_map m
INNER JOIN gc_commerce.orders go ON go.id = m.gc_order_id
WHERE
  (SELECT COUNT(*) FROM public.order_items oi WHERE oi.order_id = m.legacy_order_id)
  <>
  (SELECT COUNT(*) FROM gc_commerce.order_lines ol WHERE ol.order_id = m.gc_order_id);

COMMENT ON VIEW gc_commerce.v_integrity_missing_lines IS
  'Mapped orders where line row counts differ (partial migration or failed line insert).';

-- -----------------------------------------------------------------------------
-- 8) Legacy lines with canonical UUID but no matching gc line (by legacy id)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_integrity_legacy_lines_not_in_gc AS
SELECT
  oi.id AS legacy_order_item_id,
  oi.order_id AS legacy_order_id,
  oi.product_id AS legacy_product_id,
  oi.canonical_product_id,
  m.gc_order_id,
  'order_item has canonical and order is mapped, but no gc line with this legacy_order_item_id' AS check_name
FROM public.order_items oi
INNER JOIN gc_commerce.legacy_order_map m ON m.legacy_order_id = oi.order_id
WHERE oi.canonical_product_id IS NOT NULL
  AND COALESCE(oi.quantity, 0) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM gc_commerce.order_lines ol
    WHERE ol.order_id = m.gc_order_id
      AND (ol.product_snapshot->>'legacy_order_item_id')::BIGINT = oi.id
  );

COMMENT ON VIEW gc_commerce.v_integrity_legacy_lines_not_in_gc IS
  'Legacy lines that should have been copied (canonical + qty>0 + mapped order) but snapshot link missing.';

-- -----------------------------------------------------------------------------
-- 9) One-row dashboard
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_integrity_summary AS
SELECT
  (SELECT COUNT(*) FROM gc_commerce.legacy_order_map) AS mapped_orders,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_order_header_mismatches) AS header_vs_legacy_mismatch_count,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_gc_header_equation_failures) AS gc_header_equation_failure_count,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_line_sum_vs_legacy_items) AS line_sum_vs_legacy_mismatch_count,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_gc_lines_vs_header_subtotal) AS gc_lines_vs_header_subtotal_count,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_line_internal_mismatches) AS line_internal_mismatch_count,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_product_mapping_mismatches) AS product_mapping_mismatch_count,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_missing_lines) AS missing_line_count_mismatch,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_legacy_lines_not_in_gc) AS legacy_lines_not_in_gc_count,
  (
    (SELECT COUNT(*) FROM public.orders po
     WHERE EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = po.id AND oi.canonical_product_id IS NULL)
    )
  ) AS legacy_orders_with_any_unmapped_line,
  (
    (SELECT COUNT(*) FROM public.orders po
     WHERE NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_order_map m WHERE m.legacy_order_id = po.id)
       AND NOT EXISTS (
         SELECT 1 FROM public.order_items oi
         WHERE oi.order_id = po.id AND oi.canonical_product_id IS NULL
       )
       AND EXISTS (SELECT 1 FROM public.order_items x WHERE x.order_id = po.id)
    )
  ) AS legacy_orders_not_migrated_but_all_lines_canonical;

COMMENT ON VIEW gc_commerce.v_integrity_summary IS
  'Single-row counts: zeros (or expected backlog only) indicate clean migration for each check.';

GRANT SELECT ON gc_commerce.v_integrity_order_header_mismatches TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_integrity_gc_header_equation_failures TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_integrity_line_sum_vs_legacy_items TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_integrity_gc_lines_vs_header_subtotal TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_integrity_line_internal_mismatches TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_integrity_product_mapping_mismatches TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_integrity_missing_lines TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_integrity_legacy_lines_not_in_gc TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_integrity_summary TO postgres, service_role;
