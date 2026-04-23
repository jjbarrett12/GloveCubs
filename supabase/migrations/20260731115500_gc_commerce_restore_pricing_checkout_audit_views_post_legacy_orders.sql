-- =============================================================================
-- Restore pricing/checkout audit views after DROP TABLE public.order_items CASCADE
-- removed dependents (notably v_audit_line_vs_legacy_unit_price and thus
-- v_pricing_checkout_audit_summary). Canonical originals:
--   supabase/migrations/20260626152000_gc_commerce_pricing_audit_and_checkout_guard_views.sql
-- Legacy line-vs-order_items check: retired zero-row (same column shape); all other
-- definitions unchanged where they only reference gc_commerce + public.products.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) Per-line: unit × qty vs line_subtotal; total_minor vs components (strict, 1¢ tol)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_audit_line_internal_pricing AS
SELECT
  ol.id AS gc_order_line_id,
  ol.order_id,
  ol.line_number,
  ol.quantity,
  ol.unit_price_minor,
  ol.line_subtotal_minor,
  (ol.unit_price_minor * ol.quantity::BIGINT) AS expected_subtotal_minor,
  (ol.line_subtotal_minor - (ol.unit_price_minor * ol.quantity::BIGINT)) AS delta_subtotal_minor,
  ol.discount_minor,
  ol.tax_minor,
  ol.total_minor,
  (ol.line_subtotal_minor - ol.discount_minor + ol.tax_minor) AS expected_total_minor,
  (ol.total_minor - (ol.line_subtotal_minor - ol.discount_minor + ol.tax_minor)) AS delta_total_minor,
  'internal_line_math' AS issue_category
FROM gc_commerce.order_lines ol
WHERE ABS(ol.line_subtotal_minor - (ol.unit_price_minor * ol.quantity::BIGINT)) > 1
   OR ABS(ol.total_minor - (ol.line_subtotal_minor - ol.discount_minor + ol.tax_minor)) > 1;

COMMENT ON VIEW gc_commerce.v_audit_line_internal_pricing IS
  'Lines where extended subtotal or total_minor disagrees with components (>1 minor unit).';

-- -----------------------------------------------------------------------------
-- B) Migrated unit price vs legacy order_items — retired (public.order_items removed)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_audit_line_vs_legacy_unit_price AS
SELECT
  CAST(NULL AS uuid) AS gc_order_line_id,
  CAST(NULL AS uuid) AS order_id,
  CAST(NULL AS integer) AS line_number,
  CAST(NULL AS bigint) AS legacy_order_item_id,
  CAST(NULL AS bigint) AS gc_unit_price_minor,
  CAST(NULL AS bigint) AS legacy_unit_price_minor,
  CAST(NULL AS bigint) AS delta_unit_minor,
  CAST(NULL AS bigint) AS gc_line_subtotal_minor,
  CAST(NULL AS bigint) AS legacy_extended_minor,
  CAST(NULL AS bigint) AS delta_extended_minor,
  CAST(NULL AS text) AS issue_category
WHERE false;

COMMENT ON VIEW gc_commerce.v_audit_line_vs_legacy_unit_price IS
  'Retired: depended on public.order_items (removed). line_vs_legacy_unit_mismatch_count in v_pricing_checkout_audit_summary is therefore always 0.';

-- -----------------------------------------------------------------------------
-- C) Checkout guard: header equation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_checkout_guard_header_total AS
SELECT
  go.id AS gc_order_id,
  go.order_number,
  go.subtotal_minor,
  go.discount_minor,
  go.shipping_minor,
  go.tax_minor,
  go.total_minor,
  (go.subtotal_minor - go.discount_minor + go.shipping_minor + go.tax_minor) AS expected_total_minor,
  (go.total_minor - (go.subtotal_minor - go.discount_minor + go.shipping_minor + go.tax_minor)) AS delta_total_minor,
  'header_total_equation' AS issue_category
FROM gc_commerce.orders go
WHERE go.total_minor
  <> (go.subtotal_minor - go.discount_minor + go.shipping_minor + go.tax_minor);

COMMENT ON VIEW gc_commerce.v_checkout_guard_header_total IS
  'Orders where total_minor != subtotal - discount + shipping + tax (checkout composition).';

-- -----------------------------------------------------------------------------
-- D) Checkout guard: sum(line subtotals) vs header subtotal
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_checkout_guard_lines_subtotal_vs_header AS
WITH s AS (
  SELECT order_id, SUM(line_subtotal_minor) AS sum_line_subtotal_minor
  FROM gc_commerce.order_lines
  GROUP BY order_id
)
SELECT
  go.id AS gc_order_id,
  go.order_number,
  go.subtotal_minor AS header_subtotal_minor,
  s.sum_line_subtotal_minor,
  (go.subtotal_minor - COALESCE(s.sum_line_subtotal_minor, 0)) AS delta_subtotal_minor,
  'lines_subtotal_vs_header' AS issue_category
