CREATE OR REPLACE FUNCTION public.gc_deduct_stock_for_order_atomic(
  p_order_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, gc_commerce
AS $fn$
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
  FROM gc_commerce.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'gc order % not found', p_order_id USING ERRCODE = 'P0001';
  END IF;

  IF v_ded_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  FOR r_item IN
    SELECT
      NULLIF(TRIM(ol.product_snapshot->>'legacy_product_id'), '')::bigint AS product_id,
      ol.quantity,
      NULLIF(TRIM(ol.product_snapshot->>'catalog_product_id'), '')::uuid AS canonical_product_id
    FROM gc_commerce.order_lines ol
    WHERE ol.order_id = p_order_id
    ORDER BY ol.line_number
  LOOP
    IF COALESCE(r_item.quantity, 0) <= 0 OR r_item.product_id IS NULL THEN
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
      RAISE EXCEPTION 'Cannot deduct product % for gc order %: on_hand % reserved % need %',
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
      canonical_product_id
    ) VALUES (
      inv_row.product_id,
      -r_item.quantity,
      'deduct',
      'gc_order',
      0,
      format('Shipped gc order %s', p_order_id),
      COALESCE(r_item.canonical_product_id, v_hist_canon)
    );
  END LOOP;

  UPDATE gc_commerce.orders
  SET
    inventory_deducted_at = now(),
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'skipped', false);
END;
$fn$;
