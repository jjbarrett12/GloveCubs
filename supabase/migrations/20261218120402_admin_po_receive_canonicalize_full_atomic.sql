-- =============================================================================
-- Canonicalize PO full-receive RPC to admin_receive_purchase_order_full_atomic.
-- Single DO statement (CLI 2.75 safe). Does not duplicate function bodies.
--
-- Matrix:
--   only _full_atomic → keep; ensure _full thin wrapper
--   only _full        → rename to _full_atomic; ensure wrapper
--   both              → drop non-canonical _full then recreate as wrapper
--   neither           → RAISE (baseline must have created one)
-- =============================================================================

DO $body$
DECLARE
  atomic_oid oid;
  full_oid oid;
BEGIN
  SELECT p.oid INTO atomic_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'admin_receive_purchase_order_full_atomic'
    AND p.pronargs = 3
  ORDER BY p.oid
  LIMIT 1;

  SELECT p.oid INTO full_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'admin_receive_purchase_order_full'
    AND p.pronargs = 3
  ORDER BY p.oid
  LIMIT 1;

  IF atomic_oid IS NULL AND full_oid IS NULL THEN
    RAISE EXCEPTION '20261218120402: neither admin_receive_purchase_order_full_atomic nor _full(bigint,uuid,jsonb) exists';
  END IF;

  IF atomic_oid IS NULL AND full_oid IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.admin_receive_purchase_order_full(bigint, uuid, jsonb) RENAME TO admin_receive_purchase_order_full_atomic';
    atomic_oid := full_oid;
    full_oid := NULL;
  END IF;

  IF atomic_oid IS NOT NULL AND full_oid IS NOT NULL AND atomic_oid IS DISTINCT FROM full_oid THEN
    EXECUTE 'DROP FUNCTION public.admin_receive_purchase_order_full(bigint, uuid, jsonb)';
    full_oid := NULL;
  END IF;

  -- Thin compatibility wrapper (same signature); body delegates to canonical.
  EXECUTE $fn$
CREATE OR REPLACE FUNCTION public.admin_receive_purchase_order_full(
  p_po_id bigint,
  p_operator_user_id uuid,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $q$
  SELECT public.admin_receive_purchase_order_full_atomic(p_po_id, p_operator_user_id, p_lines);
$q$;
$fn$;

  EXECUTE $c$
COMMENT ON FUNCTION public.admin_receive_purchase_order_full_atomic(bigint, uuid, jsonb) IS
  'Locks PO row, validates full receive against PO lines, updates inventory + stock_history once, marks PO received.'
$c$;
  EXECUTE $c$
COMMENT ON FUNCTION public.admin_receive_purchase_order_full(bigint, uuid, jsonb) IS
  'Compatibility wrapper → admin_receive_purchase_order_full_atomic.'
$c$;

  EXECUTE 'REVOKE ALL ON FUNCTION public.admin_receive_purchase_order_full_atomic(bigint, uuid, jsonb) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.admin_receive_purchase_order_full_atomic(bigint, uuid, jsonb) FROM anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_receive_purchase_order_full_atomic(bigint, uuid, jsonb) TO service_role';

  EXECUTE 'REVOKE ALL ON FUNCTION public.admin_receive_purchase_order_full(bigint, uuid, jsonb) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.admin_receive_purchase_order_full(bigint, uuid, jsonb) FROM anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_receive_purchase_order_full(bigint, uuid, jsonb) TO service_role';
END;
$body$;