FROM gc_commerce.orders go
LEFT JOIN s ON s.order_id = go.id
WHERE EXISTS (SELECT 1 FROM gc_commerce.order_lines ol WHERE ol.order_id = go.id)
  AND ABS(go.subtotal_minor - COALESCE(s.sum_line_subtotal_minor, 0)) > 1;

COMMENT ON VIEW gc_commerce.v_checkout_guard_lines_subtotal_vs_header IS
  'Orders where header subtotal does not match sum of line_subtotal_minor.';

-- -----------------------------------------------------------------------------
-- E) Checkout guard: full reconciliation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_checkout_guard_full_reconciliation AS
WITH s AS (
  SELECT
    order_id,
    SUM(total_minor) AS sum_line_total_minor,
    SUM(tax_minor) AS sum_line_tax_minor,
    SUM(discount_minor) AS sum_line_discount_minor
  FROM gc_commerce.order_lines
  GROUP BY order_id
)
SELECT
  go.id AS gc_order_id,
  go.order_number,
  go.total_minor AS header_total_minor,
  go.subtotal_minor,
  go.discount_minor AS header_discount_minor,
  go.shipping_minor,
  go.tax_minor AS header_tax_minor,
  s.sum_line_total_minor,
  s.sum_line_tax_minor,
  s.sum_line_discount_minor,
  (
    COALESCE(s.sum_line_total_minor, 0) + go.shipping_minor + go.tax_minor - go.discount_minor
  ) AS recomputed_from_lines_plus_ship_tax_minus_header_discount,
  (
    go.total_minor
    - (
      COALESCE(s.sum_line_total_minor, 0) + go.shipping_minor + go.tax_minor - go.discount_minor
    )
  ) AS delta_full_reconciliation_minor,
  'full_checkout_reconciliation' AS issue_category
FROM gc_commerce.orders go
LEFT JOIN s ON s.order_id = go.id
WHERE EXISTS (SELECT 1 FROM gc_commerce.order_lines ol WHERE ol.order_id = go.id)
  AND ABS(
    go.total_minor
    - (
      COALESCE(s.sum_line_total_minor, 0) + go.shipping_minor + go.tax_minor - go.discount_minor
    )
  ) > 1;

COMMENT ON VIEW gc_commerce.v_checkout_guard_full_reconciliation IS
  'Strict full stack: header total vs sum(line total_minor)+shipping+tax-header_discount. '
  'Often fails when tax lives only on header (migrated backfill sets line tax=0) — see v_checkout_guard_tax_allocation.';

-- -----------------------------------------------------------------------------
-- F) Tax allocation signal
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_checkout_guard_tax_allocation AS
WITH lt AS (
  SELECT order_id, SUM(tax_minor) AS sum_line_tax, COUNT(*) AS line_count
  FROM gc_commerce.order_lines
  GROUP BY order_id
)
SELECT
  go.id AS gc_order_id,
  go.order_number,
  go.tax_minor AS header_tax_minor,
  COALESCE(lt.sum_line_tax, 0) AS sum_line_tax_minor,
  COALESCE(lt.line_count, 0)::BIGINT AS line_count,
  'header_tax_not_allocated_to_lines' AS issue_category
FROM gc_commerce.orders go
LEFT JOIN lt ON lt.order_id = go.id
WHERE go.tax_minor > 0
  AND COALESCE(lt.sum_line_tax, 0) = 0
  AND COALESCE(lt.line_count, 0) > 0;

COMMENT ON VIEW gc_commerce.v_checkout_guard_tax_allocation IS
  'Orders with positive header tax but zero sum of line tax_minor (expected for current backfill).';

-- -----------------------------------------------------------------------------
-- G) Margin: per-line goods contribution using public.products.cost at legacy_product_id
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_audit_line_margin AS
SELECT
  ol.id AS gc_order_line_id,
  ol.order_id,
  ol.line_number,
  ol.quantity,
  ol.unit_price_minor,
  ol.line_subtotal_minor,
  (NULLIF(ol.product_snapshot->>'legacy_product_id', ''))::BIGINT AS legacy_product_id,
  p.cost AS legacy_product_cost_dollars,
  CASE
    WHEN p.cost IS NULL THEN NULL
    ELSE ROUND(p.cost * 100)::BIGINT
  END AS unit_cost_minor_assumed_per_unit,
  CASE
    WHEN p.cost IS NULL THEN NULL
    ELSE ROUND(p.cost * 100)::BIGINT * ol.quantity::BIGINT
  END AS extended_cost_minor,
  CASE
    WHEN p.cost IS NULL THEN NULL
    ELSE ol.line_subtotal_minor - (ROUND(p.cost * 100)::BIGINT * ol.quantity::BIGINT)
  END AS goods_contribution_minor,
  CASE
    WHEN p.cost IS NULL THEN 'cost_unknown'
    WHEN p.cost < 0 THEN 'invalid_negative_cost'
    WHEN ol.line_subtotal_minor < (ROUND(p.cost * 100)::BIGINT * ol.quantity::BIGINT) - 1
      THEN 'negative_goods_margin'
    ELSE 'ok_or_low_margin'
  END AS margin_status
