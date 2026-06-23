CREATE OR REPLACE FUNCTION public.admin_update_variant_fulfillment_atomic(
  p_catalog_variant_id uuid,
  p_operator_user_id uuid,
  p_fulfillment_mode text,
  p_inventory_visibility text,
  p_stock_enforcement boolean,
  p_reorder_point int DEFAULT NULL,
  p_default_bin_location text DEFAULT NULL,
  p_default_location_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, catalog_v2
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_row catalog_v2.catalog_variants%ROWTYPE;
BEGIN
  IF p_fulfillment_mode NOT IN ('stocked', 'dropship') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_FULFILLMENT_MODE', 'error', 'fulfillment_mode must be stocked or dropship');
  END IF;
  IF p_inventory_visibility NOT IN ('hidden', 'status', 'quantity') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_VISIBILITY', 'error', 'invalid inventory_visibility');
  END IF;

  SELECT * INTO v_row FROM catalog_v2.catalog_variants WHERE id = p_catalog_variant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VARIANT_NOT_FOUND', 'error', 'Variant not found');
  END IF;

  v_before := jsonb_build_object(
    'fulfillment_mode', v_row.fulfillment_mode,
    'inventory_visibility', v_row.inventory_visibility,
    'stock_enforcement', v_row.stock_enforcement,
    'reorder_point', v_row.reorder_point,
    'default_bin_location', v_row.default_bin_location,
    'default_location_code', v_row.default_location_code
  );

  UPDATE catalog_v2.catalog_variants
  SET
    fulfillment_mode = p_fulfillment_mode,
    inventory_visibility = p_inventory_visibility,
    stock_enforcement = COALESCE(p_stock_enforcement, false),
    reorder_point = CASE WHEN p_fulfillment_mode = 'stocked' THEN GREATEST(COALESCE(p_reorder_point, reorder_point), 0) ELSE 0 END,
    default_bin_location = CASE WHEN p_fulfillment_mode = 'stocked' THEN NULLIF(btrim(p_default_bin_location), '') ELSE NULL END,
    default_location_code = CASE WHEN p_fulfillment_mode = 'stocked' THEN COALESCE(NULLIF(btrim(p_default_location_code), ''), 'default') ELSE 'default' END,
    updated_at = now()
  WHERE id = p_catalog_variant_id
  RETURNING * INTO v_row;

  v_after := jsonb_build_object(
    'fulfillment_mode', v_row.fulfillment_mode,
    'inventory_visibility', v_row.inventory_visibility,
    'stock_enforcement', v_row.stock_enforcement,
    'reorder_point', v_row.reorder_point,
    'default_bin_location', v_row.default_bin_location,
    'default_location_code', v_row.default_location_code
  );

  INSERT INTO catalog_v2.variant_fulfillment_audit (catalog_variant_id, operator_user_id, before_state, after_state)
  VALUES (p_catalog_variant_id, p_operator_user_id, v_before, v_after);

  RETURN jsonb_build_object('ok', true, 'catalog_variant_id', p_catalog_variant_id, 'after', v_after);
END;
$$;
