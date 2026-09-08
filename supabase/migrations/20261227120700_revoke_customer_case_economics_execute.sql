-- Launch gate: revoke customer EXECUTE on supplier case-economics RPCs.
-- SECURITY DEFINER previously allowed any authenticated PostgREST caller to read
-- supplier_offers-derived economics (cost/sell via COALESCE), bypassing Phase 1 cost lockdown.
-- Storefront PDP already calls these via service-role (getSupabaseAdmin).

REVOKE ALL ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) FROM anon;
REVOKE ALL ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) TO postgres;

REVOKE ALL ON FUNCTION public.gc_variant_case_economics_batch(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gc_variant_case_economics_batch(UUID[]) FROM anon;
REVOKE ALL ON FUNCTION public.gc_variant_case_economics_batch(UUID[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gc_variant_case_economics_batch(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.gc_variant_case_economics_batch(UUID[]) TO postgres;

COMMENT ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) IS
  'Server-authoritative case/pack economics per variant; service_role only (customers must not EXECUTE).';

COMMENT ON FUNCTION public.gc_variant_case_economics_batch(UUID[]) IS
  'Thin wrapper over gc_commerce.variant_case_economics_batch; service_role only.';
