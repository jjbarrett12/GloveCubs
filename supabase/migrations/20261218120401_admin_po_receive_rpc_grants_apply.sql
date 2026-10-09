-- =============================================================================
-- Grant pass for admin_receive_purchase_order_full* after 20261218120400.
-- Single DO statement avoids Supabase CLI 2.75 splitter (SQLSTATE 42601) when
-- static multi-statement files reference identifiers containing "atomic".
-- Handles both _full_atomic (restored history / existing envs) and _full
-- (staging temporary rename).
-- =============================================================================

DO $body$
DECLARE
  has_atomic boolean := false;
  has_full boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_receive_purchase_order_full_atomic'
      AND p.pronargs = 3
  ) INTO has_atomic;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_receive_purchase_order_full'
      AND p.pronargs = 3
  ) INTO has_full;

  IF has_atomic THEN
    EXECUTE $c$
COMMENT ON FUNCTION public.admin_receive_purchase_order_full_atomic(bigint, uuid, jsonb) IS
  'Locks PO row, validates full receive against PO lines, updates inventory + stock_history once, marks PO received.'
$c$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.admin_receive_purchase_order_full_atomic(bigint, uuid, jsonb) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.admin_receive_purchase_order_full_atomic(bigint, uuid, jsonb) FROM anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_receive_purchase_order_full_atomic(bigint, uuid, jsonb) TO service_role';
  END IF;

  IF has_full THEN
    EXECUTE $c$
COMMENT ON FUNCTION public.admin_receive_purchase_order_full(bigint, uuid, jsonb) IS
  'Compatibility name for admin_receive_purchase_order_full_atomic (or temporary rename).'
$c$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.admin_receive_purchase_order_full(bigint, uuid, jsonb) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.admin_receive_purchase_order_full(bigint, uuid, jsonb) FROM anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_receive_purchase_order_full(bigint, uuid, jsonb) TO service_role';
  END IF;

  IF NOT has_atomic AND NOT has_full THEN
    RAISE NOTICE '20261218120401: skip grants — neither receive function present';
  END IF;
END;
$body$;
