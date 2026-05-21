-- Phase 0C: variant-grain reserve / release / deduct (catalog_v2.variant_inventory).
-- Wrapped in DO/EXECUTE so Supabase CLI statement splitter does not treat *_atomic
-- function names as BEGIN ATOMIC (SQLSTATE 42601 on trailing statements).

DO $wrap_reserve$
BEGIN
  EXECUTE $reserve$
CREATE OR REPLACE FUNCTION public.gc_reserve_variant_stock_for_order_atomic(
  p_order_id uuid,
  p_user_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, gc_commerce, catalog_v2
AS $fn$
DECLARE
  elem jsonb;
  v_qty int;
  v_vid_text text;
  v_vid uuid;
  v_loc text;
  inv_row catalog_v2.variant_inventory%ROWTYPE;
  v_avail int;
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
    ORDER BY COALESCE(NULLIF(TRIM(x.value->>'catalog_variant_id'), ''), '')
  LOOP
    v_qty := COALESCE(NULLIF(TRIM(elem->>'quantity'), '')::int, 0);
    v_vid_text := NULLIF(TRIM(elem->>'catalog_variant_id'), '');
    v_loc := COALESCE(NULLIF(TRIM(elem->>'location_code'), ''), 'default');
    v_vid := NULL;
    IF v_vid_text IS NOT NULL THEN
      BEGIN
        v_vid := v_vid_text::uuid;
      EXCEPTION
        WHEN invalid_text_representation THEN
          v_vid := NULL;
      END;
    END IF;

    IF v_vid IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO inv_row
    FROM catalog_v2.variant_inventory vi
    WHERE vi.catalog_variant_id = v_vid
      AND vi.location_code = v_loc
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Missing variant_inventory for catalog_variant_id % location %',
        v_vid, v_loc
        USING ERRCODE = 'P0001';
    END IF;

    v_avail := COALESCE(inv_row.quantity_on_hand, 0) - COALESCE(inv_row.quantity_reserved, 0);
    IF v_avail < v_qty THEN
      RAISE EXCEPTION 'Insufficient variant stock for %: need %, available %',
        v_vid, v_qty, v_avail
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE catalog_v2.variant_inventory vi
    SET
      quantity_reserved = vi.quantity_reserved + v_qty,
      updated_at = now()
    WHERE vi.catalog_variant_id = v_vid
      AND vi.location_code = v_loc;
  END LOOP;

  UPDATE gc_commerce.orders
  SET
    inventory_reserved_at = now(),
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'skipped', false);
END;
$fn$;
$reserve$;
END;
$wrap_reserve$;

DO $wrap_release$
BEGIN
  EXECUTE $release$
CREATE OR REPLACE FUNCTION public.gc_release_variant_stock_for_order_atomic(
  p_order_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, gc_commerce, catalog_v2
AS $fn$
DECLARE
  r_item record;
  inv_row catalog_v2.variant_inventory%ROWTYPE;
  v_new_r int;
  v_loc text;
  v_rel_at timestamptz;
  v_res_at timestamptz;
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
    SELECT ol.quantity, ol.catalog_variant_id
    FROM gc_commerce.order_lines ol
    WHERE ol.order_id = p_order_id
      AND ol.catalog_variant_id IS NOT NULL
    ORDER BY ol.line_number
  LOOP
    IF COALESCE(r_item.quantity, 0) <= 0 THEN
      CONTINUE;
    END IF;

    v_loc := 'default';

    SELECT * INTO inv_row
    FROM catalog_v2.variant_inventory vi
    WHERE vi.catalog_variant_id = r_item.catalog_variant_id
      AND vi.location_code = v_loc
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Missing variant_inventory for catalog_variant_id % on release',
        r_item.catalog_variant_id
        USING ERRCODE = 'P0001';
    END IF;

    v_new_r := GREATEST(0, COALESCE(inv_row.quantity_reserved, 0) - r_item.quantity);

    UPDATE catalog_v2.variant_inventory vi
    SET
      quantity_reserved = v_new_r,
      updated_at = now()
    WHERE vi.catalog_variant_id = r_item.catalog_variant_id
      AND vi.location_code = v_loc;
  END LOOP;

  UPDATE gc_commerce.orders
  SET
    inventory_released_at = now(),
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'skipped', false);
END;
$fn$;
$release$;
END;
$wrap_release$;

