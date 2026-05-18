-- Phase 0A: Pricing Authority V2 RPC (company tier path; guest resolution remains Node for shadow).

CREATE OR REPLACE FUNCTION gc_commerce.resolve_pricing_authority_v2(
  p_company_id UUID,
  p_catalog_variant_id UUID,
  p_variant_sku TEXT,
  p_quantity INT DEFAULT 1,
  p_flow TEXT DEFAULT 'unknown'
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = gc_commerce, catalog_v2, catalogos, public
AS $fn$
DECLARE
  v_sku TEXT;
  v_product_id UUID;
  v_inner JSONB;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 99999 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  v_sku := NULLIF(TRIM(p_variant_sku), '');
  IF v_sku IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'price_available', false,
      'error', 'missing_variant_sku',
      'authority_version', 'v2.0',
      'flow', COALESCE(p_flow, 'unknown')
    );
  END IF;

  SELECT v.catalog_product_id
  INTO v_product_id
  FROM catalog_v2.catalog_variants v
  WHERE v.id = p_catalog_variant_id
    AND v.is_active = true
    AND TRIM(v.variant_sku) = v_sku;

  IF v_product_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'price_available', false,
      'error', 'variant_not_found_or_sku_mismatch',
      'catalog_variant_id', p_catalog_variant_id,
      'authority_version', 'v2.0',
      'flow', COALESCE(p_flow, 'unknown')
    );
  END IF;

  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'price_available', false,
      'error', 'guest_requires_node_resolver',
      'catalog_variant_id', p_catalog_variant_id,
      'catalog_product_id', v_product_id,
      'variant_sku', v_sku,
      'quantity', p_quantity,
      'authority_version', 'v2.0',
      'pricing_source', 'guest_use_node_resolver_v1',
      'flow', COALESCE(p_flow, 'unknown')
    );
  END IF;

  v_inner := gc_commerce.resolve_buyer_unit_price(p_company_id, p_catalog_variant_id, p_quantity);

  RETURN v_inner
    || jsonb_build_object(
      'ok', true,
      'catalog_variant_id', p_catalog_variant_id,
      'catalog_product_id', v_product_id,
      'variant_sku', v_sku,
      'price_available', (v_inner->>'resolved_unit_price_major') IS NOT NULL,
      'authority_version', 'v2.0',
      'pricing_mode_applied', 'tier_off_list',
      'precedence_step', 2,
      'flow', COALESCE(p_flow, 'unknown')
    );
END;
$fn$;

COMMENT ON FUNCTION gc_commerce.resolve_pricing_authority_v2(UUID, UUID, TEXT, INT, TEXT) IS
  'Pricing Authority V2 (Phase 0A): variant-validated company tier off site list. Guest/no-company lines use Node resolver.';

REVOKE ALL ON FUNCTION gc_commerce.resolve_pricing_authority_v2(UUID, UUID, TEXT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gc_commerce.resolve_pricing_authority_v2(UUID, UUID, TEXT, INT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.gc_resolve_pricing_authority_v2(
  p_company_id UUID,
  p_catalog_variant_id UUID,
  p_variant_sku TEXT,
  p_quantity INT DEFAULT 1,
  p_flow TEXT DEFAULT 'unknown'
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, gc_commerce
AS $w$
BEGIN
  RETURN gc_commerce.resolve_pricing_authority_v2(
    p_company_id,
    p_catalog_variant_id,
    p_variant_sku,
    COALESCE(p_quantity, 1),
    p_flow
  );
END;
$w$;

COMMENT ON FUNCTION public.gc_resolve_pricing_authority_v2(UUID, UUID, TEXT, INT, TEXT) IS
  'PostgREST wrapper for gc_commerce.resolve_pricing_authority_v2.';

REVOKE ALL ON FUNCTION public.gc_resolve_pricing_authority_v2(UUID, UUID, TEXT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gc_resolve_pricing_authority_v2(UUID, UUID, TEXT, INT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.gc_resolve_pricing_authority_v2(UUID, UUID, TEXT, INT, TEXT) TO authenticated;
