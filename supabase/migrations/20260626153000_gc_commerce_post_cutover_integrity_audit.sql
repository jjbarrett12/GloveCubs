-- =============================================================================
-- Post-cutover full system integrity audit (gc_commerce + legacy cross-checks)
--
-- Depends on:
--   20260626151000_gc_commerce_migration_validation_views.sql
--   20260626152000_gc_commerce_pricing_audit_and_checkout_guard_views.sql
--
-- Run:
--   SELECT * FROM gc_commerce.v_post_cutover_integrity_summary;
-- Detail views return failing rows only (empty = pass).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tenant: migrated GC order company must match legacy company map when legacy had company_id
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_audit_tenant_legacy_company_drift AS
SELECT
  m.legacy_order_id,
  m.gc_order_id,
  go.order_number,
  po.company_id AS legacy_company_id,
  lcm.gc_company_id AS expected_gc_company_id,
  go.company_id AS actual_gc_company_id,
  'legacy public.orders.company_id map differs from gc_commerce.orders.company_id' AS issue
FROM gc_commerce.legacy_order_map m
INNER JOIN public.orders po ON po.id = m.legacy_order_id
INNER JOIN gc_commerce.orders go ON go.id = m.gc_order_id
LEFT JOIN gc_commerce.legacy_company_map lcm ON lcm.legacy_company_id = po.company_id
WHERE po.company_id IS NOT NULL
  AND lcm.gc_company_id IS NOT NULL
  AND go.company_id IS DISTINCT FROM lcm.gc_company_id;

COMMENT ON VIEW gc_commerce.v_audit_tenant_legacy_company_drift IS
  'Mapped orders where legacy company_id resolves to a gc company but order header company_id differs.';

-- -----------------------------------------------------------------------------
-- Tenant: placer (created_by) should be an active member of the order company (when both set)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_audit_tenant_placer_not_member AS
SELECT
  go.id AS gc_order_id,
  go.order_number,
  go.company_id,
  go.created_by_user_id,
  'created_by_user_id is not an active company_member of orders.company_id' AS issue
FROM gc_commerce.orders go
WHERE go.created_by_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM gc_commerce.company_members cm
    WHERE cm.company_id = go.company_id
      AND cm.user_id = go.created_by_user_id
  );

COMMENT ON VIEW gc_commerce.v_audit_tenant_placer_not_member IS
  'B2B isolation risk: order attributed to company but placer not in company_members.';

-- -----------------------------------------------------------------------------
-- Tenant: orders with unknown placer (auth mapping gap — not always wrong)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_audit_tenant_placer_null AS
SELECT
  go.id AS gc_order_id,
  go.order_number,
  go.company_id,
  'created_by_user_id NULL after cutover (legacy user had no auth.users email match)' AS issue
FROM gc_commerce.orders go
INNER JOIN gc_commerce.legacy_order_map m ON m.gc_order_id = go.id
WHERE go.created_by_user_id IS NULL;

COMMENT ON VIEW gc_commerce.v_audit_tenant_placer_null IS
  'Audit trail gap: who placed the order is unknown at DB level.';

-- -----------------------------------------------------------------------------
-- Tenant: RLS status on gc_commerce tables (service_role bypasses; anon must not see all orders)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_audit_rls_gc_commerce_tables AS
SELECT
  c.relname::TEXT AS table_name,
  c.relrowsecurity AS rls_enabled,
  (SELECT COUNT(*)::INT FROM pg_policies p WHERE p.schemaname = 'gc_commerce' AND p.tablename = c.relname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'gc_commerce'
  AND c.relkind = 'r'
  AND c.relname NOT LIKE 'pg_%'
ORDER BY c.relname;

COMMENT ON VIEW gc_commerce.v_audit_rls_gc_commerce_tables IS
  'If rls_enabled is false for orders/order_lines/user_profiles, PostgREST exposure could leak tenants without app-layer guards.';

-- -----------------------------------------------------------------------------
-- Product mapping rollup (re-export counts from existing integrity view)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_audit_product_mapping_summary AS
SELECT
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_product_mapping_mismatches) AS product_mapping_mismatch_line_count,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_missing_lines) AS missing_line_count_mismatch,
  (SELECT COUNT(*) FROM gc_commerce.v_integrity_legacy_lines_not_in_gc) AS legacy_lines_not_in_gc_count,
  (SELECT COUNT(*) FROM public.order_items WHERE canonical_product_id IS NULL) AS legacy_order_items_missing_canonical;

-- -----------------------------------------------------------------------------
-- One-row post-cutover dashboard
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_post_cutover_integrity_summary AS
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

GRANT SELECT ON gc_commerce.v_audit_tenant_legacy_company_drift TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_audit_tenant_placer_not_member TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_audit_tenant_placer_null TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_audit_rls_gc_commerce_tables TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_audit_product_mapping_summary TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_post_cutover_integrity_summary TO postgres, service_role;
