-- =============================================================================
-- Restore gc_commerce integrity views after DROP TABLE public.orders / order_items
-- (CASCADE removed views that referenced legacy public tables). Canonical originals:
--   supabase/migrations/20260626151000_gc_commerce_migration_validation_views.sql
-- Product mapping: real post-legacy check (sellable vs snapshot only). Header/line
-- count / legacy-line views: retired zero-row (same column shape) — legacy tables gone.
-- v_integrity_summary: backlog columns fixed to 0 (legacy public.orders removed).
-- =============================================================================

CREATE OR REPLACE VIEW gc_commerce.v_integrity_order_header_mismatches AS
SELECT
  CAST(NULL AS bigint) AS legacy_order_id,
  CAST(NULL AS uuid) AS gc_order_id,
  CAST(NULL AS text) AS order_number,
  CAST(NULL AS bigint) AS legacy_subtotal_minor,
  CAST(NULL AS bigint) AS gc_subtotal_minor,
  CAST(NULL AS bigint) AS delta_subtotal_minor,
  CAST(NULL AS bigint) AS legacy_discount_minor,
  CAST(NULL AS bigint) AS gc_discount_minor,
  CAST(NULL AS bigint) AS delta_discount_minor,
  CAST(NULL AS bigint) AS legacy_shipping_minor,
  CAST(NULL AS bigint) AS gc_shipping_minor,
  CAST(NULL AS bigint) AS delta_shipping_minor,
  CAST(NULL AS bigint) AS legacy_tax_minor,
  CAST(NULL AS bigint) AS gc_tax_minor,
  CAST(NULL AS bigint) AS delta_tax_minor,
  CAST(NULL AS bigint) AS legacy_total_minor,
  CAST(NULL AS bigint) AS gc_total_minor,
  CAST(NULL AS bigint) AS delta_total_minor,
  CAST(NULL AS text) AS check_name
WHERE false;

COMMENT ON VIEW gc_commerce.v_integrity_order_header_mismatches IS
  'Retired: depended on public.orders (removed). Kept as zero-row view for downstream summary compatibility.';

CREATE OR REPLACE VIEW gc_commerce.v_integrity_line_sum_vs_legacy_items AS
SELECT
  CAST(NULL AS bigint) AS legacy_order_id,
  CAST(NULL AS uuid) AS gc_order_id,
  CAST(NULL AS text) AS order_number,
  CAST(NULL AS bigint) AS legacy_line_count,
  CAST(NULL AS bigint) AS gc_line_count,
  CAST(NULL AS bigint) AS legacy_sum_extended_minor,
  CAST(NULL AS bigint) AS gc_sum_line_subtotal_minor,
  CAST(NULL AS bigint) AS delta_line_subtotal_vs_legacy_minor,
  CAST(NULL AS text) AS check_name
WHERE false;

COMMENT ON VIEW gc_commerce.v_integrity_line_sum_vs_legacy_items IS
  'Retired: depended on public.order_items (removed). Kept as zero-row view for downstream summary compatibility.';

CREATE OR REPLACE VIEW gc_commerce.v_integrity_product_mapping_mismatches AS
SELECT
  ol.id AS gc_order_line_id,
  ol.order_id AS gc_order_id,
  ol.sellable_product_id,
  sp.catalog_product_id AS sellable_catalog_product_id,
  (NULLIF(ol.product_snapshot->>'catalog_product_id', ''))::UUID AS snapshot_catalog_product_id,
  (NULLIF(ol.product_snapshot->>'legacy_order_item_id', ''))::BIGINT AS legacy_order_item_id,
  NULL::UUID AS legacy_canonical_product_id,
  'sellable.catalog_product_id <> snapshot.catalog_product_id' AS mismatch_reason
FROM gc_commerce.order_lines ol
INNER JOIN gc_commerce.sellable_products sp ON sp.id = ol.sellable_product_id
WHERE
  sp.catalog_product_id
    IS DISTINCT FROM (NULLIF(ol.product_snapshot->>'catalog_product_id', ''))::UUID;

COMMENT ON VIEW gc_commerce.v_integrity_product_mapping_mismatches IS
  'Lines where sellable UUID disagrees with snapshot catalog_product_id (post-legacy: public.order_items removed; legacy canonical cross-check retired).';

CREATE OR REPLACE VIEW gc_commerce.v_integrity_missing_lines AS
SELECT
  CAST(NULL AS bigint) AS legacy_order_id,
  CAST(NULL AS uuid) AS gc_order_id,
  CAST(NULL AS text) AS order_number,
  CAST(NULL AS bigint) AS legacy_item_count,
  CAST(NULL AS bigint) AS gc_line_count,
  CAST(NULL AS text) AS check_name
WHERE false;

COMMENT ON VIEW gc_commerce.v_integrity_missing_lines IS
  'Retired: depended on public.order_items (removed). Kept as zero-row view for downstream summary compatibility.';

CREATE OR REPLACE VIEW gc_commerce.v_integrity_legacy_lines_not_in_gc AS
SELECT
  CAST(NULL AS bigint) AS legacy_order_item_id,
  CAST(NULL AS bigint) AS legacy_order_id,
  CAST(NULL AS bigint) AS legacy_product_id,
  CAST(NULL AS uuid) AS canonical_product_id,
  CAST(NULL AS uuid) AS gc_order_id,
  CAST(NULL AS text) AS check_name
WHERE false;

COMMENT ON VIEW gc_commerce.v_integrity_legacy_lines_not_in_gc IS
  'Retired: depended on public.order_items (removed). Kept as zero-row view for downstream summary compatibility.';

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
  0::bigint AS legacy_orders_with_any_unmapped_line,
  0::bigint AS legacy_orders_not_migrated_but_all_lines_canonical;

COMMENT ON VIEW gc_commerce.v_integrity_summary IS
  'Single-row counts: zeros (or expected backlog only) indicate clean migration for each check. Post-legacy-public.orders: backlog_* columns are 0 (legacy tables removed).';

GRANT SELECT ON gc_commerce.v_integrity_order_header_mismatches TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_integrity_line_sum_vs_legacy_items TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_integrity_product_mapping_mismatches TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_integrity_missing_lines TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_integrity_legacy_lines_not_in_gc TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_integrity_summary TO postgres, service_role;
