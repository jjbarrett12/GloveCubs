CREATE OR REPLACE FUNCTION public.admin_assign_po_line_variant_atomic(
  p_po_id bigint,
  p_line_index int,
  p_catalog_variant_id uuid,
  p_operator_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, catalog_v2
AS $$
DECLARE
  po_row public.purchase_orders%ROWTYPE;
  po_line jsonb;
  v_canon uuid;
  v_lines jsonb;
  v_len int;
BEGIN
  SELECT * INTO po_row FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PO_NOT_FOUND', 'error', 'Purchase order not found');
  END IF;

  v_lines := COALESCE(po_row.lines, '[]'::jsonb);
  v_len := jsonb_array_length(v_lines);
  IF p_line_index < 0 OR p_line_index >= v_len THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PO_LINE_INDEX_INVALID', 'error', 'Invalid PO line index');
  END IF;

  po_line := v_lines->p_line_index;
  v_canon := public._po_line_canonical_uuid(po_line);

  IF NOT EXISTS (
    SELECT 1 FROM catalog_v2.catalog_variants cv
    WHERE cv.id = p_catalog_variant_id
      AND cv.is_active = true
      AND (v_canon IS NULL OR cv.catalog_product_id = v_canon)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PO_LINE_VARIANT_INVALID', 'error', 'Variant invalid for PO line product');
  END IF;

  po_line := po_line || jsonb_build_object(
    'catalog_variant_id', p_catalog_variant_id::text,
    'needs_sku_assignment', false
  );

  v_lines := jsonb_set(v_lines, ARRAY[p_line_index::text], po_line, false);

  UPDATE public.purchase_orders
  SET lines = v_lines, updated_at = now()
  WHERE id = p_po_id;

  RETURN jsonb_build_object('ok', true, 'po_id', p_po_id, 'line_index', p_line_index, 'catalog_variant_id', p_catalog_variant_id);
END;
$$;
