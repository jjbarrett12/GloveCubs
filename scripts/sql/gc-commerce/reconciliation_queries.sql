-- =============================================================================
-- Reconciliation: backfill_log + gc_commerce health (final schema).
-- Legacy public.orders / gc_commerce.user_profiles are not used.
--
-- Run in Supabase SQL Editor or psql.
-- =============================================================================

-- Latest mapping-script summary (if present)
SELECT id, created_at, details AS snapshot
FROM gc_commerce.backfill_log
WHERE phase = 'summary'
ORDER BY id DESC
LIMIT 5;

SELECT id, phase, legacy_table, legacy_id, message, details, created_at
FROM gc_commerce.backfill_log
WHERE severity = 'warning'
ORDER BY id DESC;

SELECT phase, COUNT(*) AS warning_rows
FROM gc_commerce.backfill_log
WHERE severity = 'warning'
GROUP BY phase
ORDER BY warning_rows DESC;

-- Live health (gc_commerce + public.users identity only)
SELECT
  (SELECT COUNT(*) FROM public.users) AS public_users_rows,
  (SELECT COUNT(*) FROM gc_commerce.legacy_user_map) AS legacy_user_map_rows;

SELECT
  (SELECT COUNT(*) FROM gc_commerce.orders) AS gc_orders,
  (SELECT COUNT(*) FROM gc_commerce.order_lines) AS gc_order_lines;

SELECT
  (SELECT COUNT(*) FROM gc_commerce.sellable_products WHERE is_active) AS gc_sellable_active;

-- Optional dashboard view
CREATE OR REPLACE VIEW gc_commerce.v_mapping_backfill_health AS
SELECT
  (SELECT COUNT(*) FROM public.users) AS public_users_rows,
  (SELECT COUNT(*) FROM gc_commerce.legacy_user_map) AS legacy_user_map_rows,
  (SELECT COUNT(*) FROM gc_commerce.orders) AS gc_orders,
  (SELECT COUNT(*) FROM gc_commerce.order_lines) AS gc_order_lines,
  (SELECT COUNT(*) FROM gc_commerce.sellable_products WHERE is_active) AS gc_sellable_active,
  (SELECT COUNT(*) FROM gc_commerce.backfill_log WHERE severity = 'warning') AS backfill_warning_log_rows;

COMMENT ON VIEW gc_commerce.v_mapping_backfill_health IS
  'Row counts for gc_commerce and public.users; legacy order/user_profiles reconciliation removed.';

GRANT SELECT ON gc_commerce.v_mapping_backfill_health TO postgres, service_role;
