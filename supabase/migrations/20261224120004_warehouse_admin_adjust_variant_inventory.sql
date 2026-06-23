CREATE OR REPLACE FUNCTION public.admin_adjust_variant_inventory_atomic(
  p_catalog_variant_id uuid,
  p_operator_user_id uuid,
  p_delta int,
  p_reason text,
  p_location_code text DEFAULT 'default'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, catalog_v2
AS $$
DECLARE
  v_inv catalog_v2.variant_inventory%ROWTYPE;
  v_new_oh int;
  v_bal int;
  v_loc text := COALESCE(NULLIF(btrim(p_location_code), ''), 'default');
  v_mode text;
BEGIN
  SELECT fulfillment_mode INTO v_mode FROM catalog_v2.catalog_variants WHERE id = p_catalog_variant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VARIANT_NOT_FOUND', 'error', 'Variant not found');
  END IF;
  IF v_mode <> 'stocked' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_STOCKED_VARIANT', 'error', 'Manual warehouse adjustment requires stocked fulfillment_mode');
  END IF;
  IF p_delta IS NULL OR p_delta = 0 OR NULLIF(btrim(p_reason), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DELTA_REASON_REQUIRED', 'error', 'Non-zero delta and reason required');
  END IF;

  INSERT INTO catalog_v2.variant_inventory (catalog_variant_id, location_code, quantity_on_hand, quantity_reserved, quantity_uom)
  VALUES (p_catalog_variant_id, v_loc, 0, 0, 'case')
  ON CONFLICT (catalog_variant_id, location_code) DO NOTHING;

  SELECT * INTO v_inv FROM catalog_v2.variant_inventory vi
  WHERE vi.catalog_variant_id = p_catalog_variant_id AND vi.location_code = v_loc FOR UPDATE;

  v_new_oh := GREATEST(0, COALESCE(v_inv.quantity_on_hand, 0) + p_delta);
  IF COALESCE(v_inv.quantity_reserved, 0) > v_new_oh THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RESERVED_EXCEEDS_ON_HAND', 'error', 'Would leave on_hand below reserved');
  END IF;

  UPDATE catalog_v2.variant_inventory SET quantity_on_hand = v_new_oh, updated_at = now()
  WHERE catalog_variant_id = p_catalog_variant_id AND location_code = v_loc;

  SELECT quantity_on_hand INTO v_bal FROM catalog_v2.variant_inventory
  WHERE catalog_variant_id = p_catalog_variant_id AND location_code = v_loc;

  INSERT INTO catalog_v2.variant_stock_history (
    catalog_variant_id, location_code, delta, type, reference_type, notes, user_id, balance_after, metadata
  ) VALUES (
    p_catalog_variant_id, v_loc, p_delta, 'adjust', 'admin', btrim(p_reason), p_operator_user_id, COALESCE(v_bal, 0),
    jsonb_build_object('quantity_uom', 'case')
  );

  RETURN jsonb_build_object('ok', true, 'quantity_on_hand', COALESCE(v_bal, 0), 'quantity_reserved', COALESCE(v_inv.quantity_reserved, 0));
END;
$$;
