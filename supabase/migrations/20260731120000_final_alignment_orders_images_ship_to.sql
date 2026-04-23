-- =============================================================================
-- Final alignment: gc order placer column rename, catalogos images → catalog_v2,
-- one default ship-to per company (DB-enforced).
-- Depends on: 20260731115000_gc_commerce_restore_integrity_views_post_legacy_orders.sql,
--   20260731115500_gc_commerce_restore_pricing_checkout_audit_views_post_legacy_orders.sql
-- (integrity + pricing audit views dropped with public.orders / public.order_items CASCADE).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) gc_commerce.orders: created_by_user_id → placed_by_user_id
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'gc_commerce' AND table_name = 'orders' AND column_name = 'created_by_user_id'
  ) THEN
    ALTER TABLE gc_commerce.orders RENAME COLUMN created_by_user_id TO placed_by_user_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_gc_orders_created_by') THEN
    ALTER TABLE gc_commerce.orders RENAME CONSTRAINT fk_gc_orders_created_by TO fk_gc_orders_placed_by;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'gc_commerce' AND c.relname = 'idx_gc_orders_created_by_user_id'
  ) THEN
    ALTER INDEX gc_commerce.idx_gc_orders_created_by_user_id RENAME TO idx_gc_orders_placed_by_user_id;
  END IF;
END $$;

COMMENT ON COLUMN gc_commerce.orders.placed_by_user_id IS 'Auth user who placed the order (attribution).';

-- -----------------------------------------------------------------------------
-- 2) At most one default ship-to per company (company-scoped rows)
-- -----------------------------------------------------------------------------
WITH d AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY company_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
    ) AS rn
  FROM gc_commerce.ship_to_addresses
  WHERE company_id IS NOT NULL AND is_default = true
)
UPDATE gc_commerce.ship_to_addresses s
SET is_default = false, updated_at = now()
FROM d
WHERE s.id = d.id AND d.rn > 1;

DROP INDEX IF EXISTS uq_gc_ship_to_one_default_per_company;

CREATE UNIQUE INDEX uq_gc_ship_to_one_default_per_company
  ON gc_commerce.ship_to_addresses (company_id)
  WHERE is_default = true AND company_id IS NOT NULL;

COMMENT ON INDEX gc_commerce.uq_gc_ship_to_one_default_per_company IS 'Only one default address per company when company_id is set.';

-- -----------------------------------------------------------------------------
-- 3) catalogos.product_images: physical table → read-only view over catalog_v2
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "catalogos_admin_all_product_images" ON catalogos.product_images;

DROP TABLE IF EXISTS catalogos.product_images CASCADE;

CREATE OR REPLACE VIEW catalogos.product_images AS
SELECT
  i.id,
  p.id AS product_id,
  i.url,
  i.sort_order,
  i.created_at
FROM catalogos.products p
INNER JOIN catalog_v2.catalog_products cp
  ON cp.legacy_public_product_id = p.live_product_id
INNER JOIN catalog_v2.catalog_product_images i
  ON i.catalog_product_id = cp.id
WHERE p.live_product_id IS NOT NULL;

COMMENT ON VIEW catalogos.product_images IS
  'Read-through to catalog_v2.catalog_product_images (single image source). Join: products.live_product_id → catalog_products.legacy_public_product_id.';

GRANT SELECT ON catalogos.product_images TO postgres, service_role, authenticated, anon;

-- -----------------------------------------------------------------------------
-- 4) Integrity audit views: column rename + dropped legacy public.orders
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS gc_commerce.v_post_cutover_integrity_summary;

CREATE OR REPLACE VIEW gc_commerce.v_audit_tenant_legacy_company_drift AS
SELECT
  CAST(NULL AS bigint) AS legacy_order_id,
  CAST(NULL AS uuid) AS gc_order_id,
  CAST(NULL AS text) AS order_number,
  CAST(NULL AS uuid) AS legacy_company_id,
  CAST(NULL AS uuid) AS expected_gc_company_id,
  CAST(NULL AS uuid) AS actual_gc_company_id,
  CAST(NULL AS text) AS issue
WHERE false;

COMMENT ON VIEW gc_commerce.v_audit_tenant_legacy_company_drift IS
  'Retired: depended on public.orders (removed). Kept as zero-row view for downstream summary compatibility.';

DROP VIEW IF EXISTS gc_commerce.v_audit_tenant_placer_not_member;

CREATE VIEW gc_commerce.v_audit_tenant_placer_not_member AS
SELECT
  go.id AS gc_order_id,
  go.order_number,
  go.company_id,
  go.placed_by_user_id,
  'placed_by_user_id is not an active company_member of orders.company_id' AS issue
