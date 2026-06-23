CREATE OR REPLACE FUNCTION public.gc_reserve_variant_stock_for_order_atomic(
  p_order_id uuid,
  p_user_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, gc_commerce, catalog_v2
AS $$
DECLARE
  elem jsonb;
  v_qty int;
  v_vid uuid;
  v_loc text;
  inv_row catalog_v2.variant_inventory%ROWTYPE;
  v_avail int;
  v_reserved_at timestamptz;
  v_mode text;
  v_enforce boolean;
BEGIN
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'order_id required' USING ERRCODE = 'P0001'; END IF;

  SELECT inventory_reserved_at INTO v_reserved_at FROM gc_commerce.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gc order % not found', p_order_id USING ERRCODE = 'P0001'; END IF;
  IF v_reserved_at IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'skipped', true); END IF;

  FOR elem IN
    SELECT x.value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS x(value)
    ORDER BY COALESCE(NULLIF(TRIM(x.value->>'catalog_variant_id'), ''), '')
  LOOP
    v_qty := COALESCE(NULLIF(TRIM(elem->>'quantity'), '')::int, 0);
    BEGIN v_vid := NULLIF(TRIM(elem->>'catalog_variant_id'), '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN v_vid := NULL; END;
    v_loc := COALESCE(NULLIF(TRIM(elem->>'location_code'), ''), 'default');
    IF v_vid IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;

    SELECT cv.fulfillment_mode, cv.stock_enforcement INTO v_mode, v_enforce
    FROM catalog_v2.catalog_variants cv WHERE cv.id = v_vid;
    IF NOT FOUND OR v_mode <> 'stocked' THEN CONTINUE; END IF;

    SELECT * INTO inv_row FROM catalog_v2.variant_inventory vi
    WHERE vi.catalog_variant_id = v_vid AND vi.location_code = v_loc FOR UPDATE;
    IF NOT FOUND THEN
      IF COALESCE(v_enforce, false) THEN
        RAISE EXCEPTION 'Missing variant_inventory for %', v_vid USING ERRCODE = 'P0001';
      END IF;
      CONTINUE;
    END IF;

    IF COALESCE(v_enforce, false) THEN
      v_avail := COALESCE(inv_row.quantity_on_hand, 0) - COALESCE(inv_row.quantity_reserved, 0);
      IF v_avail < v_qty THEN
        RAISE EXCEPTION 'Insufficient case stock for %: need %, available %', v_vid, v_qty, v_avail USING ERRCODE = 'P0001';
      END IF;
    END IF;

    UPDATE catalog_v2.variant_inventory SET quantity_reserved = quantity_reserved + v_qty, updated_at = now()
    WHERE catalog_variant_id = v_vid AND location_code = v_loc;
  END LOOP;

  UPDATE gc_commerce.orders SET inventory_reserved_at = now(), updated_at = now() WHERE id = p_order_id;
  RETURN jsonb_build_object('ok', true, 'skipped', false);
END;
$$;
