CREATE OR REPLACE FUNCTION public.deduct_stock_for_order_atomic(
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
  v_new_oh int;
  v_new_r int;
  v_bal int;
  v_hist_canon uuid;
  v_ded_at timestamptz;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_id required' USING ERRCODE = 'P0001';
  END IF;

  SELECT inventory_deducted_at INTO v_ded_at
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0001';
  END IF;

  IF v_ded_at IS NOT NULL THEN
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

    IF COALESCE(inv_row.quantity_on_hand, 0) < r_item.quantity
       OR COALESCE(inv_row.quantity_reserved, 0) < r_item.quantity THEN
      RAISE EXCEPTION 'Cannot deduct product % for order %: on_hand % reserved % need %',
        r_item.product_id, p_order_id,
        inv_row.quantity_on_hand, inv_row.quantity_reserved, r_item.quantity
        USING ERRCODE = 'P0001';
    END IF;

    v_new_oh := inv_row.quantity_on_hand - r_item.quantity;
    v_new_r := inv_row.quantity_reserved - r_item.quantity;

    UPDATE public.inventory inv
    SET
      quantity_on_hand = v_new_oh,
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
      -r_item.quantity,
      'deduct',
      'order',
      p_order_id,
      format('Shipped order #%s', p_order_id),
      NULLIF(p_user_id, 0),
      COALESCE(v_bal, 0),
      COALESCE(r_item.canonical_product_id, v_hist_canon)
    );
  END LOOP;

  UPDATE public.orders
  SET
    inventory_deducted_at = now(),
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'skipped', false);
END;
$$;
