-- =============================================================================
-- Phase 2B-0: Variant-scoped list pricing + batch buyer/case economics contracts.
-- - catalogos.variant_best_offer_price (no sibling / parent fallback)
-- - gc_commerce.resolve_buyer_unit_price uses variant list only
-- - gc_commerce.resolve_buyer_unit_prices_batch (max 50)
-- - gc_commerce.variant_case_economics_batch (server case $ only)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Variant-scoped site list (SKU-matched offers only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW catalogos.variant_best_offer_price AS
SELECT
  v.id AS catalog_variant_id,
  v.catalog_product_id,
  MIN(COALESCE(so.sell_price, so.cost)) AS list_unit_price_major,
  COUNT(*)::INT AS offer_count,
  'catalogos.supplier_offers.variant_sku_v1'::TEXT AS pricing_source,
  'USD'::TEXT AS currency_code
FROM catalog_v2.catalog_variants v
INNER JOIN catalogos.supplier_offers so
  ON so.product_id = v.catalog_product_id
 AND so.is_active = true
 AND so.supplier_sku = v.variant_sku
 AND COALESCE(so.sell_price, so.cost) IS NOT NULL
 AND COALESCE(so.sell_price, so.cost) > 0
WHERE v.is_active = true
GROUP BY v.id, v.catalog_product_id;

COMMENT ON VIEW catalogos.variant_best_offer_price IS
  'Per-variant min list unit from active catalogos.supplier_offers matched by catalog_product_id + variant_sku. No parent aggregate or sibling fallback.';

GRANT SELECT ON catalogos.variant_best_offer_price TO authenticated;
GRANT SELECT ON catalogos.variant_best_offer_price TO service_role;

-- Storefront admin client queries public schema (same pattern as product_best_offer_price exposure).
CREATE OR REPLACE VIEW public.variant_best_offer_price AS
SELECT
  catalog_variant_id,
  catalog_product_id,
  list_unit_price_major,
  offer_count,
  pricing_source,
  currency_code
FROM catalogos.variant_best_offer_price;

COMMENT ON VIEW public.variant_best_offer_price IS
  'Public read surface for storefront PDP variant list pricing (catalogos.variant_best_offer_price).';

GRANT SELECT ON public.variant_best_offer_price TO authenticated;
GRANT SELECT ON public.variant_best_offer_price TO service_role;

-- -----------------------------------------------------------------------------
-- 2) Single buyer unit price — variant list authority only
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gc_commerce.resolve_buyer_unit_price(
  p_company_id UUID,
  p_catalog_variant_id UUID,
  p_quantity INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = gc_commerce, catalog_v2, catalogos, public
AS $fn$
DECLARE
  v_tier TEXT;
  v_discount INT;
  v_product_id UUID;
  v_list NUMERIC;
  v_list_minor BIGINT;
  v_res_minor BIGINT;
  v_currency TEXT := 'USD';
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 99999 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  IF auth.role() = 'service_role' THEN
    NULL;
  ELSIF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM gc_commerce.company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
  ) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT c.b2b_pricing_tier_code
  INTO v_tier
  FROM gc_commerce.companies c
  WHERE c.id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'company_not_found');
  END IF;

  v_discount := CASE v_tier
    WHEN 'cub' THEN 10
    WHEN 'grizzly' THEN 20
    WHEN 'kodiak' THEN 30
    ELSE 10
  END;

  SELECT v.catalog_product_id
  INTO v_product_id
  FROM catalog_v2.catalog_variants v
  WHERE v.id = p_catalog_variant_id
    AND v.is_active = true;

  IF v_product_id IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'variant_not_found_or_inactive',
      'catalog_variant_id', p_catalog_variant_id,
      'pricing_tier_code', v_tier,
      'discount_percent', v_discount,
      'is_variant_specific_list', false
    );
  END IF;

  SELECT vp.list_unit_price_major
  INTO v_list
  FROM catalogos.variant_best_offer_price vp
  WHERE vp.catalog_variant_id = p_catalog_variant_id;

  IF v_list IS NULL OR v_list <= 0 THEN
    RETURN jsonb_build_object(
      'company_id', p_company_id,
      'catalog_variant_id', p_catalog_variant_id,
      'catalog_product_id', v_product_id,
      'quantity', p_quantity,
      'list_unit_price_major', NULL,
      'list_unit_price_minor', NULL,
      'pricing_tier_code', v_tier,
      'discount_percent', v_discount,
      'resolved_unit_price_major', NULL,
      'resolved_unit_price_minor', NULL,
      'currency_code', v_currency,
      'pricing_source', 'site_list_unavailable',
      'is_variant_specific_list', false,
      'computed_at', to_jsonb(now())
    );
  END IF;

  v_list_minor := ROUND(v_list * 100)::BIGINT;
  v_res_minor := ROUND(v_list_minor * (100 - v_discount) / 100.0)::BIGINT;

  RETURN jsonb_build_object(
    'company_id', p_company_id,
    'catalog_variant_id', p_catalog_variant_id,
    'catalog_product_id', v_product_id,
    'quantity', p_quantity,
    'list_unit_price_major', v_list,
    'list_unit_price_minor', v_list_minor,
    'pricing_tier_code', v_tier,
    'discount_percent', v_discount,
    'resolved_unit_price_major', (v_res_minor::NUMERIC / 100.0),
    'resolved_unit_price_minor', v_res_minor,
    'currency_code', v_currency,
    'pricing_source', 'site_variant_list_x_company_tier_v1',
    'is_variant_specific_list', true,
    'computed_at', to_jsonb(now())
  );