FROM gc_commerce.orders go
WHERE go.placed_by_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM gc_commerce.company_members cm
    WHERE cm.company_id = go.company_id
      AND cm.user_id = go.placed_by_user_id
  );

CREATE OR REPLACE VIEW gc_commerce.v_audit_tenant_placer_null AS
SELECT
  go.id AS gc_order_id,
  go.order_number,
  go.company_id,
  'placed_by_user_id NULL after cutover (legacy user had no auth.users email match)' AS issue
FROM gc_commerce.orders go
INNER JOIN gc_commerce.legacy_order_map m ON m.gc_order_id = go.id
WHERE go.placed_by_user_id IS NULL;

CREATE OR REPLACE VIEW gc_commerce.v_audit_product_mapping_summary AS
SELECT
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_product_mapping_mismatches) AS product_mapping_mismatch_line_count,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_missing_lines) AS missing_line_count_mismatch,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_legacy_lines_not_in_gc) AS legacy_lines_not_in_gc_count,
  0::bigint AS legacy_order_items_missing_canonical;

CREATE VIEW gc_commerce.v_post_cutover_integrity_summary AS
SELECT
  -- Migration / legacy parity (20260626151000)
  (SELECT COUNT(*) FROM gc_commerce.legacy_order_map) AS mapped_orders,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_order_header_mismatches) AS pricing_legacy_header_mismatch,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_gc_header_equation_failures) AS checkout_header_equation_fail,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_line_sum_vs_legacy_items) AS pricing_line_sum_vs_legacy_fail,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_gc_lines_vs_header_subtotal) AS checkout_lines_vs_header_subtotal_fail,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_line_internal_mismatches) AS pricing_line_internal_fail,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_product_mapping_mismatches) AS product_mapping_line_fail,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_missing_lines) AS product_mapping_line_count_mismatch,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_legacy_lines_not_in_gc) AS product_mapping_legacy_line_missing_in_gc,
  (SELECT legacy_orders_with_any_unmapped_line FROM gc_commerce.v_integrity_summary LIMIT 1) AS backlog_legacy_unmapped_lines_orders,
  (SELECT legacy_orders_not_migrated_but_all_lines_canonical FROM gc_commerce.v_integrity_summary LIMIT 1) AS backlog_legacy_not_migrated_eligible,
  -- Pricing / checkout guard (20260626152000)
  (SELECT line_internal_pricing_issue_count FROM gc_commerce.v_pricing_checkout_audit_summary LIMIT 1) AS audit_line_internal_pricing,
  (SELECT line_vs_legacy_unit_mismatch_count FROM gc_commerce.v_pricing_checkout_audit_summary LIMIT 1) AS audit_line_vs_legacy_unit,
  (SELECT checkout_header_equation_failure_count FROM gc_commerce.v_pricing_checkout_audit_summary LIMIT 1) AS audit_checkout_header_equation,
  (SELECT checkout_lines_vs_header_subtotal_count FROM gc_commerce.v_pricing_checkout_audit_summary LIMIT 1) AS audit_checkout_lines_vs_header,
  (SELECT checkout_full_reconciliation_mismatch_count FROM gc_commerce.v_pricing_checkout_audit_summary LIMIT 1) AS audit_checkout_full_stack_reconciliation,
  (SELECT checkout_tax_not_on_lines_count FROM gc_commerce.v_pricing_checkout_audit_summary LIMIT 1) AS info_header_tax_not_on_lines,
  (SELECT lines_negative_goods_margin_count FROM gc_commerce.v_pricing_checkout_audit_summary LIMIT 1) AS risk_negative_margin_lines,
  (SELECT lines_cost_unknown_count FROM gc_commerce.v_pricing_checkout_audit_summary LIMIT 1) AS info_cost_unknown_lines,
  -- Tenant isolation (this migration)
  (SELECT COUNT(*) FROM gc_commerce.v_audit_tenant_legacy_company_drift) AS tenant_legacy_company_drift_count,
  (SELECT COUNT(*) FROM gc_commerce.v_audit_tenant_placer_not_member) AS tenant_placer_not_member_count,
  (SELECT COUNT(*) FROM gc_commerce.v_audit_tenant_placer_null) AS tenant_placer_unknown_count;

COMMENT ON VIEW gc_commerce.v_post_cutover_integrity_summary IS
  'Single-row post-cutover audit. Hard fails: pricing_* mismatch, checkout_* fail (except interpret full_stack + tax info), product_mapping_*, tenant_* drift/not_member. GO when all hard counts = 0 and backlog acceptable.';

GRANT SELECT ON gc_commerce.v_post_cutover_integrity_summary TO postgres, service_role;

GRANT SELECT ON gc_commerce.v_audit_tenant_legacy_company_drift TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_audit_tenant_placer_not_member TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_audit_tenant_placer_null TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_audit_product_mapping_summary TO postgres, service_role;
