CREATE OR REPLACE FUNCTION public.gc_release_stock_for_order_atomic(
  p_order_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, gc_commerce
AS $$
DECLARE
  r_item record;
  inv_row public.inventory%ROWTYPE;
  v_new_r int;
  v_bal int;
  v_hist_canon uuid;
  v_rel_at timestamptz;
  v_res_at timestamptz;
  v_canon uuid;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_id required' USING ERRCODE = 'P0001';
  END IF;

  SELECT inventory_released_at, inventory_reserved_at
  INTO v_rel_at, v_res_at
  FROM gc_commerce.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'gc order % not found', p_order_id USING ERRCODE = 'P0001';
  END IF;

  IF v_rel_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  IF v_res_at IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  FOR r_item IN
    SELECT
      ol.quantity,
      NULLIF(TRIM(ol.product_snapshot->>'catalog_product_id'), '')::uuid AS canonical_product_id
    FROM gc_commerce.order_lines ol
    WHERE ol.order_id = p_order_id
    ORDER BY ol.line_number
  LOOP
    v_canon := r_item.canonical_product_id;
    IF COALESCE(r_item.quantity, 0) <= 0 OR v_canon IS NULL THEN
      CONTINUE;
    END IF;

    SELECT * INTO inv_row
    FROM public.inventory
    WHERE canonical_product_id = v_canon
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_new_r := GREATEST(0, COALESCE(inv_row.quantity_reserved, 0) - r_item.quantity);

    UPDATE public.inventory inv
    SET
      quantity_reserved = v_new_r,
      updated_at = now()
    WHERE inv.canonical_product_id = v_canon;

    SELECT quantity_on_hand, canonical_product_id
    INTO v_bal, v_hist_canon
    FROM public.inventory
    WHERE canonical_product_id = v_canon;

    INSERT INTO public.stock_history (
      delta,
      type,
      reference_type,
      reference_id,
      notes,
      user_id,
      balance_after,
      canonical_product_id
    ) VALUES (
      r_item.quantity,
      'release',
      'gc_order',
      0,
      format('Released reservation for gc order %s', p_order_id),
      NULL,
      COALESCE(v_bal, 0),
      COALESCE(v_hist_canon, v_canon)
    );
  END LOOP;

  UPDATE gc_commerce.orders
  SET
    inventory_released_at = now(),
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'skipped', false);
END;
$$;