END;
$fn$;

COMMENT ON FUNCTION gc_commerce.resolve_buyer_unit_price(UUID, UUID, INT) IS
  'Variant-scoped site list from catalogos.variant_best_offer_price × company B2B tier. No product_best_offer_price fallback.';

-- -----------------------------------------------------------------------------
-- 3) Batch buyer unit prices (per-item JSON objects; max 50 ids)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gc_commerce.resolve_buyer_unit_prices_batch(
  p_company_id UUID,
  p_catalog_variant_ids UUID[],
  p_quantity INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = gc_commerce, catalog_v2, catalogos, public
AS $batch$
DECLARE
  v_id UUID;
  v_results JSONB := '[]'::JSONB;
  v_item JSONB;
  v_len INT;
BEGIN
  IF p_catalog_variant_ids IS NULL OR array_length(p_catalog_variant_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('error', 'empty_variant_ids', 'items', '[]'::JSONB);
  END IF;

  v_len := array_length(p_catalog_variant_ids, 1);
  IF v_len > 50 THEN
    RETURN jsonb_build_object('error', 'too_many_variant_ids', 'max', 50, 'received', v_len);
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 99999 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  FOREACH v_id IN ARRAY p_catalog_variant_ids
  LOOP
    BEGIN
      v_item := gc_commerce.resolve_buyer_unit_price(p_company_id, v_id, p_quantity);
    EXCEPTION
      WHEN OTHERS THEN
        v_item := jsonb_build_object(
          'catalog_variant_id', v_id,
          'error', SQLERRM,
          'pricing_source', 'batch_item_error'
        );
    END;
    v_results := v_results || jsonb_build_array(v_item);
  END LOOP;

  RETURN jsonb_build_object(
    'company_id', p_company_id,
    'quantity', p_quantity,
    'items', v_results
  );
END;
$batch$;

COMMENT ON FUNCTION gc_commerce.resolve_buyer_unit_prices_batch(UUID, UUID[], INT) IS
  'Batch wrapper: up to 50 variant ids; each element is resolve_buyer_unit_price result or per-item error object.';

REVOKE ALL ON FUNCTION gc_commerce.resolve_buyer_unit_prices_batch(UUID, UUID[], INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gc_commerce.resolve_buyer_unit_prices_batch(UUID, UUID[], INT) TO service_role;
GRANT EXECUTE ON FUNCTION gc_commerce.resolve_buyer_unit_prices_batch(UUID, UUID[], INT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4) Case economics batch (SQL-only case price; SKU-matched offers)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gc_commerce.variant_case_economics_batch(
  p_catalog_variant_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = gc_commerce, catalog_v2, catalogos, public
AS $case$
DECLARE
  v_id UUID;
  v_results JSONB := '[]'::JSONB;
  v_len INT;
  v_row RECORD;
  v_list_unit NUMERIC;
  v_list_case NUMERIC;
  v_units NUMERIC;
BEGIN
  IF p_catalog_variant_ids IS NULL OR array_length(p_catalog_variant_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::JSONB);
  END IF;

  v_len := array_length(p_catalog_variant_ids, 1);
  IF v_len > 50 THEN
    RETURN jsonb_build_object('error', 'too_many_variant_ids', 'max', 50, 'received', v_len);
  END IF;

  FOREACH v_id IN ARRAY p_catalog_variant_ids
  LOOP
    SELECT
      v.id AS catalog_variant_id,
      vp.list_unit_price_major,
      so.cost_basis,
      so.pack_qty,
      so.units_per_case,
      so.normalized_unit_uom,
      so.normalization_confidence,
      COALESCE(so.sell_price, so.cost) AS offer_price
    INTO v_row
    FROM catalog_v2.catalog_variants v
    LEFT JOIN catalogos.variant_best_offer_price vp ON vp.catalog_variant_id = v.id
    LEFT JOIN LATERAL (
      SELECT so.*
      FROM catalogos.supplier_offers so
      WHERE so.product_id = v.catalog_product_id
        AND so.is_active = true
        AND so.supplier_sku = v.variant_sku
        AND COALESCE(so.sell_price, so.cost) IS NOT NULL
        AND COALESCE(so.sell_price, so.cost) > 0
      ORDER BY COALESCE(so.sell_price, so.cost) ASC
      LIMIT 1
    ) so ON true
    WHERE v.id = v_id
      AND v.is_active = true;

    IF NOT FOUND THEN
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'catalog_variant_id', v_id,
          'error', 'variant_not_found_or_inactive'
        )
      );
      CONTINUE;
    END IF;

    v_list_unit := v_row.list_unit_price_major;
    v_units := NULL;
    IF v_row.pack_qty IS NOT NULL AND v_row.pack_qty > 0 THEN
      v_units := v_row.pack_qty;
    ELSIF v_row.units_per_case IS NOT NULL AND v_row.units_per_case > 0 THEN
      v_units := v_row.units_per_case::NUMERIC;
    END IF;

    v_list_case := NULL;
    IF v_row.cost_basis = 'per_case' AND v_row.offer_price IS NOT NULL AND v_row.offer_price > 0 THEN
      v_list_case := v_row.offer_price;
    ELSIF v_row.cost_basis = 'per_each'
      AND v_units IS NOT NULL
      AND v_list_unit IS NOT NULL
      AND v_list_unit > 0 THEN
      v_list_case := v_list_unit * v_units;
    END IF;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'catalog_variant_id', v_row.catalog_variant_id,
        'units_per_case', v_units,
        'uom_label', COALESCE(NULLIF(TRIM(v_row.normalized_unit_uom), ''), 'each'),
        'cost_basis', v_row.cost_basis,
        'list_unit_price_major', v_list_unit,
        'list_case_price_major', v_list_case,
        'case_pricing_source', CASE
          WHEN v_list_case IS NOT NULL THEN 'supplier_offer.cost_basis_v1'
          ELSE NULL
        END,
        'normalization_confidence', v_row.normalization_confidence,
        'packaging_spec', NULL
      )
    );
  END LOOP;

  RETURN jsonb_build_object('items', v_results);
