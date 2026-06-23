-- Explicit revoke: Supabase default grants leave EXECUTE on anon/authenticated after PUBLIC revoke.
REVOKE ALL ON FUNCTION public.admin_receive_purchase_order_full_atomic(bigint, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_receive_purchase_order_full_atomic(bigint, uuid, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_receive_purchase_order_full_atomic(bigint, uuid, jsonb) TO service_role;
