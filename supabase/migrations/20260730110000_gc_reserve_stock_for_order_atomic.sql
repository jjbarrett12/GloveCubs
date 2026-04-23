CREATE OR REPLACE FUNCTION public.gc_reserve_stock_for_order_atomic(
  p_order_id uuid,
  p_user_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, gc_commerce
AS $$
DECLARE
  elem jsonb;
  v_qty int;
  v_canon_text text;
  v_canon uuid;
  inv_row public.inventory%ROWTYPE;
  v_avail int;
  v_hist_canon uuid;
  v_bal int;
  v_reserved_at timestamptz;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_id required' USING ERRCODE = 'P0001';
  END IF;

  SELECT inventory_reserved_at INTO v_reserved_at
  FROM gc_commerce.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'gc order % not found', p_order_id USING ERRCODE = 'P0001';
  END IF;

  IF v_reserved_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  FOR elem IN
    SELECT x.value AS j
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS x(value)
    ORDER BY COALESCE(NULLIF(TRIM(x.value->>'canonical_product_id'), ''), '')
  LOOP
    v_qty := COALESCE(NULLIF(TRIM(elem->>'quantity'), '')::int, 0);
    v_canon_text := NULLIF(TRIM(elem->>'canonical_product_id'), '');
    v_canon := NULL;
    IF v_canon_text IS NOT NULL THEN
      BEGIN
        v_canon := v_canon_text::uuid;
      EXCEPTION
        WHEN invalid_text_representation THEN
          v_canon := NULL;
      END;
    END IF;

    IF v_canon IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO inv_row
    FROM public.inventory
    WHERE canonical_product_id = v_canon
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_avail := COALESCE(inv_row.quantity_on_hand, 0) - COALESCE(inv_row.quantity_reserved, 0);
    IF v_avail < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for catalog product %: need %, available %',
        v_canon, v_qty, v_avail
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.inventory inv
    SET
      quantity_reserved = inv.quantity_reserved + v_qty,
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
      -v_qty,
      'reserve',
      'gc_order',
      0,
      format('Reserved for gc order %s', p_order_id),
      NULL,
      COALESCE(v_bal, 0),
      COALESCE(v_hist_canon, v_canon)
    );
  END LOOP;

  UPDATE gc_commerce.orders
  SET
    inventory_reserved_at = now(),
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'skipped', false);
END;
$$;