END;
$case$;

COMMENT ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) IS
  'Server-authoritative case/pack economics per variant; list_case_price_major computed in SQL only.';

REVOKE ALL ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION gc_commerce.variant_case_economics_batch(UUID[]) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5) Public RPC wrappers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gc_resolve_buyer_unit_price(
  p_company_id UUID,
  p_catalog_variant_id UUID,
  p_quantity INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, gc_commerce
AS $w$
BEGIN
  RETURN gc_commerce.resolve_buyer_unit_price(
    p_company_id,
    p_catalog_variant_id,
    COALESCE(p_quantity, 1)
  );
END;
$w$;

CREATE OR REPLACE FUNCTION public.gc_resolve_buyer_unit_prices_batch(
  p_company_id UUID,
  p_catalog_variant_ids UUID[],
  p_quantity INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, gc_commerce
AS $wb$
BEGIN
  RETURN gc_commerce.resolve_buyer_unit_prices_batch(
    p_company_id,
    p_catalog_variant_ids,
    COALESCE(p_quantity, 1)
  );
END;
$wb$;

COMMENT ON FUNCTION public.gc_resolve_buyer_unit_prices_batch(UUID, UUID[], INT) IS
  'Thin wrapper over gc_commerce.resolve_buyer_unit_prices_batch for Supabase RPC.';

REVOKE ALL ON FUNCTION public.gc_resolve_buyer_unit_prices_batch(UUID, UUID[], INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gc_resolve_buyer_unit_prices_batch(UUID, UUID[], INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gc_resolve_buyer_unit_prices_batch(UUID, UUID[], INT) TO service_role;

CREATE OR REPLACE FUNCTION public.gc_variant_case_economics_batch(
  p_catalog_variant_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, gc_commerce
AS $wc$
BEGIN
  RETURN gc_commerce.variant_case_economics_batch(p_catalog_variant_ids);
END;
$wc$;

COMMENT ON FUNCTION public.gc_variant_case_economics_batch(UUID[]) IS
  'Thin wrapper over gc_commerce.variant_case_economics_batch for Supabase RPC.';

REVOKE ALL ON FUNCTION public.gc_variant_case_economics_batch(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gc_variant_case_economics_batch(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.gc_variant_case_economics_batch(UUID[]) TO authenticated;
