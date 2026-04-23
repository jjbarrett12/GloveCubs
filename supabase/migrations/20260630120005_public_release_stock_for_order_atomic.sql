CREATE OR REPLACE FUNCTION public.release_stock_for_order_atomic(
  p_order_id bigint,
  p_user_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_item record;
  inv_row public.inventory%ROWTYPE;
  v_new_r int;
  v_bal int;
  v_hist_canon uuid;
  v_rel_at timestamptz;
  v_res_at timestamptz;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_id required' USING ERRCODE = 'P0001';
  END IF;

  SELECT inventory_released_at, inventory_reserved_at
  INTO v_rel_at, v_res_at
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0001';
  END IF;

  IF v_rel_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  IF v_res_at IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  FOR r_item IN
    SELECT oi.product_id, oi.quantity, oi.canonical_product_id
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
    ORDER BY oi.product_id
  LOOP
    IF COALESCE(r_item.quantity, 0) <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO inv_row
    FROM public.inventory
    WHERE product_id = r_item.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_new_r := GREATEST(0, COALESCE(inv_row.quantity_reserved, 0) - r_item.quantity);

    UPDATE public.inventory inv
    SET
      quantity_reserved = v_new_r,
      updated_at = now(),
      canonical_product_id = COALESCE(inv.canonical_product_id, r_item.canonical_product_id)
    WHERE inv.product_id = inv_row.product_id;

    SELECT quantity_on_hand, canonical_product_id
    INTO v_bal, v_hist_canon
    FROM public.inventory
    WHERE product_id = inv_row.product_id;

    INSERT INTO public.stock_history (
      product_id,
      delta,
      type,
      reference_type,
      reference_id,
      notes,
      user_id,
      balance_after,
      canonical_product_id
    ) VALUES (
      inv_row.product_id,
      r_item.quantity,
      'release',
      'order',
      p_order_id,
      format('Released reservation for order #%s', p_order_id),
      NULLIF(p_user_id, 0),
      COALESCE(v_bal, 0),
      COALESCE(r_item.canonical_product_id, v_hist_canon)
    );
  END LOOP;

  UPDATE public.orders
  SET
    inventory_released_at = now(),
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'skipped', false);
END;
$$;