FROM gc_commerce.order_lines ol
LEFT JOIN public.products p ON p.id = (NULLIF(ol.product_snapshot->>'legacy_product_id', ''))::BIGINT;

COMMENT ON VIEW gc_commerce.v_audit_line_margin IS
  'All lines with margin_status; filter WHERE margin_status IN (...) for risks.';

CREATE OR REPLACE VIEW gc_commerce.v_audit_margin_risks_only AS
SELECT *
FROM gc_commerce.v_audit_line_margin
WHERE margin_status IN ('negative_goods_margin', 'invalid_negative_cost', 'cost_unknown');

COMMENT ON VIEW gc_commerce.v_audit_margin_risks_only IS
  'Subset: negative margin, bad cost, or missing cost (analytics gap).';

-- -----------------------------------------------------------------------------
-- H) Order-level margin rollup
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_audit_order_margin_summary AS
SELECT
  m.order_id,
  COUNT(*)::BIGINT AS line_count,
  COUNT(*) FILTER (WHERE m.margin_status = 'cost_unknown')::BIGINT AS lines_cost_unknown,
  COUNT(*) FILTER (WHERE m.margin_status = 'negative_goods_margin')::BIGINT AS lines_negative_margin,
  COUNT(*) FILTER (WHERE m.margin_status = 'invalid_negative_cost')::BIGINT AS lines_invalid_cost,
  SUM(m.line_subtotal_minor) AS sum_line_subtotal_minor,
  SUM(COALESCE(m.extended_cost_minor, 0)) FILTER (WHERE m.extended_cost_minor IS NOT NULL) AS sum_extended_cost_minor_known_lines_only
FROM gc_commerce.v_audit_line_margin m
GROUP BY m.order_id;

COMMENT ON VIEW gc_commerce.v_audit_order_margin_summary IS
  'Per-order counts for margin risk triage.';

-- -----------------------------------------------------------------------------
-- I) One-row dashboard
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_pricing_checkout_audit_summary AS
SELECT
  (SELECT COUNT(*) FROM gc_commerce.v_audit_line_internal_pricing) AS line_internal_pricing_issue_count,
  (SELECT COUNT(*) FROM gc_commerce.v_audit_line_vs_legacy_unit_price) AS line_vs_legacy_unit_mismatch_count,
  (SELECT COUNT(*) FROM gc_commerce.v_checkout_guard_header_total) AS checkout_header_equation_failure_count,
  (SELECT COUNT(*) FROM gc_commerce.v_checkout_guard_lines_subtotal_vs_header) AS checkout_lines_vs_header_subtotal_count,
  (SELECT COUNT(*) FROM gc_commerce.v_checkout_guard_full_reconciliation) AS checkout_full_reconciliation_mismatch_count,
  (SELECT COUNT(*) FROM gc_commerce.v_checkout_guard_tax_allocation) AS checkout_tax_not_on_lines_count,
  (SELECT COUNT(*) FROM gc_commerce.v_audit_line_margin WHERE margin_status = 'negative_goods_margin') AS lines_negative_goods_margin_count,
  (SELECT COUNT(*) FROM gc_commerce.v_audit_line_margin WHERE margin_status = 'invalid_negative_cost') AS lines_invalid_negative_cost_count,
  (SELECT COUNT(*) FROM gc_commerce.v_audit_line_margin WHERE margin_status = 'cost_unknown') AS lines_cost_unknown_count,
  (SELECT COUNT(*) FROM gc_commerce.order_lines) AS total_gc_order_lines,
  (SELECT COUNT(*) FROM gc_commerce.orders) AS total_gc_orders;

COMMENT ON VIEW gc_commerce.v_pricing_checkout_audit_summary IS
  'Pricing Engine Auditor + Checkout Guard: aggregate counts. Interpret tax_not_on_lines separately from errors.';

GRANT SELECT ON gc_commerce.v_audit_line_internal_pricing TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_audit_line_vs_legacy_unit_price TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_checkout_guard_header_total TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_checkout_guard_lines_subtotal_vs_header TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_checkout_guard_full_reconciliation TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_checkout_guard_tax_allocation TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_audit_line_margin TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_audit_margin_risks_only TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_audit_order_margin_summary TO postgres, service_role;
GRANT SELECT ON gc_commerce.v_pricing_checkout_audit_summary TO postgres, service_role;