DO $wrap_deduct$
BEGIN
  EXECUTE $deduct$
CREATE OR REPLACE FUNCTION public.gc_deduct_variant_stock_for_order_atomic(
  p_order_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, gc_commerce, catalog_v2
AS $fn$
DECLARE
  r_item record;
  inv_row catalog_v2.variant_inventory%ROWTYPE;
  v_new_oh int;
  v_new_r int;
  v_loc text;
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
    SELECT ol.quantity, ol.catalog_variant_id
    FROM gc_commerce.order_lines ol
    WHERE ol.order_id = p_order_id
      AND ol.catalog_variant_id IS NOT NULL
    ORDER BY ol.line_number
  LOOP
    IF COALESCE(r_item.quantity, 0) <= 0 THEN
      CONTINUE;
    END IF;

    v_loc := 'default';

    SELECT * INTO inv_row
    FROM catalog_v2.variant_inventory vi
    WHERE vi.catalog_variant_id = r_item.catalog_variant_id
      AND vi.location_code = v_loc
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Missing variant_inventory for catalog_variant_id % on deduct',
        r_item.catalog_variant_id
        USING ERRCODE = 'P0001';
    END IF;

    IF COALESCE(inv_row.quantity_on_hand, 0) < r_item.quantity
       OR COALESCE(inv_row.quantity_reserved, 0) < r_item.quantity THEN
      RAISE EXCEPTION 'Cannot deduct variant % for gc order %: on_hand % reserved % need %',
        r_item.catalog_variant_id, p_order_id,
        inv_row.quantity_on_hand, inv_row.quantity_reserved, r_item.quantity
        USING ERRCODE = 'P0001';
    END IF;

    v_new_oh := inv_row.quantity_on_hand - r_item.quantity;
    v_new_r := inv_row.quantity_reserved - r_item.quantity;

    UPDATE catalog_v2.variant_inventory vi
    SET
      quantity_on_hand = v_new_oh,
      quantity_reserved = v_new_r,
      updated_at = now()
    WHERE vi.catalog_variant_id = r_item.catalog_variant_id
      AND vi.location_code = v_loc;
  END LOOP;

  UPDATE gc_commerce.orders
  SET
    inventory_deducted_at = now(),
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'skipped', false);
END;
$fn$;
$deduct$;
END;
$wrap_deduct$;

DO $wrap_perms$
BEGIN
  EXECUTE $c1$
COMMENT ON FUNCTION public.gc_reserve_variant_stock_for_order_atomic(uuid, uuid, jsonb) IS
  'Phase 0C: atomic variant_inventory reservation per catalog_variant_id + location_code.';
$c1$;
  EXECUTE $c2$
COMMENT ON FUNCTION public.gc_release_variant_stock_for_order_atomic(uuid, uuid) IS
  'Phase 0C: release variant_inventory reservations for gc order lines.';
$c2$;
  EXECUTE $c3$
COMMENT ON FUNCTION public.gc_deduct_variant_stock_for_order_atomic(uuid, uuid) IS
  'Phase 0C: deduct variant_inventory on_hand + reserved for shipped gc order.';
$c3$;
  EXECUTE $r1$
REVOKE ALL ON FUNCTION public.gc_reserve_variant_stock_for_order_atomic(uuid, uuid, jsonb) FROM PUBLIC;
$r1$;
  EXECUTE $r2$
REVOKE ALL ON FUNCTION public.gc_release_variant_stock_for_order_atomic(uuid, uuid) FROM PUBLIC;
$r2$;
  EXECUTE $r3$
REVOKE ALL ON FUNCTION public.gc_deduct_variant_stock_for_order_atomic(uuid, uuid) FROM PUBLIC;
$r3$;
  EXECUTE $g1$
GRANT EXECUTE ON FUNCTION public.gc_reserve_variant_stock_for_order_atomic(uuid, uuid, jsonb) TO service_role;
$g1$;
  EXECUTE $g2$
GRANT EXECUTE ON FUNCTION public.gc_release_variant_stock_for_order_atomic(uuid, uuid) TO service_role;
$g2$;
  EXECUTE $g3$
GRANT EXECUTE ON FUNCTION public.gc_deduct_variant_stock_for_order_atomic(uuid, uuid) TO service_role;
$g3$;
END;
$wrap_perms$;
